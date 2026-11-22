import { expect, test } from 'vitest';
import { legalActions } from './apply';
import { hashState } from './hash';
import { randomPlayout } from './testkit';
import type { MatchState } from './types';
import { playerView } from './vision';

const digest = (v: unknown) => hashState(v as MatchState);
test.each([
  // re-pinned again for rules version 7 (a captured capital is an ordinary city and the loser's capital moves, and a
  // Lumber camp and a Market give 2 growth; every digest moved, none of the three has ended); before that for rules
  // version 7 (a city first joined to its capital by roads pays both 1 growth, cities carry linked,
  // and the Scout sees 1 tile; every digest moved); earlier, for rules version 6 (only a pathfinder enters the fog, the Mongol bonus is a half-point and rides by
  // territory, a level-up ends a chain, and units carry bonusMp; every digest moved); earlier, for rules version 5 (a chain kill costs the rider health; every state digest carries rulesVersion, and
  // seed 7's playout now differs after a Knight's kill); earlier, for the draught fix (a draught waits a turn after it is found and buys no second ability); earlier, for plan 5 Task 8's tuned thresholds (the draught worth is an AI number and cannot move these digests); seed 1 now ends after 101 turns, so its row is the
  // position after 90 turns, still unfinished; earlier, for rules version 4 (units carry deeds, heroTraits and item, traits and the seven treasure outcomes change play
  // (a relic, a draught, a map or a sellsword), so every digest and the legal counts moved; seed 1 now ends before turn 200,
  // so its row is the position after 140 turns, still unfinished; earlier, for rules version 3: Defender def 9 hp 20, scouts cannot capture cities; earlier: treasure claims, melee advance, home on capture, healing by place, the Mongol forest cost,
  // one unexplored tile per move, the Task 12 tuning numbers)
  [7, 160, 324, 'fb49aba42f2372c1', 'ae38f2043e6f231b', 'cdc06b30459e4b81'],
  [1, 90, 149, '6d7d2e3fd0d5e9c4', '64c00ae94cd0d888', '08e8aecfe808b8ae'],
  [3, 90, 191, '649bb1417150d26c', 'b0a0d6265ccf87d3', 'c1166c4de76ee87a'],
])('seed %i after %i turns: same legal actions and views', (seed, turns, count, legal, views, state) => {
  const s = randomPlayout(seed, turns);
  expect(hashState(s)).toBe(state);
  const acts = legalActions(s);
  expect(acts).toHaveLength(count);
  expect(digest(acts)).toBe(legal);
  expect(digest([playerView(s, 0), playerView(s, 1)])).toBe(views);
}, 30_000);
test('legalActions on a 25-unit position is fast', () => {
  const s = randomPlayout(8, 292);              // re-picked for rules 7's moving capitals and growth 2 buildings: (7, 286) has 45 units now, and seed 7's only even 25-unit turn (146) gives the AI nothing the person sees; this one has 290 legal actions; earlier (7, 286) for rules 7: (7, 164) has 12 units now; earlier (7, 164) for rules 6, (4, 268) for rules 5, (7, 236) for Task 8
  expect(s.units).toHaveLength(25);
  let fastest = Infinity; // the fastest of five batches, so a busy machine does not fail the test
  for (let b = 0; b < 5; b++) {
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) legalActions(s);
    fastest = Math.min(fastest, (performance.now() - t0) / 20);
  }
  // Raised from 5 for rules 6: 25-unit positions now hold far more legal actions (this one 283; the rules 5 position
  // had 130), and on this same state the rules 5 engine takes 4.8 ms against rules 6's 5.1 ms, so the engine is not
  // slower per action. About 5 ms on this position in Node on ClaudeComputer, idle (2.5 ms on rules 2's position);
  // 6.5 leaves room for a busy machine and still catches a slowdown of a third. GitHub's shared runners measured
  // 7.5 ms on the same code (run 44967791066, after passing on earlier runs), so CI gets 9 ms: it still fails a
  // slowdown of three quarters there, and the 6.5 bound keeps guarding every local run.
  expect(fastest).toBeLessThan(process.env.CI ? 9 : 6.5);
}, 30_000);
