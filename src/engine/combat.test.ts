import { expect, test } from 'vitest';
import { applyAction } from './apply';
import { attackTargets } from './combat';
import { CONFIG } from './data/config';
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
test('warrior on warrior: 6 dealt, 2 back', () => {
  const { a, d } = duel('warrior', 'warrior');
  expect(d!.hp).toBe(4); expect(a!.hp).toBe(8);
  expect(a).toMatchObject({ attacks: 0, mp: 0, acted: true });
});
test('cover', () => {
  expect(duel('warrior', 'warrior', undefined, { terrain: 'forest' }).d!.hp).toBe(5);
  expect(duel('warrior', 'defender').d!.hp).toBe(17);
  expect(duel('warrior', 'defender').a!.hp).toBe(9);
});
test('steadfast counter hurts: spearman deals 5 back', () => {
  const { a, d } = duel('warrior', 'spearman');
  expect(d!.hp).toBe(5); expect(a!.hp).toBe(5);
});
test('a wounded attacker hits softer', () => {
  expect(duel('warrior', 'warrior', { hp: 5 }).d!.hp).toBe(6);
});
test('a city protects its owner', () => {
  const s = blankMatch(); const a = addUnit(s, 'warrior', 0, 0, 0); addCity(s, 1, 1, 0); const d = addUnit(s, 'warrior', 1, 1, 0);
  s.players[1]!.faction = 'mongols';
  expect(unitById(must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' })), d.id)!.hp).toBe(5);
});
test('archer at range takes no counter and cannot shoot three tiles', () => {
  const s = blankMatch(); const a = addUnit(s, 'archer', 0, 0, 0); const d = addUnit(s, 'warrior', 1, 2, 0);
  const t = must(applyAction(s, { type: 'attack', unit: a.id, target: '2,0' }));
  expect(unitById(t, d.id)!.hp).toBe(4); expect(unitById(t, a.id)!.hp).toBe(10);
  d.pos = '3,0';
  expect(applyAction(s, { type: 'attack', unit: a.id, target: '3,0' }).ok).toBe(false);
});
test('knight kills, chains, and may strike again', () => {
  const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0);
  const w1 = addUnit(s, 'warrior', 1, 1, 0, { hp: 8 }); addUnit(s, 'warrior', 1, 0, 1, { hp: 6 });
  const r = applyAction(s, { type: 'attack', unit: k.id, target: '1,0' }); const t = must(r);
  expect(unitById(t, w1.id)).toBeUndefined();
  expect(r.ok && r.events).toContainEqual({ type: 'died', unit: w1.id });
  expect(unitById(t, k.id)!.attacks).toBe(1);
  expect(unitById(t, k.id)!.pos).toBe('1,0');                                 // it advanced into the tile
  expect(must(applyAction(t, { type: 'attack', unit: k.id, target: '0,1' })).units.length).toBe(1);   // the wounded rider still kills the second
});
test('a melee kill advances the attacker into the tile, at no movement cost', () => {
  const s = blankMatch(); const a = addUnit(s, 'warrior', 0, 0, 0); const d = addUnit(s, 'warrior', 1, 1, 0, { hp: 5 });
  const r = applyAction(s, { type: 'attack', unit: a.id, target: '1,0' }); const t = must(r);
  expect(unitById(t, d.id)).toBeUndefined();
  expect(unitById(t, a.id)).toMatchObject({ pos: '1,0', enteredTurn: s.stamp, mp: 0, attacks: 0, acted: true, hp: 10 });
  expect(r.ok && r.events).toEqual([
    { type: 'attacked', unit: a.id, target: d.id, damage: 6, counter: 0 },
    { type: 'died', unit: d.id },
    { type: 'advanced', unit: a.id, from: '0,0', to: '1,0' },
  ]);
});
test('a horseman advances and keeps the movement it had left', () => {
  const s = blankMatch(); const h = addUnit(s, 'horseman', 0, 0, 0, { mp: 3 }); addUnit(s, 'warrior', 1, 1, 0, { hp: 1 });
  const t = must(applyAction(s, { type: 'attack', unit: h.id, target: '1,0' }));
  expect(unitById(t, h.id)).toMatchObject({ pos: '1,0', mp: 3 });
});
test('a melee kill on a forest or an enemy city advances there too', () => {
  const s = blankMatch(); const a = addUnit(s, 'warrior', 0, 0, 0); addCity(s, 1, 1, 0); addCity(s, 1, 3, 0);
  addUnit(s, 'warrior', 1, 1, 0, { hp: 1 }); setTile(s, 1, 0, { terrain: 'forest' });
  expect(unitById(must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' })), a.id)!.pos).toBe('1,0');
});
test('no advance when the target lives, for a ranged attacker, or for a splash kill', () => {
  const s = blankMatch(); const a = addUnit(s, 'warrior', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0);
  expect(unitById(must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' })), a.id)!.pos).toBe('0,0');
  const r = blankMatch(); const ar = addUnit(r, 'archer', 0, 0, 0); addUnit(r, 'warrior', 1, 1, 0, { hp: 1 });
  const shot = must(applyAction(r, { type: 'attack', unit: ar.id, target: '1,0' }));     // an archer next to its target
  expect(unitAt(shot, '1,0')).toBeUndefined(); expect(unitById(shot, ar.id)!.pos).toBe('0,0');
  const c = blankMatch(); const cat = addUnit(c, 'catapult', 0, 0, 0);
  addUnit(c, 'warrior', 1, 3, 0, { hp: 1 }); const n = addUnit(c, 'warrior', 1, 3, -1, { hp: 1 }); addUnit(c, 'warrior', 0, 2, 0);
  const t = must(applyAction(c, { type: 'attack', unit: cat.id, target: '3,0' }));
  expect(unitById(t, n.id)).toBeUndefined(); expect(unitById(t, cat.id)!.pos).toBe('0,0');
});
test('swordsman strikes twice, and the second strike needs a living target', () => {
  const s = blankMatch(); const sw = addUnit(s, 'swordsman', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0);
  const t1 = must(applyAction(s, { type: 'attack', unit: sw.id, target: '1,0' }));   // 8 damage, warrior at 2
  const t2 = must(applyAction(t1, { type: 'attack', unit: sw.id, target: '1,0' }));  // kills, and steps in
  expect(unitAt(t2, '1,0')?.id).toBe(sw.id);
  expect(t2.units).toHaveLength(1);
  expect(applyAction(t2, { type: 'attack', unit: sw.id, target: '1,0' }).ok).toBe(false);
});
test('catapult: splash, no counter, no shot after moving', () => {   // 10 kills the target; its neighbour takes 5
  const s = blankMatch(); const c = addUnit(s, 'catapult', 0, 0, 0);
  const d = addUnit(s, 'warrior', 1, 3, 0); const n = addUnit(s, 'warrior', 1, 3, -1); const mine = addUnit(s, 'warrior', 0, 2, 0);
  const t = must(applyAction(s, { type: 'attack', unit: c.id, target: '3,0' }));
  expect(unitById(t, d.id)).toBeUndefined(); expect(unitById(t, n.id)!.hp).toBe(5);
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
  // the attack and its two kills earn 1 + 2 * 2 = 5 fight points, which take the catapult to the agoge threshold
  const fight = CONFIG.heroes.agogeThresholds.fight - CONFIG.heroes.fightPerAttack - 2 * CONFIG.heroes.fightPerKill;
  const s = blankMatch(); const c = addUnit(s, 'catapult', 0, 0, 0, { deeds: { fight, march: 0, survive: 0, rest: 0 } });
  const d = addUnit(s, 'warrior', 1, 3, 0); const n = addUnit(s, 'spearman', 1, 3, -1, { hp: 3 });
  addUnit(s, 'warrior', 0, 2, 0);                       // the catapult sees the target through this unit
  const r = applyAction(s, { type: 'attack', unit: c.id, target: '3,0' }); const t = must(r);
  expect(unitById(t, n.id)).toBeUndefined();
  expect(r.ok && r.events).toContainEqual({ type: 'died', unit: n.id });
  expect(r.ok && r.events).toContainEqual({ type: 'attacked', unit: c.id, target: d.id, damage: 10, counter: 0 });
  // no counter, but the kills earn the Spartan catapult Fierce, which heals its extra health at once
  expect(unitById(t, c.id)!.heroTraits).toEqual(['fierce']);
  expect(unitById(t, c.id)!.hp).toBe(10 + CONFIG.heroes.fierceHp);
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
test('walls raise a Mongol city cover: a Mongol warrior takes 4 from a full Warrior, 5 without', () => {
  const s = blankMatch(); const a = addUnit(s, 'warrior', 0, 0, 0);
  s.players[1]!.faction = 'mongols';
  const c = addCity(s, 1, 1, 0); const d = addUnit(s, 'warrior', 1, 1, 0);
  expect(unitById(must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' })), d.id)!.hp).toBe(5);
  c.walls = true;
  expect(unitById(must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' })), d.id)!.hp).toBe(6);
});

// The rules 5 chain health cost tests were replaced by momentum.test.ts (rules 7).

// rules 6: a chain unit that earns a hero trait from its own attack gets no extra attack from that kill.
test('a chain unit that earns a trait from a kill gets no extra attack, after paying the momentum', () => {
  expect(CONFIG.levelUpEndsChain).toBe(true);
  const need = CONFIG.heroes.agogeThresholds.fight - CONFIG.heroes.fightPerAttack - CONFIG.heroes.fightPerKill;
  const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0, { deeds: { fight: need, march: 0, survive: 0, rest: 0 } });
  const w = addUnit(s, 'warrior', 1, 1, 0, { hp: 1 }); addUnit(s, 'warrior', 1, 2, 0);
  const r = applyAction(s, { type: 'attack', unit: k.id, target: '1,0' }); const t = must(r);
  expect(unitById(t, k.id)).toMatchObject({ attacks: 0, acted: true, heroTraits: ['fierce'], hp: 15 + CONFIG.heroes.fierceHp, momentum: CONFIG.momentum.start.knight! - CONFIG.momentum.price.warrior });
  expect(r.ok && r.events).toEqual([
    { type: 'attacked', unit: k.id, target: w.id, damage: expect.any(Number), counter: 0 },
    { type: 'died', unit: w.id },
    { type: 'advanced', unit: k.id, from: '0,0', to: '1,0' },
    { type: 'momentum', unit: k.id, spent: CONFIG.momentum.price.warrior, left: CONFIG.momentum.start.knight! - CONFIG.momentum.price.warrior },
    { type: 'heroTrait', unit: k.id, trait: 'fierce', hero: false },
    { type: 'chainEnded', unit: k.id },
  ]);
  expect(attackTargets(t, k.id)).toEqual([]);
});
test('a chain unit that earns no trait from a kill still strikes again', () => {
  const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0);
  addUnit(s, 'warrior', 1, 1, 0, { hp: 1 }); addUnit(s, 'warrior', 1, 2, 0);
  const r = applyAction(s, { type: 'attack', unit: k.id, target: '1,0' }); const t = must(r);
  expect(unitById(t, k.id)).toMatchObject({ attacks: 1, heroTraits: [] });
  expect(r.ok && r.events.some((e) => e.type === 'chainEnded')).toBe(false);
  expect(attackTargets(t, k.id)).toEqual(['2,0']);
});
test('a unit without the chain trait that earns a trait from a kill keeps its other attacks', () => {
  const need = CONFIG.heroes.agogeThresholds.fight - CONFIG.heroes.fightPerAttack - CONFIG.heroes.fightPerKill;
  const s = blankMatch(); const h = addUnit(s, 'horseman', 0, 0, 0, { attacks: 2, deeds: { fight: need, march: 0, survive: 0, rest: 0 } });
  addUnit(s, 'warrior', 1, 1, 0, { hp: 1 });
  const r = applyAction(s, { type: 'attack', unit: h.id, target: '1,0' }); const t = must(r);
  expect(unitById(t, h.id)).toMatchObject({ attacks: 1, heroTraits: ['fierce'] });
  expect(r.ok && r.events.some((e) => e.type === 'chainEnded')).toBe(false);
});
