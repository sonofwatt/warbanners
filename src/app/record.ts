import { createMatch, FACTIONS, hashState, legalActions, playerView, replay, RULES_VERSION } from '../engine';
import type { Action, MatchSettings, MatchState } from '../engine';

// The same shape online play will store in plan 4.
export interface MatchRecord {
  id: string;
  rulesVersion: number;
  settings: MatchSettings;
  players: { name: string; kind: 'human' }[]; // plan 3 adds 'ai'
  actions: Action[];
  snapshot: { count: number; hash: string; state: MatchState } | null; // the state after `count` actions
  createdAt: number;
  updatedAt: number;
}

export function newRecord(id: string, settings: MatchSettings, names: [string, string], now: number): MatchRecord {
  return {
    id,
    rulesVersion: RULES_VERSION,
    settings,
    players: names.map(name => ({ name, kind: 'human' as const })),
    actions: [],
    snapshot: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function append(rec: MatchRecord, action: Action, stateAfter: MatchState, now: number): MatchRecord {
  const actions = [...rec.actions, action];
  return {
    ...rec,
    actions,
    snapshot: { count: actions.length, hash: hashState(stateAfter), state: stateAfter },
    updatedAt: now,
  };
}

export type Restored =
  | { ok: true; record: MatchRecord; state: MatchState; repaired: boolean }
  | { ok: false; reason: 'version' | 'corrupt' };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// The parts a consumer reads that the snapshot hash does not cover.
function wellFormed(v: Record<string, unknown>): boolean {
  const { players, settings } = v;
  if (!Array.isArray(players) || players.length !== 2) return false;
  if (!players.every(p => isObject(p) && typeof p.name === 'string')) return false;
  if (!isObject(settings) || typeof settings.seed !== 'number') return false;
  const f = settings.factions;
  return Array.isArray(f) && f.length === 2 && f.every(x => typeof x === 'string' && Object.hasOwn(FACTIONS, x));
}

// Never throws, whatever it is given.
export function restore(value: unknown): Restored {
  if (!isObject(value) || typeof value.rulesVersion !== 'number' || !isObject(value.settings) || !Array.isArray(value.actions)) {
    return { ok: false, reason: 'corrupt' };
  }
  if (value.rulesVersion !== RULES_VERSION) return { ok: false, reason: 'version' };
  if (!wellFormed(value)) return { ok: false, reason: 'corrupt' };
  const rec = value as unknown as MatchRecord;

  try {
    const snap = rec.snapshot;
    if (snap === null || snap === undefined) return rebuilt(rec, false);
    if (isObject(snap) && snap.count === rec.actions.length && typeof snap.hash === 'string' && isObject(snap.state)) {
      let trusted = false;
      try { trusted = hashState(snap.state as unknown as MatchState) === snap.hash; } catch { trusted = false; }
      if (trusted && playable(snap.state as unknown as MatchState, rec.settings)) {
        return { ok: true, record: rec, state: snap.state as unknown as MatchState, repaired: false };
      }
    }
    return rebuilt(rec, true);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
}

// Whether every object in `items` has each field that `like` has. An empty `like` proves nothing and passes.
function sameFields(items: unknown[], like: object | undefined): boolean {
  if (like === undefined) return true;
  const keys = Object.keys(like);
  return items.every(x => isObject(x) && keys.every(k => Object.hasOwn(x, k)));
}

// A snapshot's hash proves it is the one that was written, not that this build can read it: a state written before
// a change to MatchState's shape hashes to itself and then throws on the screen. So its fields are checked against
// a fresh match of the same settings, and the screens' first calls are tried on it.
function playable(state: MatchState, settings: MatchSettings): boolean {
  try {
    const fresh = createMatch(settings);
    if (!sameFields([state], fresh)) return false;
    const { players, units, cities, tiles } = state as unknown as Record<string, unknown>;
    if (!Array.isArray(players) || !Array.isArray(units) || !Array.isArray(cities) || !isObject(tiles)) return false;
    if (!sameFields(players, fresh.players[0]) || !sameFields(units, fresh.units[0]) || !sameFields(cities, fresh.cities[0])) return false;
    if (!sameFields(Object.values(tiles), Object.values(fresh.tiles)[0])) return false;
    if (state.winner !== null && state.winner !== 0 && state.winner !== 1) return false;
    playerView(state, 0);
    playerView(state, 1);
    legalActions(state);
    return true;
  } catch {
    return false;
  }
}

function rebuilt(rec: MatchRecord, repaired: boolean): Restored {
  const state = rec.actions.length === 0 ? createMatch(rec.settings) : replay(rec.settings, rec.actions);
  const record: MatchRecord = { ...rec, snapshot: { count: rec.actions.length, hash: hashState(state), state } };
  return { ok: true, record, state, repaired };
}

// The turn number players see.
export function roundOf(state: MatchState): number {
  return Math.floor(state.stamp / 2) + 1;
}
