import { describe, expect, test } from 'vitest';
import type { MatchState } from '../engine';
import { addCity, blankMatch, setTile } from '../engine/testkit';
import { newRecord } from './record';
import type { MatchRecord, Seat } from './record';
import { SCORE, difficultyFactor, scoreSheet, scoreSheets } from './score';
import type { ScoreSheet } from './score';
import { emptyTally } from './tally';
import type { MatchTallies } from './tally';

const ai = (level: 'easy' | 'normal' | 'hard' | 'adaptive', dial = 0.5): Seat =>
  ({ name: 'AI', kind: 'ai', level, salt: 1, adapt: { dial, trend: 0 } });
const record = (b: string | Seat = ai('easy'), factions: ['spartans' | 'mongols', 'spartans' | 'mongols'] = ['spartans', 'mongols']): MatchRecord =>
  newRecord('m', { seed: 1, factions }, ['Ann', b], 0);

// Seat 0 won on turn 41 (stamp 80) with a capital, two joined cities and one not joined, every level set by hand.
function finished(factions: ['spartans' | 'mongols', 'spartans' | 'mongols'] = ['spartans', 'mongols']): MatchState {
  const s = blankMatch({ factions });
  s.stamp = 80; s.winner = 0; s.players[1]!.alive = false;
  addCity(s, 0, 0, 0, { capital: true, level: 5 });
  addCity(s, 0, 2, 0, { level: 3 });
  addCity(s, 0, -2, 0, { level: 1 });
  addCity(s, 0, 0, 3, { level: 8 });
  setTile(s, 1, 0, { road: true }); setTile(s, -1, 0, { road: true });
  s.players[0]!.explored = Object.keys(s.tiles).slice(0, 40).sort();
  return s;
}
const tallies = (over: Partial<MatchTallies> = {}): MatchTallies => ({
  tallies: [{ ...emptyTally(), kills: 12, deaths: 4, treasures: 2 }, emptyTally()],
  conquest: [{ villages: 3, wiped: 1 }, { villages: 0, wiped: 0 }], rounds: 41, winner: 0, ...over,
});
const line = (sheet: ScoreSheet, key: string) => sheet.lines.find(l => l.key === key);
const sum = (sheet: ScoreSheet) => sheet.lines.reduce((n, l) => n + l.points, 0);

describe('the lines', () => {
  const sheet = scoreSheet(record(), finished(), tallies(), 0);
  test('every line has the spec points', () => {
    expect(line(sheet, 'victory')).toEqual({ key: 'victory', count: 41, points: 19 * 20 });
    expect(line(sheet, 'kills')).toEqual({ key: 'kills', count: 12, points: 120 });
    expect(line(sheet, 'losses')).toEqual({ key: 'losses', count: 4, points: -20 });
    expect(line(sheet, 'explored')).toEqual({ key: 'explored', count: 40, of: 61, points: 40 });
    expect(line(sheet, 'villages')).toEqual({ key: 'villages', count: 3, points: 120 });
    expect(line(sheet, 'treasures')).toEqual({ key: 'treasures', count: 2, points: 60 });
    expect(line(sheet, 'cities')).toEqual({ key: 'cities', count: 4, best: 8, points: (4 + 2 + 0 + 7) * 10 });
    expect(line(sheet, 'roads')).toEqual({ key: 'roads', count: 2, of: 3, points: 50 });
    expect(line(sheet, 'wiped')).toEqual({ key: 'wiped', count: 1, points: 200 });
  });
  test('the lines, the subtotal, the difficulty and the total agree', () => {
    expect(sheet.subtotal).toBe(sum(sheet));
    expect(sheet.difficulty).toEqual({ level: 'easy', factor: 1, points: 0 });
    expect(sheet.total).toBe(sheet.subtotal);
  });
  test('the lines come in the sheet order', () => {
    expect(sheet.lines.map(l => l.key)).toEqual(['victory', 'kills', 'losses', 'explored', 'villages', 'treasures', 'cities', 'roads', 'wiped']);
  });
});

