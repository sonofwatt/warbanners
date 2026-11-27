import { describe, expect, test } from 'vitest';
import { applyAction } from './apply';
import { attackOf, coverAt, damageFor, defenceOf, guardOf, momentumPrice, momentumShort, strikeDamage } from './combat';
import { CONFIG } from './data/config';
import { UNITS } from './data/units';
import { momentumStart, unitAt, unitById } from './state';
import { addCity, addUnit, blankMatch, give, must } from './testkit';
import type { GameEvent as Event, MatchState, Result, Unit, UnitTypeId } from './types';

// rules 7, momentum: a chain unit pays each kill's price out of its momentum; a paid kill gives one more attack, and an
// attack it cannot pay for is cut by the shortfall and ends the chain. It replaces the rules 5 chain health cost.
const M = CONFIG.momentum;
const attack = (s: MatchState, a: Unit, target: string) => applyAction(s, { type: 'attack', unit: a.id, target });
const events = (r: Result): Event[] => (r.ok ? r.events : []);
const hit = (r: Result) => events(r).find((e) => e.type === 'attacked') as { damage: number; counter: number };
// The damage an attack would do with no cut, worked out on the state before it.
const uncut = (s: MatchState, a: Unit, d: Unit): number => damageFor(attackOf(s, a), guardOf(s, d, a), coverAt(s, d));

describe('momentum: the numbers', () => {
  test('a Knight starts with 7 and a Khan\'s Guard with 8; every chain type has a start value, no other type has one', () => {
    expect(M.start).toEqual({ knight: 7, khansGuard: 8 });
    for (const [type, def] of Object.entries(UNITS) as [UnitTypeId, (typeof UNITS)[UnitTypeId]][]) {
      const chain = def.traits.includes('chain');
      expect(M.start[type] !== undefined, type).toBe(chain);
      expect(momentumStart(type), type).toBe(chain ? M.start[type] : 0);
    }
  });
  test('the draft prices, one per unit type, and 4 for a braced Hoplite', () => {
    expect(M.price).toEqual({
      scout: 0,
      warrior: 1, archer: 1, horseman: 1, spearman: 1, catapult: 1, piper: 1, skyCaller: 1,
      hoplite: 2, swordsman: 2, horseArcher: 2, knight: 2, sellsword: 2, camp: 2,
      defender: 3, kingsGuard: 3, khansGuard: 3,
      skirmisher: 1, woodlandHunter: 1, smokeKeeper: 1, trapper: 1, warChief: 3,
    });
    expect(Object.keys(M.price).sort()).toEqual(Object.keys(UNITS).sort());
    expect(M.bracedPrice).toBe(4);
  });
  test('a unit gets its start value when it appears: a Knight 7, a Warrior 0', () => {
    const s = blankMatch();
    expect(addUnit(s, 'knight', 0, 0, 0).momentum).toBe(7);
    expect(addUnit(s, 'warrior', 0, 1, 0).momentum).toBe(0);
    const g = blankMatch({ factions: ['mongols', 'spartans'] });
    expect(addUnit(g, 'khansGuard', 0, 0, 0).momentum).toBe(8);
  });
  test('a Knight trained mid-turn starts with its start value', () => {
    const s = blankMatch(); const c = addCity(s, 0, 0, 0); give(s, 0, 'chivalry'); s.players[0]!.gold = 50;
    const t = must(applyAction(s, { type: 'train', city: c.id, unitType: 'knight' }));
    expect(unitAt(t, '0,0')).toMatchObject({ type: 'knight', momentum: 7 });
  });
  test("momentum is back to the start value when its owner's turn starts, and only then", () => {
    const s = blankMatch(); addCity(s, 0, -3, 0); addCity(s, 1, 3, 0);
    const k0 = addUnit(s, 'knight', 0, -2, 0, { momentum: 1 });
    const k1 = addUnit(s, 'knight', 1, 2, 0, { momentum: 2 });
    const t1 = must(applyAction(s, { type: 'endTurn' }));
    expect([unitById(t1, k0.id)!.momentum, unitById(t1, k1.id)!.momentum]).toEqual([1, 7]);
    const t2 = must(applyAction(t1, { type: 'endTurn' }));
    expect(unitById(t2, k0.id)!.momentum).toBe(7);
  });
});

