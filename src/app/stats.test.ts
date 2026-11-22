import { describe, expect, test } from 'vitest';
import type { KeyValue } from './saves';
import { newRecord } from './record';
import type { MatchRecord } from './record';
import {
  DAY_MS, forgetPlayer, isCounted, linesFor, MAX_LINES, MAX_NAMES, playerNames, readLines, recentNames, recordLines,
  rememberNames, summarize,
} from './stats';
import type { Filter, StatLine } from './stats';
import { emptyTally } from './tally';

const memory = () => {
  const map = new Map<string, string>();
  const kv: KeyValue = { getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: k => { map.delete(k); } };
  return { map, kv };
};
const ALL: Filter = { kind: 'all', faction: 'all', ai: 'any' };

const line = (over: Partial<StatLine> = {}): StatLine => ({
  match: 'm', at: 1000, name: 'Ann', kind: 'computer', faction: 'spartans', ai: 'easy', won: true, rounds: 10,
  tally: { ...emptyTally(), dealt: 20, taken: 10, kills: 2, deaths: 1, cities: 1, heroes: 0, treasures: 1 },
  opponent: { name: 'Easy AI', faction: 'mongols', tally: emptyTally() }, ...over,
});

describe('storage', () => {
  test('lines round trip, newest first, and the match is counted', () => {
    const { kv } = memory();
    expect(isCounted(kv, 'a')).toBe(false);
    expect(recordLines(kv, 'a', [line({ match: 'a', at: 1 })], 5)).toBe(true);
    expect(recordLines(kv, 'b', [line({ match: 'b', at: 2 })], 5)).toBe(true);
    expect(readLines(kv, 5).map(l => l.match)).toEqual(['b', 'a']);
    expect(isCounted(kv, 'a')).toBe(true);
  });
  test('malformed storage reads as empty and never throws', () => {
    const { kv, map } = memory();
    for (const raw of ['nope', '[]', '{"lines":7}', '{"lines":[{"name":3}],"counted":"x"}', 'null']) {
      map.set('warbanners.stats.v1', raw);
      map.set('warbanners.names.v1', raw);
      expect(readLines(kv, 0)).toEqual([]);
      expect(recentNames(kv)).toEqual([]);
      expect(isCounted(kv, 'm')).toBe(false);
    }
  });
  test('a phone that refuses the write reports it and stays readable', () => {
    const { kv } = memory();
    recordLines(kv, 'a', [line({ match: 'a' })], 5);
    const full: KeyValue = { ...kv, setItem: () => { throw new Error('full'); } };
    expect(recordLines(full, 'b', [line({ match: 'b' })], 5)).toBe(false);
    expect(readLines(full, 5).map(l => l.match)).toEqual(['a']);
    expect(() => rememberNames(full, ['Zed'])).not.toThrow();
  });
  test('the oldest line goes once there are too many', () => {
    const { kv } = memory();
    for (let i = 0; i <= MAX_LINES; i++) recordLines(kv, `m${i}`, [line({ match: `m${i}`, at: i })], 0);
    const lines = readLines(kv, 0);
    expect(lines).toHaveLength(MAX_LINES);
    expect(lines.some(l => l.match === 'm0')).toBe(false);
    expect(isCounted(kv, 'm0')).toBe(true);
  });
  test('an online opponent\'s numbers go after 30 days; the line and the rest stay', () => {
    const { kv } = memory();
    recordLines(kv, 'o', [line({ match: 'o', kind: 'online', at: 0 })], 0);
    recordLines(kv, 'c', [line({ match: 'c', kind: 'computer', at: 0 })], 0);
    expect(readLines(kv, 30 * DAY_MS - 1).find(l => l.match === 'o')!.opponent).not.toBeNull();
    const later = readLines(kv, 30 * DAY_MS + 1);
    expect(later.find(l => l.match === 'o')).toMatchObject({ opponent: null, won: true, tally: { dealt: 20 } });
    expect(later.find(l => l.match === 'c')!.opponent).not.toBeNull();
  });
  test('forgetting a player drops their lines and name, but their matches stay counted', () => {
    const { kv } = memory();
    rememberNames(kv, ['Ann', 'Ben']);
    recordLines(kv, 'p', [line({ match: 'p', name: 'Ann' }), line({ match: 'p', name: 'Ben', won: false })], 0);
    forgetPlayer(kv, 'Ann');
    expect(readLines(kv, 0).map(l => l.name)).toEqual(['Ben']);
    expect(recentNames(kv)).toEqual(['Ben']);
    expect(isCounted(kv, 'p')).toBe(true);
  });
});

describe('names', () => {
  test('newest first, no repeats, no blanks, at most eight', () => {
    const { kv } = memory();
    rememberNames(kv, ['Ann', '  ', 'Ben']);
    rememberNames(kv, ['Ann']);
    expect(recentNames(kv)).toEqual(['Ann', 'Ben']);
    for (let i = 0; i < 10; i++) rememberNames(kv, [`P${i}`]);
    expect(recentNames(kv)).toHaveLength(MAX_NAMES);
    expect(recentNames(kv)[0]).toBe('P9');
  });
  test('players are the names with lines, most recent first', () => {
    const lines = [line({ name: 'Cat', at: 3 }), line({ name: 'Ann', at: 2 }), line({ name: 'Cat', at: 1 })];
    expect(playerNames(lines)).toEqual(['Cat', 'Ann']);
  });
});

