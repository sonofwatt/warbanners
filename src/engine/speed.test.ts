import { expect, test } from 'vitest';
import { legalActions } from './apply';
import { hashState } from './hash';
import { randomPlayout } from './testkit';
import type { MatchState } from './types';
import { playerView } from './vision';

const digest = (v: unknown) => hashState(v as MatchState);
test.each([
  // re-pinned for rules version 2 (treasure claims, melee advance, home on capture, healing by place, the Mongol forest cost)
  [7, 160, 105, '235245564f95a1ab', '46fe6d2edf0d6633', '6837b8c501f02708'],
  [1, 200, 277, '70cbac528c62a009', '5117160e3536f74b', '8d8c11847456b687'],
  [3, 90, 39, '076da221e267ea48', '2d0470742f84cd9d', 'd4269b9e34a9464d'],
])('seed %i after %i turns: same legal actions and views', (seed, turns, count, legal, views, state) => {
  const s = randomPlayout(seed, turns);
  expect(hashState(s)).toBe(state);
  const acts = legalActions(s);
  expect(acts).toHaveLength(count);
  expect(digest(acts)).toBe(legal);
  expect(digest([playerView(s, 0), playerView(s, 1)])).toBe(views);
}, 30_000);
test('legalActions on a 25-unit position is fast', () => {
  const s = randomPlayout(2, 192);              // re-picked when the Mongol forest rule changed: seed 7 no longer reaches 25
  expect(s.units).toHaveLength(25);
  let fastest = Infinity; // the fastest of five batches, so a busy machine does not fail the test
  for (let b = 0; b < 5; b++) {
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) legalActions(s);
    fastest = Math.min(fastest, (performance.now() - t0) / 20);
  }
  expect(fastest).toBeLessThan(5); // about 2.6 ms on this position in Node on ClaudeComputer (rules version 2)
}, 30_000);
