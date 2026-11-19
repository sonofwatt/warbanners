import { createMatch, FACTIONS, hashState, replay, RULES_VERSION } from '../engine';
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
      if (trusted) return { ok: true, record: rec, state: snap.state as unknown as MatchState, repaired: false };
    }
    return rebuilt(rec, true);
  } catch {
    return { ok: false, reason: 'corrupt' };
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
