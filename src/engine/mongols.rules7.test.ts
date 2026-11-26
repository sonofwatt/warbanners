import { expect, test, vi } from 'vitest';
import { applyAction } from './apply';
import { maxMp, reachable } from './movement';
import { claimTerritory, unitById } from './state';
import { addCity, addUnit, blankMatch, must, setTile } from './testkit';

// Rules 6 and 7 Mongol riding: a half-point riding bonus, ridden by territory, and relay riding for every Mongol unit.
// Rules 8 sets the bonus to 0, turns territoryRiding off and limits relay riding to mounted units; the code stays, and
// these tests drive it with the rules 7 faction data, and with rules 10's first relay tile at the normal cost off
// (CONFIG.relayFirstFull false). This file is alone because vi.mock binds a whole file.
vi.mock('./data/config', async (orig) => {
  const m = await orig<typeof import('./data/config')>();
  return { CONFIG: { ...m.CONFIG, relayFirstFull: false } };
});
vi.mock('./data/factions', async (orig) => {
  const m = await orig<typeof import('./data/factions')>();
  return { FACTIONS: { ...m.FACTIONS, mongols: { ...m.FACTIONS.mongols, mountedMoveBonus: 1, territoryRiding: true, relayMountedOnly: false, canBuildRoads: true } } };
});

const mongols = () => blankMatch({ factions: ['mongols', 'spartans'] });

