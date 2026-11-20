import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { applyAction, createMatch, hashState, playerView, RULES_VERSION } from '../engine';
import type { Action, FactionId, GameEvent, MatchState, PlayerId } from '../engine';
import { adaptStep, betweenMatches, gapOf } from '../ai/adapt';
import type { AdaptState } from '../ai/adapt';
import { afterAct, afterThink, aiStep, FIRST_THINK_MS, REPLAN_MS, START } from '../ai/driver';
import type { Cursor } from '../ai/driver';
import { aiInputFor } from '../ai/input';
import { LEVEL_DIAL } from '../ai/types';
import type { AiLevel } from '../ai/types';
import { watchMs } from '../ui/board/effects';
import { afterAction, indexActions, isOffered, NONE, nextUnit as nextUnitOf, offered, tap as tapLogic } from '../ui/interaction';
import type { Armed, Hit, Selection } from '../ui/interaction';
import { T } from '../ui/text';
import { netReady } from '../netReady';
import { BUILD } from '../version';
import type { Net } from '../net/net';
import { openSession } from '../online/session';
import type { Session, SessionView } from '../online/session';
import type { Step } from '../online/sync';
import { codeFromSearch, decodeAction, factionsFor, inviteLink as inviteLinkFor, makeRoomCode, toRecordSeat } from '../online/wire';
import type { ClockSec, Room } from '../online/wire';
import { createAiClient, isSuperseded } from './aiClient';
import type { AiClient } from './aiClient';
import { readDial, writeDial } from './aiMemory';
import { digestFor } from './digest';
import type { DigestLine, TurnStep } from './digest';
import { append, newRecord, restore, roundOf, setAdapt } from './record';
import type { MatchRecord, Seat } from './record';
import { dueForSweep, forgetOnline, listOnline, readOnlineCache, rememberOnline, setPendingRoom, takePendingRoom } from './onlineList';
import type { OnlineEntry } from './onlineList';
import { deleteSave, listSaves, readSave, withSave, writeSave } from './saves';
import type { KeyValue, SaveSummary } from './saves';
import type { UpdateState, Updater } from './update';

export interface Deps {
  kv: KeyValue; now(): number; newSeed(): number; newId(): string; updater?: Updater;
  ai: AiClient; sleep(ms: number): Promise<void>;
  // Online play. All optional, so plan 2's and 3's deps stand as they are; without openNet and netReady there is none.
  openNet?: () => Promise<Net>;                 // loads src/net on first use: Firebase never loads for local play
  online?: () => boolean;                       // the platform says it has a connection
  roomFromUrl?: () => string | null;            // ?room= in the address the app was opened with
  roomToUrl?: (code: string) => void;           // the room the player is in, kept in the address so a reload comes back
  clearRoomFromUrl?: () => void;                // on leaving, so a reload does not reopen a room the player has left
  inviteBase?: () => string;                    // origin plus the base path, for the invite link
  build?: string;
  setTimer?: (fn: () => void, ms: number) => () => void;
  pause?: () => Promise<void>;                  // the session's pause between replay chunks; tests pass their own
  netReady?: () => boolean;                     // this build has a Firebase backend to talk to
}
export type SecondSeat = 'human' | AiLevel;
export interface Setup { names: [string, string]; factions: [FactionId, FactionId]; second?: SecondSeat }   // second: 'human' if left out
export type Screen = 'home' | 'setup' | 'pass' | 'match' | 'result' | 'onlineSetup' | 'lobby' | 'join';
export type Notice = 'saveFailed' | 'saveRepaired' | 'saveDropped' | 'saveUnreadable' | 'saveOldVersion' | 'blockedUnseen' | 'aiPassed'
  | 'needsConnection' | 'notSetUp' | 'serverOutOfDate' | 'roomGone' | 'updateDuringOnline'
  | 'onlineListDropped' | 'onlineListFailed' | 'resignLost';

// The least time the person gets to watch an AI action they can see.
export const AI_STEP_MS = 450;
export { FIRST_THINK_MS, REPLAN_MS };

