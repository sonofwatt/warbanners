import { describe, expect, test } from 'vitest';
import { applyAction, HANDLERS } from './apply';
import { attackTargets } from './combat';
import { createMatch } from './state';
import { addCity, addUnit, blankMatch, setTile } from './testkit';
import { canSeeUnit, playerView, refreshExplored, visibleTiles } from './vision';

describe('vision', () => {
  test('a warrior sees one tile, two from a mountain', () => {
    const s = blankMatch(); addUnit(s, 'warrior', 0, 0, 0);
    expect(visibleTiles(s, 0).size).toBe(7);
    setTile(s, 0, 0, { terrain: 'mountain' });
    expect(visibleTiles(s, 0).size).toBe(19);
  });
  test('a city sees its radius plus one', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0);
    expect(visibleTiles(s, 0).size).toBe(19);
  });
  test('explored tiles stay explored', () => {
    const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0);
    refreshExplored(s, 0); u.pos = '3,0'; refreshExplored(s, 0);
    expect(s.players[0]!.explored).toContain('0,0');
    expect(s.players[0]!.explored).toContain('4,0');
    expect([...s.players[0]!.explored]).toEqual([...s.players[0]!.explored].sort());
  });
  test('refreshing twice adds no duplicates', () => {
    const s = blankMatch(); addUnit(s, 'warrior', 0, 0, 0);
    refreshExplored(s, 0); refreshExplored(s, 0);
    expect(s.players[0]!.explored.length).toBe(7);
  });
  test('hidden scout is seen only from next to it', () => {
    const s = blankMatch(); const scout = addUnit(s, 'scout', 0, 2, 0);
    addUnit(s, 'horseman', 1, 0, 0);
    expect(canSeeUnit(s, 1, scout)).toBe(false);
    addUnit(s, 'warrior', 1, 1, 0);
    expect(canSeeUnit(s, 1, scout)).toBe(true);
  });
  test('a city next to a hidden unit reveals it', () => {
    const s = blankMatch(); const scout = addUnit(s, 'scout', 0, 2, 0);
    addCity(s, 1, 3, 0);
    expect(canSeeUnit(s, 1, scout)).toBe(true);
  });
  test('a city sees a hidden unit standing on its own tile, and one next to it', () => {
    const s = blankMatch(); s.current = 1;
    const onCity = addUnit(s, 'scout', 0, 2, 0); const beside = addUnit(s, 'scout', 0, -1, 0);
    addCity(s, 1, 2, 0); addCity(s, 1, -2, 0);
    const guard = addUnit(s, 'warrior', 1, 3, 0, { blinded: true });   // blinded: it spots nothing itself
    expect(canSeeUnit(s, 1, onCity)).toBe(true);
    expect(canSeeUnit(s, 1, beside)).toBe(true);
    expect(playerView(s, 1).units.map((u) => u.id)).toContain(onCity.id);
    expect(attackTargets(s, guard.id)).toEqual(['2,0']);
  });
  test('a blinded neighbour does not reveal a hidden unit', () => {
    const s = blankMatch(); const scout = addUnit(s, 'scout', 0, 2, 0);
    addUnit(s, 'horseman', 1, 0, 0);
    addUnit(s, 'warrior', 1, 1, 0, { blinded: true });
    expect(canSeeUnit(s, 1, scout)).toBe(false);
  });
  test('own units are always seen', () => {
    const s = blankMatch(); const u = addUnit(s, 'scout', 0, 2, 0, { blinded: true });
    expect(canSeeUnit(s, 0, u)).toBe(true);
  });
  test('a blinded unit gives no vision', () => {
    const s = blankMatch(); addUnit(s, 'warrior', 0, 0, 0, { blinded: true });
    expect(visibleTiles(s, 0).size).toBe(0);
  });
  test('tiles off the map are never visible', () => {
    const s = blankMatch(); addUnit(s, 'warrior', 0, 4, 0);
    expect(visibleTiles(s, 0).has('5,0')).toBe(false);
    expect(visibleTiles(s, 0).size).toBe(4);
  });
  test('playerView leaves out what the player cannot see', () => {
    const s = blankMatch(); addUnit(s, 'warrior', 0, 0, 0); addUnit(s, 'warrior', 1, 3, 0); refreshExplored(s, 0);
    const v = playerView(s, 0);
    expect(v.units.map(u => u.owner)).toEqual([0]);
    expect(v.tiles['3,0']).toBeUndefined();
  });
  test('playerView shows seen enemies and cities on explored tiles, with copied tiles', () => {
    const s = blankMatch(); addUnit(s, 'warrior', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0);
    addCity(s, 1, 0, 1); addCity(s, 1, 4, 0); refreshExplored(s, 0);
    const v = playerView(s, 0);
    expect(v.units.length).toBe(2);
    expect(v.cities.map(c => c.pos)).toEqual(['0,1']);
    expect(v.visible).toEqual([...v.visible].sort());
    v.tiles['0,0']!.terrain = 'water';
    expect(s.tiles['0,0']!.terrain).toBe('field');
  });
  test('createMatch explores around the starting units and cities', () => {
    const s = createMatch({ seed: 1, factions: ['spartans', 'mongols'] });
    expect(s.players[0]!.explored.length).toBeGreaterThan(0);
    expect(s.players[1]!.explored.length).toBeGreaterThan(0);
  });
  test('applyAction refreshes explored for living players only', () => {
    const s = blankMatch(); addUnit(s, 'warrior', 0, 0, 0); addUnit(s, 'warrior', 1, 3, 0);
    s.players[1]!.alive = false;
    HANDLERS.endTurn = () => null;
    try {
      const r = applyAction(s, { type: 'endTurn' });
      if (!r.ok) throw new Error(r.reason);
      expect(r.state.players[0]!.explored.length).toBe(7);
      expect(r.state.players[1]!.explored.length).toBe(0);
      expect(s.players[0]!.explored.length).toBe(0);
    } finally { delete HANDLERS.endTurn; }
  });
});
