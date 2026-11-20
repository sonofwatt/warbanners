import { FACTIONS } from '../engine';
import type { FactionId, PlayerId } from '../engine';
import { FINISHED_SWEEP_MS, isRoomCode, ROOM_IDLE_TTL_MS } from '../online/wire';
import { restore } from './record';
import type { MatchRecord, Restored } from './record';
import type { KeyValue } from './saves';

// This phone's online matches. They live under their own keys and never touch the saves (warbanners.saves.v1,
// warbanners.save.<id>), so the saves' limit, eviction order and listing are exactly as they were.
export interface OnlineEntry {
  code: string;
  seat: PlayerId;
  names: [string, string];
  factions: [FactionId, FactionId];
  round: number;
  current: PlayerId;
  over: boolean;
  rulesVersion: number;
  createdHere: boolean;
  updatedAt: number;
}

export const MAX_ONLINE = 20;
const LIST_KEY = 'warbanners.online.v1';
const PENDING_KEY = 'warbanners.online.pending';
const cacheKey = (code: string) => `warbanners.online.${code}`;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPair = (v: unknown, item: (x: unknown) => boolean): boolean => Array.isArray(v) && v.length === 2 && v.every(item);
const isSeat = (v: unknown): v is PlayerId => v === 0 || v === 1;

function isEntry(e: unknown): e is OnlineEntry {
  return isObject(e) && isRoomCode(e.code) && isSeat(e.seat) && isSeat(e.current)
    && isPair(e.names, x => typeof x === 'string')
    && isPair(e.factions, x => typeof x === 'string' && Object.hasOwn(FACTIONS, x))
    && typeof e.round === 'number' && typeof e.over === 'boolean' && typeof e.rulesVersion === 'number'
    && typeof e.createdHere === 'boolean' && typeof e.updatedAt === 'number';
}

function readList(kv: KeyValue): OnlineEntry[] {
  try {
    const raw = kv.getItem(LIST_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

const newestFirst = (a: OnlineEntry, b: OnlineEntry) => b.updatedAt - a.updatedAt;

export function listOnline(kv: KeyValue): OnlineEntry[] {
  return readList(kv).sort(newestFirst);
}

// Which others to drop so that they and the entry being written fit in MAX_ONLINE: finished first, then
// unfinished, oldest first within each. The entry being written is never one of them.
function toDrop(others: readonly OnlineEntry[]): OnlineEntry[] {
  const excess = others.length + 1 - MAX_ONLINE;
  if (excess <= 0) return [];
  const oldestFirst = [...others].sort((a, b) => a.updatedAt - b.updatedAt);
  return [...oldestFirst.filter(e => e.over), ...oldestFirst.filter(e => !e.over)].slice(0, excess);
}

// What became of a write. `saved` is false when the phone refused, and then the previous list stays in place.
// `droppedUnfinished` is true when making room cost an unfinished match from the list (the room itself survives on
// the server, but this phone loses its pointer), which the player is told about. `dropped` are the codes that went.
// `cached` is false when the record cache could not be written; the entry is still listed, only the instant start is lost.
export interface OnlineOutcome { saved: boolean; droppedUnfinished: boolean; dropped: string[]; cached: boolean }

// `cache` is the last known record, kept for an instant start; null leaves any earlier cache as it is.
// The list is written first, so a failed list write leaves no orphan cache key, and a failed cache write
// never costs the entry its place in the list.
export function rememberOnline(kv: KeyValue, e: OnlineEntry, cache: MatchRecord | null): OnlineOutcome {
  let dropped: OnlineEntry[];
  try {
    const others = readList(kv).filter(x => x.code !== e.code);
    dropped = toDrop(others);
    const list = [...others.filter(x => !dropped.includes(x)), e].sort(newestFirst);
    kv.setItem(LIST_KEY, JSON.stringify(list));
  } catch {
    return { saved: false, droppedUnfinished: false, dropped: [], cached: false };
  }
  let cached = true;
  if (cache !== null) {
    try { kv.setItem(cacheKey(e.code), JSON.stringify(cache)); } catch { cached = false; }
  }
  for (const d of dropped) {
    try { kv.removeItem(cacheKey(d.code)); } catch { /* the list no longer names it */ }
  }
  return { saved: true, droppedUnfinished: dropped.some(d => !d.over), dropped: dropped.map(d => d.code), cached };
}

export function readOnlineCache(kv: KeyValue, code: string): Restored | null {
  try {
    if (!isRoomCode(code)) return null;
    const raw = kv.getItem(cacheKey(code));
    return raw === null ? null : restore(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function forgetOnline(kv: KeyValue, code: string): void {
  try {
    if (!isRoomCode(code)) return;
    try { kv.removeItem(cacheKey(code)); } catch { /* the list is still updated */ }
    kv.setItem(LIST_KEY, JSON.stringify(readList(kv).filter(e => e.code !== code)));
  } catch { /* nothing more to do */ }
}

// Only matches created here are swept: a room made on another phone is that phone's to delete.
export function dueForSweep(list: OnlineEntry[], now: number): string[] {
  return list
    .filter(e => e.createdHere && now - e.updatedAt > (e.over ? FINISHED_SWEEP_MS : ROOM_IDLE_TTL_MS))
    .map(e => e.code);
}

export function setPendingRoom(kv: KeyValue, code: string | null): void {
  try {
    if (code === null || !isRoomCode(code)) kv.removeItem(PENDING_KEY);
    else kv.setItem(PENDING_KEY, code);
  } catch { /* nothing more to do */ }
}

export function takePendingRoom(kv: KeyValue): string | null {
  try {
    const raw = kv.getItem(PENDING_KEY);
    kv.removeItem(PENDING_KEY);
    return isRoomCode(raw) ? raw : null;
  } catch {
    return null;
  }
}
