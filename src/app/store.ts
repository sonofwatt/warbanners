import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { applyAction, createMatch, hashState, legalActions, playerView } from '../engine';
import type { Action, FactionId, GameEvent, MatchState, PlayerId } from '../engine';
import { afterAction, indexActions, NONE, tap as tapLogic } from '../ui/interaction';
import type { Armed, Hit, Selection } from '../ui/interaction';
import { digestFor } from './digest';
import type { DigestLine, TurnStep } from './digest';
import { append, newRecord, restore } from './record';
import type { MatchRecord } from './record';
import { deleteSave, listSaves, readSave, withSave, writeSave } from './saves';
import type { KeyValue, SaveSummary } from './saves';
import type { UpdateState, Updater } from './update';

export interface Deps { kv: KeyValue; now(): number; newSeed(): number; newId(): string; updater?: Updater }
export interface Setup { names: [string, string]; factions: [FactionId, FactionId] }
export type Screen = 'home' | 'setup' | 'pass' | 'match' | 'result';
export type Notice = 'saveFailed' | 'saveRepaired' | 'saveDropped' | 'saveUnreadable' | 'saveOldVersion';

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
  openSetup(): void; startMatch(setup: Setup): void; resume(id: string): void; removeSave(id: string): void;
  ready(): void;                    // the player named on the curtain now has the phone
  tap(hit: Hit): void; run(action: Action): void; arm(armed: Armed | null): void; select(sel: Selection): void;
  setUpdate(s: UpdateState): void; applyUpdate(): void;   // a new build is applied only from home
  goHome(): void; dismissNotice(): void; dismissDigest(): void;
  recover(): void;                  // back to home after a screen failed to draw, keeping every save
}

export function createAppStore(deps: Deps): StoreApi<AppState> {
  let seq = 0;
  let turnLog: TurnStep[] = [];
  const kv = deps.kv;

  return createStore<AppState>((set, get) => {
    // Opens a match behind the curtain: nobody's view is drawn until ready().
    const openMatch = (record: MatchRecord, state: MatchState, extra: Partial<AppState> = {}): void => {
      turnLog = [];
      set({
        screen: state.winner !== null ? 'result' : 'pass', record, state, viewer: null, selection: NONE,
        last: null, digest: [], saves: listSaves(kv), ...extra,
      });
    };

    const accept = (action: Action): void => {
      const { record, state, viewer, selection } = get();
      if (get().screen !== 'match' || record === null || state === null || viewer === null || viewer !== state.current) return;
      const res = applyAction(state, action);
      if (!res.ok) return;
      const next = append(record, action, res.state, deps.now());
      const saved = writeSave(kv, next, res.state);
      turnLog.push({ before: state, after: res.state, events: res.events });
      seq += 1;
      const patch: Partial<AppState> = {
        record: next, state: res.state, saves: withSave(get().saves, saved), last: { seq, events: res.events, before: state },
      };
      // A failure is reported at once; a later save that works makes the report out of date, so it goes.
      if (!saved.saved) patch.notice = 'saveFailed';
      else if (saved.droppedUnfinished) patch.notice = 'saveDropped';
      else if (get().notice === 'saveFailed') patch.notice = null;
      if (res.state.winner !== null) {
        set({ ...patch, screen: 'result', viewer: null, selection: NONE });
      } else if (action.type === 'endTurn') {
        set({ ...patch, screen: 'pass', viewer: null, selection: NONE, digest: digestFor(res.state.current, turnLog) });
      } else {
        const view = playerView(res.state, viewer);
        set({ ...patch, selection: afterAction(selection, view, indexActions(legalActions(res.state))) });
      }
    };

    return {
      screen: 'home', record: null, state: null, viewer: null, selection: NONE, last: null, digest: [],
      notice: null, saves: listSaves(kv), update: { offlineReady: false, updateReady: false },

      openSetup: () => set({ screen: 'setup' }),

      startMatch: setup => {
        const settings = { seed: deps.newSeed(), factions: setup.factions };
        const state = createMatch(settings);
        const base = newRecord(deps.newId(), settings, setup.names, deps.now());
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
        const { screen, state, viewer, selection } = get();
        if (screen !== 'match' || state === null || viewer === null || viewer !== state.current) return;
        const out = tapLogic(selection, hit, playerView(state, viewer), indexActions(legalActions(state)));
        if (out.action !== null) accept(out.action);
        else set({ selection: out.selection });
      },

      run: action => accept(action),

      arm: armed => {
        const { screen, state, viewer, selection } = get();
        if (screen !== 'match' || state === null || viewer === null || selection.kind !== 'unit') return;
        const unit = state.units.find(u => u.id === selection.id);
        if (unit === undefined || unit.owner !== viewer) return;
        set({ selection: { kind: 'unit', id: selection.id, armed, askLure: null } });
      },

      select: sel => { if (get().screen === 'match') set({ selection: sel }); },

      goHome: () => {
        const { record, state } = get();
        if (record !== null && state !== null && state.winner !== null) deleteSave(kv, record.id);
        turnLog = [];
        set({ screen: 'home', record: null, state: null, viewer: null, selection: NONE, last: null, digest: [], saves: listSaves(kv) });
      },

      recover: () => {
        turnLog = [];
        set({ screen: 'home', record: null, state: null, viewer: null, selection: NONE, last: null, digest: [], saves: listSaves(kv) });
      },

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
  };
}
