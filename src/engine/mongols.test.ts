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

test('mounted Mongols move one farther, and forest stops them', () => {
  const s = mongols(); const h = addUnit(s, 'horseman', 0, 0, 0, { mp: 6 });
  expect(maxMp(s, h)).toBe(6);
  setTile(s, 1, 0, { terrain: 'forest' });
  const r = reachable(s, h.id);
  expect(r['-3,0']).toBe(0);
  expect(r['1,0']).toBe(0);
  const w = addUnit(s, 'warrior', 0, 0, 2); expect(maxMp(s, w)).toBe(2);
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
test('inspire: a horseman beside the Khan\'s Guard deals 6 to a warrior', () => {
  const s = mongols(); const h = addUnit(s, 'horseman', 0, 0, 0); addUnit(s, 'khansGuard', 0, -1, 0); const d = addUnit(s, 'warrior', 1, 1, 0);
  expect(unitById(must(applyAction(s, { type: 'attack', unit: h.id, target: '1,0' })), d.id)!.hp).toBe(4);
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
test('scouting riders: a mounted Mongol unit keeps its movement after a step into the fog', () => {
  const s = mongols(); const h = addUnit(s, 'horseman', 0, 0, 0, { mp: 4 });
  s.players[0]!.explored = ['0,0'];
  const r = reachable(s, h.id);
  expect(r).toEqual({ '-1,0': 2, '-1,1': 2, '0,-1': 2, '0,1': 2, '1,-1': 2, '1,0': 2 });
  const t = must(applyAction(s, { type: 'move', unit: h.id, to: '1,0' }));
  expect(unitById(t, h.id)).toMatchObject({ pos: '1,0', mp: 2, moved: true });
  const again = reachable(t, h.id);
  expect(again['2,0']).toBe(0);                                                 // explored by the first move: field costs 2
  const u = must(applyAction(t, { type: 'move', unit: h.id, to: '2,0' }));
  expect(unitById(u, h.id)).toMatchObject({ pos: '2,0', mp: 0 });
});
test('scouting riders: forest, engagement and unmounted units still stop the move', () => {
  const s = mongols(); s.players[0]!.explored = ['0,0', '0,2', '0,-2'];
  const h = addUnit(s, 'horseman', 0, 0, 0, { mp: 6 }); setTile(s, 1, 0, { terrain: 'forest' });
  addUnit(s, 'warrior', 1, -2, 2);
  const r = reachable(s, h.id);
  expect(r['1,0']).toBe(0);                                                     // forest in the fog: the rest of the move is gone
  expect(r['-1,1']).toBe(0);                                                    // beside the enemy
  expect(r['0,-1']).toBe(4);
  const w = addUnit(s, 'warrior', 0, 0, 2, { mp: 2 });                          // a Mongol foot unit
  expect(reachable(s, w.id)['1,2']).toBe(0);
  const a = addUnit(s, 'horseArcher', 0, 0, -2, { mp: 6 });
  expect(reachable(s, a.id)['1,-2']).toBe(4);
});
