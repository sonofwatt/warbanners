import { describe, expect, test } from 'vitest';
import { CONFIG } from './data/config';
import { reachable } from './movement';
import { addUnit, blankMatch, give, setTile } from './testkit';
import type { MatchState } from './types';

// Horseman: move 2, so 4 half-points; a field costs 2 and a forest 4 (CONFIG.terrain)
const forests = (s: MatchState): void => { setTile(s, 1, 0, { terrain: 'forest' }); setTile(s, 2, 0, { terrain: 'forest' }); };

describe('Woodland forest stride', () => {
  test('a Woodland-owned Horseman crosses two forests in a row and ends with 0 left', () => {
    const s = blankMatch({ factions: ['woodland', 'mongols'] }); forests(s);
    const h = addUnit(s, 'horseman', 0, 0, 0);
    const r = reachable(s, h.id);
    expect(r['1,0']).toBe(2);
    expect(r['2,0']).toBe(0);
  });
  test('a Spartan Horseman reaches only the first forest', () => {
    const s = blankMatch(); forests(s);
    const h = addUnit(s, 'horseman', 0, 0, 0);
    const r = reachable(s, h.id);
    expect(r['1,0']).toBe(0);
    expect(r['2,0']).toBeUndefined();
  });
  test('a Mongol Horseman still loses its move on entering a forest', () => {
    const s = blankMatch({ factions: ['mongols', 'spartans'] }); forests(s);
    const h = addUnit(s, 'horseman', 0, 0, 0);
    const r = reachable(s, h.id);
    expect(r['1,0']).toBe(0);
    expect(r['2,0']).toBeUndefined();
  });
  test('a Woodland Skirmisher next to an enemy stops on entering a tile beside it', () => {
    const s = blankMatch({ factions: ['woodland', 'mongols'] }); setTile(s, 1, 0, { terrain: 'forest' });
    const sk = addUnit(s, 'skirmisher', 0, 0, 0); addUnit(s, 'warrior', 1, 2, 0);
    expect(reachable(s, sk.id)['1,0']).toBe(0);
    const t = blankMatch({ factions: ['woodland', 'mongols'] }); setTile(t, 1, 0, { terrain: 'forest' });
    const h = addUnit(t, 'horseman', 0, 0, 0); addUnit(t, 'warrior', 1, 2, 0);
    expect(reachable(t, h.id)['1,0']).toBe(0);                 // would be 2 without the enemy beside it
  });
  test('a Woodland unit still cannot climb a mountain without prospecting', () => {
    const s = blankMatch({ factions: ['woodland', 'mongols'] }); setTile(s, 1, 0, { terrain: 'mountain' });
    const h = addUnit(s, 'horseman', 0, 0, 0);
    expect(reachable(s, h.id)['1,0']).toBeUndefined();
    give(s, 0, CONFIG.mountain.tech!);
    expect(reachable(s, h.id)['1,0']).toBe(0);
  });
  test('roads are unchanged: a forest road costs the road rate', () => {
    const s = blankMatch({ factions: ['woodland', 'mongols'] });
    for (const q of [0, 1, 2]) setTile(s, q, 0, { road: true });
    setTile(s, 1, 0, { terrain: 'forest', road: true });
    const h = addUnit(s, 'horseman', 0, 0, 0);
    expect(reachable(s, h.id)['2,0']).toBe(4 - 2 * CONFIG.roadCost);
  });
});
