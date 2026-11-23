import { describe, expect, test } from 'vitest';
import { applyAction } from './apply';
import { CONFIG } from './data/config';
import { bracedAgainst, coverAt, damageFor, defenceOf, guardOf, isBraced, momentumPrice } from './combat';
import { UNITS } from './data/units';
import { unitById } from './state';
import { addUnit, blankMatch, must, setTile } from './testkit';
import type { MatchState, Unit, UnitTypeId } from './types';

// rules 7, phalanx brace: a Hoplite with at least CONFIG.brace.mates friendly Hoplites beside it has CONFIG.brace.def
// more defence against a chain attacker, and a chain kill of it costs CONFIG.momentum.bracedPrice momentum.
const brace = CONFIG.brace;

// Player 0's attacker at 0,0; player 1's Hoplite at 1,0. Mates go on 2,0 and 2,-1: next to the Hoplite, out of the
// attacker's reach.
function line(attacker: UnitTypeId, mates: number, patch: Partial<Unit> = {}): { s: MatchState; a: Unit; h: Unit } {
  const s = blankMatch({ factions: ['mongols', 'spartans'] });
  const a = addUnit(s, attacker, 0, 0, 0);
  const h = addUnit(s, 'hoplite', 1, 1, 0, patch);
  const spots: Array<[number, number]> = [[2, 0], [2, -1]];
  for (let i = 0; i < mates; i += 1) addUnit(s, 'hoplite', 1, spots[i]![0], spots[i]![1]);
  return { s, a, h };
}
const attack = (s: MatchState, a: Unit, target = '1,0') => applyAction(s, { type: 'attack', unit: a.id, target });
const dealt = (r: ReturnType<typeof applyAction>): number =>
  r.ok ? (r.events.find((e) => e.type === 'attacked') as { damage: number }).damage : -1;
const countered = (r: ReturnType<typeof applyAction>): number =>
  r.ok ? (r.events.find((e) => e.type === 'attacked') as { counter: number }).counter : -1;

describe('phalanx brace: who is braced', () => {
  test('the numbers', () => {
    expect(brace).toEqual({ mates: 2, def: 2 });
  });
  test('two Hoplite mates brace it; one does not', () => {
    const two = line('knight', 2);
    expect(isBraced(two.s, two.h)).toBe(true);
    expect(bracedAgainst(two.s, two.h, two.a)).toBe(true);
    const one = line('knight', 1);
    expect(isBraced(one.s, one.h)).toBe(false);
    expect(bracedAgainst(one.s, one.h, one.a)).toBe(false);
  });
  test('enemy Hoplites and other friendly units beside it do not count', () => {
    const { s, h } = line('knight', 1);
    addUnit(s, 'spearman', 1, 1, -1);                  // a friendly non-phalanx neighbour
    addUnit(s, 'hoplite', 0, 0, 1);                    // an enemy Hoplite beside it
    expect(isBraced(s, h)).toBe(false);
  });
  test('a non-Hoplite with two Hoplites beside it is not braced', () => {
    const s = blankMatch({ factions: ['mongols', 'spartans'] });
    const k = addUnit(s, 'knight', 0, 0, 0);
    const w = addUnit(s, 'warrior', 1, 1, 0);
    addUnit(s, 'hoplite', 1, 2, 0); addUnit(s, 'hoplite', 1, 2, -1);
    expect(isBraced(s, w)).toBe(false);
    expect(bracedAgainst(s, w, k)).toBe(false);
  });
});

describe('phalanx brace: defence', () => {
  test('+2 defence against a Knight, before cover multiplies', () => {
    const { s, a, h } = line('knight', 2);
    setTile(s, 1, 0, { terrain: 'forest' });
    expect(guardOf(s, h, a)).toBe(defenceOf(s, h) + brace.def);
    const r = attack(s, a);
    expect(dealt(r)).toBe(damageFor(6, defenceOf(s, h) + brace.def, coverAt(s, h)));
    expect(dealt(r)).toBeLessThan(damageFor(6, defenceOf(s, h), coverAt(s, h)));
  });
  test("+2 against the Khan's Guard too", () => {
    const { s, a, h } = line('khansGuard', 2);
    expect(guardOf(s, h, a)).toBe(defenceOf(s, h) + brace.def);
  });
  test('no bonus against an attacker without chain', () => {
    const { s, a, h } = line('swordsman', 2);
    expect(bracedAgainst(s, h, a)).toBe(false);
    expect(guardOf(s, h, a)).toBe(defenceOf(s, h));
    expect(dealt(attack(s, a))).toBe(damageFor(UNITS[a.type].atk, defenceOf(s, h), coverAt(s, h)));
  });
  test('it adds to the hunker bonus', () => {
    const { s, a, h } = line('knight', 2, { hunkered: true });
    expect(guardOf(s, h, a)).toBe(defenceOf(s, h) + CONFIG.hunker.def + brace.def);
  });
  test('only one mate: the plain phalanx bonus and nothing more', () => {
    const { s, a, h } = line('knight', 1);
    expect(guardOf(s, h, a)).toBe(defenceOf(s, h));
  });
  test("a braced Hoplite's own attack is unchanged, and so is the Knight's counter to it", () => {
    const s = blankMatch({ factions: ['spartans', 'mongols'] });
    const h = addUnit(s, 'hoplite', 0, 0, 0);
    addUnit(s, 'hoplite', 0, -1, 0); addUnit(s, 'hoplite', 0, -1, 1);
    const k = addUnit(s, 'knight', 1, 1, 0);
    expect(isBraced(s, h)).toBe(true);
    expect(guardOf(s, k, h)).toBe(defenceOf(s, k));
    const r = attack(s, h);
    expect(dealt(r)).toBe(damageFor(UNITS.hoplite.atk, defenceOf(s, k), coverAt(s, k)));
    const hf = (15 - dealt(r) + 15) / 30;
    expect(countered(r)).toBe(damageFor(UNITS.knight.atk * CONFIG.counterFactor * hf, defenceOf(s, h), 1));
  });
});

// The rules 7 brace chain-stop tests were replaced: momentum (rules 7) prices a braced Hoplite at
// CONFIG.momentum.bracedPrice instead (momentum.test.ts covers the price, the cut and the chain).
describe('phalanx brace: the momentum price', () => {
  test('a braced Hoplite costs the braced price, an unbraced one its own price; the kill still counts', () => {
    const two = line('knight', 2, { hp: 1 });
    const one = line('knight', 1, { hp: 1 });
    expect(momentumPrice(two.s, two.h, two.a)).toBe(CONFIG.momentum.bracedPrice);
    expect(momentumPrice(one.s, one.h, one.a)).toBe(CONFIG.momentum.price.hoplite);
    const r = attack(two.s, two.a); const t = must(r);
    expect(unitById(t, two.h.id)).toBeUndefined();
    expect(unitById(t, two.a.id)).toMatchObject({ hp: 15, attacks: 1, momentum: CONFIG.momentum.start.knight! - CONFIG.momentum.bracedPrice, pos: '1,0' });
    expect(unitById(t, two.a.id)!.deeds.fight).toBe(CONFIG.heroes.fightPerAttack + CONFIG.heroes.fightPerKill);
  });
  test("the Khan's Guard pays the braced price too", () => {
    const { s, a } = line('khansGuard', 2, { hp: 1 });
    expect(unitById(must(attack(s, a)), a.id)).toMatchObject({ hp: 20, attacks: 1, momentum: CONFIG.momentum.start.khansGuard! - CONFIG.momentum.bracedPrice });
  });
});