describe('momentum: the price of a target and the shortfall', () => {
  test('the price is the target type\'s; the shortfall is what the momentum left lacks, 0 for a unit without chain', () => {
    const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0, { momentum: 1 });
    const d = addUnit(s, 'defender', 1, 1, 0); const sc = addUnit(s, 'scout', 1, 0, 1);
    expect(momentumPrice(s, d, k)).toBe(3); expect(momentumPrice(s, sc, k)).toBe(0);
    expect(momentumShort(s, d, k)).toBe(2); expect(momentumShort(s, sc, k)).toBe(0);
    const w = addUnit(s, 'warrior', 0, -1, 0);
    expect(momentumShort(s, d, w)).toBe(0);
    k.momentum = 3;
    expect(momentumShort(s, d, k)).toBe(0);
  });
  test('strikeDamage is the formula less the shortfall, never below 1', () => {
    const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0, { momentum: 1 }); const d = addUnit(s, 'defender', 1, 1, 0);
    const base = damageFor(6, guardOf(s, d, k), coverAt(s, d));
    expect(strikeDamage(s, d, k, 6)).toBe(Math.max(1, base - 2));
    k.momentum = 7;
    expect(strikeDamage(s, d, k, 6)).toBe(base);
  });
});

describe('momentum: paid kills', () => {
  test('a first-attack kill pays its price, emits the momentum event after the advance and gives one more attack; no health is lost', () => {
    const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0);
    const w = addUnit(s, 'warrior', 1, 1, 0, { hp: 1 }); addUnit(s, 'warrior', 1, 2, 0);
    const r = attack(s, k, '1,0'); const t = must(r);
    expect(unitById(t, k.id)).toMatchObject({ hp: 15, attacks: 1, momentum: 6, pos: '1,0' });
    expect(events(r)).toEqual([
      { type: 'attacked', unit: k.id, target: w.id, damage: expect.any(Number), counter: 0 },
      { type: 'died', unit: w.id },
      { type: 'advanced', unit: k.id, from: '0,0', to: '1,0' },
      { type: 'momentum', unit: k.id, spent: 1, left: 6 },
    ]);
  });
  test('a Knight with 7 kills three Hoplites; the fourth is 1 short: 1 less damage, no extra attack, momentum 0', () => {
    // Each Hoplite has at most one living mate when it is attacked, so none is braced.
    const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0);
    for (const q of [1, 2, 3]) addUnit(s, 'hoplite', 1, q, 0, { hp: 1 });
    const last = addUnit(s, 'hoplite', 1, 4, 0);
    let t = s;
    for (const [q, left] of [[1, 5], [2, 3], [3, 1]] as const) {
      const r = attack(t, unitById(t, k.id)!, `${q},0`); t = must(r);
      expect(events(r)).toContainEqual({ type: 'momentum', unit: k.id, spent: 2, left });
      expect(unitById(t, k.id)).toMatchObject({ attacks: 1, momentum: left, hp: 15 });
    }
    const kk = unitById(t, k.id)!;
    const want = uncut(t, kk, unitById(t, last.id)!) - 1;
    const r = attack(t, kk, '4,0'); const after = must(r);
    expect(hit(r).damage).toBe(want);
    expect(unitById(after, last.id)!.hp).toBe(15 - want);
    expect(unitById(after, k.id)).toMatchObject({ attacks: 0, momentum: 0 });
    expect(events(r).some((e) => e.type === 'momentum' || e.type === 'chainEnded')).toBe(false);
  });
  test("a Khan's Guard pays too, out of its 8", () => {
    const s = blankMatch({ factions: ['mongols', 'spartans'] }); const g = addUnit(s, 'khansGuard', 0, 0, 0);
    addUnit(s, 'defender', 1, 1, 0, { hp: 1 });
    const r = attack(s, g, '1,0');
    expect(unitById(must(r), g.id)).toMatchObject({ hp: 20, attacks: 1, momentum: 5 });
    expect(events(r)).toContainEqual({ type: 'momentum', unit: g.id, spent: 3, left: 5 });
  });
  test('a Scout costs nothing: a Knight with no momentum left chains on through Scouts, with no momentum event', () => {
    const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0, { momentum: 0 });
    addUnit(s, 'scout', 1, 1, 0, { hp: 1 }); addUnit(s, 'scout', 1, 2, 0, { hp: 1 });
    const r1 = attack(s, k, '1,0'); const t1 = must(r1);
    expect(unitById(t1, k.id)).toMatchObject({ attacks: 1, momentum: 0 });
    expect(events(r1).some((e) => e.type === 'momentum' || e.type === 'chainEnded')).toBe(false);
    const t2 = must(attack(t1, unitById(t1, k.id)!, '2,0'));
    expect(unitById(t2, k.id)).toMatchObject({ attacks: 1, momentum: 0, pos: '2,0' });
  });
  test('a paid kill leaves the deeds as they were: a fight deed, no survive deed', () => {
    const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0, { hp: 1 });
    const t = must(attack(s, k, '1,0'));
    expect(unitById(t, k.id)!.deeds).toMatchObject({ fight: CONFIG.heroes.fightPerAttack + CONFIG.heroes.fightPerKill, survive: 0 });
  });
  test('a kill by counter-attack costs a chain unit nothing', () => {
    const s = blankMatch(); const w = addUnit(s, 'warrior', 0, 0, 0, { hp: 1 }); const k = addUnit(s, 'knight', 1, 1, 0);
    const r = attack(s, w, '1,0'); const t = must(r);
    expect(unitById(t, w.id)).toBeUndefined();
    expect(unitById(t, k.id)!.momentum).toBe(7);
    expect(events(r).some((e) => e.type === 'momentum')).toBe(false);
  });
  test('a level-up from the kill still ends the chain; the momentum already paid stays paid', () => {
    const need = CONFIG.heroes.agogeThresholds.fight - CONFIG.heroes.fightPerAttack - CONFIG.heroes.fightPerKill;
    const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0, { deeds: { fight: need, march: 0, survive: 0, rest: 0 } });
    const w = addUnit(s, 'warrior', 1, 1, 0, { hp: 1 }); addUnit(s, 'warrior', 1, 2, 0);
    const r = attack(s, k, '1,0'); const t = must(r);
    expect(unitById(t, k.id)).toMatchObject({ attacks: 0, momentum: 6, heroTraits: ['fierce'], hp: 15 + CONFIG.heroes.fierceHp });
    expect(events(r)).toEqual([
      { type: 'attacked', unit: k.id, target: w.id, damage: expect.any(Number), counter: 0 },
      { type: 'died', unit: w.id },
      { type: 'advanced', unit: k.id, from: '0,0', to: '1,0' },
      { type: 'momentum', unit: k.id, spent: 1, left: 6 },
      { type: 'heroTrait', unit: k.id, trait: 'fierce', hero: false },
      { type: 'chainEnded', unit: k.id },
    ]);
  });
});

