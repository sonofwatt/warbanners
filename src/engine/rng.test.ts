import { test, expect } from 'vitest';
import { rngNext, rngInt } from './rng';

test('fixed sequence from seed 1', () => {
  const [a, s1] = rngNext(1);
  const [b, s2] = rngNext(s1);
  const [c, s3] = rngNext(s2);
  expect([a, b, c]).toEqual([2693262067, 11749833, 2265367787]);
  expect(s3).toBe(1199730144);
});
test('rngInt stays in range', () => {
  let s = 7;
  for (let i = 0; i < 200; i++) {
    const [v, n] = rngInt(s, 6);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(6);
    s = n;
  }
});