export interface AppState {
  screen: Screen;
  record: MatchRecord | null; state: MatchState | null;
  viewer: PlayerId | null;          // whose view may be drawn; null whenever the curtain is up or no match is open
  selection: Selection;
  last: { seq: number; events: GameEvent[]; before: MatchState } | null;   // the last accepted action, for effects and sound
  digest: DigestLine[];
  notice: Notice | null;
  saves: SaveSummary[];
  update: UpdateState;              // what the service worker has reported
  aiBusy: boolean;                  // the AI is playing its turn; the person can only watch or go home
  openSetup(): void; startMatch(setup: Setup): void; resume(id: string): void; removeSave(id: string): void;
  ready(): void;                    // the player named on the curtain now has the phone
  tap(hit: Hit): void; run(action: Action): void; arm(armed: Armed | null): void; select(sel: Selection): void;
  nextUnit(): void;                 // selects the next of the viewer's units that can still act
  setUpdate(s: UpdateState): void;
  applyUpdate(confirmed?: boolean): void;   // a new build is applied only from home; with an unfinished online match, only once confirmed === true
  goHome(): void; dismissNotice(): void; dismissDigest(): void;
  recover(): void;                  // back to home after a screen failed to draw, keeping every save

  mode: 'local' | 'online';
  online: SessionView | null;       // the open session's view; null in local mode
  onlineList: OnlineEntry[];        // this phone's online matches, for Home
  inviteLink: string | null;        // for the lobby's share button
  openOnline(): void;               // the online setup screen
  openJoin(): void;                 // the join screen, with a code field
  createRoom(input: { name: string; faction: FactionId; clock: ClockSec }): Promise<void>;
  openRoom(code: string): void;     // from a link, a typed code, or Continue on Home
  joinAs(name: string): Promise<void>;
  takeSeat(seat: PlayerId): Promise<void>;
  setLobby(patch: { clock?: ClockSec; hostFaction?: FactionId; name?: string }): void;
  startOnline(): void;
  resignOnline(): void;             // on either player's turn: the Menu's Resign in online mode
  onlineBlocked(): 'notSetUp' | 'needsConnection' | null;   // why Home cannot offer online play now; never loads src/net
  forgetRoom(code: string): void;   // Home's remove: forget it here, and delete the room when made here and over
  updateForRoom(): void;            // the join screen on a newer room: remember the room, then Home to update
}

type AiSeat = Extract<Seat, { kind: 'ai' }>;
const END_TURN: Action = { type: 'endTurn' };
const ROOM_TRIES = 5;             // a new code is drawn this many times when the one drawn is taken

const realTimer = (fn: () => void, ms: number): (() => void) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

// A selection that survives a change the player did not make: the unit is still in view, or it is not a unit.
const keepLooking = (sel: Selection, state: MatchState, viewer: PlayerId): Selection =>
  sel.kind !== 'unit' ? sel : playerView(state, viewer).units.some(u => u.id === sel.id) ? { kind: 'unit', id: sel.id, armed: null, askLure: null } : NONE;

// The one person's seat in a match against the AI, or null in a match between two people.
export function soloSeat(record: MatchRecord): PlayerId | null {
  const people = record.players.flatMap((p, i) => (p.kind === 'human' ? [i] : []));
  return people.length === 1 ? people[0]! : null;
}

const aiSeatAt = (record: MatchRecord, p: PlayerId): AiSeat | null => {
  const seat = record.players[p];
  return seat !== undefined && seat.kind === 'ai' ? seat : null;
};

// The AI's turn has not started when nothing of it is saved: the match is new or the last action ended a turn.
const turnFresh = (record: MatchRecord): boolean => {
  const lastAction = record.actions[record.actions.length - 1];
  return lastAction === undefined || lastAction.type === 'endTurn';
};