describe('momentum: short attacks', () => {
  test('a short attack that kills: cut damage, no extra attack, momentum 0, and the chain ends', () => {
    const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0, { momentum: 1 });
    const h = addUnit(s, 'hoplite', 1, 1, 0, { hp: 1 }); addUnit(s, 'warrior', 1, 2, 0);
    const want = Math.max(1, uncut(s, k, h) - 1);
    const r = attack(s, k, '1,0'); const t = must(r);
    expect(hit(r).damage).toBe(want);
    expect(unitById(t, h.id)).toBeUndefined();
    expect(unitById(t, k.id)).toMatchObject({ attacks: 0, momentum: 0, hp: 15, pos: '1,0' });
    expect(events(r)).toEqual([
      { type: 'attacked', unit: k.id, target: h.id, damage: want, counter: 0 },
      { type: 'died', unit: h.id },
      { type: 'advanced', unit: k.id, from: '0,0', to: '1,0' },
      { type: 'chainEnded', unit: k.id },
    ]);
  });
  test('a short attack that does not kill: 1 less damage per missing point, momentum 0', () => {
    const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0, { momentum: 1 }); const d = addUnit(s, 'swordsman', 1, 1, 0);
    const base = uncut(s, k, d);
    expect(base).toBeGreaterThan(2);
    const r = attack(s, k, '1,0'); const t = must(r);
    expect(hit(r).damage).toBe(base - 1);
    expect(unitById(t, k.id)).toMatchObject({ attacks: 0, momentum: 0 });
    expect(events(r).some((e) => e.type === 'chainEnded' || e.type === 'momentum')).toBe(false);
  });
  test('the cut never takes the damage below 1', () => {
    const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0, { momentum: 0, hp: 1 });
    const d = addUnit(s, 'defender', 1, 1, 0); setForest(s);
    const base = damageFor(attackOf(s, k) * (1 + 15) / 30, guardOf(s, d, k), coverAt(s, d));
    expect(base).toBeLessThanOrEqual(3);
    expect(hit(attack(s, k, '1,0')).damage).toBe(1);
  });
  test('the counter-attack is not cut: it is worked out from the target as the hit leaves it', () => {
    const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0, { momentum: 0 }); const d = addUnit(s, 'swordsman', 1, 1, 0);
    const dealt = uncut(s, k, d) - 2;
    const r = attack(s, k, '1,0');
    expect(hit(r).damage).toBe(dealt);
    const hf = (15 - dealt + 15) / 30;
    expect(hit(r).counter).toBe(damageFor(UNITS.swordsman.atk * CONFIG.counterFactor * hf, defenceOf(s, k), 1));
  });
});

