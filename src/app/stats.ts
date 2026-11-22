import { FACTIONS } from '../engine';
import type { FactionId, PlayerId } from '../engine';
import type { AiLevel } from '../ai/types';
import type { MatchRecord } from './record';
import type { KeyValue } from './saves';
import { matchTallies } from './tally';
import type { Tally } from './tally';

// Per-phone player stats: one line for each player in each finished match, summed under filters when shown.

export type MatchKind = 'computer' | 'pass' | 'online';
export interface Opponent { name: string; faction: FactionId; tally: Tally }
export interface StatLine {
  match: string; at: number; name: string; kind: MatchKind; faction: FactionId;
  ai: AiLevel | null;              // the level of the AI played against, if it was one
  won: boolean; rounds: number; tally: Tally;
  opponent: Opponent | null;       // the other side's numbers for this match; an online one goes after 30 days
}
export interface Filter { kind: MatchKind | 'all'; faction: FactionId | 'all'; ai: AiLevel | 'any' }
export interface Summary {
  played: number; wins: number; losses: number; winRate: number | null;
  streak: number; bestStreak: number;
  avgDealt: number | null; avgTaken: number | null;
  kills: number; deaths: number; cities: number; heroes: number; treasures: number;
  avgRounds: number | null; favourite: FactionId | null;
}

export const MAX_LINES = 1000;
export const MAX_COUNTED = 2000;
export const MAX_NAMES = 8;
export const DAY_MS = 86_400_000;
export const OPPONENT_KEPT_MS = 30 * DAY_MS;
const STATS_KEY = 'warbanners.stats.v1';
const NAMES_KEY = 'warbanners.names.v1';

const LEVELS: readonly AiLevel[] = ['easy', 'normal', 'hard', 'adaptive'];
const KINDS: readonly MatchKind[] = ['computer', 'pass', 'online'];
const TALLY_KEYS: readonly (keyof Tally)[] = ['dealt', 'taken', 'kills', 'deaths', 'cities', 'heroes', 'treasures'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isFaction = (x: unknown): x is FactionId => typeof x === 'string' && Object.hasOwn(FACTIONS, x);
const isTally = (v: unknown): v is Tally => isObject(v) && TALLY_KEYS.every(k => finite(v[k]));
const isOpponent = (v: unknown): v is Opponent => isObject(v) && typeof v.name === 'string' && isFaction(v.faction) && isTally(v.tally);

function isLine(v: unknown): v is StatLine {
  return isObject(v) && typeof v.match === 'string' && finite(v.at) && typeof v.name === 'string'
    && KINDS.includes(v.kind as MatchKind) && isFaction(v.faction)
    && (v.ai === null || LEVELS.includes(v.ai as AiLevel)) && typeof v.won === 'boolean' && finite(v.rounds)
    && isTally(v.tally) && (v.opponent === null || isOpponent(v.opponent));
}

interface Stored { lines: StatLine[]; counted: string[] }

function readStored(kv: KeyValue): Stored {
  try {
    const raw = kv.getItem(STATS_KEY);
    if (raw === null) return { lines: [], counted: [] };
    const v: unknown = JSON.parse(raw);
    if (!isObject(v)) return { lines: [], counted: [] };
    const lines = Array.isArray(v.lines) ? v.lines.filter(isLine) : [];
    const counted = Array.isArray(v.counted) ? v.counted.filter((x): x is string => typeof x === 'string') : [];
    return { lines, counted };
  } catch {
    return { lines: [], counted: [] };
  }
}

const newestFirst = (a: StatLine, b: StatLine) => b.at - a.at;
const pruned = (l: StatLine, now: number): StatLine =>
  l.kind === 'online' && l.opponent !== null && now - l.at > OPPONENT_KEPT_MS ? { ...l, opponent: null } : l;

// Every line, newest first, with online opponents older than 30 days already dropped.
export function readLines(kv: KeyValue, now: number): StatLine[] {
  return readStored(kv).lines.map(l => pruned(l, now)).sort(newestFirst);
}

export function isCounted(kv: KeyValue, match: string): boolean {
  return readStored(kv).counted.includes(match);
}

// Adds a finished match's lines and marks it counted, even with no lines. False when the phone refused the write.
export function recordLines(kv: KeyValue, match: string, lines: readonly StatLine[], now: number): boolean {
  try {
    const st = readStored(kv);
    if (st.counted.includes(match)) return true;
    const all = [...st.lines, ...lines].map(l => pruned(l, now)).sort(newestFirst).slice(0, MAX_LINES);
    const counted = [...st.counted, match].slice(-MAX_COUNTED);
    kv.setItem(STATS_KEY, JSON.stringify({ lines: all, counted }));
    return true;
  } catch {
    return false;
  }
}

export function forgetPlayer(kv: KeyValue, name: string): void {
  try {
    const st = readStored(kv);
    kv.setItem(STATS_KEY, JSON.stringify({ lines: st.lines.filter(l => l.name !== name), counted: st.counted }));
  } catch { /* nothing more to do */ }
  try {
    kv.setItem(NAMES_KEY, JSON.stringify(recentNames(kv).filter(n => n !== name)));
  } catch { /* nothing more to do */ }
}

export function recentNames(kv: KeyValue): string[] {
  try {
    const raw = kv.getItem(NAMES_KEY);
    if (raw === null) return [];
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, MAX_NAMES) : [];
  } catch {
    return [];
  }
}