export function createAppStore(deps: Deps): StoreApi<AppState> {
  let seq = 0;
  let turnLog: TurnStep[] = [];
  let aiRun = 0;                    // which AI loop may still act; opening or leaving a match stops the one running
  const kv = deps.kv;

  // Online play. src/net arrives through deps.openNet (a dynamic import in the browser) the first time it is needed.
  let netLoad: Promise<Net> | null = null;
  let net: Net | null = null;
  let session: Session | null = null;
  let sessionGen = 0;               // which session (or session being opened) may still change the store
  let stepsSeen = -1;               // the session's lastSteps.seq already handled
  let acting = false;               // inside session.act from run or tap: the store applies that step itself
  let onlineLog: TurnStep[] = [];   // the other side's steps since this phone's last turn, for the digest
  let resignPending = false;        // a resign is on its way; if it is refused the player is told
  let rememberedAs = '';            // what was last written to the online list, so a clock tick writes nothing
  let listFailTold = false;         // onlineListFailed is told once a session, not on every move after it is dismissed
  let built: { actions: string[]; record: MatchRecord } | null = null;   // the record built from the session, kept to extend
  const createdHere = new Set<string>();

  const store = createStore<AppState>((set, get) => {
    // Opens a match. Between two people it opens behind the curtain: nobody's view is drawn until ready(). Against
    // the AI there is no curtain: the person's view is drawn at once, and the AI plays at once if it is to move.
    const openMatch = (record: MatchRecord, state: MatchState, extra: Partial<AppState> = {}): void => {
      turnLog = [];
      aiRun += 1;
      closeSession();
      const solo = soloSeat(record);
      const over = state.winner !== null;
      set({
        screen: over ? 'result' : solo !== null ? 'match' : 'pass', record, state, viewer: over ? null : solo,
        selection: NONE, last: null, digest: [], saves: listSaves(kv), aiBusy: false,
        mode: 'local', online: null, inviteLink: null, ...extra,
      });
      if (!over && solo !== null && state.current !== solo) void playAi();
    };

    // Writes the dial an adaptive AI ended a match on, nudged by who won, under the person's name.
    const remember = (record: MatchRecord, state: MatchState): void => {
      const solo = soloSeat(record);
      if (solo === null || state.winner === null) return;
      const ai = record.players.find((p): p is AiSeat => p.kind === 'ai' && p.level === 'adaptive');
      if (ai === undefined) return;
      writeDial(kv, record.players[solo]!.name, betweenMatches(ai.adapt.dial, state.winner === solo ? 'person' : 'ai'));
    };

    // An action the engine accepted, from a person or the AI: append it, save, log it for the digest, and hand it to
    // the screen as `last`. Returns the state change for the caller to complete.
    const commit = (record: MatchRecord, before: MatchState, action: Action, res: { state: MatchState; events: GameEvent[] }): Partial<AppState> => {
      const next = append(record, action, res.state, deps.now());
      const saved = writeSave(kv, next, res.state);
      turnLog.push({ before, after: res.state, events: res.events });
      seq += 1;
      const patch: Partial<AppState> = {
        record: next, state: res.state, saves: withSave(get().saves, saved), last: { seq, events: res.events, before },
      };
      // A failure is reported at once; a later save that works makes the report out of date, so it goes. So does a
      // refused move's explanation once something else happened.
      const notice = get().notice;
      if (!saved.saved) patch.notice = 'saveFailed';
      else if (saved.droppedUnfinished) patch.notice = 'saveDropped';
      else if (notice === 'saveFailed' || notice === 'blockedUnseen') patch.notice = null;
      if (res.state.winner !== null) remember(next, res.state);
      return patch;
    };

    // A person's action: only on the match screen, only on their own turn, never while the AI plays.
    const accept = (action: Action): void => {
      const { record, state, viewer, selection, aiBusy } = get();
      if (get().screen !== 'match' || record === null || state === null || viewer === null || viewer !== state.current || aiBusy) return;
      if (get().mode === 'online') { acceptOnline(action); return; }
      const res = applyAction(state, action);
      if (!res.ok) {
        // The screen offered this from what the person knows, so something they cannot see is in the way.
        if (isOffered(state, viewer, action) && get().notice !== 'saveFailed') {
          set({ notice: 'blockedUnseen' });
        }
        return;
      }
      const patch = commit(record, state, action, res);
      if (res.state.winner !== null) {
        set({ ...patch, screen: 'result', viewer: null, selection: NONE });
      } else if (action.type === 'endTurn' && soloSeat(record) !== null) {
        set({ ...patch, selection: NONE });
        void playAi();
      } else if (action.type === 'endTurn') {
        set({ ...patch, screen: 'pass', viewer: null, selection: NONE, digest: digestFor(res.state.current, turnLog) });
      } else {
        set({ ...patch, selection: afterAction(selection, playerView(res.state, viewer), offered(res.state, viewer)) });
      }
    };

    // The AI's whole turn, played on the person's screen one saved action at a time. After every wait it checks that
    // this loop is still the one that may act and that the match has not moved on; if not, it stops and drops what
    // it was waiting for. A think that fails (superseded, or the client gone) stops it the same way.
    const playAi = async (): Promise<void> => {
      const run = ++aiRun;
      const start = get();
      if (start.mode !== 'local') return;   // an online AI seat is played by the session's host, never here
      if (start.record === null || start.state === null || start.viewer === null) return;
      const id = start.record.id;
      const viewer = start.viewer;
      const ai = start.state.current;
      const seat = aiSeatAt(start.record, ai);
      if (seat === null || start.state.winner !== null) return;
      let count = start.record.actions.length;
      const live = (): boolean => run === aiRun && get().screen === 'match' && get().record?.id === id && get().record?.actions.length === count;

      // The adaptive dial moves once, as the turn starts. It is saved with the turn's first action, so a turn left
      // before that action restarts from the same dial and moves it the same way again.
      let adapt: AdaptState | null = null;
      if (seat.level === 'adaptive' && turnFresh(start.record)) adapt = adaptStep(seat.adapt, gapOf(start.state, ai));
      const dial = seat.level === 'adaptive' ? (adapt ?? seat.adapt).dial : LEVEL_DIAL[seat.level];
      const aiSeat = { player: ai, dial, salt: seat.salt };

      turnLog = [];
      set({ aiBusy: true, selection: NONE, notice: get().notice === 'aiPassed' ? null : get().notice });
      let cur: Cursor = START;
      let failed = false;      // the step being tried has failed once already

      // Applies one AI action the engine accepted. Returns true when the AI's turn is over (or the match is).
      const play = (record: MatchRecord, state: MatchState, action: Action, res: { state: MatchState; events: GameEvent[] }, passed = false): boolean => {
        const withAdapt = adapt !== null ? setAdapt(record, ai, adapt) : record;
        adapt = null;
        const patch = commit(withAdapt, state, action, res);
        count += 1;
        if (passed && patch.notice !== 'saveFailed') patch.notice = 'aiPassed';
        if (res.state.winner !== null) {
          set({ ...patch, screen: 'result', viewer: null, selection: NONE, aiBusy: false });
          return true;
        }
        if (action.type === 'endTurn') {
          set({ ...patch, aiBusy: false, digest: digestFor(viewer, turnLog) });
          turnLog = [];
          return true;
        }
        set(patch);
        return false;
      };

      // The AI could not decide twice running: it ends its turn, which is always legal, and the person is told.
      const pass = (): void => {
        const { record, state } = get();
        if (record === null || state === null) return;
        const res = applyAction(state, END_TURN);
        if (res.ok) play(record, state, END_TURN, res, true);
        else set({ aiBusy: false });
      };

      for (;;) {
        try {
          const { record, state } = get();
          if (record === null || state === null) return;
          const step = aiStep(cur, state, aiSeat);
          if (step.kind === 'think') {
            const deadlineMs = cur.plan === null && cur.refused.length === 0 ? FIRST_THINK_MS : REPLAN_MS;
            const plan = await deps.ai.think(aiInputFor(state, ai), { dial, seed: step.seed, refused: step.refused, deadlineMs });
            if (!live()) return;
            cur = afterThink(cur, plan);
            failed = false;
            continue;
          }
          const res = applyAction(state, step.action);
          cur = afterAct(cur, step.action, res.ok);
          failed = false;
          if (!res.ok) {
            if (step.action.type === 'endTurn') { set({ aiBusy: false }); return; }   // cannot happen; never loop on it
            continue;
          }
          if (play(record, state, step.action, res)) return;
          // Let the screen draw what it can see, and never hold the main thread through a long run of unseen actions.
          const watch = watchMs(res.events, state, res.state, viewer);
          await deps.sleep(watch > 0 ? Math.max(AI_STEP_MS, watch) : 0);
          if (!live()) return;
        } catch (e) {
          // A newer think or Home took over: that one owns the turn now. Should nothing have, aiBusy is not left set.
          if (isSuperseded(e) || !live()) { if (run === aiRun) set({ aiBusy: false }); return; }
          // Anything else (a planner or worker failure): try the same step once more, then pass the turn.
          if (!failed) { failed = true; continue; }
          pass();
          return;
        }
      }
    };

    const leave = (why: Notice | null = null): void => {
      turnLog = [];
      aiRun += 1;
      closeSession();
      const kept = get().notice === 'blockedUnseen' || get().notice === 'aiPassed' || get().notice === 'resignLost' ? null : get().notice;
      set({
        screen: 'home', record: null, state: null, viewer: null, selection: NONE, last: null, digest: [], saves: listSaves(kv), aiBusy: false,
        notice: why ?? kept, mode: 'local', online: null, inviteLink: null, onlineList: listOnline(kv),
      });
      deps.clearRoomFromUrl?.();
      sweep();
      deps.updater?.homeReached();
    };

    // ---- online ----

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
      const base = prior?.record ?? newRecord(v.code, f.settings, [seatOf(room, 0), seatOf(room, 1)], room.meta.createdAt);
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
            seq += 1;
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
      if (resignPending && !v.sending) {
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
      session = openSession(code, { net: n, ai: deps.ai, build: deps.build ?? BUILD, setTimer: deps.setTimer ?? realTimer, ...(deps.pause ? { pause: deps.pause } : {}) }, v => {
        if (gen === sessionGen) onView(v);
      });
      set({ online: session.view() });
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
      seq += 1;
      const patch: Partial<AppState> = { state: step.after, last: { seq, events: step.events, before: step.before }, online: session.view() };
      if (get().notice === 'blockedUnseen') patch.notice = null;
      if (step.after.winner !== null) set({ ...patch, screen: 'result', selection: NONE });
      else if (action.type === 'endTurn') set({ ...patch, selection: NONE, digest: [] });
      else set({ ...patch, selection: afterAction(selection, playerView(step.after, viewer), offered(step.after, viewer)) });
    };

    // Whether the viewer may act now: their turn, and online also the session's word that it is.
    const canAct = (state: MatchState, viewer: PlayerId): boolean =>
      viewer === state.current && (get().mode === 'local' || get().online?.myTurn === true);

    return {
      screen: 'home', record: null, state: null, viewer: null, selection: NONE, last: null, digest: [],
      notice: null, saves: listSaves(kv), update: { offlineReady: false, updateReady: false }, aiBusy: false,

      openSetup: () => set({ screen: 'setup' }),

      startMatch: setup => {
        const settings = { seed: deps.newSeed(), factions: setup.factions };
        const state = createMatch(settings);
        const second = setup.second ?? 'human';
        const seats: [string | Seat, string | Seat] = second === 'human' ? setup.names : [setup.names[0], {
          name: T.ai.name[second], kind: 'ai', level: second, salt: deps.newSeed() >>> 0,
          adapt: { dial: second === 'adaptive' ? readDial(kv, setup.names[0]) : LEVEL_DIAL[second], trend: 0 },
        }];
        const base = newRecord(deps.newId(), settings, seats, deps.now());
        const fresh: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
        const saved = writeSave(kv, fresh, state);
        openMatch(fresh, state, { notice: !saved.saved ? 'saveFailed' : saved.droppedUnfinished ? 'saveDropped' : null });
      },

      resume: id => {
        const body = readSave(kv, id);
        const res = body === null ? null : restore(body);
        if (res === null || (!res.ok && res.reason === 'corrupt')) { set({ screen: 'home', notice: 'saveUnreadable' }); return; }
        if (!res.ok) { set({ screen: 'home', notice: 'saveOldVersion' }); return; }
        openMatch(res.record, res.state, { notice: res.repaired ? 'saveRepaired' : null });
      },

      removeSave: id => { deleteSave(kv, id); set({ saves: listSaves(kv) }); },

      ready: () => {
        const { screen, state } = get();
        if (screen !== 'pass' || state === null) return;
        turnLog = [];
        set({ screen: 'match', viewer: state.current, selection: NONE });
      },

      tap: hit => {
        const { screen, state, viewer, selection, aiBusy, mode } = get();
        if (screen !== 'match' || state === null || viewer === null || aiBusy) return;
        const acts = canAct(state, viewer);
        // Online, the waiting player may still look: the selection moves, with nothing offered, so no action comes of it.
        if (!acts && mode === 'local') return;
        const out = tapLogic(selection, hit, playerView(state, viewer), acts ? offered(state, viewer) : indexActions([]));
        if (out.action !== null && acts) accept(out.action);
        else set({ selection: out.selection });
      },

      run: action => accept(action),

      nextUnit: () => {
        const { screen, state, viewer, selection, aiBusy } = get();
        if (screen !== 'match' || state === null || viewer === null || !canAct(state, viewer) || aiBusy) return;
        const next = nextUnitOf(selection, offered(state, viewer));
        if (next !== null) set({ selection: next });
      },

      arm: armed => {
        const { screen, state, viewer, selection, aiBusy } = get();
        if (screen !== 'match' || state === null || viewer === null || selection.kind !== 'unit' || aiBusy) return;
        if (get().mode === 'online' && !canAct(state, viewer)) return;
        const unit = state.units.find(u => u.id === selection.id);
        if (unit === undefined || unit.owner !== viewer) return;
        set({ selection: { kind: 'unit', id: selection.id, armed, askLure: null } });
      },

      select: sel => { if (get().screen === 'match' && !get().aiBusy) set({ selection: sel }); },

      goHome: () => {
        const { record, state, mode } = get();
        // Online the match stays in the database and on Home; only a local save is this phone's to delete.
        if (mode === 'local' && record !== null && state !== null && state.winner !== null) deleteSave(kv, record.id);
        leave();
      },

      recover: () => leave(),

      setUpdate: update => set({ update }),
      // `confirmed === true`, never just truthy: a button that passes its click event must not confirm.
      applyUpdate: confirmed => {
        if (get().screen !== 'home' || !get().update.updateReady) return;
        if (confirmed !== true && listOnline(kv).some(e => !e.over)) { set({ notice: 'updateDuringOnline' }); return; }
        void deps.updater?.apply();
      },

      mode: 'local', online: null, onlineList: listOnline(kv), inviteLink: null,

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
        const why = notReady();
        if (why !== null) { set({ notice: why }); return; }
        turnLog = [];
        aiRun += 1;
        closeSession();
        const gen = sessionGen;
        // The last known board at once, while the session connects; the database wins as soon as it answers.
        const entry = listOnline(kv).find(e => e.code === code);
        const cached = entry !== undefined ? readOnlineCache(kv, code) : null;
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
      startOnline: () => { if (session !== null) void session.start(deps.newSeed()); },

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

      dismissNotice: () => set({ notice: null }),
      dismissDigest: () => set({ digest: [] }),
    };
  });

  // A room named in the address, or one remembered before an update's reload, opens at once. The address keeps the
  // room while the player is in it (a reload comes back to it) and loses it when they leave (a reload then goes Home).
  const code = deps.roomFromUrl?.() ?? takePendingRoom(kv);
  if (code !== null) store.getState().openRoom(code);
  return store;
}

