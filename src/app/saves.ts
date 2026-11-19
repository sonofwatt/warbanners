import { RULES_VERSION } from '../engine';
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

export const MAX_SAVES = 5;
const LIST_KEY = 'banners.saves.v1';
const bodyKey = (id: string) => `banners.save.${id}`;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function readList(kv: KeyValue): SaveSummary[] {
  try {
    const raw = kv.getItem(LIST_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is SaveSummary => isObject(e) && typeof e.id === 'string' && typeof e.updatedAt === 'number');
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

// False when the phone refused; the previous list stays in place.
export function writeSave(kv: KeyValue, rec: MatchRecord, state: MatchState): boolean {
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
    const list = [...readList(kv).filter(e => e.id !== rec.id), summary].sort(newestFirst);
    const dropped = list.splice(MAX_SAVES);
    kv.setItem(bodyKey(rec.id), JSON.stringify(rec));
    kv.setItem(LIST_KEY, JSON.stringify(list));
    for (const d of dropped) {
      try { kv.removeItem(bodyKey(d.id)); } catch { /* the list no longer names it */ }
    }
    return true;
  } catch {
    return false;
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
