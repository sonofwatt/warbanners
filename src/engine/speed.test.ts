import { expect, test } from 'vitest';
import { legalActions } from './apply';
import { hashState } from './hash';
import { randomPlayout } from './testkit';
import type { MatchState } from './types';
import { playerView } from './vision';

const digest = (v: unknown) => hashState(v as MatchState);
test.each([
  [7, 160, 131, '413f23187e9d2455', 'b625567dcd32467e', '14aa5840dc307115'],
  [1, 200, 92, 'b6346467f7ed3e08', 'ea1bbb44b1f21ed1', 'ac653f91e0e611ba'],
  [3, 90, 182, '475ea9ab3af1cd20', '3675179e5f83ad9f', 'd3422bd296e824ff'],
])('seed %i after %i turns: same legal actions and views', (seed, turns, count, legal, views, state) => {
  const s = randomPlayout(seed, turns);
  expect(hashState(s)).toBe(state);
  const acts = legalActions(s);
  expect(acts).toHaveLength(count);
  expect(digest(acts)).toBe(legal);
  expect(digest([playerView(s, 0), playerView(s, 1)])).toBe(views);
}, 30_000);
test('legalActions on a 24-unit position is fast', () => {
  const s = randomPlayout(7, 160);
  expect(s.units).toHaveLength(24);
  let fastest = Infinity; // the fastest of five batches, so a busy machine does not fail the test
  for (let b = 0; b < 5; b++) {
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) legalActions(s);
    fastest = Math.min(fastest, (performance.now() - t0) / 20);
  }
  expect(fastest).toBeLessThan(5); // about 9.4 ms before, 2.7 ms after, in Node on ClaudeComputer
}, 30_000);
