import { describe, expect, test } from 'vitest';
import { applyAction } from './apply';
import { maxHpOf } from './heroes';
import { CONFIG } from './data/config';
import { ambushes, attackReach, attackTargets, damageFor, statsOf, strikeDamage } from './combat';
import { addUnit, blankMatch, give, setTile } from './testkit';
import { bowShot, forestEyeReach, normalRange } from './woodland';
import type { GameEvent, MatchState, Unit } from './types';

// Woodland (player 0) against Mongols (player 1) on a plain field map with no cities.
const match = (): MatchState => blankMatch({ factions: ['woodland', 'mongols'] });
const archery = (s: MatchState): MatchState => { give(s, 0, 'archery'); return s; };

function attack(s: MatchState, unit: Unit, target: string): GameEvent[] {
  const r = applyAction(s, { type: 'attack', unit: unit.id, target });
  if (!r.ok) throw new Error(r.reason);
  return r.events;
}
const hit = (events: GameEvent[]): Extract<GameEvent, { type: 'attacked' }> =>
  events.find((e): e is Extract<GameEvent, { type: 'attacked' }> => e.type === 'attacked')!;

describe('rules 11: the bow', () => {
  test('Skirmisher reach: 1 without archery, 2 with it, 3 on a mountain with it', () => {
    const s = match(); const sk = addUnit(s, 'skirmisher', 0, 0, 0);
    expect(normalRange(s, sk)).toBe(1);
    expect(attackReach(s, sk)).toBe(1);
    expect(statsOf(s, sk).range).toBe(1);
    archery(s);
    expect(normalRange(s, sk)).toBe(2);
    expect(attackReach(s, sk)).toBe(2);
    expect(statsOf(s, sk).range).toBe(2);
    setTile(s, 0, 0, { terrain: 'mountain' });
    expect(attackReach(s, sk)).toBe(3);
  });
  test('a shot at 2 does 70% of an Archer\'s hit; the Warrior cannot strike back', () => {
    const s = archery(match()); const sk = addUnit(s, 'skirmisher', 0, 0, 0); const w = addUnit(s, 'warrior', 1, 2, 0);
    expect(bowShot(s, sk, w)).toBe(true);
    expect(Math.round(CONFIG.woodland.bowShare * damageFor(4, 3, 1))).toBe(4);
    expect(hit(attack(s, sk, '2,0'))).toMatchObject({ damage: 4, counter: 0 });
  });
  test('a bow kill does not advance the Skirmisher', () => {
    const s = archery(match()); const sk = addUnit(s, 'skirmisher', 0, 0, 0); addUnit(s, 'warrior', 1, 2, 0, { hp: 2 });
    const r = applyAction(s, { type: 'attack', unit: sk.id, target: '2,0' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events.some((e) => e.type === 'died')).toBe(true);
    expect(r.events.some((e) => e.type === 'advanced')).toBe(false);
    expect(r.state.units.find((u) => u.id === sk.id)!.pos).toBe('0,0');
  });
  test('melee at 1: damage 8, counter 1 (2 before agile)', () => {
    const s = archery(match()); const sk = addUnit(s, 'skirmisher', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0);
    expect(damageFor(4 * CONFIG.counterFactor * 0.6, 2, 1)).toBe(2);
    expect(hit(attack(s, sk, '1,0'))).toMatchObject({ damage: 8, counter: 1 });
  });
  test('agile stacks with Watchful, never below 1', () => {
    const s = match(); const sk = addUnit(s, 'skirmisher', 0, 0, 0, { heroTraits: ['watchful'] });
    addUnit(s, 'warrior', 1, 1, 0);
    expect(hit(attack(s, sk, '1,0'))).toMatchObject({ damage: 8, counter: 1 });
  });
  test('an Archer shooting a Skirmisher at 2: 7, and the bow strikes back for 1; without archery no counter', () => {
    for (const known of [true, false]) {
      const s = match(); if (known) archery(s);
      s.current = 1;
      const a = addUnit(s, 'archer', 1, 0, 0); addUnit(s, 'skirmisher', 0, 2, 0);
      expect(hit(attack(s, a, '2,0'))).toMatchObject({ damage: 7, counter: known ? 1 : 0 });
    }
  });
  test('Fierce carries to the bow', () => {
    const s = archery(match()); const sk = addUnit(s, 'skirmisher', 0, 0, 0, { heroTraits: ['fierce'] });
    sk.hp = maxHpOf(sk);                                  // Fierce raises max health: full health is 12
    addUnit(s, 'warrior', 1, 2, 0);
    expect(Math.round(CONFIG.woodland.bowShare * damageFor(5, 3, 1))).toBe(6);
    expect(hit(attack(s, sk, '2,0')).damage).toBe(6);
  });
  test('from a mountain at 3: the long shot cut on top of the bow share', () => {
    const s = archery(match()); setTile(s, 0, 0, { terrain: 'mountain' });
    const sk = addUnit(s, 'skirmisher', 0, 0, 0); addUnit(s, 'warrior', 1, 3, 0);
    expect(hit(attack(s, sk, '3,0')).damage).toBe(3);
  });
});

describe('rules 11: ambush', () => {
  test('a hidden Skirmisher the Warrior cannot see: 6 and no counter', () => {
    const s = archery(match()); setTile(s, 0, 0, { terrain: 'forest' });
    const sk = addUnit(s, 'skirmisher', 0, 0, 0); const w = addUnit(s, 'warrior', 1, 2, 0);
    expect(ambushes(s, sk, w)).toBe(true);
    expect(hit(attack(s, sk, '2,0'))).toMatchObject({ damage: 6, counter: 0 });
  });
  test('the same shot from a field is no ambush: 4', () => {
    const s = archery(match()); const sk = addUnit(s, 'skirmisher', 0, 0, 0); const w = addUnit(s, 'warrior', 1, 2, 0);
    expect(ambushes(s, sk, w)).toBe(false);
    expect(hit(attack(s, sk, '2,0')).damage).toBe(4);
  });
  test('from a forest but seen by a Horseman next to it: 4', () => {
    const s = archery(match()); setTile(s, 0, 0, { terrain: 'forest' });
    const sk = addUnit(s, 'skirmisher', 0, 0, 0); const w = addUnit(s, 'warrior', 1, 2, 0);
    addUnit(s, 'horseman', 1, 0, 1);
    expect(ambushes(s, sk, w)).toBe(false);
    expect(hit(attack(s, sk, '2,0')).damage).toBe(4);
  });
  test('melee is never an ambush: a War Chief on a forest is seen by the Defender next to it', () => {
    const s = match(); setTile(s, 0, 0, { terrain: 'forest' });
    const c = addUnit(s, 'warChief', 0, 0, 0); const d = addUnit(s, 'defender', 1, 1, 0);
    expect(ambushes(s, c, d)).toBe(false);
    const h = hit(attack(s, c, '1,0'));
    expect(h.damage).toBe(damageFor(6, 9, 1));
    expect(h.counter).toBeGreaterThan(0);
  });
  test('strikeDamage takes the ambush as its last argument and adds ambushAtk', () => {
    const s = match(); const c = addUnit(s, 'warChief', 0, 0, 0); const d = addUnit(s, 'defender', 1, 1, 0);
    expect(strikeDamage(s, d, c, 6)).toBe(damageFor(6, 9, 1));
    expect(strikeDamage(s, d, c, 6, true)).toBe(damageFor(6 + CONFIG.woodland.ambushAtk, 9, 1));
  });
});

describe('rules 11: forest eye', () => {
  // A Hunter on a forest at 0,0; the Warrior at 3,0 is kept in view by a Skirmisher at 1,0 (2 from it).
  function hunterScene(): { s: MatchState; h: Unit; w: Unit } {
    const s = archery(match()); setTile(s, 0, 0, { terrain: 'forest' });
    const h = addUnit(s, 'woodlandHunter', 0, 0, 0); const w = addUnit(s, 'warrior', 1, 3, 0);
    addUnit(s, 'skirmisher', 0, 1, 0);
    return { s, h, w };
  }
  test('on a forest, not moved: reach 3 and a shot at 3 does round(6 * 0.8) = 5', () => {
    const { s, h, w } = hunterScene();
    addUnit(s, 'horseman', 1, -1, 0);                     // next to the Hunter, so it is seen: no ambush
    expect(forestEyeReach(s, h)).toBe(CONFIG.woodland.forestEyeRange);
    expect(attackReach(s, h)).toBe(3);
    expect(strikeDamage(s, w, h, 4)).toBe(5);
    expect(hit(attack(s, h, '3,0'))).toMatchObject({ damage: 5, counter: 0 });
  });
  test('unseen on a forest, the shot at 3 is also an ambush: round(8 * 0.8) = 6', () => {
    const { s, h, w } = hunterScene();
    expect(ambushes(s, h, w)).toBe(true);
    expect(hit(attack(s, h, '3,0')).damage).toBe(6);
  });
  test('after a move or an attack: reach 2', () => {
    for (const patch of [{ moved: true }, { acted: true }]) {
      const { s, h } = hunterScene(); Object.assign(h, patch);
      expect(forestEyeReach(s, h)).toBe(0);
      expect(attackReach(s, h)).toBe(2);
    }
  });
  test('on a field reach 2; on a mountain reach 2 (noMountainRange)', () => {
    for (const terrain of ['field', 'mountain'] as const) {
      const s = match(); setTile(s, 0, 0, { terrain });
      const h = addUnit(s, 'woodlandHunter', 0, 0, 0);
      expect(attackReach(s, h)).toBe(2);
    }
  });
  test('its counter reach stays 2', () => {
    for (const [dist, struck] of [[2, true], [3, false]] as const) {
      const s = archery(match()); setTile(s, 0, 0, { terrain: 'forest' }); setTile(s, dist, 0, { terrain: 'mountain' });
      s.current = 1;
      addUnit(s, 'woodlandHunter', 0, 0, 0); addUnit(s, 'horseman', 1, 1, -1);   // the Horseman sees the Hunter
      const a = addUnit(s, 'archer', 1, dist, 0);
      expect(hit(attack(s, a, '0,0')).counter > 0).toBe(struck);
    }
  });
  test('Hunter spotter: a target at 3 needs another unit of its player to see it', () => {
    const s = archery(match()); setTile(s, 0, 0, { terrain: 'forest' });
    const h = addUnit(s, 'woodlandHunter', 0, 0, 0); addUnit(s, 'warrior', 1, 3, 0);
    expect(attackTargets(s, h.id)).toEqual([]);
    addUnit(s, 'skirmisher', 0, 1, 0);
    expect(attackTargets(s, h.id)).toEqual(['3,0']);
  });
});
