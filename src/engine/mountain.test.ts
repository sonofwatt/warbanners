import { describe, expect, test } from 'vitest';
import { applyAction, legalActions } from './apply';
import { CONFIG } from './data/config';
import { UNITS } from './data/units';
import { attackOf, attackReach, attackTargets, coverAt, damageFor, guardOf, longShot, strikeDamage } from './combat';
import { reachable } from './movement';
import { unitById } from './state';
import { addCity, addUnit, blankMatch, must, setTile } from './testkit';
import type { MatchState, UnitTypeId } from './types';

const end = { type: 'endTurn' } as const;
const move = (unit: number, to: string) => ({ type: 'move', unit, to }) as const;
const attack = (unit: number, target: string) => ({ type: 'attack', unit, target }) as const;

// A plain field map with player 0's city far away at 0,4 and player 1's at 0,-4, so nothing here stands in a city.
function field(): MatchState {
  const s = blankMatch(); addCity(s, 0, 0, 4); addCity(s, 1, 0, -4);
  return s;
}

describe('rules 8: ranged units reach farther from a mountain', () => {
  test.each<[UnitTypeId, number]>([['archer', 3], ['horseArcher', 3], ['catapult', 4]])('%s on a mountain reaches %i', (type, reach) => {
    const s = field();
    setTile(s, 0, 0, { terrain: 'mountain' });
    const u = addUnit(s, type, 0, 0, 0);
    expect(attackReach(s, u)).toBe(reach);
    addUnit(s, 'warrior', 1, reach, 0);
    addUnit(s, 'warrior', 1, -(reach + 1), 0);
    addUnit(s, 'scout', 0, reach - 1, 1);                 // keeps the far target in view
    expect(attackTargets(s, u.id)).toEqual([`${reach},0`]);
  });
  test.each<UnitTypeId>(['archer', 'horseArcher', 'catapult'])('%s off a mountain keeps its normal reach', (type) => {
    for (const terrain of ['field', 'forest'] as const) {
      const s = field();
      setTile(s, 0, 0, { terrain });
      const u = addUnit(s, type, 0, 0, 0);
      expect(attackReach(s, u)).toBe(UNITS[type].range);
      addUnit(s, 'warrior', 1, UNITS[type].range + 1, 0);
      expect(attackTargets(s, u.id)).toEqual([]);
    }
  });
  test('a melee unit on a mountain gets no extra reach', () => {
    const s = field();
    setTile(s, 0, 0, { terrain: 'mountain' });
    const u = addUnit(s, 'warrior', 0, 0, 0);
    addUnit(s, 'warrior', 1, 2, 0);
    expect(attackReach(s, u)).toBe(1);
    expect(attackTargets(s, u.id)).toEqual([]);
  });
  test('a blinded ranged unit on a mountain keeps its blinded reach', () => {
    const s = field();
    setTile(s, 0, 0, { terrain: 'mountain' });
    const u = addUnit(s, 'archer', 0, 0, 0, { blinded: true });
    addUnit(s, 'warrior', 1, 2, 0);
    expect(attackReach(s, u)).toBe(CONFIG.blindedReach);
    expect(attackTargets(s, u.id)).toEqual([]);
  });
  test('a Catapult that climbed this turn still cannot shoot', () => {
    const s = field();
    setTile(s, 1, 0, { terrain: 'mountain' });
    const c = addUnit(s, 'catapult', 0, 0, 0);
    addUnit(s, 'warrior', 1, 4, 0);
    const t = must(applyAction(s, move(c.id, '1,0')));
    expect(attackTargets(t, c.id)).toEqual([]);
  });
});