describe('summaries', () => {
  test('counts, averages and win rate', () => {
    const lines = [line({ at: 2, won: false, rounds: 20 }), line({ at: 1 })];
    expect(summarize(lines, 'Ann', ALL)).toMatchObject({
      played: 2, wins: 1, losses: 1, winRate: 0.5, avgDealt: 20, avgTaken: 10, kills: 4, deaths: 2, cities: 2, treasures: 2, avgRounds: 15,
    });
  });
  test('nothing played gives no rates', () => {
    expect(summarize([], 'Ann', ALL)).toMatchObject({ played: 0, winRate: null, avgDealt: null, avgRounds: null, favourite: null, streak: 0, bestStreak: 0 });
  });
  test('streaks run in time order: W W L W W W', () => {
    const results = [true, true, false, true, true, true];
    const lines = results.map((won, i) => line({ match: `m${i}`, at: i, won })).reverse();
    expect(summarize(lines, 'Ann', ALL)).toMatchObject({ streak: 3, bestStreak: 3 });
    expect(summarize([line({ at: 9, won: false }), ...lines], 'Ann', ALL)).toMatchObject({ streak: 0, bestStreak: 3 });
  });
  test('favourite faction is the most played; a tie goes to the most recent', () => {
    expect(summarize([line({ at: 2, faction: 'mongols' }), line({ at: 1 })], 'Ann', ALL).favourite).toBe('mongols');
    expect(summarize([line({ at: 3 }), line({ at: 2, faction: 'mongols' }), line({ at: 1, faction: 'mongols' })], 'Ann', ALL).favourite).toBe('mongols');
  });
  test('filters by kind, faction and AI level, and only the named player counts', () => {
    const lines = [
      line({ match: 'a', kind: 'computer', ai: 'hard' }),
      line({ match: 'b', kind: 'pass', ai: null, faction: 'mongols' }),
      line({ match: 'c', kind: 'online', ai: null }),
      line({ match: 'd', name: 'Ben' }),
    ];
    expect(summarize(lines, 'Ann', ALL).played).toBe(3);
    expect(summarize(lines, 'Ann', { ...ALL, kind: 'pass' }).played).toBe(1);
    expect(summarize(lines, 'Ann', { ...ALL, faction: 'spartans' }).played).toBe(2);
    expect(summarize(lines, 'Ann', { ...ALL, ai: 'hard' }).played).toBe(1);
    expect(summarize(lines, 'Ann', { ...ALL, ai: 'easy' }).played).toBe(0);
  });
});

describe('lines for a finished match', () => {
  const settings = { seed: 3, factions: ['spartans', 'mongols'] as ['spartans', 'mongols'] };
  const finished = (rec: MatchRecord): MatchRecord => ({ ...rec, actions: [{ type: 'endTurn' }, { type: 'resign' }] });
  const ai = { name: 'Hard AI', kind: 'ai' as const, level: 'hard' as const, salt: 1, adapt: { dial: 0.85, trend: 0 } };

  test('against the computer: one line for the person, with the AI level', () => {
    const rec = finished(newRecord('m', settings, ['Ann', ai], 0));
    const lines = linesFor(rec, 'local', null, 77);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ match: 'm@0', at: 77, name: 'Ann', kind: 'computer', ai: 'hard', faction: 'spartans', won: true, rounds: 1 });
    expect(lines[0]!.opponent).toMatchObject({ name: 'Hard AI', faction: 'mongols' });
  });
  test('pass the phone: a line for each seat, even the same name twice', () => {
    const lines = linesFor(finished(newRecord('m', settings, ['Ann', 'Ann'], 0)), 'local', null, 0);
    expect(lines.map(l => [l.name, l.kind, l.won, l.faction])).toEqual([['Ann', 'pass', true, 'spartans'], ['Ann', 'pass', false, 'mongols']]);
    expect(lines.every(l => l.ai === null)).toBe(true);
  });
  test('online: only this phone\'s seat, with the AI level when the other seat is an AI', () => {
    const lines = linesFor(finished(newRecord('ROOM22', settings, [ai, 'Ben'], 0)), 'online', 1, 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ name: 'Ben', kind: 'online', ai: 'hard', won: false, opponent: { name: 'Hard AI' } });
    expect(linesFor(finished(newRecord('ROOM22', settings, ['Ann', 'Ben'], 0)), 'online', 0, 0)[0]).toMatchObject({ name: 'Ann', ai: null });
  });
  test('an unfinished match gives no lines', () => {
    expect(linesFor(newRecord('m', settings, ['Ann', 'Ben'], 0), 'local', null, 0)).toEqual([]);
  });
});
