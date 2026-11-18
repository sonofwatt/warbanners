import { describe, expect, test } from 'vitest';
import { generateMap, isConnected } from './mapgen';
import { distance, key, mirror, neighbors, parseKey } from './hex';

const seeds = [1, 2, 3, 42, 1000, 123456];
test.each(seeds)('seed %i: symmetric, complete, connected', (seed) => {
  const m = generateMap(seed, 6);
  expect(Object.keys(m.tiles)).toHaveLength(127);
  for (const k of Object.keys(m.tiles)) {
    const a = m.tiles[k]!, b = m.tiles[key(mirror(parseKey(k)))]!;
    expect([b.terrain, b.resource, b.village, b.treasure]).toEqual([a.terrain, a.resource, a.village, a.treasure]);
  }
  expect(m.villages).toHaveLength(6);
  expect(m.treasures).toHaveLength(4);
  expect(m.tiles['-2,5']!.terrain).toBe('field');
  expect(m.tiles['0,0']).toMatchObject({ terrain: 'field', resource: null, village: false, treasure: false });
  for (const n of neighbors({ q: -2, r: 5 })) { const t = m.tiles[key(n)]; if (t) expect(t.terrain).not.toBe('water'); }
  for (const v of m.villages) {
    expect(m.tiles[v]).toMatchObject({ terrain: 'field', resource: null, village: true });
    expect(distance(parseKey(v), { q: -2, r: 5 })).toBeGreaterThanOrEqual(3);
    expect(distance(parseKey(v), { q: 2, r: -5 })).toBeGreaterThanOrEqual(3);
  }
  expect(isConnected(m.tiles, '-2,5', ['2,-5', ...m.villages, ...m.treasures])).toBe(true);
});
test('same seed, same map; different seed, different map', () => {
  expect(generateMap(42, 6)).toEqual(generateMap(42, 6));
  expect(generateMap(42, 6).tiles).not.toEqual(generateMap(43, 6).tiles);
});
test('isConnected sees water as a wall', () => {
  const m = generateMap(1, 6);
  for (const n of neighbors({ q: 2, r: -5 })) { const t = m.tiles[key(n)]; if (t) t.terrain = 'water'; }
  expect(isConnected(m.tiles, '-2,5', ['2,-5'])).toBe(false);
});
describe('spacing and shape', () => {
  test.each(seeds)('seed %i: spacing, treasures, cityId', (seed) => {
    const m = generateMap(seed, 6);
    for (let i = 0; i < m.villages.length; i++) for (let j = i + 1; j < m.villages.length; j++) {
      expect(distance(parseKey(m.villages[i]!), parseKey(m.villages[j]!))).toBeGreaterThanOrEqual(3);
    }
    for (const t of m.treasures) {
      expect(m.tiles[t]).toMatchObject({ treasure: true, resource: null });
      for (const v of m.villages) expect(distance(parseKey(t), parseKey(v))).toBeGreaterThanOrEqual(2);
    }
    for (const t of Object.values(m.tiles)) expect(t.cityId).toBeNull();
    expect(m.attempts).toBeGreaterThanOrEqual(1);
  });
});
