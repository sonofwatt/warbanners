import { expect, test } from 'vitest';
import { legalActions } from './apply';
import { hashState } from './hash';
import { randomPlayout } from './testkit';
import type { MatchState } from './types';
import { playerView } from './vision';

const digest = (v: unknown) => hashState(v as MatchState);
test.each([
  // re-pinned for rules version 4 (units carry deeds, heroTraits and item, and traits change play, so every digest and
  // the legal counts moved; earlier, for rules version 3: Defender def 9 hp 20, scouts cannot capture cities; earlier: treasure claims, melee advance, home on capture, healing by place, the Mongol forest cost,
  // one unexplored tile per move, the Task 12 tuning numbers)
  [7, 160, 84, 'e42a7b740c14c87d', '73507d630b2f4828', 'eed33dbad34e4b31'],
  [1, 200, 458, '851b4bdb9007018c', 'bd7f3402689270cf', '8796822a7bbb08cd'],
  [3, 90, 84, '844e6c797457d1a2', '7da9e8a2cea941dd', '9391279798e78e44'],
])('seed %i after %i turns: same legal actions and views', (seed, turns, count, legal, views, state) => {
  const s = randomPlayout(seed, turns);
  expect(hashState(s)).toBe(state);
  const acts = legalActions(s);
  expect(acts).toHaveLength(count);
  expect(digest(acts)).toBe(legal);
  expect(digest([playerView(s, 0), playerView(s, 1)])).toBe(views);
}, 30_000);
test('legalActions on a 25-unit position is fast', () => {
  const s = randomPlayout(7, 180);              // re-picked for the Task 4 trait effects: (7, 148) now has 22 units
  expect(s.units).toHaveLength(25);
  let fastest = Infinity; // the fastest of five batches, so a busy machine does not fail the test
  for (let b = 0; b < 5; b++) {
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) legalActions(s);
    fastest = Math.min(fastest, (performance.now() - t0) / 20);
  }
  expect(fastest).toBeLessThan(5); // about 2.5 ms on this position in Node on ClaudeComputer (rules version 2)
}, 30_000);