describe('rules 8: the long shot', () => {
  test('a shot on the extra tile does longShotScale of the damage, rounded, and the forecast agrees', () => {
    const s = field();
    setTile(s, 0, 0, { terrain: 'mountain' });
    const a = addUnit(s, 'archer', 0, 0, 0);
    const far = addUnit(s, 'warrior', 1, 3, 0);
    expect(longShot(s, a, far)).toBe(true);
    const effAtk = attackOf(s, a);
    const full = damageFor(effAtk, guardOf(s, far, a), coverAt(s, far));
    const cut = Math.max(1, Math.round(full * CONFIG.mountain.longShotScale));
    expect(cut).toBeLessThan(full);
    expect(strikeDamage(s, far, a, effAtk)).toBe(cut);
    const r = applyAction(s, attack(a.id, '3,0'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events[0]).toMatchObject({ type: 'attacked', damage: cut, counter: 0 });
  });
  test('a shot within the normal reach from a mountain does full damage', () => {
    const s = field();
    setTile(s, 0, 0, { terrain: 'mountain' });
    const a = addUnit(s, 'archer', 0, 0, 0);
    const near = addUnit(s, 'warrior', 1, 2, 0);
    expect(longShot(s, a, near)).toBe(false);
    const effAtk = attackOf(s, a);
    expect(strikeDamage(s, near, a, effAtk)).toBe(damageFor(effAtk, guardOf(s, near, a), coverAt(s, near)));
  });
  test('the cut never takes a hit below 1', () => {
    const s = field();
    setTile(s, 0, 0, { terrain: 'mountain' });
    const a = addUnit(s, 'archer', 0, 0, 0);
    const wall = addUnit(s, 'defender', 1, 3, 0);
    expect(strikeDamage(s, wall, a, 0.01)).toBe(1);
  });
  test('the counter keeps the normal reach and full damage', () => {
    // An enemy Archer on a mountain three tiles off cannot counter; two tiles off it counters in full, not cut.
    const s = field();
    setTile(s, 0, 0, { terrain: 'mountain' });
    setTile(s, 3, 0, { terrain: 'mountain' });
    const mine = addUnit(s, 'archer', 0, 0, 0);
    addUnit(s, 'archer', 1, 3, 0);
    const r = must(applyAction(s, attack(mine.id, '3,0')));
    expect(unitById(r, mine.id)!.hp).toBe(UNITS.archer.hp);
    const s2 = field();
    setTile(s2, 2, 0, { terrain: 'mountain' });
    const a2 = addUnit(s2, 'archer', 0, 0, 0);
    addUnit(s2, 'archer', 1, 2, 0);
    const r2 = applyAction(s2, attack(a2.id, '2,0'));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const ev = r2.events[0] as { counter: number; damage: number };
    const hpAfter = UNITS.archer.hp - ev.damage;
    const cAtk = UNITS.archer.atk * CONFIG.counterFactor * ((hpAfter + UNITS.archer.hp) / (2 * UNITS.archer.hp));
    expect(ev.counter).toBe(damageFor(cAtk, UNITS.archer.def, 1));
  });
});

describe('rules 8: climbing ends the turn', () => {
  test('a step onto a mountain ends the turn: no attack, ability, hunker, capture or item after', () => {
    const s = field();
    setTile(s, 1, 0, { terrain: 'mountain' });
    const a = addUnit(s, 'archer', 0, 0, 0);
    addUnit(s, 'warrior', 1, 3, 0);
    const t = must(applyAction(s, move(a.id, '1,0')));
    expect(unitById(t, a.id)).toMatchObject({ pos: '1,0', mp: 0, attacks: 0, moved: true, acted: true, turnEnded: true });
    expect(legalActions(t).filter((x) => 'unit' in x && x.unit === a.id)).toEqual([]);
    expect(attackTargets(t, a.id)).toEqual([]);
  });
  test('a Piper that climbs cannot heal after', () => {
    const s = field();
    setTile(s, 1, 0, { terrain: 'mountain' });
    const p = addUnit(s, 'piper', 0, 0, 0);
    addUnit(s, 'warrior', 0, 2, 0, { hp: 3 });
    const t = must(applyAction(s, move(p.id, '1,0')));
    expect(legalActions(t).filter((x) => 'unit' in x && x.unit === p.id)).toEqual([]);
  });
  test('a unit on a mountain may step off only as a first step, and that ends its turn', () => {
    const s = field();
    setTile(s, 0, 0, { terrain: 'mountain' });
    const h = addUnit(s, 'horseman', 0, 0, 0);
    const opts = reachable(s, h.id);
    expect(Object.keys(opts).sort()).toEqual(['-1,0', '-1,1', '0,-1', '0,1', '1,-1', '1,0']);
    expect(Object.values(opts).every((v) => v === 0)).toBe(true);
    const t = must(applyAction(s, move(h.id, '1,0')));
    expect(unitById(t, h.id)).toMatchObject({ pos: '1,0', mp: 0, attacks: 0, acted: true, turnEnded: true });
    expect(reachable(t, h.id)).toEqual({});
    addUnit(t, 'warrior', 1, 2, 0);
    expect(attackTargets(t, h.id)).toEqual([]);
  });
  test('a unit that already moved cannot step onto or off a mountain', () => {
    const s = field();
    setTile(s, 0, 0, { terrain: 'mountain' });
    setTile(s, 2, 1, { terrain: 'mountain' });
    const on = addUnit(s, 'horseman', 0, 0, 0, { moved: true });
    expect(reachable(s, on.id)).toEqual({});
    const off = addUnit(s, 'horseman', 0, 1, 1);
    const t = must(applyAction(s, move(off.id, '1,2')));
    expect(Object.keys(reachable(t, off.id))).not.toContain('2,1');
    // a Knight with 6 half-points never passes over a mountain
    const s2 = field();
    setTile(s2, 1, 0, { terrain: 'mountain' });
    const k = addUnit(s2, 'knight', 0, 0, 0);
    const kr = reachable(s2, k.id);
    expect(kr['1,0']).toBe(0);
  });
  test('a hastened rider that stepped off a mountain still cannot move again', () => {
    const s = field();
    setTile(s, 0, 0, { terrain: 'mountain' });
    const ha = addUnit(s, 'horseArcher', 0, 0, 0);
    addUnit(s, 'skyCaller', 0, 2, 0);
    addUnit(s, 'horseman', 0, 3, -1);
    const t = must(applyAction(s, move(ha.id, '1,0')));
    expect(legalActions(t).some((x) => x.type === 'ability' && x.ability === 'hasten' && x.target === '3,-1')).toBe(true);
    expect(legalActions(t).some((x) => x.type === 'ability' && x.ability === 'hasten' && x.target === '1,0')).toBe(false);
    // even if extra movement were granted, the turn is over
    unitById(t, ha.id)!.mp = CONFIG.hastenMp;
    expect(reachable(t, ha.id)).toEqual({});
  });
  test('a rider that attacked from a mountain may still step off when its rules allow moving after an attack', () => {
    const s = field();
    setTile(s, 0, 0, { terrain: 'mountain' });
    const ha = addUnit(s, 'horseArcher', 0, 0, 0);
    addUnit(s, 'warrior', 1, 3, 0, { hp: 10 });
    const t = must(applyAction(s, attack(ha.id, '3,0')));
    const opts = reachable(t, ha.id);
    expect(opts['-1,0']).toBe(0);
    const t2 = must(applyAction(t, move(ha.id, '-1,0')));
    expect(unitById(t2, ha.id)).toMatchObject({ mp: 0, turnEnded: true });
  });
  test('the turn end wears off when the owner\'s next turn starts', () => {
    const s = field();
    setTile(s, 1, 0, { terrain: 'mountain' });
    const a = addUnit(s, 'archer', 0, 0, 0);
    const t = must(applyAction(must(applyAction(must(applyAction(s, move(a.id, '1,0'))), end)), end));
    expect(unitById(t, a.id)).toMatchObject({ turnEnded: false, attacks: 1, moved: false, acted: false });
    expect(Object.keys(reachable(t, a.id)).length).toBeGreaterThan(0);
  });
  test('a move that touches no mountain is unchanged', () => {
    const s = field();
    const w = addUnit(s, 'horseman', 0, 0, 0);
    const t = must(applyAction(s, move(w.id, '1,0')));
    expect(unitById(t, w.id)).toMatchObject({ mp: 2, attacks: 1, acted: false, turnEnded: false });
  });
});