const seatOf = (room: Room, p: PlayerId): Seat => {
  const s = room.seats[p];
  return s ? toRecordSeat(s) : { name: '', kind: 'human' };
};
const stepOf = (st: Step): TurnStep => ({ before: st.before, after: st.after, events: st.events });

// Real storage, clock and randomness; each is touched only when called, and Node falls back to keeping nothing.
export function browserDeps(): Deps {
  const none: KeyValue = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const kv: KeyValue = {
    getItem: k => (typeof localStorage === 'undefined' ? none.getItem(k) : localStorage.getItem(k)),
    setItem: (k, v) => { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); },
    removeItem: k => { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); },
  };
  return {
    kv,
    now: () => Date.now(),
    newSeed: () => {
      if (typeof location !== 'undefined') {
        const raw = new URLSearchParams(location.search).get('seed');
        const n = raw === null || raw.trim() === '' ? NaN : Number(raw);
        if (Number.isInteger(n)) return n >>> 0;
      }
      return Math.floor(Math.random() * 2 ** 32);
    },
    newId: () => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`),
    ai: createAiClient(),
    sleep: ms => new Promise(resolve => { setTimeout(resolve, ms); }),
    openNet: () => import('../net/firebaseNet').then(m => m.firebaseNet()),
    online: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    roomFromUrl: () => (typeof location === 'undefined' ? null : codeFromSearch(location.search)),
    roomToUrl: code => setRoomInUrl(code),
    clearRoomFromUrl: () => setRoomInUrl(null),
    inviteBase: () => `${location.origin}${import.meta.env.BASE_URL}`,
    build: BUILD,
    setTimer: realTimer,
    netReady,
  };
}

// Puts ?room= in the address, or takes it out, keeping every other parameter, without a new history entry.
function setRoomInUrl(code: string | null): void {
  if (typeof location === 'undefined' || typeof history === 'undefined') return;
  const params = new URLSearchParams(location.search);
  if (params.get('room') === code || (code === null && !params.has('room'))) return;
  if (code === null) params.delete('room');
  else params.set('room', code);
  const query = params.toString();
  history.replaceState(history.state, '', `${location.pathname}${query === '' ? '' : `?${query}`}${location.hash}`);
}
