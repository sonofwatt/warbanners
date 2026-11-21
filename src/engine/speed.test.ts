import { expect, test } from 'vitest';
import { legalActions } from './apply';
import { hashState } from './hash';
import { randomPlayout } from './testkit';
import type { MatchState } from './types';
import { playerView } from './vision';

const digest = (v: unknown) => hashState(v as MatchState);
test.each([
  // re-pinned for rules version 4 (units carry deeds, heroTraits and item, so the state and view digests moved; the legal
  // digests and counts did not, since traits have no effect yet; earlier, for rules version 3: Defender def 9 hp 20, scouts cannot capture cities; earlier: treasure claims, melee advance, home on capture, healing by place, the Mongol forest cost,
  // one unexplored tile per move, the Task 12 tuning numbers)
  [7, 160, 135, '055c9ddf5d30bd44', '62b313a04315fc93', '5646a1ae025bacb3'],
  [1, 200, 221, '6374e506b658ed17', '516c413feaef8018', '1927de22a39149c3'],
  [3, 90, 36, '62f188c8cf3f9cff', 'f0dd3b90a000310f', '35d5876b283ed848'],
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
