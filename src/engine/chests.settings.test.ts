import { expect, test } from 'vitest';
import { createMatch, hashState, treasuresPerHalf } from './index';
import type { MatchSettings } from './index';
import { generateMap, isConnected } from './mapgen';
import { distance, key, mirror, parseKey } from './hex';
import { CONFIG } from './data/config';

// The advanced chest setting: Few, Normal (today's map) and Many treasures. Absent means Normal.

const BASE: MatchSettings = { seed: 42, factions: ['spartans', 'mongols'] };
const treasures = (s: MatchSettings): string[] => Object.entries(createMatch(s).tiles).filter(([, t]) => t.treasure).map(([k]) => k);

test('absent and normal chests are today\'s map, exactly', () => {
  for (const seed of [0, 1, 7, 42, 99999]) {
    const s = { ...BASE, seed };
    expect(hashState(createMatch({ ...s, chests: 'normal' }))).toBe(hashState(createMatch(s)));
    expect(generateMap(seed, 6, CONFIG.mapgen.treasuresPerHalf)).toEqual(generateMap(seed, 6));
  }
  expect(treasuresPerHalf(undefined)).toBe(2);
  expect(treasuresPerHalf('normal')).toBe(2);
});

test('weather and time of day are looks: they never change the match', () => {
  const h = hashState(createMatch(BASE));
  for (const weather of ['clear', 'cloudy', 'rain', 'snow', 'random'] as const) {
    for (const time of ['day', 'dawn', 'dusk', 'night', 'random'] as const) {
      expect(hashState(createMatch({ ...BASE, weather, time }))).toBe(h);
    }
  }
});

test('Few, Normal and Many place 1, 2 and 4 chests a half, mirrored and spaced by the map rules', () => {
  for (let seed = 0; seed < 300; seed++) {
    for (const [chests, per] of [['few', 1], ['normal', 2], ['many', 4]] as const) {
      const m = generateMap(seed, 6, treasuresPerHalf(chests));
      expect(m.treasures, `seed ${seed} ${chests}`).toHaveLength(per * 2);
      const set = new Set(m.treasures);
      for (const t of m.treasures) {
        expect(set.has(key(mirror(parseKey(t))))).toBe(true);
        expect(m.tiles[t]).toMatchObject({ treasure: true, resource: null });
        for (const c of CONFIG.capitals) expect(distance(parseKey(t), parseKey(c))).toBeGreaterThanOrEqual(CONFIG.mapgen.treasureMinCapitalDistance!);
        for (const o of [...m.villages, ...m.treasures]) {
          if (o !== t) expect(distance(parseKey(t), parseKey(o))).toBeGreaterThanOrEqual(CONFIG.mapgen.treasureMinFeatureDistance!);
        }
      }
      expect(isConnected(m.tiles, CONFIG.capitals[0], [CONFIG.capitals[1], ...m.villages, ...m.treasures])).toBe(true);
    }
  }
});

test('the chest setting reaches the match: Few, Normal and Many differ in chests only where they must', () => {
  expect(treasures({ ...BASE, chests: 'few' })).toHaveLength(2);
  expect(treasures(BASE)).toHaveLength(4);
  expect(treasures({ ...BASE, chests: 'many' })).toHaveLength(8);
  // The same seed rolls the same land: the villages stand where they stand on today's map.
  const villages = (s: MatchSettings): string[] => Object.entries(createMatch(s).tiles).filter(([, t]) => t.village).map(([k]) => k);
  expect(villages({ ...BASE, chests: 'many' })).toEqual(villages(BASE));
});
