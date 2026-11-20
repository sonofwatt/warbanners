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
import { afterAction, isOffered, NONE, nextUnit as nextUnitOf, offered, tap as tapLogic } from '../ui/interaction';
import type { Armed, Hit, Selection } from '../ui/interaction';
import { T } from '../ui/text';
import { createAiClient, isSuperseded } from './aiClient';
import type { AiClient } from './aiClient';
import { readDial, writeDial } from './aiMemory';
import { digestFor } from './digest';
import type { DigestLine, TurnStep } from './digest';
import { append, newRecord, restore, setAdapt } from './record';
import type { MatchRecord, Seat } from './record';
import { deleteSave, listSaves, readSave, withSave, writeSave } from './saves';
import type { KeyValue, SaveSummary } from './saves';
import type { UpdateState, Updater } from './update';

export interface Deps {
  kv: KeyValue; now(): number; newSeed(): number; newId(): string; updater?: Updater;
  ai: AiClient; sleep(ms: number): Promise<void>;
}
export type SecondSeat = 'human' | AiLevel;
export interface Setup { names: [string, string]; factions: [FactionId, FactionId]; second?: SecondSeat }   // second: 'human' if left out
export type Screen = 'home' | 'setup' | 'pass' | 'match' | 'result';
export type Notice = 'saveFailed' | 'saveRepaired' | 'saveDropped' | 'saveUnreadable' | 'saveOldVersion' | 'blockedUnseen' | 'aiPassed';

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
  setUpdate(s: UpdateState): void; applyUpdate(): void;   // a new build is applied only from home
  goHome(): void; dismissNotice(): void; dismissDigest(): void;
  recover(): void;                  // back to home after a screen failed to draw, keeping every save
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

  return createStore<AppState>((set, get) => {
    // Opens a match. Between two people it opens behind the curtain: nobody's view is drawn until ready(). Against
    // the AI there is no curtain: the person's view is drawn at once, and the AI plays at once if it is to move.
    const openMatch = (record: MatchRecord, state: MatchState, extra: Partial<AppState> = {}): void => {
      turnLog = [];
      aiRun += 1;
      const solo = soloSeat(record);
      const over = state.winner !== null;
      set({
        screen: over ? 'result' : solo !== null ? 'match' : 'pass', record, state, viewer: over ? null : solo,
        selection: NONE, last: null, digest: [], saves: listSaves(kv), aiBusy: false, ...extra,
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

    const leave = (): void => {
      turnLog = [];
      aiRun += 1;
      const notice = get().notice === 'blockedUnseen' || get().notice === 'aiPassed' ? null : get().notice;
      set({ screen: 'home', record: null, state: null, viewer: null, selection: NONE, last: null, digest: [], saves: listSaves(kv), aiBusy: false, notice });
      deps.updater?.homeReached();
    };

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
        const { screen, state, viewer, selection, aiBusy } = get();
        if (screen !== 'match' || state === null || viewer === null || viewer !== state.current || aiBusy) return;
        const out = tapLogic(selection, hit, playerView(state, viewer), offered(state, viewer));
        if (out.action !== null) accept(out.action);
        else set({ selection: out.selection });
      },

      run: action => accept(action),

      nextUnit: () => {
        const { screen, state, viewer, selection, aiBusy } = get();
        if (screen !== 'match' || state === null || viewer === null || viewer !== state.current || aiBusy) return;
        const next = nextUnitOf(selection, offered(state, viewer));
        if (next !== null) set({ selection: next });
      },

      arm: armed => {
        const { screen, state, viewer, selection, aiBusy } = get();
        if (screen !== 'match' || state === null || viewer === null || selection.kind !== 'unit' || aiBusy) return;
        const unit = state.units.find(u => u.id === selection.id);
        if (unit === undefined || unit.owner !== viewer) return;
        set({ selection: { kind: 'unit', id: selection.id, armed, askLure: null } });
      },

      select: sel => { if (get().screen === 'match' && !get().aiBusy) set({ selection: sel }); },

      goHome: () => {
        const { record, state } = get();
        if (record !== null && state !== null && state.winner !== null) deleteSave(kv, record.id);
        leave();
      },

      recover: () => leave(),

      setUpdate: update => set({ update }),
      applyUpdate: () => { if (get().screen === 'home' && get().update.updateReady) void deps.updater?.apply(); },

      dismissNotice: () => set({ notice: null }),
      dismissDigest: () => set({ digest: [] }),
    };
  });
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
  };
}