// Puts these names first, in the order given. Callers leave out AI names and the default "Player 1" names.
export function rememberNames(kv: KeyValue, names: readonly string[]): void {
  const fresh = names.map(n => n.trim()).filter(n => n !== '');
  if (fresh.length === 0) return;
  const list = [...new Set([...fresh, ...recentNames(kv)])].slice(0, MAX_NAMES);
  try { kv.setItem(NAMES_KEY, JSON.stringify(list)); } catch { /* the names are only a convenience */ }
}

// The names that have stats, most recent first.
export function playerNames(lines: readonly StatLine[]): string[] {
  return [...new Set([...lines].sort(newestFirst).map(l => l.name))];
}

export function filtered(lines: readonly StatLine[], name: string, f: Filter): StatLine[] {
  return lines.filter(l => l.name === name && (f.kind === 'all' || l.kind === f.kind)
    && (f.faction === 'all' || l.faction === f.faction) && (f.ai === 'any' || l.ai === f.ai)).sort(newestFirst);
}

export function summarize(lines: readonly StatLine[], name: string, f: Filter): Summary {
  const ls = filtered(lines, name, f);
  const n = ls.length;
  const sum = (pick: (l: StatLine) => number) => ls.reduce((s, l) => s + pick(l), 0);
  const avg = (pick: (l: StatLine) => number) => (n === 0 ? null : sum(pick) / n);
  const wins = ls.filter(l => l.won).length;
  let streak = 0;
  for (const l of ls) { if (!l.won) break; streak += 1; }
  let best = 0;
  let run = 0;
  for (const l of [...ls].reverse()) { run = l.won ? run + 1 : 0; best = Math.max(best, run); }
  // Most played faction; ls is newest first, so the first to reach the top count on a tie is the most recent.
  const counts = new Map<FactionId, number>();
  for (const l of ls) counts.set(l.faction, (counts.get(l.faction) ?? 0) + 1);
  let favourite: FactionId | null = null;
  for (const l of ls) if (favourite === null || counts.get(l.faction)! > counts.get(favourite)!) favourite = l.faction;
  return {
    played: n, wins, losses: n - wins, winRate: n === 0 ? null : wins / n, streak, bestStreak: best,
    avgDealt: avg(l => l.tally.dealt), avgTaken: avg(l => l.tally.taken),
    kills: sum(l => l.tally.kills), deaths: sum(l => l.tally.deaths), cities: sum(l => l.tally.cities),
    heroes: sum(l => l.tally.heroes), treasures: sum(l => l.tally.treasures),
    avgRounds: avg(l => l.rounds), favourite,
  };
}

// The lines a finished match gives this phone: the person against the computer, both seats when two people shared
// the phone, and only this phone's seat online. An unfinished match gives none.
export function linesFor(record: MatchRecord, mode: 'local' | 'online', mySeat: PlayerId | null, at: number): StatLine[] {
  const t = matchTallies(record.settings, record.actions);
  if (t.winner === null) return [];
  const people = record.players.flatMap((p, i) => (p.kind === 'human' ? [i] : []));
  const seats = mode === 'online' ? (mySeat === null ? [] : [mySeat]) : people;
  const kind: MatchKind = mode === 'online' ? 'online' : people.length === 2 ? 'pass' : 'computer';
  return seats.flatMap((seat): StatLine[] => {
    const me = record.players[seat];
    const otherSeat = seat === 0 ? 1 : 0;
    const them = record.players[otherSeat];
    if (me === undefined || them === undefined || me.kind !== 'human') return [];
    return [{
      match: record.id, at, name: me.name, kind, faction: record.settings.factions[seat]!,
      ai: them.kind === 'ai' ? them.level : null, won: t.winner === seat, rounds: t.rounds, tally: t.tallies[seat]!,
      opponent: { name: them.name, faction: record.settings.factions[otherSeat]!, tally: t.tallies[otherSeat]! },
    }];
  });
}
