import { expect, test } from 'vitest';
import { legalActions } from './apply';
import { hashState } from './hash';
import { randomPlayout } from './testkit';
import type { MatchState } from './types';
import { playerView } from './vision';

const digest = (v: unknown) => hashState(v as MatchState);
test.each([
  // re-pinned for rules version 2 (treasure claims, melee advance, home on capture, healing by place change the playouts)
  [7, 160, 172, '124d41ccd07f0439', '9b69044f4aa10586', 'e8ff59ef8dd33b0c'],
  [1, 200, 239, '20fee509bbc3915c', '654a4af7401adcea', '38e13f7d11f5912e'],
  [3, 90, 54, 'b7f86befcac6c538', 'f64888689f4f8c5f', '2ebe63618a2bc086'],
])('seed %i after %i turns: same legal actions and views', (seed, turns, count, legal, views, state) => {
  const s = randomPlayout(seed, turns);
  expect(hashState(s)).toBe(state);
  const acts = legalActions(s);
  expect(acts).toHaveLength(count);
  expect(digest(acts)).toBe(legal);
  expect(digest([playerView(s, 0), playerView(s, 1)])).toBe(views);
}, 30_000);
test('legalActions on a 25-unit position is fast', () => {
  const s = randomPlayout(7, 180);              // rules version 2: the old 24-unit playout (7, 160) now ends with 23
  expect(s.units).toHaveLength(25);
  let fastest = Infinity; // the fastest of five batches, so a busy machine does not fail the test
  for (let b = 0; b < 5; b++) {
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) legalActions(s);
    fastest = Math.min(fastest, (performance.now() - t0) / 20);
  }
  expect(fastest).toBeLessThan(5); // about 3.6 ms on this position in Node on ClaudeComputer (rules version 2)
}, 30_000);
