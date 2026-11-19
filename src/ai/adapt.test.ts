import { expect, test } from 'vitest';
import { createMatch } from '../engine';
import { ADAPT, adaptStep, betweenMatches, gapOf, standingOf } from './adapt';
import type { AdaptState } from './adapt';

test('steady lead: three small steps down', () => {
  let a: AdaptState = { dial: 0.5, trend: 0 }; const dials: number[] = [];
  for (let i = 0; i < 3; i++) { a = adaptStep(a, 0.4); dials.push(a.dial); }
  expect(dials[0]).toBeCloseTo(0.46, 10); expect(dials[1]).toBeCloseTo(0.42, 10); expect(dials[2]).toBeCloseTo(0.38, 10);
  expect(a.trend).toBeCloseTo(0.2628, 10);
});
test('a close game is left alone, then a lasting edge is answered gently', () => {
  let a: AdaptState = { dial: 0.5, trend: 0 };
  a = adaptStep(a, 0.1); expect(a.dial).toBe(0.5);
  a = adaptStep(a, 0.1); expect(a.dial).toBeCloseTo(0.4745, 10);
  a = adaptStep(a, 0.1); expect(a.dial).toBeCloseTo(0.44165, 10);
});
test('it never leaves its range', () => {
  let a: AdaptState = { dial: 0.12, trend: 0 };
  for (let i = 0; i < 5; i++) a = adaptStep(a, 0.9);
  expect(a.dial).toBe(0.1);
});
test.each([[0.2, 0.1983], [0.5, 0.5], [0.8, 0.8017]])('converges on a scripted opponent of strength %f', (h, end) => {
  // the scripted opponent: the gap it produces is clamp(1.5 * (dial - h), -1, 1)
  let a: AdaptState = { dial: ADAPT.start, trend: 0 }; let jump = 0;
  for (let t = 0; t < 40; t++) {
    const n = adaptStep(a, Math.max(-1, Math.min(1, 1.5 * (a.dial - h))));
    jump = Math.max(jump, Math.abs(n.dial - a.dial)); a = n;
  }
  expect(a.dial).toBeCloseTo(end, 4);
  expect(jump).toBeLessThanOrEqual(0.04 + 1e-12);
});
test('between matches', () => {
  expect(betweenMatches(0.62, 'person')).toBeCloseTo(0.67, 10);
  expect(betweenMatches(0.62, 'ai')).toBeCloseTo(0.57, 10);
  expect(betweenMatches(0.93, 'person')).toBe(0.95);
  expect(betweenMatches(0.12, 'ai')).toBe(0.1);
  expect(betweenMatches(0.62, 'none')).toBe(0.62);
});
test('standing at the opening is even', () => {
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  expect(gapOf(s, 1)).toBeCloseTo((standingOf(s, 1) - standingOf(s, 0)) / (standingOf(s, 1) + standingOf(s, 0)), 10);
  expect(Math.abs(gapOf(s, 1))).toBeLessThan(0.1);
});
