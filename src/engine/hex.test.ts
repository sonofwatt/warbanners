import { test, expect } from 'vitest';
import { distance, range, neighbors, key, parseKey, mirror } from './hex';

test('distance', () => {
  expect(distance({ q: -2, r: 5 }, { q: 2, r: -5 })).toBe(10);
  expect(distance({ q: -2, r: 5 }, { q: 0, r: 0 })).toBe(5);
});
test('range of 6 is the stage 1 board', () => {
  const all = range({ q: 0, r: 0 }, 6);
  expect(all).toHaveLength(127);
  expect(all[0]).toEqual({ q: 0, r: -6 });
});
test('neighbors follow DIRS order', () => {
  expect(neighbors({ q: 0, r: 0 }).map(key)).toEqual(['1,0', '1,-1', '0,-1', '-1,0', '-1,1', '0,1']);
});
test('key round trip and mirror', () => {
  expect(parseKey(key({ q: -3, r: 2 }))).toEqual({ q: -3, r: 2 });
  expect(key(mirror({ q: 0, r: 0 }))).toBe('0,0');
  expect(key(mirror({ q: -3, r: 2 }))).toBe('3,-2');
});
