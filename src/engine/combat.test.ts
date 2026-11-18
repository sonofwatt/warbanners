import { expect, test } from 'vitest';
import { applyAction } from './apply';
import { attackTargets } from './combat';
import { hashState } from './hash';
import { unitAt, unitById } from './state';
import { addCity, addUnit, blankMatch, must, setTile } from './testkit';
import type { Tile, Unit, UnitTypeId } from './types';

const duel = (atk: UnitTypeId, def: UnitTypeId, patchA?: Partial<Unit>, tile?: Partial<Tile>) => {
  const s = blankMatch(); const a = addUnit(s, atk, 0, 0, 0, patchA); const d = addUnit(s, def, 1, 1, 0);
  if (tile) setTile(s, 1, 0, tile);
  const t = must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' }));
  return { a: unitById(t, a.id), d: unitById(t, d.id), t };
};
test('warrior on warrior: 5 dealt, 2 back', () => {
  const { a, d } = duel('warrior', 'warrior');
  expect(d!.hp).toBe(5); expect(a!.hp).toBe(8);
  expect(a).toMatchObject({ attacks: 0, mp: 0, acted: true });
});
test('cover', () => {
  expect(duel('warrior', 'warrior', undefined, { terrain: 'forest' }).d!.hp).toBe(6);
  expect(duel('warrior', 'defender').d!.hp).toBe(12);
  expect(duel('warrior', 'defender').a!.hp).toBe(9);
});
test('steadfast counter hurts: spearman deals 5 back', () => {
  const { a, d } = duel('warrior', 'spearman');
  expect(d!.hp).toBe(6); expect(a!.hp).toBe(5);
});
test('a wounded attacker hits softer', () => {
  expect(duel('warrior', 'warrior', { hp: 5 }).d!.hp).toBe(7);
});
test('a city protects its owner', () => {
  const s = blankMatch(); const a = addUnit(s, 'warrior', 0, 0, 0); addCity(s, 1, 1, 0); const d = addUnit(s, 'warrior', 1, 1, 0);
  s.players[1]!.faction = 'mongols';
  expect(unitById(must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' })), d.id)!.hp).toBe(6);
});
test('archer at range takes no counter and cannot shoot three tiles', () => {
  const s = blankMatch(); const a = addUnit(s, 'archer', 0, 0, 0); const d = addUnit(s, 'warrior', 1, 2, 0);
  const t = must(applyAction(s, { type: 'attack', unit: a.id, target: '2,0' }));
  expect(unitById(t, d.id)!.hp).toBe(5); expect(unitById(t, a.id)!.hp).toBe(10);
  d.pos = '3,0';
  expect(applyAction(s, { type: 'attack', unit: a.id, target: '3,0' }).ok).toBe(false);
});
test('knight kills, chains, and may strike again', () => {
  const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0);
  const w1 = addUnit(s, 'warrior', 1, 1, 0, { hp: 8 }); addUnit(s, 'warrior', 1, 0, 1);
  const r = applyAction(s, { type: 'attack', unit: k.id, target: '1,0' }); const t = must(r);
  expect(unitById(t, w1.id)).toBeUndefined();
  expect(r.ok && r.events).toContainEqual({ type: 'died', unit: w1.id });
  expect(unitById(t, k.id)!.attacks).toBe(1);
  expect(must(applyAction(t, { type: 'attack', unit: k.id, target: '0,1' })).units.length).toBe(2);
});
test('swordsman strikes twice, and the second strike needs a living target', () => {
  const s = blankMatch(); const sw = addUnit(s, 'swordsman', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0);
  const t1 = must(applyAction(s, { type: 'attack', unit: sw.id, target: '1,0' }));   // 6 damage, warrior at 4
  const t2 = must(applyAction(t1, { type: 'attack', unit: sw.id, target: '1,0' }));  // kills
  expect(unitAt(t2, '1,0')).toBeUndefined();
  expect(applyAction(t2, { type: 'attack', unit: sw.id, target: '1,0' }).ok).toBe(false);
});
test('catapult: splash, no counter, no shot after moving', () => {
  const s = blankMatch(); const c = addUnit(s, 'catapult', 0, 0, 0);
  const d = addUnit(s, 'warrior', 1, 3, 0); const n = addUnit(s, 'warrior', 1, 3, -1); const mine = addUnit(s, 'warrior', 0, 2, 0);
  const t = must(applyAction(s, { type: 'attack', unit: c.id, target: '3,0' }));
  expect(unitById(t, d.id)!.hp).toBe(2); expect(unitById(t, n.id)!.hp).toBe(6);
  expect(unitById(t, mine.id)!.hp).toBe(10); expect(unitById(t, c.id)!.hp).toBe(10);
  const moved = must(applyAction(s, { type: 'move', unit: c.id, to: '0,1' }));
  expect(attackTargets(moved, c.id)).toEqual([]);
});
test('an attacker killed by the counter is removed cleanly', () => {
  const s = blankMatch(); const a = addUnit(s, 'warrior', 0, 0, 0, { hp: 1 }); addUnit(s, 'spearman', 1, 1, 0);
  const t = must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' }));
  expect(unitById(t, a.id)).toBeUndefined();
  expect(t.units).toHaveLength(1);
});
test('you cannot attack what you cannot see, your own units, or out of turn', () => {
  const s = blankMatch(); const a = addUnit(s, 'archer', 0, 0, 0);
  addUnit(s, 'scout', 1, 2, 0); addUnit(s, 'warrior', 0, -1, 0); const e = addUnit(s, 'warrior', 1, 0, 3);
  expect(applyAction(s, { type: 'attack', unit: a.id, target: '2,0' }).ok).toBe(false);   // hidden at distance 2
  expect(applyAction(s, { type: 'attack', unit: a.id, target: '-1,0' }).ok).toBe(false);  // own unit
  expect(applyAction(s, { type: 'attack', unit: e.id, target: '0,2' }).ok).toBe(false);
});
test('hostile input is refused and changes nothing', () => {
  const s = blankMatch(); const a = addUnit(s, 'warrior', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0);
  const before = hashState(s);
  for (const target of ['constructor', '__proto__', 'toString']) {
    expect(applyAction(s, { type: 'attack', unit: a.id, target }).ok).toBe(false);
  }
  expect(applyAction(s, { type: 'attack', unit: 'constructor' as unknown as number, target: '1,0' }).ok).toBe(false);
  expect(applyAction(s, { type: 'attack', unit: a.id, target: 5 as unknown as string }).ok).toBe(false);
  expect(hashState(s)).toBe(before);
});
test('splash can kill a neighbour, which is reported, with no counter from it', () => {
  const s = blankMatch(); const c = addUnit(s, 'catapult', 0, 0, 0);
  const d = addUnit(s, 'warrior', 1, 3, 0); const n = addUnit(s, 'spearman', 1, 3, -1, { hp: 3 });
  addUnit(s, 'warrior', 0, 2, 0);                       // the catapult sees the target through this unit
  const r = applyAction(s, { type: 'attack', unit: c.id, target: '3,0' }); const t = must(r);
  expect(unitById(t, n.id)).toBeUndefined();
  expect(r.ok && r.events).toContainEqual({ type: 'died', unit: n.id });
  expect(r.ok && r.events).toContainEqual({ type: 'attacked', unit: c.id, target: d.id, damage: 8, counter: 0 });
  expect(unitById(t, c.id)!.hp).toBe(10);
});
test('a blinded attacker reaches only distance 1', () => {
  const s = blankMatch(); const a = addUnit(s, 'archer', 0, 0, 0, { blinded: true });
  addUnit(s, 'warrior', 0, 1, 1); addUnit(s, 'warrior', 1, 2, 0); addUnit(s, 'warrior', 1, 1, 0);
  expect(attackTargets(s, a.id)).toEqual(['1,0']);
  expect(applyAction(s, { type: 'attack', unit: a.id, target: '2,0' }).ok).toBe(false);
});
test('a camp (atk 0) does not counter', () => {
  const s = blankMatch(); const a = addUnit(s, 'warrior', 0, 0, 0); const c = addUnit(s, 'camp', 1, 1, 0);
  const t = must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' }));
  expect(unitById(t, a.id)!.hp).toBe(10);
  expect(unitById(t, c.id)!.hp).toBeLessThan(15);
});
test('a unit with no attacks left is refused', () => {
  const s = blankMatch(); const a = addUnit(s, 'warrior', 0, 0, 0, { attacks: 0 }); addUnit(s, 'warrior', 1, 1, 0);
  expect(attackTargets(s, a.id)).toEqual([]);
  expect(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' }).ok).toBe(false);
});
test('walls raise a Mongol city cover: a Mongol warrior takes 3 from a full Warrior', () => {
  const s = blankMatch(); const a = addUnit(s, 'warrior', 0, 0, 0);
  s.players[1]!.faction = 'mongols';
  const c = addCity(s, 1, 1, 0); const d = addUnit(s, 'warrior', 1, 1, 0);
  expect(unitById(must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' })), d.id)!.hp).toBe(6);
  c.walls = true;
  expect(unitById(must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' })), d.id)!.hp).toBe(7);
});
