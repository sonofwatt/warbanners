import { expect, test } from 'vitest';
import { abilityTargets } from './abilities';
import { applyAction } from './apply';
import { attackOf, attackTargets, lureApplies } from './combat';
import { growthNeeded } from './economy';
import { hashState } from './hash';
import { maxMp, reachable } from './movement';
import { cityById, unitAt, unitById } from './state';
import { addCity, addUnit, blankMatch, give, must, setTile } from './testkit';
import { campCity } from './training';
import { visibleTiles } from './vision';
import { claimTerritory } from './state';
import type { Action } from './types';

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
test('tribute and slow growth', () => {
  const s = mongols(); setTile(s, 1, 0, { village: true }); const u = addUnit(s, 'horseman', 0, 1, 0);
  expect(must(applyAction(s, { type: 'capture', unit: u.id })).players[0]!.gold).toBe(23);
  const c = addCity(s, 1, 3, 0, { level: 3 }); const v = addUnit(s, 'horseman', 0, 3, 0); addCity(s, 1, -3, 0);
  expect(must(applyAction(s, { type: 'capture', unit: v.id })).players[0]!.gold).toBe(26);
  expect(growthNeeded(s, addCity(s, 0, 0, 3))).toBe(3); void c;
});
test('inspire: a horseman beside the Khan\'s Guard deals 8 to a warrior', () => {
  const s = mongols(); const h = addUnit(s, 'horseman', 0, 0, 0); addUnit(s, 'khansGuard', 0, -1, 0); const d = addUnit(s, 'warrior', 1, 1, 0);
  expect(unitById(must(applyAction(s, { type: 'attack', unit: h.id, target: '1,0' })), d.id)!.hp).toBe(2);
  const w = addUnit(s, 'warrior', 0, -1, 1); expect(attackOf(s, w)).toBe(4);
});
test('inspire also lifts the counter-attack, and an enemy Guard does not inspire', () => {
  const s = mongols(); const h = addUnit(s, 'horseman', 0, 0, 0); addUnit(s, 'khansGuard', 0, -1, 0);
  expect(attackOf(s, h)).toBe(5);
  const t = mongols(); const h2 = addUnit(t, 'horseman', 0, 0, 0); addUnit(t, 'khansGuard', 1, -1, 0);
  expect(attackOf(t, h2)).toBe(4);
});
test('horse archer shoots, keeps its movement, and lures the target one tile', () => {
  const s = mongols(); const a = addUnit(s, 'horseArcher', 0, 0, 0, { mp: 6 }); const d = addUnit(s, 'warrior', 1, 2, 0);
  const shot = must(applyAction(s, { type: 'attack', unit: a.id, target: '2,0', lure: true }));
  expect(unitById(shot, a.id)).toMatchObject({ mp: 6, attacks: 0, lure: { target: d.id, from: '0,0' } });
  const r = applyAction(shot, { type: 'move', unit: a.id, to: '-2,0' }); const t = must(r);
  expect(unitById(t, d.id)!.pos).toBe('1,0');
  expect(r.ok && r.events).toContainEqual({ type: 'lured', unit: d.id, from: '2,0', to: '1,0' });
  expect(unitById(t, a.id)!.lure).toBeNull();
});
test('melee lure pulls the target onto the tile the rider left', () => {
  const s = mongols(); const h = addUnit(s, 'horseman', 0, 0, 0, { mp: 6 }); const d = addUnit(s, 'defender', 1, 1, 0);
  const hit = must(applyAction(s, { type: 'attack', unit: h.id, target: '1,0', lure: true }));
  const t = must(applyAction(hit, { type: 'move', unit: h.id, to: '-1,0' }));
  expect(unitById(t, d.id)!.pos).toBe('0,0');
});
test('no lure on a steadied unit, a unit in a city, a dead unit, or for Spartans', () => {
  const s = mongols(); const a = addUnit(s, 'horseArcher', 0, 0, 0, { mp: 6 });
  const d = addUnit(s, 'warrior', 1, 2, 0); addUnit(s, 'piper', 1, 3, 0);
  expect(unitById(must(applyAction(s, { type: 'attack', unit: a.id, target: '2,0', lure: true })), a.id)!.lure).toBeNull();
  const s2 = mongols(); const a2 = addUnit(s2, 'horseArcher', 0, 0, 0, { mp: 6 }); addCity(s2, 1, 2, 0); addUnit(s2, 'warrior', 1, 2, 0);
  expect(unitById(must(applyAction(s2, { type: 'attack', unit: a2.id, target: '2,0', lure: true })), a2.id)!.lure).toBeNull();
  const s3 = mongols(); const a3 = addUnit(s3, 'horseArcher', 0, 0, 0, { mp: 6 }); const weak = addUnit(s3, 'warrior', 1, 2, 0, { hp: 6 });
  const other = addUnit(s3, 'horseArcher', 0, 0, 1, { mp: 6 });
  const first = must(applyAction(s3, { type: 'attack', unit: a3.id, target: '2,0', lure: true }));
  const killed = must(applyAction(first, { type: 'attack', unit: other.id, target: '2,0' }));
  expect(unitById(killed, weak.id)).toBeUndefined();
  const moved = must(applyAction(killed, { type: 'move', unit: a3.id, to: '-1,0' }));
  expect(moved.units).toHaveLength(2);
  const sp = blankMatch(); const h = addUnit(sp, 'horseman', 0, 0, 0); addUnit(sp, 'defender', 1, 1, 0);
  expect(unitById(must(applyAction(sp, { type: 'attack', unit: h.id, target: '1,0', lure: true })), h.id)!.lure).toBeNull();
  void d;
});
test('a Spartan unit with retreat never records a lure', () => {
  const s = blankMatch(); const h = addUnit(s, 'horseman', 0, 0, 0, { mp: 4 }); addUnit(s, 'warrior', 1, 1, 0);
  expect(unitById(must(applyAction(s, { type: 'attack', unit: h.id, target: '1,0', lure: true })), h.id)!.lure).toBeNull();
});
test('lure must be exactly true: other values attack without a lure', () => {
  for (const bad of ['yes', 1, {}, [true]]) {
    const s = mongols(); const a = addUnit(s, 'horseArcher', 0, 0, 0, { mp: 6 }); addUnit(s, 'warrior', 1, 2, 0);
    const r = applyAction(s, { type: 'attack', unit: a.id, target: '2,0', lure: bad } as unknown as Action);
    expect(unitById(must(r), a.id)).toMatchObject({ attacks: 0, lure: null });
  }
});
test('a lure whose destination is occupied does nothing and clears the lure', () => {
  const s = mongols(); const a = addUnit(s, 'horseArcher', 0, 0, 0, { mp: 6 }); const d = addUnit(s, 'warrior', 1, 2, 0);
  const shot = must(applyAction(s, { type: 'attack', unit: a.id, target: '2,0', lure: true }));
  const blocker = addUnit(shot, 'warrior', 1, 1, 0);
  const r = applyAction(shot, { type: 'move', unit: a.id, to: '-2,0' }); const t = must(r);
  expect(unitById(t, d.id)!.pos).toBe('2,0'); expect(unitById(t, blocker.id)!.pos).toBe('1,0');
  expect(unitById(t, a.id)!.lure).toBeNull();
  expect(r.ok && r.events.some((e) => e.type === 'lured')).toBe(false);
});
test('a distance 2 lure uses the first shared neighbour that is free, skipping a blocked one', () => {
  const s = mongols(); const a = addUnit(s, 'horseArcher', 0, 0, 0, { mp: 6 }); const d = addUnit(s, 'warrior', 1, 2, -1);
  const blocker = addUnit(s, 'warrior', 0, 1, -1);                   // the first shared neighbour in direction order
  const shot = must(applyAction(s, { type: 'attack', unit: a.id, target: '2,-1', lure: true }));
  const r = applyAction(shot, { type: 'move', unit: a.id, to: '-2,0' }); const t = must(r);
  expect(unitById(t, d.id)!.pos).toBe('1,0'); expect(unitById(t, blocker.id)!.pos).toBe('1,-1');
  expect(r.ok && r.events).toContainEqual({ type: 'lured', unit: d.id, from: '2,-1', to: '1,0' });
  addUnit(shot, 'warrior', 0, 1, 0);                                 // now both shared neighbours are taken
  const both = must(applyAction(shot, { type: 'move', unit: a.id, to: '-2,0' }));
  expect(unitById(both, d.id)!.pos).toBe('2,-1'); expect(unitById(both, a.id)!.lure).toBeNull();
});
test('a pulled unit never collects a treasure', () => {
  const s = mongols(); const a = addUnit(s, 'horseArcher', 0, 0, 0, { mp: 6 }); const d = addUnit(s, 'warrior', 1, 2, 0);
  setTile(s, 1, 0, { treasure: true });
  const t = must(applyAction(must(applyAction(s, { type: 'attack', unit: a.id, target: '2,0', lure: true })), { type: 'move', unit: a.id, to: '-2,0' }));
  expect(unitById(t, d.id)!.pos).toBe('1,0'); expect(t.tiles['1,0']!.treasure).toBe(true);
});
test('sky caller: hasten and dust storm', () => {
  const s = mongols(); const c = addUnit(s, 'skyCaller', 0, 0, 0, { mp: 6 }); const h = addUnit(s, 'horseman', 0, 1, 0, { mp: 6 });
  const e1 = addUnit(s, 'archer', 1, 2, -1); const e2 = addUnit(s, 'warrior', 1, 3, -2); const mine = addUnit(s, 'warrior', 0, 2, 0);
  expect(unitById(must(applyAction(s, { type: 'ability', unit: c.id, ability: 'hasten', target: '1,0' })), h.id)!.mp).toBe(8);
  expect(applyAction(s, { type: 'ability', unit: c.id, ability: 'hasten', target: '2,0' }).ok).toBe(false);
  const t = must(applyAction(s, { type: 'ability', unit: c.id, ability: 'dustStorm', target: '2,-1' }));
  expect([e1, e2, mine].map(u => unitById(t, u.id)!.blinded)).toEqual([true, true, false]);
  const theirs = must(applyAction(t, { type: 'endTurn' }));
  expect(attackTargets(theirs, e1.id)).toEqual([]);
  expect(visibleTiles(theirs, 1).size).toBe(0);
});
test('a hastened unit can move the extra distance', () => {
  const s = mongols(); const c = addUnit(s, 'skyCaller', 0, 0, 0); const h = addUnit(s, 'horseman', 0, 1, 0);
  expect(reachable(s, h.id)['-2,0']).toBeUndefined();
  const t = must(applyAction(s, { type: 'ability', unit: c.id, ability: 'hasten', target: '1,0' }));
  expect(reachable(t, h.id)['-2,0']).toBe(0);
});
test('dust storm is refused on a tile with no visible enemy on or beside it', () => {
  const s = mongols(); const c = addUnit(s, 'skyCaller', 0, 0, 0); addUnit(s, 'warrior', 1, 4, -4);
  expect(abilityTargets(s, c.id, 'dustStorm')).toEqual([]);
  const before = hashState(s);
  expect(applyAction(s, { type: 'ability', unit: c.id, ability: 'dustStorm', target: '2,0' }).ok).toBe(false);
  expect(applyAction(s, { type: 'ability', unit: c.id, ability: 'dustStorm', target: '4,-4' }).ok).toBe(false);
  expect(hashState(s)).toBe(before);
  addUnit(s, 'warrior', 1, 1, 1);                      // visible, distance 2 from the caster
  expect(abilityTargets(s, c.id, 'dustStorm')).toContain('1,1');
  expect(abilityTargets(s, c.id, 'dustStorm')).toContain('2,0');   // beside the enemy and within 2
  expect(abilityTargets(s, c.id, 'dustStorm')).not.toContain('2,-1');
});
test('the Camp trains beside itself on behalf of a city', () => {
  const s = mongols(); give(s, 0, 'riding', 'roads'); const city = addCity(s, 0, -3, 0); const camp = addUnit(s, 'camp', 0, 2, 0);
  expect(campCity(s, 0)!.id).toBe(city.id);
  const t = must(applyAction(s, { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: '3,0' }));
  expect(unitAt(t, '3,0')).toMatchObject({ type: 'horseman', home: city.id, mp: 0, attacks: 0 });
  expect(t.players[0]!.gold).toBe(18);
  expect(applyAction(t, { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: '2,1' }).ok).toBe(false);
  expect(applyAction(s, { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: '0,0' }).ok).toBe(false);
  const full = structuredClone(s); cityById(full, city.id)!.level = 0; cityById(full, city.id)!.capacityBonus = -1;
  expect(applyAction(full, { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: '3,0' }).ok).toBe(false);
  const movedCamp = structuredClone(s); unitById(movedCamp, camp.id)!.moved = true;
  expect(applyAction(movedCamp, { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: '3,0' }).ok).toBe(false);
  expect(attackTargets(s, camp.id)).toEqual([]);
});
test('campCity prefers the most free capacity, lowest id on a tie', () => {
  const s = mongols(); const c0 = addCity(s, 0, -3, 0); const c1 = addCity(s, 0, -3, 2);
  expect(campCity(s, 0)!.id).toBe(c0.id);
  addUnit(s, 'warrior', 0, 0, 0, { home: c0.id });
  expect(campCity(s, 0)!.id).toBe(c1.id);
  expect(campCity(s, 1)).toBeNull();
});
test('campTrain refuses hostile input and leaves the state untouched', () => {
  const s = mongols(); give(s, 0, 'riding', 'roads'); addCity(s, 0, -3, 0); const camp = addUnit(s, 'camp', 0, 2, 0);
  const before = hashState(s);
  const bad: unknown[] = [
    { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: 'constructor' },
    { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: '__proto__' },
    { type: 'campTrain', unit: camp.id, unitType: 'constructor', to: '3,0' },
    { type: 'campTrain', unit: camp.id, unitType: '__proto__', to: '3,0' },
    { type: 'campTrain', unit: 'x', unitType: 'horseman', to: '3,0' },
    { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: 5 },
    { type: 'campTrain', unit: camp.id, unitType: 'khansGuard', to: '3,0' },
  ];
  for (const a of bad) expect(applyAction(s, a as Action).ok).toBe(false);
  expect(hashState(s)).toBe(before);
});
test('lureApplies: Mongol retreat attacker, unsteadied target outside any city, attacker not fresh', () => {
  const s = mongols(); const a = addUnit(s, 'horseArcher', 0, 0, 0); const d = addUnit(s, 'warrior', 1, 2, 0);
  expect(lureApplies(s, a, d)).toBe(true);
  expect(lureApplies(s, addUnit(s, 'warrior', 0, 0, 1), d)).toBe(false);          // no retreat
  expect(lureApplies(s, { ...a, fresh: true }, d)).toBe(false);
  const steadied = mongols(); const a2 = addUnit(steadied, 'horseArcher', 0, 0, 0); const d2 = addUnit(steadied, 'warrior', 1, 2, 0);
  addUnit(steadied, 'piper', 1, 3, 0);
  expect(lureApplies(steadied, a2, d2)).toBe(false);
  const inCity = mongols(); const a3 = addUnit(inCity, 'horseArcher', 0, 0, 0); addCity(inCity, 0, 2, 0);
  expect(lureApplies(inCity, a3, addUnit(inCity, 'warrior', 1, 2, 0))).toBe(false);   // any city, even the rider's own
  const sp = blankMatch(); const h = addUnit(sp, 'horseman', 0, 0, 0);
  expect(lureApplies(sp, h, addUnit(sp, 'warrior', 1, 1, 0))).toBe(false);
});
test('an attack asking for a lure that cannot apply is accepted with the lure ignored', () => {
  const s = mongols(); const a = addUnit(s, 'horseArcher', 0, 0, 0, { mp: 6 }); addUnit(s, 'warrior', 1, 2, 0); addUnit(s, 'piper', 1, 3, 0);
  const r = applyAction(s, { type: 'attack', unit: a.id, target: '2,0', lure: true });
  expect(unitById(must(r), a.id)).toMatchObject({ attacks: 0, lure: null });
});
test('hasten, dustStorm and campTrain refuse hostile and off-map targets with the state untouched', () => {
  const s = mongols(); give(s, 0, 'riding', 'roads'); addCity(s, 0, -3, 0);
  const c = addUnit(s, 'skyCaller', 0, 0, 0); addUnit(s, 'horseman', 0, 1, 0); addUnit(s, 'warrior', 1, 2, 0);
  const camp = addUnit(s, 'camp', 0, -2, 2);
  const before = hashState(s);
  const bad: unknown[] = [
    { type: 'ability', unit: c.id, ability: 'hasten', target: 'constructor' },
    { type: 'ability', unit: c.id, ability: 'hasten', target: '__proto__' },
    { type: 'ability', unit: c.id, ability: 'dustStorm', target: 'constructor' },
    { type: 'ability', unit: c.id, ability: 'dustStorm', target: '__proto__' },
    { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: '99,99' },
    { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: '-2,7' },
  ];
  for (const a of bad) expect(applyAction(s, a as Action).ok).toBe(false);
  expect(hashState(s)).toBe(before);
});
test('the Camp refuses to train onto water or onto an occupied neighbour', () => {
  const s = mongols(); give(s, 0, 'riding', 'roads'); addCity(s, 0, -3, 0); const camp = addUnit(s, 'camp', 0, 2, 0);
  setTile(s, 3, 0, { terrain: 'water' }); addUnit(s, 'warrior', 0, 2, 1);
  const before = hashState(s);
  expect(applyAction(s, { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: '3,0' }).ok).toBe(false);
  expect(applyAction(s, { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: '2,1' }).ok).toBe(false);
  expect(applyAction(s, { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: '1,0' }).ok).toBe(true);   // control
  expect(hashState(s)).toBe(before);
});
// rules 13 (rules 6): Mongol riding by territory. Friendly land: relay riders and the half-point bonus; neutral land:
// the bonus, normal costs; a move that starts in enemy land: no bonus, normal costs, as for anyone.
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
