import { expect, test } from 'vitest';
import { legalActions } from './apply';
import { hashState } from './hash';
import { randomPlayout } from './testkit';
import type { MatchState } from './types';
import { playerView } from './vision';

const digest = (v: unknown) => hashState(v as MatchState);
test.each([
  // re-pinned for rules version 6 (only a pathfinder enters the fog, the Mongol bonus is a half-point and rides by
  // territory, a level-up ends a chain; every digest moved); earlier, for rules version 5 (a chain kill costs the rider health; every state digest carries rulesVersion, and
  // seed 7's playout now differs after a Knight's kill); earlier, for the draught fix (a draught waits a turn after it is found and buys no second ability); earlier, for plan 5 Task 8's tuned thresholds (the draught worth is an AI number and cannot move these digests); seed 1 now ends after 101 turns, so its row is the
  // position after 90 turns, still unfinished; earlier, for rules version 4 (units carry deeds, heroTraits and item, traits and the seven treasure outcomes change play
  // (a relic, a draught, a map or a sellsword), so every digest and the legal counts moved; seed 1 now ends before turn 200,
  // so its row is the position after 140 turns, still unfinished; earlier, for rules version 3: Defender def 9 hp 20, scouts cannot capture cities; earlier: treasure claims, melee advance, home on capture, healing by place, the Mongol forest cost,
  // one unexplored tile per move, the Task 12 tuning numbers)
  [7, 160, 255, 'f3b36177e0ab8fbc', '979493dd578f231a', '82bee4aa47311ee5'],
  [1, 90, 113, '8c62060f332221e2', '8c0b3544cbd70715', '458e896c3ea64f73'],
  [3, 90, 106, 'add0a84910c00352', '36f9646a5c498c4f', '3773727d6f6893c0'],
])('seed %i after %i turns: same legal actions and views', (seed, turns, count, legal, views, state) => {
  const s = randomPlayout(seed, turns);
  expect(hashState(s)).toBe(state);
  const acts = legalActions(s);
  expect(acts).toHaveLength(count);
  expect(digest(acts)).toBe(legal);
  expect(digest([playerView(s, 0), playerView(s, 1)])).toBe(views);
}, 30_000);
test('legalActions on a 25-unit position is fast', () => {
  const s = randomPlayout(7, 164);              // re-picked for rules 6: (4, 268) no longer has 25 units; earlier (4, 268) for rules 5, (7, 236) for Task 8
  expect(s.units).toHaveLength(25);
  let fastest = Infinity; // the fastest of five batches, so a busy machine does not fail the test
  for (let b = 0; b < 5; b++) {
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) legalActions(s);
    fastest = Math.min(fastest, (performance.now() - t0) / 20);
  }
  expect(fastest).toBeLessThan(5); // about 2.5 ms on this position in Node on ClaudeComputer (rules version 2)
}, 30_000);