test('mounted Mongols have a half-point more: two field tiles and one spare, five road tiles; forest stops them', () => {
  const s = mongols(); const h = addUnit(s, 'horseman', 0, 0, 0, { mp: 5 });
  expect(maxMp(s, h)).toBe(5);
  setTile(s, 1, 0, { terrain: 'forest' });
  const r = reachable(s, h.id);
  expect(r['-2,0']).toBe(1);                                                    // the spare half-point buys no field tile
  expect(r['-3,0']).toBeUndefined();
  expect(r['1,0']).toBe(0);
  const w = addUnit(s, 'warrior', 0, 0, 2); expect(maxMp(s, w)).toBe(2);
  const road = mongols(); for (const q of [-4, -3, -2, -1, 0, 1, 2]) setTile(road, q, 0, { road: true });
  const rr = reachable(road, addUnit(road, 'horseman', 0, -4, 0, { mp: 5 }).id);
  expect(rr['1,0']).toBe(0);                                                    // five road tiles
  expect(rr['2,0']).toBeUndefined();
  const sp = blankMatch(); for (const q of [-4, -3, -2, -1, 0, 1]) setTile(sp, q, 0, { road: true });
  const sr = reachable(sp, addUnit(sp, 'horseman', 0, -4, 0, { mp: 4 }).id);
  expect(sr['0,0']).toBe(0);                                                    // a Spartan rider: four
  expect(sr['1,0']).toBeUndefined();
});
test('relay riders: one half-point per tile inside Mongol territory', () => {
  const s = mongols(); addCity(s, 0, 0, 0, { radius: 2 }); claimTerritory(s, s.cities[0]!);
  setTile(s, 1, 0, { terrain: 'forest' }); const w = addUnit(s, 'warrior', 0, 0, 0);
  expect(reachable(s, w.id)['2,0']).toBe(0);
});
test('riding by territory: in friendly land a mounted Mongol has the relay and the bonus', () => {
  const s = mongols(); claimTerritory(s, addCity(s, 0, 0, 0, { radius: 2 }));
  const h = addUnit(s, 'horseman', 0, 1, 0, { mp: 5 });
  const r = reachable(s, h.id);
  expect(r['2,0']).toBe(4);                                                     // relay: 1 inside the territory
  expect(r['4,0']).toBe(0);                                                     // then fields at 2 each: 5 - 1 - 2 - 2
  expect(r['-2,0']).toBe(2);                                                    // three relay tiles and on
});
test('riding by territory: in neutral land a mounted Mongol has the bonus but no relay', () => {
  const s = mongols(); const h = addUnit(s, 'horseman', 0, 0, 0, { mp: 5 });
  const r = reachable(s, h.id);
  expect(r['1,0']).toBe(3);
  expect(r['2,0']).toBe(1);
  expect(r['3,0']).toBeUndefined();
});
test('riding by territory: a move that starts in enemy land has no bonus', () => {
  const s = mongols(); claimTerritory(s, addCity(s, 1, 0, 0, { radius: 2 }));
  const h = addUnit(s, 'horseman', 0, 1, 0, { mp: 5 });
  const r = reachable(s, h.id);
  expect(r['2,0']).toBe(2);                                                     // 4 to spend, not 5
  expect(r['3,0']).toBe(0);
  expect(r['4,0']).toBeUndefined();
  const w = addUnit(s, 'warrior', 0, -1, 0, { mp: 2 });                         // a foot unit never had the bonus
  expect(reachable(s, w.id)['-2,0']).toBe(0);
  const sp = blankMatch(); claimTerritory(sp, addCity(sp, 1, 0, 0, { radius: 2 }));
  const sh = addUnit(sp, 'horseman', 0, 1, 0, { mp: 4 });                       // a Spartan rider: the same 4
  expect(reachable(sp, sh.id)['3,0']).toBe(0);
});
test('riding by territory: the bonus is spent first, so a split move loses only what is unspent', () => {
  const s = mongols(); claimTerritory(s, addCity(s, 1, 3, 0, { radius: 2 }));
  setTile(s, 1, 0, { road: true }); setTile(s, 2, 0, { road: true }); setTile(s, 2, -1, { road: true });
  const h = addUnit(s, 'horseman', 0, -1, 0, { mp: 5 });                        // in neutral land
  const t = must(applyAction(s, { type: 'move', unit: h.id, to: '1,0' }));      // into enemy land: 5 - 4
  expect(unitById(t, h.id)!.mp).toBe(1);
  expect(reachable(t, h.id)['2,0']).toBe(0);                                    // the bonus is spent: the half-point left is its own
  const e = addUnit(s, 'horseman', 0, 2, -1, { mp: 5 });                        // starting in enemy land, unspent
  expect(reachable(s, e.id)['2,0']).toBe(3);                                    // road 1 from 4, not from 5
});
test('riding by territory: a retreat move after an attack pays the same costs', () => {
  const s = mongols(); claimTerritory(s, addCity(s, 1, 2, 0, { radius: 2 }));
  const h = addUnit(s, 'horseman', 0, 0, 0, { mp: 5 });                         // in enemy land
  addUnit(s, 'warrior', 1, 1, 0, { hp: 20 });
  const plain = reachable(s, h.id);
  const t = must(applyAction(s, { type: 'attack', unit: h.id, target: '1,0' }));
  expect(unitById(t, h.id)).toMatchObject({ acted: true, mp: 5 });
  const r = reachable(t, h.id);
  expect(r).toEqual(plain);
  expect(r['-1,0']).toBe(2);                                                    // no bonus: 4 to spend
  expect(r['-2,0']).toBe(0);
  expect(r['-3,0']).toBeUndefined();
  const n = mongols(); const g = addUnit(n, 'horseman', 0, 0, 0, { mp: 5 });     // in neutral land the bonus stays
  addUnit(n, 'warrior', 1, 1, 0, { hp: 20 });
  const tn = must(applyAction(n, { type: 'attack', unit: g.id, target: '1,0' }));
  expect(reachable(tn, g.id)['-2,0']).toBe(1);
});
test('riding by territory: haste is never taken for the bonus, wherever the rider spent its movement', () => {
  const s = mongols(); claimTerritory(s, addCity(s, 1, 3, 0, { radius: 2 }));
  const h = addUnit(s, 'horseman', 0, 0, 0, { mp: 5 });                         // neutral land, bonus unspent
  expect(h.bonusMp).toBe(1);
  const c = addUnit(s, 'skyCaller', 0, 0, 1);
  const moved = must(applyAction(s, { type: 'move', unit: h.id, to: '1,0' }));  // into enemy land: 5 - 2, the bonus spent
  expect(unitById(moved, h.id)).toMatchObject({ mp: 3, bonusMp: 0 });
  const hasted = must(applyAction(moved, { type: 'ability', unit: c.id, ability: 'hasten', target: '1,0' }));
  expect(unitById(hasted, h.id)).toMatchObject({ mp: 5, bonusMp: 0 });
  const r = reachable(hasted, h.id);
  expect(r['2,0']).toBe(3);                                                     // all 5: 3 left and the haste's 2
  expect(r['3,-1']).toBe(1);
  const e = mongols(); claimTerritory(e, addCity(e, 1, 3, 0, { radius: 2 }));
  const g = addUnit(e, 'horseman', 0, 1, 0, { mp: 5 });                         // in enemy land, bonus unspent
  const ec = addUnit(e, 'skyCaller', 0, 0, 1);
  const eh = must(applyAction(e, { type: 'ability', unit: ec.id, ability: 'hasten', target: '1,0' }));
  expect(unitById(eh, g.id)).toMatchObject({ mp: 7, bonusMp: 1 });
  expect(reachable(eh, g.id)['2,0']).toBe(4);                                   // 7 less the barred bonus: 6, then a field
});
