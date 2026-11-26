import { expect, test } from 'vitest';
import { createMatch } from '../engine';
import { ADAPT, adaptStep, betweenMatches, gapOf, standingOf } from './adapt';
import type { AdaptState } from './adapt';

// The scripted standing of a match: it sums the play, moving each turn by how far the AI's dial is above the other
// side's strength h (the real gap is a standing like this, not a measure of one turn).
function sumsThePlay(h: number, rate: number, turns: number): { dials: number[]; reversals: number; jump: number } {
  let a: AdaptState = { dial: ADAPT.start, trend: 0 }; let g = 0; const dials: number[] = [];
  let reversals = 0; let last = 0; let jump = 0;
  for (let t = 0; t < turns; t++) {
    const n = adaptStep(a, g); const move = n.dial - a.dial;
    if (move * last < 0) reversals += 1;
    if (move !== 0) last = move;
    jump = Math.max(jump, Math.abs(move)); a = n; dials.push(a.dial);
    g = Math.max(-1, Math.min(1, g + rate * (a.dial - h)));
  }
  return { dials, reversals, jump };
}

test('steady lead: small steps down', () => {
  let a: AdaptState = { dial: 0.5, trend: 0 }; const dials: number[] = [];
  for (let i = 0; i < 3; i++) { a = adaptStep(a, 0.4); dials.push(a.dial); }
  expect(dials[0]).toBeCloseTo(0.4776, 10); expect(dials[1]).toBeCloseTo(0.44932, 10); expect(dials[2]).toBeCloseTo(0.427424, 10);
  expect(a.trend).toBeCloseTo(0.2628, 10);
});
test('a close game is left alone', () => {
  let a: AdaptState = { dial: 0.5, trend: 0 };
  for (let i = 0; i < 20; i++) a = adaptStep(a, i % 2 === 0 ? 0.05 : -0.05);
  expect(a.dial).toBe(0.5);
});
test('it never leaves its range', () => {
  let a: AdaptState = { dial: 0.12, trend: 0 };
  for (let i = 0; i < 30; i++) a = adaptStep(a, 0.9);
  expect(a.dial).toBe(0.1);
  a = { dial: 0.93, trend: 0 };
  for (let i = 0; i < 30; i++) a = adaptStep(a, -0.9);
  expect(a.dial).toBe(0.95);
});
test('a lead that comes and goes leaves the dial near where it was', () => {
  // Ten turns behind by 0.25 (a faction's early tempo, a lost city taken back), then even again. The old dial,
  // which stepped by the trend, ran from 0.5 to its top on this and stayed there.
  let a: AdaptState = { dial: 0.5, trend: 0 }; let top = 0;
  for (let t = 0; t < 40; t++) { a = adaptStep(a, t >= 2 && t < 12 ? -0.25 : 0); top = Math.max(top, a.dial); }
  expect(top).toBeLessThan(0.62);
  expect(Math.abs(a.dial - 0.5)).toBeLessThan(0.05);
});
test.each([[0.2, 0.03], [0.2, 0.06], [0.85, 0.03], [0.85, 0.06]])(
  'against a standing that sums the play (strength %f, rate %f) it moves one way, gently', (h, rate) => {
    const { dials, reversals, jump } = sumsThePlay(h, rate, 60);
    expect(reversals).toBe(0);
    expect(jump).toBeLessThanOrEqual(ADAPT.maxStep + 1e-12);
    expect(Math.abs(dials.at(-1)! - h)).toBeLessThanOrEqual(0.1 + 1e-12);
  });
test.each([0.2, 0.5, 0.8])('converges toward a scripted opponent of strength %f without passing it', (h) => {
  // the scripted opponent: the gap it produces is clamp(1.5 * (dial - h), -1, 1)
  let a: AdaptState = { dial: ADAPT.start, trend: 0 }; let jump = 0;
  for (let t = 0; t < 40; t++) {
    const n = adaptStep(a, Math.max(-1, Math.min(1, 1.5 * (a.dial - h))));
    jump = Math.max(jump, Math.abs(n.dial - a.dial)); a = n;
    expect(Math.sign(a.dial - h)).not.toBe(-Math.sign(ADAPT.start - h));
  }
  if (h !== ADAPT.start) expect(Math.abs(a.dial - h)).toBeLessThan(0.5 * Math.abs(ADAPT.start - h));
  expect(jump).toBeLessThanOrEqual(ADAPT.maxStep + 1e-12);
});
test('between matches', () => {
  expect(betweenMatches(0.62, 'person')).toBeCloseTo(0.72, 10);
  expect(betweenMatches(0.62, 'ai')).toBeCloseTo(0.52, 10);
  expect(betweenMatches(0.9, 'person')).toBe(0.95);
  expect(betweenMatches(0.15, 'ai')).toBe(0.1);
  expect(betweenMatches(0.62, 'none')).toBe(0.62);
});
test('standing at the opening is even but for the Spartan level 2 capital', () => {
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  expect(gapOf(s, 1)).toBeCloseTo((standingOf(s, 1) - standingOf(s, 0)) / (standingOf(s, 1) + standingOf(s, 0)), 10);
  // rules 9: the Spartan capital starts at level 2, worth 2 for the level and 1 for the income; without it the two
  // sides stand within 0.1 of each other (10.5 and 10.75 on this map)
  const even = { ...s, cities: s.cities.map((c) => (c.owner === 0 ? { ...c, level: 1 } : c)) };
  expect(standingOf(s, 0) - standingOf(even, 0)).toBe(3);
  expect(Math.abs(gapOf(even, 1))).toBeLessThan(0.1);
});
