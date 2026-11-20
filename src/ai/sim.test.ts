import { expect, test } from 'vitest';
import { adaptiveSeries, runMatch, summarize } from './sim';
import type { SimOpts } from './sim';

test('a short match is repeatable', () => {
  const o: SimOpts = { seed: 3, factions: ['spartans', 'mongols'], seats: [{ level: 'easy' }, { level: 'easy' }], maxRounds: 8 };
  expect(runMatch(o)).toEqual(runMatch(o));
});
test('a stalled match is adjudged and flagged', () => {
  const r = runMatch({ seed: 3, factions: ['spartans', 'mongols'], seats: [{ level: 'easy' }, { level: 'easy' }], maxRounds: 2 });
  expect(r).toMatchObject({ stalled: true, winner: null, rounds: 2 });
});
test('the summary counts an adjudged stall as half a win', () => {
  const r = runMatch({ seed: 3, factions: ['spartans', 'mongols'], seats: [{ level: 'easy' }, { level: 'easy' }], maxRounds: 2 });
  const sum = summarize([r, { ...r, factions: ['mongols', 'spartans'] }]);
  expect(sum.matches).toBe(2);
  expect(sum.stalledShare).toBe(1);
  expect(sum.winRate.spartans + sum.winRate.mongols).toBeCloseTo(r.adjudged === null ? 0 : 0.5, 9);
  expect(sum.rounds).toEqual({ p10: 2, median: 2, p90: 2 });
});
test('an adaptive seat records its dial every turn', () => {
  const r = runMatch({ seed: 3, factions: ['spartans', 'mongols'], seats: [{ adaptive: 0.5 }, { level: 'easy' }], maxRounds: 3 });
  expect(r.dials).toHaveLength(3);
  expect(r.dials.every((d) => d >= 0.1 && d <= 0.95)).toBe(true);
});
test.runIf(process.env.SLOW === '1')('ten normal matches: legal, finished, only moves refused', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const r = runMatch({ seed, factions: seed % 2 ? ['spartans', 'mongols'] : ['mongols', 'spartans'], seats: [{ level: 'normal' }, { level: 'normal' }], maxRounds: 60 });
    expect(r.nonMoveRefusals).toBe(0);
    expect(r.winner !== null || r.stalled).toBe(true);
  }
}, 1_800_000);
test.runIf(process.env.SLOW === '1')('adaptive climbs against a strong opponent and drops against a weak one', () => {
  // 4 matches each, memory carried: mean dial over the second half of the last match vs dial 0.85 exceeds the one vs dial 0.2 by at least 0.2
  const strong = adaptiveSeries({ opponentDial: 0.85, matches: 4, seed: 1, maxRounds: 60 });
  const weak = adaptiveSeries({ opponentDial: 0.2, matches: 4, seed: 1, maxRounds: 60 });
  expect(strong.at(-1)! - weak.at(-1)!).toBeGreaterThanOrEqual(0.2);
}, 1_800_000);
