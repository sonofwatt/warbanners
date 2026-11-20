import { expect, test } from 'vitest';
import { legalActions } from './apply';
import { hashState } from './hash';
import { randomPlayout } from './testkit';
import type { MatchState } from './types';
import { playerView } from './vision';

const digest = (v: unknown) => hashState(v as MatchState);
test.each([
  // re-pinned for rules version 2 (treasure claims, melee advance, home on capture, healing by place, the Mongol forest cost,
  // one unexplored tile per move, the Task 12 tuning numbers)
  [7, 160, 141, '064107ca6264ba73', '01acfbf291ea1289', '3fd27cc9951b828c'],
  [1, 200, 233, '2b2fc8079fade2d8', 'b14ce4ffa93f5500', '3bfdfdb74ddd98fa'],
  [3, 90, 36, '62f188c8cf3f9cff', '01d48ac042a2138f', '29f7b371850fd6c0'],
])('seed %i after %i turns: same legal actions and views', (seed, turns, count, legal, views, state) => {
  const s = randomPlayout(seed, turns);
  expect(hashState(s)).toBe(state);
  const acts = legalActions(s);
  expect(acts).toHaveLength(count);
  expect(digest(acts)).toBe(legal);
  expect(digest([playerView(s, 0), playerView(s, 1)])).toBe(views);
}, 30_000);
test('legalActions on a 25-unit position is fast', () => {
  const s = randomPlayout(7, 148);              // re-picked for the Task 12 numbers: (6, 128) now has 27 units
  expect(s.units).toHaveLength(25);
  let fastest = Infinity; // the fastest of five batches, so a busy machine does not fail the test
  for (let b = 0; b < 5; b++) {
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) legalActions(s);
    fastest = Math.min(fastest, (performance.now() - t0) / 20);
  }
  expect(fastest).toBeLessThan(5); // about 2.5 ms on this position in Node on ClaudeComputer (rules version 2)
}, 30_000);
