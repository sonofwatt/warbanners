import { expect, test } from 'vitest';
import { CAST_MAX, castShadow, daylight, DAYLIGHT_ROUNDS, MAX_REACH } from './daylight';
import { skyLight, svgGrade } from './sky';
import type { TimeOfDay, Weather } from '../../app/advanced';

const day = skyLight({ weather: 'clear', time: 'day' });
const night = skyLight({ weather: 'clear', time: 'night' });
const luma = (c: readonly number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
const at = (time: TimeOfDay, round: number, weather: Weather = 'clear'): ReturnType<typeof skyLight> => skyLight({ weather, time }, round);
const elevation = (d: readonly number[]): number => d[1]! / Math.hypot(d[0]!, d[1]!, d[2]!);
const lit = (s: ReturnType<typeof skyLight>): number => luma(s.light) * luma(s.tint);

test('daylight: dawn from night to day over 30 rounds, dusk the other way, clamped; day and night fixed', () => {
  expect(DAYLIGHT_ROUNDS).toBe(30);
  expect(daylight('dawn', 1)).toBe(0);
  expect(daylight('dawn', 15)).toBeCloseTo(14 / 29);
  expect(daylight('dawn', 30)).toBe(1);
  expect(daylight('dawn', 40)).toBe(1);
  expect(daylight('dusk', 1)).toBe(1);
  expect(daylight('dusk', 15)).toBeCloseTo(15 / 29);
  expect(daylight('dusk', 30)).toBe(0);
  expect(daylight('dusk', 40)).toBe(0);
  for (const r of [0, 1, 15, 30, 40, Number.NaN]) {
    expect(daylight('day', r)).toBe(1);
    expect(daylight('night', r)).toBe(0);
  }
  expect(daylight('dawn', Number.NaN)).toBe(0);
});

test('dawn: round 1 is the night exactly, round 15 between, rounds 30 and 40 the day exactly', () => {
  expect(at('dawn', 1)).toEqual(night);
  expect(at('dawn', 30)).toEqual(day);
  expect(at('dawn', 40)).toEqual(day);
  const mid = at('dawn', 15);
  expect(lit(mid)).toBeGreaterThan(lit(night));
  expect(lit(mid)).toBeLessThan(lit(day));
  expect(mid.light[0]).toBeGreaterThan(mid.light[2]); // warm
  expect(mid.dir[0]).toBeLessThan(0); // the east (screen left)
  expect(elevation(mid.dir)).toBeLessThan(elevation(day.dir));
});

test('dusk: round 1 is the day exactly, round 15 between, rounds 30 and 40 the night exactly', () => {
  expect(at('dusk', 1)).toEqual(day);
  expect(at('dusk', 30)).toEqual(night);
  expect(at('dusk', 40)).toEqual(night);
  const mid = at('dusk', 15);
  expect(lit(mid)).toBeGreaterThan(lit(night));
  expect(lit(mid)).toBeLessThan(lit(day));
  expect(mid.light[0]).toBeGreaterThan(mid.light[2]);
  expect(mid.dir[0]).toBeGreaterThan(0); // the west (screen right)
  expect(elevation(mid.dir)).toBeLessThan(elevation(day.dir));
});

test('day and night are unchanged by the round, in every weather', () => {
  for (const w of ['clear', 'cloudy', 'rain', 'snow'] as const) for (const t of ['day', 'night'] as const) {
    const first = at(t, 1, w);
    for (const r of [15, 30, 40]) expect(at(t, r, w)).toEqual(first);
    for (const r of [15, 30, 40]) expect(svgGrade({ weather: w, time: t }, r)).toEqual(svgGrade({ weather: w, time: t }, 1));
  }
});

test('the light changes smoothly, round by round: dawn brightens and its sun climbs, dusk darkens and its sun sinks', () => {
  for (let r = 2; r <= DAYLIGHT_ROUNDS; r++) {
    const [a, b] = [at('dawn', r - 1), at('dawn', r)];
    expect(lit(b)).toBeGreaterThanOrEqual(lit(a) - 1e-9);
    expect(Math.abs(lit(b) - lit(a))).toBeLessThan(0.06);
    const [c, d] = [at('dusk', r - 1), at('dusk', r)];
    expect(lit(d)).toBeLessThanOrEqual(lit(c) + 1e-9);
    expect(Math.abs(lit(d) - lit(c))).toBeLessThan(0.06);
  }
  // Once risen (by round 6) the dawn sun only climbs; the dusk sun only sinks until it sets.
  for (let r = 7; r <= DAYLIGHT_ROUNDS; r++) expect(elevation(at('dawn', r).dir)).toBeGreaterThan(elevation(at('dawn', r - 1).dir));
  for (let r = 2; r <= 25; r++) expect(elevation(at('dusk', r).dir)).toBeLessThan(elevation(at('dusk', r - 1).dir));
});

test('the SVG grade follows: night at the dark end, none at full day, between at round 15', () => {
  const look = (time: TimeOfDay) => ({ weather: 'clear' as const, time });
  expect(svgGrade(look('dawn'), 1)).toEqual(svgGrade(look('night')));
  expect(svgGrade(look('dawn'), 30)).toBeNull();
  expect(svgGrade(look('dusk'), 1)).toBeNull();
  expect(svgGrade(look('dusk'), 40)).toEqual(svgGrade(look('night')));
  for (const t of ['dawn', 'dusk'] as const) {
    const g = svgGrade(look(t), 15)!;
    expect(g.opacity).toBeGreaterThan(0);
    expect(g.opacity).toBeLessThan(svgGrade(look('night'))!.opacity);
    expect(g.fill).toMatch(/^#[0-9A-F]{6}$/);
  }
});

test('cast shadows: away from the light, long at a low sun (capped), short at a high one', () => {
  const high = castShadow(day.dir, 0.24);
  expect(high.step[0]).toBeGreaterThan(0); // the day's light is from the upper left: shadows fall right
  expect(high.step[1]).toBeLessThan(0); // and away from the viewer
  const low = castShadow(at('dawn', 6).dir, 0.2);
  expect(Math.hypot(...low.step)).toBeGreaterThan(Math.hypot(...high.step) * 2);
  expect(Math.hypot(...castShadow([1, 0.001, 0], 1).step)).toBeCloseTo(MAX_REACH);
  expect(castShadow([0, 1, 0], 0.3)).toEqual({ step: [0, 0], alpha: 0.3 });
  expect(castShadow(at('dusk', 20).dir, 0.2).step[0]).toBeLessThan(0); // a western sun throws shadows east
});

test('a low sun throws longer and darker shadows; a high sun and the high moon are unchanged', () => {
  const day = castShadow([-0.55, 0.8, 0.28], 0.42);
  expect(day.alpha).toBe(0.42);
  const low = castShadow([-0.9, 0.3, 0.3], 0.42);
  expect(low.alpha).toBeGreaterThan(0.5);
  expect(low.alpha).toBeLessThanOrEqual(CAST_MAX);
  expect(Math.hypot(...low.step)).toBeGreaterThan(1.3);
});
