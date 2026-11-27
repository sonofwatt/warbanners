import { hashState, playerView, RULES_VERSION } from '../engine';
import type { Action, MatchState, PlayerId } from '../engine';
import { afterAction, isOffered, NONE, offered } from '../ui/interaction';
import type { Selection } from '../ui/interaction';
import { BUILD } from '../version';
import type { Net } from '../net/net';
import { openSession } from '../online/session';
import type { Session, SessionView } from '../online/session';
import type { Step } from '../online/sync';
import { decodeAction, factionsFor, inviteLink as inviteLinkFor, makeRoomCode, toRecordSeat } from '../online/wire';
import type { Room } from '../online/wire';
import { digestFor } from './digest';
import type { TurnStep } from './digest';
import { newRecord, roundOf } from './record';
import type { MatchRecord, Seat } from './record';
import { dueForSweep, forgetOnline, listOnline, readOnlineCache, rememberOnline, setPendingRoom } from './onlineList';
import type { OnlineEntry } from './onlineList';
import type { AppState, Deps, Notice } from './store';

// The online half of the app store: rooms, the session, and the screens that follow it. It shares four things with
// local play, passed in as the context: the store's get and set, `leave`, and the local counters it must keep in step.
export interface OnlineCtx {
  deps: Deps;
  get: () => AppState;
  set: (p: Partial<AppState>) => void;
  leave: (why?: Notice) => void;
  local: { nextSeq(): number; resetTurnLog(): void; bumpAiRun(): void };
}

type OnlineMembers = Pick<AppState, 'mode' | 'online' | 'onlineList' | 'inviteLink' | 'openOnline' | 'openJoin' | 'createRoom'
  | 'openRoom' | 'joinAs' | 'takeSeat' | 'setLobby' | 'startOnline' | 'resignOnline' | 'onlineBlocked' | 'forgetRoom' | 'updateForRoom'>;

export interface OnlineSide extends OnlineMembers {
  acceptOnline(action: Action): void;   // the player's own action in an online match
  closeSession(): void;
  sweep(): void;                        // deletes rooms made here that are long finished, once src/net has loaded
  isOnline(): boolean;
}

const ROOM_TRIES = 5;             // a new code is drawn this many times when the one drawn is taken

// A selection that survives a change the player did not make: the unit is still in view, or it is not a unit.
const keepLooking = (sel: Selection, state: MatchState, viewer: PlayerId): Selection =>
  sel.kind !== 'unit' ? sel : playerView(state, viewer).units.some(u => u.id === sel.id) ? { kind: 'unit', id: sel.id, armed: null, askLure: null } : NONE;

export const realTimer = (fn: () => void, ms: number): (() => void) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

const seatOf = (room: Room, p: PlayerId): Seat => {
  const s = room.seats[p];
  return s ? toRecordSeat(s) : { name: '', kind: 'human' };
};
const stepOf = (st: Step): TurnStep => ({ before: st.before, after: st.after, events: st.events });

