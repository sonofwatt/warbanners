import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { applyAction, createMatch, hashState, playerView } from '../engine';
import type { Action, FactionId, GameEvent, MatchState, PlayerId } from '../engine';
import { adaptStep, betweenMatches, gapOf } from '../ai/adapt';
import type { AdaptState } from '../ai/adapt';
import { afterAct, afterThink, aiStep, FIRST_THINK_MS, REPLAN_MS, START } from '../ai/driver';
import type { Cursor } from '../ai/driver';
import { aiInputFor } from '../ai/input';
import { LEVEL_DIAL } from '../ai/types';
import type { AiLevel } from '../ai/types';
import { watchMs } from '../ui/board/effects';
import { movesWalk3d } from '../ui/terrain3d/option';
import { afterAction, indexActions, isOffered, NONE, nextUnit as nextUnitOf, offered, tap as tapLogic } from '../ui/interaction';
import type { Armed, Hit, Selection } from '../ui/interaction';
import { T } from '../ui/text';
import { netReady } from '../netReady';
import { BUILD } from '../version';
import type { Net } from '../net/net';
import type { SessionView } from '../online/session';
import { codeFromSearch } from '../online/wire';
import type { ClockSec } from '../online/wire';
import { createAiClient, isSuperseded } from './aiClient';
import { createOnlineSide, onPageVisible, realTimer, setRoomInUrl } from './onlineStore';
import type { AiClient } from './aiClient';
import { readDial, writeDial } from './aiMemory';
import { digestFor } from './digest';
import type { DigestLine, TurnStep } from './digest';
import { append, newRecord, restore, setAdapt } from './record';
import type { MatchRecord, Seat } from './record';
import { listOnline, takePendingRoom } from './onlineList';
import type { OnlineEntry } from './onlineList';
import { forgetPlayer as forgetStats, isCounted, pruneLines, linesFor, matchKey, readLines, recentNames, recordLines, rememberNames } from './stats';
import type { StatLine } from './stats';
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
  onVisible?: (fn: () => void) => () => void;   // fn on each return of the page to view; returns the unsubscribe
}
export type SecondSeat = 'human' | AiLevel;
export interface Setup { names: [string, string]; factions: [FactionId, FactionId]; second?: SecondSeat }   // second: 'human' if left out
export type Screen = 'home' | 'setup' | 'stats' | 'pass' | 'match' | 'result' | 'onlineSetup' | 'lobby' | 'join';
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
  statLines: StatLine[];            // this phone's player stats, read when the Stats screen opens
  names: string[];                  // names typed here before, newest first, to offer at setup
  openStats(): void;
  forgetPlayer(name: string): void; // drops a name and its stats from this phone
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
  // Names typed at setup, kept to offer next time. The default names stand for a blank field and are not offered.
  const rememberTyped = (names: readonly string[]): void => {
    rememberNames(kv, names.filter(n => n !== T.ui.playerOne && n !== T.ui.playerTwo));
  };


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
      if (isOnline()) { acceptOnline(action); return; }
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
          const watch = watchMs(res.events, state, res.state, viewer, movesWalk3d());
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

    const { acceptOnline, closeSession, sweep, isOnline, ...members } = createOnlineSide({
      deps, get, set, leave: why => leave(why ?? null),
      local: { nextSeq: () => ++seq, resetTurnLog: () => { turnLog = []; }, bumpAiRun: () => { aiRun += 1; } },
    });

    // Whether the viewer may act now: their turn, and online also the session's word that it is.
    const canAct = (state: MatchState, viewer: PlayerId): boolean =>
      viewer === state.current && (get().mode === 'local' || get().online?.myTurn === true);

    return {
      screen: 'home', record: null, state: null, viewer: null, selection: NONE, last: null, digest: [],
      notice: null, saves: listSaves(kv), update: { offlineReady: false, updateReady: false }, aiBusy: false,

      statLines: [], names: [],
      openSetup: () => set({ screen: 'setup', names: recentNames(kv) }),
      openStats: () => { pruneLines(kv, deps.now()); set({ screen: 'stats', statLines: readLines(kv, deps.now()) }); },
      forgetPlayer: name => { forgetStats(kv, name); set({ statLines: readLines(kv, deps.now()), names: recentNames(kv) }); },

      startMatch: setup => {
        const second = setup.second ?? 'human';
        rememberTyped(second === 'human' ? setup.names : [setup.names[0]]);
        const settings = { seed: deps.newSeed(), factions: setup.factions };
        const state = createMatch(settings);
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

      ...members,
      openOnline: () => { members.openOnline(); set({ names: recentNames(kv) }); },
      openJoin: () => { members.openJoin(); set({ names: recentNames(kv) }); },
      openRoom: code => { set({ names: recentNames(kv) }); members.openRoom(code); },
      createRoom: input => { rememberTyped([input.name]); return members.createRoom(input); },
      joinAs: name => { rememberTyped([name]); return members.joinAs(name); },

      dismissNotice: () => set({ notice: null }),
      dismissDigest: () => set({ digest: [] }),
    };
  });

  // Every finished match is recorded in the player stats once: here, whatever brought it to an end or reopened it.
  // Online only once the server holds the end, as Home's list does, and only for this phone's seat.
  const seen = new Set<string>();
  const recordIfOver = (s: AppState): void => {
    const { record, state } = s;
    if (record === null || state === null || state.winner === null) return;
    // Online only once the session itself says the match is over and the server holds it: not while a final write
    // is on its way, not while a lost race is being rebuilt, and never from the cached copy Home opens first.
    const o = s.online;
    if (s.mode === 'online' && (o === null || o.phase !== 'over' || o.sending || o.verifying || o.room?.meta.phase !== 'over' || s.viewer === null)) return;
    const key = matchKey(record);
    if (seen.has(key)) return;
    try {
      if (isCounted(kv, key)) { seen.add(key); return; }
      // A local match ends when its last action was saved; online, now is when the server's word arrived.
      const at = s.mode === 'local' ? record.updatedAt : deps.now();
      const lines = linesFor(record, s.mode, s.viewer, at);
      if (lines === null) return;          // the actions do not reach the end the state shows: wait for them
      seen.add(key);
      recordLines(kv, key, lines, deps.now());
    } catch { seen.add(key); /* the stats are lost for this match, never the match */ }
  };
  store.subscribe(recordIfOver);

  // A room named in the address, or one remembered before an update's reload, opens at once. The address keeps the
  // room while the player is in it (a reload comes back to it) and loses it when they leave (a reload then goes Home).
  const code = deps.roomFromUrl?.() ?? takePendingRoom(kv);
  if (code !== null) store.getState().openRoom(code);
  return store;
}

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
    netReady, onVisible: onPageVisible,
  };
}
