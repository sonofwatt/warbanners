import { expect, test } from 'vitest';
import { skyLight, svgGrade } from './sky';
import type { TimeOfDay, Weather } from '../../app/advanced';

const TIMES: TimeOfDay[] = ['day', 'dawn', 'dusk', 'night'];
const WEATHERS: Weather[] = ['clear', 'cloudy', 'rain', 'snow'];
const luma = (c: readonly number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;

test('Clear by day is the light the 3D board always had, and no SVG grade', () => {
  const s = skyLight({ weather: 'clear', time: 'day' });
  expect(s.dir).toEqual([-0.55, 0.8, 0.28]);
  expect(s.light).toEqual([1.05, 1.02, 0.96]);
  expect(s.shadow).toEqual([0.68, 0.70, 0.80]);
  expect(s.tint).toEqual([1, 1, 1]);
  expect(s.unitTint).toEqual([1, 1, 1]);
  expect(s).toMatchObject({ glow: 1, windows: 0, sea: '#3E80AE' });
  expect(svgGrade({ weather: 'clear', time: 'day' })).toBeNull();
});

test('night is dark and blue, with warm lights brighter; the figures are graded less than the ground', () => {
  const day = skyLight({ weather: 'clear', time: 'day' });
  const night = skyLight({ weather: 'clear', time: 'night' });
  expect(luma(night.tint)).toBeLessThan(0.7);
  expect(night.tint[2]).toBeGreaterThan(night.tint[0]);
  expect(night.glow).toBeGreaterThan(day.glow);
  expect(night.windows).toBe(1);
  for (const t of TIMES) for (const w of WEATHERS) {
    const s = skyLight({ weather: w, time: t });
    expect(luma(s.unitTint), `${w} ${t}`).toBeGreaterThanOrEqual(luma(s.tint));
    expect(luma(s.unitTint), `${w} ${t}`).toBeGreaterThan(0.8); // figures stay readable
    expect(s.sea).toMatch(/^#[0-9A-F]{6}$/);
  }
});

test('dawn and dusk are low and warm, from either side', () => {
  const dawn = skyLight({ weather: 'clear', time: 'dawn' });
  const dusk = skyLight({ weather: 'clear', time: 'dusk' });
  for (const s of [dawn, dusk]) {
    expect(s.dir[1]).toBeLessThan(0.5);
    expect(s.light[0]).toBeGreaterThan(s.light[2]);
  }
  expect(dawn.dir[0]).toBeLessThan(0);
  expect(dusk.dir[0]).toBeGreaterThan(0);
});

test('cloud and rain flatten and grey the light', () => {
  const clear = skyLight({ weather: 'clear', time: 'day' });
  for (const w of ['cloudy', 'rain'] as const) {
    const s = skyLight({ weather: w, time: 'day' });
    const spread = (x: typeof s): number => luma(x.light) - luma(x.shadow);
    expect(spread(s)).toBeLessThan(spread(clear));
    expect(Math.abs(s.light[0] - s.light[2])).toBeLessThan(clear.light[0] - clear.light[2]);
  }
});

test('the SVG grade: never so strong that the board goes black', () => {
  for (const t of TIMES) for (const w of WEATHERS) {
    const g = svgGrade({ weather: w, time: t });
    if (t === 'day' && w !== 'cloudy' && w !== 'rain') { expect(g).toBeNull(); continue; }
    expect(g!.opacity).toBeGreaterThan(0);
    expect(g!.opacity).toBeLessThanOrEqual(0.6);
  }
});