export function createOnlineSide(ctx: OnlineCtx): OnlineSide {
  const { deps, get, set, leave, local } = ctx;
  const kv = deps.kv;
  // src/net arrives through deps.openNet (a dynamic import in the browser) the first time it is needed.
  let netLoad: Promise<Net> | null = null;
  let net: Net | null = null;
  let session: Session | null = null;
  let stopVisible: (() => void) | null = null;   // the page-visible listener, held while a session is open
  let sessionGen = 0;               // which session (or session being opened) may still change the store
  let stepsSeen = -1;               // the session's lastSteps.seq already handled
  let acting = false;               // inside session.act from run or tap: the store applies that step itself
  let onlineLog: TurnStep[] = [];   // the other side's steps since this phone's last turn, for the digest
  let resignPending = false;        // a resign is on its way; if it is refused the player is told
  let rememberedAs = '';            // what was last written to the online list, so a clock tick writes nothing
  let listFailTold = false;         // onlineListFailed is told once a session, not on every move after it is dismissed
  let built: { actions: string[]; record: MatchRecord } | null = null;   // the record built from the session, kept to extend
  const createdHere = new Set<string>();

  // Why online play cannot start now, checked before src/net is loaded; null when it can.
  const notReady = (): 'notSetUp' | 'needsConnection' | null => {
    if (deps.openNet === undefined || !(deps.netReady?.() ?? false)) return 'notSetUp';
    return (deps.online?.() ?? true) ? null : 'needsConnection';
  };

  const loadNet = (): Promise<Net> => {
    if (netLoad === null) {
      netLoad = deps.openNet!().then(n => { net = n; return n; });
      netLoad.catch(() => { netLoad = null; });
    }
    return netLoad;
  };

  function closeSession(): void {
    sessionGen += 1;
    stopVisible?.();
    stopVisible = null;
    session?.close();
    session = null;
    onlineLog = [];
    resignPending = false;
    rememberedAs = '';
    listFailTold = false;
    built = null;
  }

  // Rooms made here that are long finished or idle are deleted, best effort, once src/net has been loaded for
  // online play: reaching Home never loads it, so local play never contacts the server.
  const sweep = (): void => {
    if (net === null) return;
    const n = net;
    for (const code of dueForSweep(listOnline(kv), deps.now())) {
      void n.remove(code).catch(() => false).then(() => {
        forgetOnline(kv, code);
        if (get().screen === 'home') set({ onlineList: listOnline(kv) });
      });
    }
  };

  // The session's match as a record, for the screens and the cache. Extended action by action, rebuilt when the
  // session rebuilt its list.
  const recordOf = (v: SessionView): MatchRecord | null => {
    const f = v.followed;
    const room = v.room;
    if (f === null || room === null) return null;
    const prior = built !== null && built.actions.length <= f.actions.length && built.actions.every((a, i) => a === f.actions[i]) ? built : null;
    const fresh = f.actions.slice(prior?.actions.length ?? 0).map(decodeAction);
    if (fresh.some(a => a === null)) return null;
    // The seats are read from the room every time: an adaptive AI seat writes its dial there as it plays, and the
    // result's difficulty line and score must match what a phone rebuilding the record from the room would show.
    const seats = [seatOf(room, 0), seatOf(room, 1)];
    const base = { ...(prior?.record ?? newRecord(v.code, f.settings, [seats[0]!, seats[1]!], room.meta.createdAt)), players: seats };
    const actions = [...(prior?.record.actions ?? []), ...(fresh as Action[])];
    const record: MatchRecord = {
      ...base, actions, snapshot: { count: actions.length, hash: hashState(f.state), state: f.state }, updatedAt: deps.now(),
    };
    built = { actions: f.actions, record };
    return record;
  };

  // This phone's entry on Home and its cached record, written when something Home shows changes. What became of
  // the write is told: the player never loses the way back to a match without a word.
  const rememberHere = (v: SessionView, record: MatchRecord | null): Notice | null => {
    const room = v.room;
    const seat = v.mySeat;
    if (room === null || seat === null) return null;
    const state = v.followed?.state ?? null;
    const names: [string, string] = [room.seats[0]?.name ?? '', room.seats[1]?.name ?? ''];
    const factions = v.followed?.settings.factions ?? factionsFor(room.meta.hostFaction);
    const round = state !== null ? roundOf(state) : 1;
    const current = state?.current ?? 0;
    // Over only once the server holds it: a winning move or a resign still on its way may never land, and an entry
    // marked over can be deleted from the server by the sweep or Remove.
    const over = state !== null && state.winner !== null && !v.sending;
    const key = JSON.stringify([v.code, seat, names, factions, round, current, over, v.followed?.actions.length ?? -1]);
    if (key === rememberedAs) return null;
    rememberedAs = key;
    const before = listOnline(kv).find(e => e.code === v.code);
    const entry: OnlineEntry = {
      code: v.code, seat, names, factions, round, current, over, rulesVersion: room.meta.rulesVersion,
      createdHere: createdHere.has(v.code) || before?.createdHere === true, updatedAt: deps.now(),
    };
    const out = rememberOnline(kv, entry, record);
    return !out.saved ? 'onlineListFailed' : out.droppedUnfinished ? 'onlineListDropped' : null;
  };

  // Every change the session reports. The session's state is the match: the screen follows its phase.
  const onView = (v: SessionView): void => {
    if (v.phase === 'notFound') {
      forgetOnline(kv, v.code);
      leave('roomGone');
      return;
    }
    const cur = get();
    const patch: Partial<AppState> = { online: v };
    if (v.phase === 'join' || v.phase === 'version') {
      if (cur.screen !== 'join') Object.assign(patch, { screen: 'join', record: null, state: null, viewer: null, selection: NONE });
    } else if (v.phase === 'lobby') {
      if (cur.screen !== 'lobby') Object.assign(patch, { screen: 'lobby', record: null, state: null, viewer: null, selection: NONE });
    }
    const f = v.followed;
    const seat = v.mySeat;
    let record: MatchRecord | null = null;
    if (f !== null && seat !== null && (v.phase === 'playing' || v.phase === 'over' || v.phase === 'desync')) {
      record = recordOf(v);
      const over = f.state.winner !== null;
      Object.assign(patch, { state: f.state, viewer: seat, screen: over ? 'result' : 'match' });
      if (record !== null) patch.record = record;
      if (over && cur.screen !== 'result') patch.selection = NONE;
      const ls = v.lastSteps;
      if (ls !== null && ls.seq !== stepsSeen) {
        stepsSeen = ls.seq;
        // A step this phone's own run or tap made is handled there. Everything else (the other phone's, an AI seat
        // this phone hosts, a timeout) plays its effects here and goes into the digest.
        if (!acting && ls.steps.length > 0) {
          const seq = ctx.local.nextSeq();
          patch.last = { seq, events: ls.steps.flatMap(st => st.events), before: ls.steps[0]!.before };
          for (const st of ls.steps) {
            if (st.before.current === seat) onlineLog = [];
            else onlineLog.push(stepOf(st));
          }
        }
      }
      if (!acting && cur.state !== f.state) {
        const back = !over && f.state.current === seat && cur.state !== null && cur.state.current !== seat;
        if (back && onlineLog.length > 0) {
          patch.digest = digestFor(seat, onlineLog);
          onlineLog = [];
        }
        if (patch.selection === undefined) patch.selection = back ? NONE : keepLooking(cur.selection, f.state, seat);
      }
    }
    // A lost resign is known once its write is answered and the rebuild that follows has replaced the board.
    if (resignPending && !v.sending && !v.verifying) {
      resignPending = false;
      if (f === null || f.state.winner === null) patch.notice = 'resignLost';
    }
    // What became of the list write is told, but never over a lost resign, and a failure only once a session.
    const listed = rememberHere(v, record);
    const repeat = listed === 'onlineListFailed' && listFailTold;
    if (listed !== null && patch.notice !== 'resignLost' && !repeat) patch.notice = listed;
    if (listed === 'onlineListFailed' && patch.notice === listed) listFailTold = true;
    set(patch);
  };

  const openSessionFor = (code: string, n: Net, gen: number): void => {
    stepsSeen = -1;
    const opened = openSession(code, { net: n, ai: deps.ai, build: deps.build ?? BUILD, setTimer: deps.setTimer ?? realTimer, ...(deps.pause ? { pause: deps.pause } : {}) }, v => {
      if (gen === sessionGen) onView(v);
    });
    session = opened;
    // A page made visible again may hold a dead socket the SDK still believes in: the session's return runs at once.
    stopVisible = deps.onVisible?.(() => { if (session === opened) opened.wake(); }) ?? null;
    set({ online: opened.view() });
  };

  // The player's own action online: the session applies it at once and writes it; nothing goes to the saves.
  const acceptOnline = (action: Action): void => {
    const { state, viewer, selection, online } = get();
    if (session === null || state === null || viewer === null || online === null || !online.myTurn) return;
    let step: Step | null;
    acting = true;
    try { step = session.act(action); } finally { acting = false; }
    if (step === null) {
      if (isOffered(state, viewer, action)) set({ notice: 'blockedUnseen' });
      return;
    }
    onlineLog = [];
    const seq = ctx.local.nextSeq();
    const patch: Partial<AppState> = { state: step.after, last: { seq, events: step.events, before: step.before }, online: session.view() };
    if (get().notice === 'blockedUnseen') patch.notice = null;
    if (step.after.winner !== null) set({ ...patch, screen: 'result', selection: NONE });
    else if (action.type === 'endTurn') set({ ...patch, selection: NONE, digest: [] });
    else set({ ...patch, selection: afterAction(selection, playerView(step.after, viewer), offered(step.after, viewer)) });
  };

  return {
    mode: 'local', online: null, onlineList: listOnline(kv), inviteLink: null,
    acceptOnline, closeSession, sweep, isOnline: () => get().mode === 'online',
    openOnline: () => set({ screen: 'onlineSetup' }),
    openJoin: () => { closeSession(); deps.clearRoomFromUrl?.(); set({ screen: 'join', mode: 'local', online: null, inviteLink: null }); },

    createRoom: async input => {
      set({ screen: 'onlineSetup' });
      const why = notReady();
      if (why !== null) { set({ notice: why }); return; }
      closeSession();
      const gen = sessionGen;
      let n: Net;
      try { n = await loadNet(); } catch { if (gen === sessionGen) set({ notice: 'needsConnection' }); return; }
      if (gen !== sessionGen) return;
      let failed: Notice = 'serverOutOfDate';
      for (let i = 0; i < ROOM_TRIES; i++) {
        const code = makeRoomCode();
        const r = await n.create({ code, name: input.name, hostFaction: input.faction, clock: input.clock, rulesVersion: RULES_VERSION, build: deps.build ?? BUILD });
        if (gen !== sessionGen) return;
        if (r === true) {
          createdHere.add(code);
          deps.roomToUrl?.(code);
          set({
            screen: 'lobby', mode: 'online', notice: null, record: null, state: null, viewer: null, selection: NONE, last: null, digest: [],
            inviteLink: deps.inviteBase ? inviteLinkFor(deps.inviteBase(), code) : null,
          });
          openSessionFor(code, n, gen);
          return;
        }
        if (r === 'refused') continue;          // the code is taken: draw another
        failed = r === 'offline' ? 'needsConnection' : r === 'notSetUp' ? 'notSetUp' : 'serverOutOfDate';
        break;
      }
      set({ notice: failed });
    },

    openRoom: code => {
      // The last known board at once, while the session connects; the database wins as soon as it answers. With no
      // connection that board is still shown, and the session waits for one; without a board this build can play
      // (none cached, or cached under other rules), there is nothing to show and the player is told why.
      const entry = listOnline(kv).find(e => e.code === code);
      const cached = entry !== undefined ? readOnlineCache(kv, code) : null;
      const why = notReady();
      if (why !== null && !(why === 'needsConnection' && cached !== null && cached.ok)) { set({ notice: why }); return; }
      local.resetTurnLog();
      local.bumpAiRun();
      closeSession();
      const gen = sessionGen;
      const shown: Partial<AppState> = cached !== null && cached.ok && entry !== undefined
        ? { screen: cached.state.winner !== null ? 'result' : 'match', record: cached.record, state: cached.state, viewer: entry.seat }
        : { screen: 'join', record: null, state: null, viewer: null };
      set({ ...shown, mode: 'online', online: null, inviteLink: null, selection: NONE, last: null, digest: [], aiBusy: false });
      deps.roomToUrl?.(code);
      loadNet().then(n => { if (gen === sessionGen) openSessionFor(code, n, gen); }, () => { if (gen === sessionGen) leave('needsConnection'); });
    },

    joinAs: async name => { if (session !== null) await session.join(name); },
    takeSeat: async seat => { if (session !== null) await session.takeOver(seat); },
    setLobby: patch => { if (session !== null) void session.setLobby(patch); },
    startOnline: advanced => { if (session !== null) void session.start(deps.newSeed(), advanced); },

    resignOnline: () => {
      if (session === null || get().mode !== 'online') return;
      resignPending = true;
      if (!session.resign()) resignPending = false;
    },

    onlineBlocked: () => notReady(),

    forgetRoom: code => {
      const entry = listOnline(kv).find(e => e.code === code);
      forgetOnline(kv, code);
      set({ onlineList: listOnline(kv) });
      if (entry === undefined || !entry.createdHere || !entry.over || notReady() !== null) return;
      loadNet().then(n => n.remove(code)).catch(() => {});
    },

    updateForRoom: () => {
      const code = get().online?.code;
      if (code === undefined) return;
      setPendingRoom(kv, code);
      leave();
    },
  };
}

// Puts ?room= in the address, or takes it out, keeping every other parameter, without a new history entry.
export function setRoomInUrl(code: string | null): void {
  if (typeof location === 'undefined' || typeof history === 'undefined') return;
  const params = new URLSearchParams(location.search);
  if (params.get('room') === code || (code === null && !params.has('room'))) return;
  if (code === null) params.delete('room');
  else params.set('room', code);
  const query = params.toString();
  history.replaceState(history.state, '', `${location.pathname}${query === '' ? '' : `?${query}`}${location.hash}`);
}

// Calls fn each time the page becomes visible again. Returns the unsubscribe; nothing listens until it is called.
export function onPageVisible(fn: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  const seen = (): void => { if (document.visibilityState === 'visible') fn(); };
  document.addEventListener('visibilitychange', seen);
  return () => document.removeEventListener('visibilitychange', seen);
}
