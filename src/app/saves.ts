import { FACTIONS, RULES_VERSION } from '../engine';
import type { FactionId, MatchState, PlayerId } from '../engine';
import { roundOf } from './record';
import type { MatchRecord } from './record';

export interface KeyValue {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface SaveSummary {
  id: string;
  names: [string, string];
  factions: [FactionId, FactionId];
  round: number;
  current: PlayerId;
  over: boolean;
  resumable: boolean;
  updatedAt: number;
}

export const MAX_SAVES = 20;
const LIST_KEY = 'warbanners.saves.v1';
const bodyKey = (id: string) => `warbanners.save.${id}`;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const isPair = (v: unknown, item: (x: unknown) => boolean): boolean => Array.isArray(v) && v.length === 2 && v.every(item);

function isSummary(e: unknown): e is SaveSummary {
  return isObject(e) && typeof e.id === 'string' && typeof e.updatedAt === 'number'
    && isPair(e.names, x => typeof x === 'string')
    && isPair(e.factions, x => typeof x === 'string' && Object.hasOwn(FACTIONS, x))
    && typeof e.round === 'number' && (e.current === 0 || e.current === 1) && typeof e.over === 'boolean';
}

function readList(kv: KeyValue): SaveSummary[] {
  try {
    const raw = kv.getItem(LIST_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSummary);
  } catch {
    return [];
  }
}

const newestFirst = (a: SaveSummary, b: SaveSummary) => b.updatedAt - a.updatedAt;

export function listSaves(kv: KeyValue): SaveSummary[] {
  try {
    const out: SaveSummary[] = [];
    for (const entry of readList(kv)) {
      const body = readSave(kv, entry.id);
      if (!isObject(body)) continue;
      out.push({ ...entry, resumable: body.rulesVersion === RULES_VERSION });
    }
    return out.sort(newestFirst);
  } catch {
    return [];
  }
}

// What became of a write. `saved` is false when the phone refused, and then the previous list stays in place.
// `droppedUnfinished` is true when making room cost an unfinished match, which the player is told about.
// `summary` is the written match's entry and `dropped` the ids that went, so a caller can keep its list without
// reading every saved match back.
export interface SaveOutcome { saved: boolean; droppedUnfinished: boolean; summary: SaveSummary | null; dropped: string[] }

// The list a caller already has, brought up to date with a write, as listSaves would now give it.
export function withSave(list: readonly SaveSummary[], out: SaveOutcome): SaveSummary[] {
  if (!out.saved || out.summary === null) return [...list];
  const gone = new Set([out.summary.id, ...out.dropped]);
  return [...list.filter(e => !gone.has(e.id)), out.summary].sort(newestFirst);
}

// Which others to drop so that they and the record being written fit in MAX_SAVES. The record being written is
// never one of them. Finished matches go first, then unfinished ones, oldest first within each.
function toDrop(others: readonly SaveSummary[]): SaveSummary[] {
  const excess = others.length + 1 - MAX_SAVES;
  if (excess <= 0) return [];
  const oldestFirst = [...others].sort((a, b) => a.updatedAt - b.updatedAt);
  return [...oldestFirst.filter(e => e.over), ...oldestFirst.filter(e => !e.over)].slice(0, excess);
}

export function writeSave(kv: KeyValue, rec: MatchRecord, state: MatchState): SaveOutcome {
  try {
    const summary: SaveSummary = {
      id: rec.id,
      names: [rec.players[0]?.name ?? '', rec.players[1]?.name ?? ''],
      factions: rec.settings.factions,
      round: roundOf(state),
      current: state.current,
      over: state.winner !== null,
      resumable: true,
      updatedAt: rec.updatedAt,
    };
    const others = readList(kv).filter(e => e.id !== rec.id);
    const dropped = toDrop(others);
    const list = [...others.filter(e => !dropped.includes(e)), summary].sort(newestFirst);
    kv.setItem(bodyKey(rec.id), JSON.stringify(rec));
    kv.setItem(LIST_KEY, JSON.stringify(list));
    for (const d of dropped) {
      try { kv.removeItem(bodyKey(d.id)); } catch { /* the list no longer names it */ }
    }
    return { saved: true, droppedUnfinished: dropped.some(d => !d.over), summary, dropped: dropped.map(d => d.id) };
  } catch {
    return { saved: false, droppedUnfinished: false, summary: null, dropped: [] };
  }
}

export function readSave(kv: KeyValue, id: string): unknown {
  try {
    const raw = kv.getItem(bodyKey(id));
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function deleteSave(kv: KeyValue, id: string): void {
  try {
    kv.removeItem(bodyKey(id));
    kv.setItem(LIST_KEY, JSON.stringify(readList(kv).filter(e => e.id !== id)));
  } catch { /* nothing more to do */ }
}