test('every city joined earns the extra road bonus', () => {
  const s = finished();
  s.cities = s.cities.filter(c => c.pos !== '0,3');
  const roads = line(scoreSheet(record(), s, tallies(), 0), 'roads')!;
  expect(roads).toEqual({ key: 'roads', count: 2, of: 2, points: 2 * SCORE.road + SCORE.allRoads });
});

test('only the capital: the roads line is there with nothing to join', () => {
  const s = finished();
  s.cities = s.cities.filter(c => c.capital);
  expect(line(scoreSheet(record(), s, tallies(), 0), 'roads')).toEqual({ key: 'roads', count: 0, of: 0, points: 0 });
});

test('a faction that builds no roads has no roads line', () => {
  const s = finished(['mongols', 'spartans']);
  const sheet = scoreSheet(record(ai('easy'), ['mongols', 'spartans']), s, tallies(), 0);
  expect(line(sheet, 'roads')).toBeUndefined();
});

test('a win at turn 60 or later scores no speed, and a loss shows no victory', () => {
  const s = finished(); s.stamp = 118;
  expect(line(scoreSheet(record(), s, tallies(), 0), 'victory')).toEqual({ key: 'victory', count: 60, points: 0 });
  const lost = finished(); lost.winner = 1;
  expect(line(scoreSheet(record(), lost, tallies(), 0), 'victory')).toEqual({ key: 'victory', count: 0, points: 0 });
});

test('a win by resignation wipes out nobody', () => {
  const sheet = scoreSheet(record(), finished(), tallies({ conquest: [{ villages: 3, wiped: 0 }, { villages: 0, wiped: 0 }] }), 0);
  expect(line(sheet, 'wiped')).toEqual({ key: 'wiped', count: 0, points: 0 });
  expect(line(sheet, 'victory')!.points).toBe(380);
});

describe('difficulty', () => {
  test('the factor follows the dial, to one decimal', () => {
    expect(difficultyFactor(0.2)).toBe(1);
    expect(difficultyFactor(0.5)).toBe(1.5);
    expect(difficultyFactor(0.85)).toBe(2);
    expect(difficultyFactor(0.1)).toBe(0.8);
  });
  test('hard doubles the subtotal; adaptive uses where its dial finished', () => {
    const hard = scoreSheet(record(ai('hard')), finished(), tallies(), 0);
    expect(hard.difficulty).toEqual({ level: 'hard', factor: 2, points: hard.subtotal });
    expect(hard.total).toBe(2 * hard.subtotal);
    const adaptive = scoreSheet(record(ai('adaptive', 0.1)), finished(), tallies(), 0);
    expect(adaptive.difficulty!.factor).toBe(0.8);
    expect(adaptive.total).toBe(adaptive.subtotal + adaptive.difficulty!.points);
    expect(adaptive.difficulty!.points).toBe(Math.round(adaptive.subtotal * -0.2));
  });
  test('a subtotal below zero is not multiplied and the total stops at zero', () => {
    const s = finished(); s.winner = 1; s.cities = []; s.players[0]!.explored = [];
    const t = tallies({ tallies: [{ ...emptyTally(), deaths: 30 }, emptyTally()], conquest: [{ villages: 0, wiped: 0 }, { villages: 0, wiped: 0 }] });
    const sheet = scoreSheet(record(ai('hard')), s, t, 0);
    expect(sheet.subtotal).toBe(-150);
    expect(sheet.difficulty).toEqual({ level: 'hard', factor: 2, points: 0 });
    expect(sheet.total).toBe(0);
  });
});

describe('which seats get a sheet', () => {
  test('against the AI, only the person', () => {
    expect(scoreSheets(record(), finished(), tallies()).map(x => x.seat)).toEqual([0]);
  });
  test('two people: both, the winner first, with no difficulty line', () => {
    const s = finished(); s.winner = 1;
    const sheets = scoreSheets(record('Ben'), s, tallies({ winner: 1 }));
    expect(sheets.map(x => x.seat)).toEqual([1, 0]);
    for (const x of sheets) { expect(x.difficulty).toBeNull(); expect(x.total).toBe(Math.max(0, x.subtotal)); }
  });
});
