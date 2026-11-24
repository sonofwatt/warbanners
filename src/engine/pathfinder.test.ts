import { expect, test, vi } from 'vitest';
import { applyAction, legalActions } from './apply';
import { UNITS } from './data/units';
import { reachable } from './movement';
import { unitById } from './state';
import { addUnit, blankMatch, must, setTile } from './testkit';

// rules 6: the pathfinder trait. Since rules 8 no unit carries it (the Scout lost it), so the code is dormant; these
// tests drive it by giving the Scout the trait back. This file is alone because vi.mock binds a whole file.
vi.mock('./data/units', async (orig) => {
  const m = await orig<typeof import('./data/units')>();
  return { UNITS: { ...m.UNITS, scout: { ...m.UNITS.scout, traits: [...m.UNITS.scout.traits, 'pathfinder'] } } };
});

test('a pathfinder may end a move on one unexplored tile, never pass through one', () => {
  expect(UNITS.scout.traits).toContain('pathfinder');                           // the mock below
  const s = blankMatch(); const sc = addUnit(s, 'scout', 0, 0, 0, { mp: 4 });
  for (const q of [0, 1, 2, 3, 4]) setTile(s, q, 0, { road: true });
  s.players[0]!.explored = ['-1,0', '-1,1', '0,-1', '0,0', '0,1', '1,-1', '1,0'];
  const r = reachable(s, sc.id);
  expect(r['1,0']).toBe(3);                                                     // explored: as before
  expect(r['2,0']).toBe(0);                                                     // the first unexplored tile: it stops there
  expect(r['3,0']).toBeUndefined();                                             // only through an unexplored tile
});
test('a pathfinder that ends a move in the fog has spent its turn, even with movement left', () => {
  const s = blankMatch(); const sc = addUnit(s, 'scout', 0, 0, 0, { mp: 4 });
  s.players[0]!.explored = ['0,0', '1,0', '-1,0'];
  addUnit(s, 'warrior', 1, 1, 1);                                               // beside the fog tile it will reach
  const t = must(applyAction(s, { type: 'move', unit: sc.id, to: '0,1' }));
  expect(unitById(t, sc.id)).toMatchObject({ pos: '0,1', mp: 0, attacks: 0, acted: true, itemTurn: t.stamp });
  expect(reachable(t, sc.id)).toEqual({});
  expect(legalActions(t).filter((a) => 'unit' in a && a.unit === sc.id)).toEqual([]);
  const u = must(applyAction(s, { type: 'move', unit: sc.id, to: '-1,0' }));    // an explored tile: as before
  expect(unitById(u, sc.id)).toMatchObject({ mp: 2, attacks: 1, acted: false });
});
