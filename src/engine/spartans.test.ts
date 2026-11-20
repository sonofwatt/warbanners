import { expect, test } from 'vitest';
import { isSteadied, abilityTargets } from './abilities';
import { applyAction } from './apply';
import { attackTargets, damageFor, defenceOf } from './combat';
import { hashState } from './hash';
import { unitById } from './state';
import { addCity, addUnit, blankMatch, must } from './testkit';
import type { Action } from './types';

test('phalanx: each hoplite beside it adds 1 defence, up to 2', () => {
  const s = blankMatch(); const h = addUnit(s, 'hoplite', 0, 0, 0);
  expect(defenceOf(s, h)).toBe(5);
  addUnit(s, 'hoplite', 0, 1, 0); addUnit(s, 'hoplite', 0, -1, 0); addUnit(s, 'hoplite', 0, 0, 1); addUnit(s, 'warrior', 0, 0, -1);
  expect(defenceOf(s, h)).toBe(7);
});
test('phalanx ignores enemy hoplites and non-phalanx neighbours', () => {
  const s = blankMatch(); const h = addUnit(s, 'hoplite', 0, 0, 0);
  addUnit(s, 'hoplite', 1, 1, 0); addUnit(s, 'warrior', 0, -1, 0);
  expect(defenceOf(s, h)).toBe(5);
});
test('our men are our walls: a hoplite line in a Spartan city takes 2 from a warrior', () => {
  const s = blankMatch({ factions: ['mongols', 'spartans'] }); addCity(s, 1, 1, 0);
  const h = addUnit(s, 'hoplite', 1, 1, 0); addUnit(s, 'hoplite', 1, 2, 0); addUnit(s, 'hoplite', 1, 1, 1);
  const a = addUnit(s, 'warrior', 0, 0, 0);
  expect(unitById(must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' })), h.id)!.hp).toBe(13);
});
test('a lone warrior in a Spartan city takes 4', () => {
  const s = blankMatch({ factions: ['mongols', 'spartans'] }); addCity(s, 1, 1, 0); const d = addUnit(s, 'warrior', 1, 1, 0);
  const a = addUnit(s, 'warrior', 0, 0, 0);
  expect(unitById(must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' })), d.id)!.hp).toBe(6);
});
test('unbowed: the King\'s Guard at 5 health still deals 7 to a Defender', () => {
  const s = blankMatch(); const g = addUnit(s, 'kingsGuard', 0, 0, 0, { hp: 5 }); const d = addUnit(s, 'defender', 1, 1, 0);
  expect(unitById(must(applyAction(s, { type: 'attack', unit: g.id, target: '1,0' })), d.id)!.hp).toBe(14);   // 20 - 6; 3 if it were not unbowed
});
test('unbowed: its counter-attack is not reduced by lost health', () => {
  const s = blankMatch(); const a = addUnit(s, 'warrior', 0, 0, 0); addUnit(s, 'kingsGuard', 1, 1, 0, { hp: 12 });
  const r = applyAction(s, { type: 'attack', unit: a.id, target: '1,0' });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  const att = r.events.find((e) => e.type === 'attacked')!;
  expect(att.type === 'attacked' && att.counter).toBe(damageFor(6 * 0.75, 3, 1));
});
test('piper heals a neighbour by 4, not past full, and it costs the piper its turn', () => {
  const s = blankMatch(); const p = addUnit(s, 'piper', 0, 0, 0); const w = addUnit(s, 'warrior', 0, 1, 0, { hp: 3 });
  const t = must(applyAction(s, { type: 'ability', unit: p.id, ability: 'heal', target: '1,0' }));
  expect(unitById(t, w.id)!.hp).toBe(7); expect(unitById(t, p.id)).toMatchObject({ attacks: 0, mp: 0, acted: true });
  expect(applyAction(t, { type: 'ability', unit: p.id, ability: 'heal', target: '1,0' }).ok).toBe(false);
  expect(applyAction(s, { type: 'ability', unit: p.id, ability: 'heal', target: '3,0' }).ok).toBe(false);
  expect(applyAction(s, { type: 'ability', unit: p.id, ability: 'hasten', target: '1,0' }).ok).toBe(false);
});
test('heal is capped at full health', () => {
  const s = blankMatch(); const p = addUnit(s, 'piper', 0, 0, 0); const w = addUnit(s, 'warrior', 0, 1, 0, { hp: 8 });
  const t = must(applyAction(s, { type: 'ability', unit: p.id, ability: 'heal', target: '1,0' }));
  expect(unitById(t, w.id)!.hp).toBe(10);
});
test('heal is refused on a full-health neighbour', () => {
  const s = blankMatch(); const p = addUnit(s, 'piper', 0, 0, 0); addUnit(s, 'warrior', 0, 1, 0);
  expect(abilityTargets(s, p.id, 'heal')).toEqual([]);
  expect(applyAction(s, { type: 'ability', unit: p.id, ability: 'heal', target: '1,0' }).ok).toBe(false);
});
test('a taunted unit in reach of a hoplite may attack only hoplites', () => {
  const s = blankMatch(); const p = addUnit(s, 'piper', 0, 0, 0);
  addUnit(s, 'hoplite', 0, 1, 0); addUnit(s, 'warrior', 0, 1, 1); const e = addUnit(s, 'warrior', 1, 2, 0);
  const t = must(applyAction(s, { type: 'ability', unit: p.id, ability: 'taunt', target: '2,0' }));
  expect(unitById(t, e.id)!.taunted).toBe(true);
  const theirTurn = must(applyAction(t, { type: 'endTurn' }));
  expect(attackTargets(theirTurn, e.id)).toEqual(['1,0']);
  const after = must(applyAction(theirTurn, { type: 'endTurn' }));
  expect(unitById(after, e.id)!.taunted).toBe(false);
});
test('a taunted unit with no hoplite in reach attacks normally', () => {
  const s = blankMatch(); const p = addUnit(s, 'piper', 0, 0, 0);
  addUnit(s, 'warrior', 0, 1, 1); const e = addUnit(s, 'warrior', 1, 2, 0);
  const t = must(applyAction(s, { type: 'ability', unit: p.id, ability: 'taunt', target: '2,0' }));
  const theirTurn = must(applyAction(t, { type: 'endTurn' }));
  expect(attackTargets(theirTurn, e.id)).toEqual(['1,1']);
});
test('taunt is refused at distance 3 and on a unit the player cannot see', () => {
  const s = blankMatch(); const p = addUnit(s, 'piper', 0, 0, 0); addUnit(s, 'warrior', 1, 3, 0);
  expect(applyAction(s, { type: 'ability', unit: p.id, ability: 'taunt', target: '3,0' }).ok).toBe(false);
  const h = blankMatch(); const q = addUnit(h, 'piper', 0, 0, 0); addUnit(h, 'scout', 1, 2, 0);
  expect(abilityTargets(h, q.id, 'taunt')).toEqual([]);
  expect(applyAction(h, { type: 'ability', unit: q.id, ability: 'taunt', target: '2,0' }).ok).toBe(false);
});
test('abilities need the trait and an attack left', () => {
  const s = blankMatch(); const w = addUnit(s, 'warrior', 0, 0, 0); addUnit(s, 'warrior', 0, 1, 0, { hp: 3 });
  expect(abilityTargets(s, w.id, 'heal')).toEqual([]);
  const p = addUnit(s, 'piper', 0, -1, 0, { attacks: 0 });
  expect(abilityTargets(s, p.id, 'heal')).toEqual([]);
});
test('hasten and dustStorm have no targets yet', () => {
  const s = blankMatch(); const p = addUnit(s, 'piper', 0, 0, 0); addUnit(s, 'warrior', 0, 1, 0);
  expect(abilityTargets(s, p.id, 'hasten')).toEqual([]);
  expect(abilityTargets(s, p.id, 'dustStorm')).toEqual([]);
});
test('isSteadied', () => {
  const s = blankMatch(); addUnit(s, 'piper', 0, 0, 0); const near = addUnit(s, 'warrior', 0, 1, 0); const far = addUnit(s, 'warrior', 0, 3, 0);
  expect([isSteadied(s, near), isSteadied(s, far)]).toEqual([true, false]);
});
test('hostile ability input is refused and changes nothing', () => {
  const s = blankMatch(); const p = addUnit(s, 'piper', 0, 0, 0); addUnit(s, 'warrior', 0, 1, 0, { hp: 3 });
  const before = hashState(s);
  const bad = [
    { type: 'ability', unit: p.id, ability: 'constructor', target: '1,0' },
    { type: 'ability', unit: p.id, ability: '__proto__', target: '1,0' },
    { type: 'ability', unit: p.id, ability: 'heal', target: 'constructor' },
    { type: 'ability', unit: p.id, ability: 'heal', target: '__proto__' },
    { type: 'ability', unit: 'x', ability: 'heal', target: '1,0' },
    { type: 'ability', unit: 99, ability: 'heal', target: '1,0' },
  ] as unknown as Action[];
  for (const a of bad) expect(applyAction(s, a).ok).toBe(false);
  expect(hashState(s)).toBe(before);
});
