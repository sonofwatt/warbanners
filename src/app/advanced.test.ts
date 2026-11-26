import { expect, test } from 'vitest';
import { createMatch, hashState, replay } from '../engine';
import type { MatchSettings } from '../engine';
import { advancedPart, DEFAULT_ADVANCED, lookOf, readAdvanced } from './advanced';
import { newRecord, restore } from './record';

const BASE: MatchSettings = { seed: 42, factions: ['spartans', 'mongols'] };

test('the defaults write nothing, so a default match\'s settings are exactly today\'s', () => {
  expect(advancedPart(undefined)).toEqual({});
  expect(advancedPart(DEFAULT_ADVANCED)).toEqual({});
  expect({ ...BASE, ...advancedPart(DEFAULT_ADVANCED) }).toEqual(BASE);
  expect(advancedPart({ chests: 'many', weather: 'clear', time: 'night' })).toEqual({ chests: 'many', time: 'night' });
});

test('untrusted settings: known choices are kept, defaults dropped, anything else refused', () => {
  expect(readAdvanced({})).toEqual({});
  expect(readAdvanced({ chests: 'normal', weather: 'clear', time: 'day' })).toEqual({});
  expect(readAdvanced({ chests: 'few', weather: 'random', time: 'dusk' })).toEqual({ chests: 'few', weather: 'random', time: 'dusk' });
  expect(readAdvanced({ chests: 'lots' })).toBeNull();
  expect(readAdvanced({ weather: 3 })).toBeNull();
  expect(readAdvanced({ time: 'noon' })).toBeNull();
});

test('a match with no advanced fields looks as today: clear, by day', () => {
  expect(lookOf(BASE)).toEqual({ weather: 'clear', time: 'day' });
  expect(lookOf(null)).toEqual({ weather: 'clear', time: 'day' });
  expect(lookOf({ ...BASE, weather: 'snow', time: 'dawn' })).toEqual({ weather: 'snow', time: 'dawn' });
});

test('Random weather and time are picked from the seed: stable for the match, the same on every phone', () => {
  const seen = { weather: new Set<string>(), time: new Set<string>() };
  let tied = 0;
  for (let seed = 0; seed < 400; seed++) {
    const s: MatchSettings = { ...BASE, seed, weather: 'random', time: 'random' };
    const a = lookOf(s);
    // Another phone gets the settings through the wire as JSON: the same pick.
    expect(lookOf(JSON.parse(JSON.stringify(s)) as MatchSettings)).toEqual(a);
    expect(lookOf(s)).toEqual(a);
    seen.weather.add(a.weather); seen.time.add(a.time);
    if (a.weather === 'clear' && a.time === 'day') tied++;
  }
  expect([...seen.weather].sort()).toEqual(['clear', 'cloudy', 'rain', 'snow']);
  expect([...seen.time].sort()).toEqual(['dawn', 'day', 'dusk', 'night']);
  // Weather and time are drawn apart, so roughly one match in sixteen is clear by day.
  expect(tied).toBeGreaterThan(10);
  expect(tied).toBeLessThan(50);
  // -1 and 4294967295 are the same match, and look the same.
  expect(lookOf({ ...BASE, seed: -1, weather: 'random', time: 'random' })).toEqual(lookOf({ ...BASE, seed: 4294967295, weather: 'random', time: 'random' }));
});

test('an old record (no advanced fields) loads unchanged; a new one keeps its choices through a save', () => {
  const old = newRecord('m', BASE, ['Ann', 'Ben'], 1);
  const r = restore(JSON.parse(JSON.stringify(old)));
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.record.settings).toEqual(BASE);
  expect(hashState(r.state)).toBe(hashState(createMatch(BASE)));
  const many: MatchSettings = { ...BASE, chests: 'many', weather: 'rain', time: 'night' };
  const r2 = restore(JSON.parse(JSON.stringify(newRecord('n', many, ['Ann', 'Ben'], 1))));
  expect(r2.ok).toBe(true);
  if (!r2.ok) return;
  expect(r2.record.settings).toEqual(many);
  expect(Object.values(r2.state.tiles).filter((t) => t.treasure)).toHaveLength(8);
  expect(hashState(replay(many, []))).toBe(hashState(createMatch(many)));
  expect(lookOf(r2.record.settings)).toEqual({ weather: 'rain', time: 'night' });
});