describe('momentum: the braced Hoplite', () => {
  // Player 1's Hoplite at 1,0 with mates at 2,0 and 2,-1, out of the Knight's reach.
  function braced(momentum: number): { s: MatchState; k: Unit; h: Unit } {
    const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0, { momentum });
    const h = addUnit(s, 'hoplite', 1, 1, 0, { hp: 1 }); addUnit(s, 'hoplite', 1, 2, 0); addUnit(s, 'hoplite', 1, 2, -1);
    addUnit(s, 'warrior', 1, 1, -1);
    return { s, k, h };
  }
  test('costs 4 in place of 2 and still has +2 defence against the chain unit', () => {
    const { s, k, h } = braced(7);
    expect(momentumPrice(s, h, k)).toBe(M.bracedPrice);
    expect(guardOf(s, h, k)).toBe(defenceOf(s, h) + CONFIG.brace.def);
    const r = attack(s, k, '1,0');
    expect(unitById(must(r), k.id)).toMatchObject({ attacks: 1, momentum: 3 });
    expect(events(r)).toContainEqual({ type: 'momentum', unit: k.id, spent: 4, left: 3 });
  });
  test('the price is judged when the attack is made, before the Hoplite falls: 3 is 1 short', () => {
    const { s, k, h } = braced(3);
    expect(momentumShort(s, h, k)).toBe(1);
    const r = attack(s, k, '1,0'); const t = must(r);
    expect(unitById(t, h.id)).toBeUndefined();
    expect(unitById(t, k.id)).toMatchObject({ attacks: 0, momentum: 0 });
    expect(events(r)).toContainEqual({ type: 'chainEnded', unit: k.id });
  });
});

function setForest(s: MatchState): void { s.tiles['1,0']!.terrain = 'forest'; }
