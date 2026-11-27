import { describe, expect, test } from 'vitest';
import { applyAction, legalActions } from './apply';
import { dashTargets, damageFor } from './combat';
import { addUnit, blankMatch, give, setTile } from './testkit';
import { chargeTile } from './woodland';
import type { Action, GameEvent, MatchState, Unit } from './types';

// Woodland (player 0) against Spartans (player 1) on a plain field map with no cities. The Skirmisher stands on 0,0 and
// its target on 1,1 (distance 2); the two tiles next to both are 1,0 (first in direction order) and 0,1.
const match = (): MatchState => blankMatch({ factions: ['woodland', 'spartans'] });
const archery = (s: MatchState): MatchState => { give(s, 0, 'archery'); return s; };
const dash = (u: Unit, target: string): Action => ({ type: 'attack', unit: u.id, target, dash: true });

function run(s: MatchState, a: Action): { state: MatchState; events: GameEvent[] } {
  const r = applyAction(s, a);
  if (!r.ok) throw new Error(r.reason);
  return { state: r.state, events: r.events };
}
const hits = (events: GameEvent[]): Extract<GameEvent, { type: 'attacked' }>[] =>
  events.filter((e): e is Extract<GameEvent, { type: 'attacked' }> => e.type === 'attacked');
const dashesOf = (s: MatchState, u: Unit): Action[] =>
  legalActions(s).filter((a) => a.type === 'attack' && a.unit === u.id && a.dash === true);

// The spec's worked example: a Hoplite with two Hoplites beside it (on 2,1 and 1,2, away from the charge tiles).
function hoplites(s: MatchState): Unit {
  const h = addUnit(s, 'hoplite', 1, 1, 1);
  addUnit(s, 'hoplite', 1, 2, 1); addUnit(s, 'hoplite', 1, 1, 2);
  return h;
}

describe('rules 11: Dash-strike', () => {
  test('the worked example: arrow 1, charge 6, counter 1; Hoplite on 8, Skirmisher on 9 at home with no movement', () => {
    const s = archery(match()); const sk = addUnit(s, 'skirmisher', 0, 0, 0); const h = hoplites(s);
    expect(chargeTile(s, sk, '1,1')).toBe('1,0');
    expect(dashTargets(s, sk.id)).toEqual(['1,1']);
    const { state, events } = run(s, dash(sk, '1,1'));
    expect(events.filter((e) => e.type === 'dashStrike' || e.type === 'attacked')).toEqual([
      { type: 'dashStrike', unit: sk.id, target: h.id, via: '1,0' },
      { type: 'attacked', unit: sk.id, target: h.id, damage: 1, counter: 0 },
      { type: 'attacked', unit: sk.id, target: h.id, damage: 6, counter: 1 },
    ]);
    expect(events.some((e) => e.type === 'advanced' || e.type === 'moved')).toBe(false);
    const after = state.units.find((u) => u.id === sk.id)!;
    expect(state.units.find((u) => u.id === h.id)!.hp).toBe(8);
    expect(after).toMatchObject({ hp: 9, pos: '0,0', mp: 0, attacks: 0, acted: true });
    expect(after.deeds).toMatchObject({ fight: 1, march: 0 });
  });

  test('a plain attack on the same Hoplite from next to it does 5 and takes 6 back', () => {
    const s = archery(match()); const sk = addUnit(s, 'skirmisher', 0, 1, 0); hoplites(s);
    expect(dashTargets(s, sk.id)).not.toContain('1,1');   // distance 1: no Dash-strike
    const { events } = run(s, { type: 'attack', unit: sk.id, target: '1,1' });
    expect(hits(events)).toEqual([expect.objectContaining({ damage: 5, counter: 6 })]);
  });

  test('legalActions lists the dash right after the plain attack on the same target', () => {
    const s = archery(match()); const sk = addUnit(s, 'skirmisher', 0, 0, 0); hoplites(s);
    const mine = legalActions(s).filter((a) => a.type === 'attack' && a.unit === sk.id);
    expect(mine).toEqual([
      { type: 'attack', unit: sk.id, target: '1,1' },
      { type: 'attack', unit: sk.id, target: '1,1', dash: true },
    ]);
  });

  test('no charge tile: water or units on both shared tiles, or neither explored, means no dash', () => {
    const s = archery(match()); const sk = addUnit(s, 'skirmisher', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 1);
    setTile(s, 1, 0, { terrain: 'water' });
    addUnit(s, 'warrior', 0, 0, 1);
    expect(chargeTile(s, sk, '1,1')).toBeNull();
    expect(dashTargets(s, sk.id)).toEqual([]);
    expect(dashesOf(s, sk)).toEqual([]);
    expect(applyAction(s, dash(sk, '1,1'))).toEqual({ ok: false, reason: 'cannot dash-strike there' });
    // A mountain is no path either, and an unexplored tile is not used.
    const m = archery(match()); const sk2 = addUnit(m, 'skirmisher', 0, 0, 0); addUnit(m, 'warrior', 1, 1, 1);
    setTile(m, 1, 0, { terrain: 'mountain' });
    expect(chargeTile(m, sk2, '1,1')).toBe('0,1');
    m.players[0]!.explored = m.players[0]!.explored.filter((k) => k !== '0,1');
    expect(chargeTile(m, sk2, '1,1')).toBeNull();
    expect(dashTargets(m, sk2.id)).toEqual([]);
  });

  test('a charge tile held by an enemy the attacker cannot see: offered from its believed view, refused for real', () => {
    const s = archery(match()); const sk = addUnit(s, 'skirmisher', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 1);
    setTile(s, 0, 1, { terrain: 'water' });
    const scout = addUnit(s, 'scout', 1, 1, 0);
    // What the attacker believes: the same board without the unit it cannot see.
    const believed = structuredClone(s);
    believed.units = believed.units.filter((u) => u.id !== scout.id);
    expect(chargeTile(believed, sk, '1,1')).toBe('1,0');
    expect(dashTargets(believed, sk.id)).toEqual(['1,1']);
    expect(dashesOf(believed, sk)).toEqual([dash(sk, '1,1')]);
    expect(chargeTile(s, sk, '1,1')).toBeNull();
    expect(dashesOf(s, sk)).toEqual([]);
    expect(applyAction(s, dash(sk, '1,1'))).toEqual({ ok: false, reason: 'cannot dash-strike there' });
  });

  test('a hunkered target: the arrow meets the hunker defence, the charge ignores it', () => {
    const s = archery(match()); const sk = addUnit(s, 'skirmisher', 0, 0, 0);
    setTile(s, 1, 1, { terrain: 'mountain' });
    const w = addUnit(s, 'warrior', 1, 1, 1, { hunkered: true });
    // On a mountain (cover 1.5) the arrow does 2 at defence 3 and 1 at defence 4; the charge does 7 at 3, 6 at 4.
    expect(Math.round(0.33 * damageFor(4, 3, 1.5))).toBe(2);
    expect(Math.round(0.33 * damageFor(4, 4, 1.5))).toBe(1);
    expect(damageFor(5, 3, 1.5)).toBe(7);
    expect(damageFor(5, 4, 1.5)).toBe(6);
    const { state, events } = run(s, dash(sk, '1,1'));
    expect(hits(events).map((e) => [e.damage, e.counter])).toEqual([[1, 0], [7, 1]]);
    expect(state.units.find((u) => u.id === w.id)!.hp).toBe(2);
  });

  test('an arrow kill ends the strike: no charge, no counter, no advance; fight 1 plus 2 for the kill', () => {
    const s = archery(match()); const sk = addUnit(s, 'skirmisher', 0, 0, 0);
    const w = addUnit(s, 'warrior', 1, 1, 1, { hp: 1 });
    const { state, events } = run(s, dash(sk, '1,1'));
    expect(events.map((e) => e.type).filter((t) => t !== 'heroTrait')).toEqual(['dashStrike', 'attacked', 'died']);
    expect(hits(events)).toEqual([{ type: 'attacked', unit: sk.id, target: w.id, damage: 2, counter: 0 }]);
    expect(state.units.find((u) => u.id === sk.id)).toMatchObject({ hp: 10, pos: '0,0', mp: 0 });
    expect(state.units.find((u) => u.id === sk.id)!.deeds.fight).toBe(3);
  });

  test('from a forest at a target that cannot see it: the arrow ambushes (attack 5), the charge still takes its counter', () => {
    const s = archery(match());
    setTile(s, 0, 0, { terrain: 'forest' });
    const sk = addUnit(s, 'skirmisher', 0, 0, 0); const h = addUnit(s, 'hoplite', 1, 1, 1);
    // Arrow: damageFor(4 + 1, 5, 1) = 6, times 0.33 = 2 (1 without the ambush). Charge: damageFor(5, 5, 1) = 6.
    const { state, events } = run(s, dash(sk, '1,1'));
    expect(hits(events).map((e) => [e.damage, e.counter])).toEqual([[2, 0], [6, 1]]);
    expect(state.units.find((u) => u.id === h.id)!.hp).toBe(7);
    expect(state.units.find((u) => u.id === sk.id)!.hp).toBe(9);
  });

  test('without archery, at distance 1, or for any other unit: no dash actions', () => {
    const s = match(); const sk = addUnit(s, 'skirmisher', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 1);
    expect(dashTargets(s, sk.id)).toEqual([]);
    expect(dashesOf(s, sk)).toEqual([]);
    expect(applyAction(s, dash(sk, '1,1'))).toEqual({ ok: false, reason: 'cannot dash-strike there' });
    const near = archery(match()); const sk2 = addUnit(near, 'skirmisher', 0, 0, 0); addUnit(near, 'warrior', 1, 1, 0);
    expect(dashTargets(near, sk2.id)).toEqual([]);
    expect(applyAction(near, dash(sk2, '1,0'))).toEqual({ ok: false, reason: 'cannot dash-strike there' });
    const other = archery(match()); const hunter = addUnit(other, 'woodlandHunter', 0, 0, 0); addUnit(other, 'warrior', 1, 1, 1);
    expect(dashTargets(other, hunter.id)).toEqual([]);
  });
});
