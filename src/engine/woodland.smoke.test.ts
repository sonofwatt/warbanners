import { describe, expect, test } from 'vitest';
import { applyAction, legalActions } from './apply';
import { abilityTargets } from './abilities';
import { reachable } from './movement';
import { addUnit, blankMatch, give, setTile } from './testkit';
import { playerView } from './vision';
import { isHidden, isVeiled } from './woodland';
import type { Action, GameEvent, MatchState, Unit } from './types';

// Woodland (player 0) against Mongols (player 1), every tile explored.
const match = (): MatchState => blankMatch({ factions: ['woodland', 'mongols'] });

function run(s: MatchState, a: Action): { state: MatchState; events: GameEvent[] } {
  const r = applyAction(s, a);
  if (!r.ok) throw new Error(r.reason);
  return { state: r.state, events: r.events };
}
const seenBy1 = (s: MatchState, id: number): boolean => playerView(s, 1).units.some((u) => u.id === id);
const ability = (u: Unit, name: 'guide' | 'smoke', target: string): Action => ({ type: 'ability', unit: u.id, ability: name, target });

describe('rules 11: guide', () => {
  // The Keeper on 0,0, the Skirmisher on 0,1, an enemy Warrior on 2,0: 1,1 and 2,1 both touch it. mp 6 stands for a
  // hasten, so the unit could walk three tiles.
  const setup = (): { s: MatchState; keeper: Unit; sk: Unit } => {
    const s = match();
    const keeper = addUnit(s, 'smokeKeeper', 0, 0, 0);
    const sk = addUnit(s, 'skirmisher', 0, 0, 1, { mp: 6 });
    addUnit(s, 'warrior', 1, 2, 0);
    addUnit(s, 'warrior', 1, 1, 2);   // shuts the long way round, so 2,1 is only reached past 1,1
    return { s, keeper, sk };
  };

  test('unguided it stops on the first tile beside the enemy; guided it walks past', () => {
    const { s, keeper, sk } = setup();
    expect(reachable(s, sk.id)['1,1']).toBe(0);
    expect(reachable(s, sk.id)['2,1']).toBeUndefined();
    const { state } = run(s, ability(keeper, 'guide', sk.pos));
    const guided = state.units.find((u) => u.id === sk.id)!;
    expect(guided.guidedTurn).toBe(5);
    expect(reachable(state, sk.id)['2,1']).toBeDefined();
    const moved = run(state, { type: 'move', unit: sk.id, to: '2,1' });
    expect(moved.state.units.find((u) => u.id === sk.id)!.pos).toBe('2,1');
  });

  test('it still cannot pass through an enemy unit', () => {
    const { s, keeper, sk } = setup();
    addUnit(s, 'warrior', 1, 1, 1);
    const { state } = run(s, ability(keeper, 'guide', sk.pos));
    expect(reachable(state, sk.id)['1,1']).toBeUndefined();
    expect(reachable(state, sk.id)['2,1']).toBeUndefined();   // every way to it is past an enemy
  });

  test('it works on a unit that has already moved, and only for the target it names', () => {
    const { s, keeper, sk } = setup();
    sk.moved = true; sk.mp = 6;
    expect(abilityTargets(s, keeper.id, 'guide')).toEqual([sk.pos]);
    const { state } = run(s, ability(keeper, 'guide', sk.pos));
    expect(reachable(state, sk.id)['2,1']).toBeDefined();
    expect(state.units.find((u) => u.id === keeper.id)).toMatchObject({ attacks: 0, mp: 0 });
  });

  test('targets are friendly neighbours that have not ended their turn; never the Keeper itself or a far unit', () => {
    const { s, keeper, sk } = setup();
    const far = addUnit(s, 'skirmisher', 0, 3, 3);
    const done = addUnit(s, 'skirmisher', 0, 1, 0, { turnEnded: true });
    addUnit(s, 'warrior', 1, -1, 0);
    expect(far.pos).toBe('3,3'); expect(done.turnEnded).toBe(true);
    expect(abilityTargets(s, keeper.id, 'guide')).toEqual([sk.pos]);
    expect(legalActions(s).some((a) => a.type === 'ability' && a.ability === 'guide' && a.target === sk.pos)).toBe(true);
  });

  test('it lasts this turn only: two stamps later the unit stops again', () => {
    const { s, keeper, sk } = setup();
    const { state } = run(s, ability(keeper, 'guide', sk.pos));
    state.stamp += 2;
    expect(reachable(state, sk.id)['2,1']).toBeUndefined();
  });
});

describe('rules 11: smoke', () => {
  const setup = (): { s: MatchState; keeper: Unit; sk: Unit; horse: Unit } => {
    const s = match();
    const keeper = addUnit(s, 'smokeKeeper', 0, 0, 0);
    const sk = addUnit(s, 'skirmisher', 0, 0, 2);
    const horse = addUnit(s, 'horseman', 1, 0, 4);   // 2 tiles from the Skirmisher
    return { s, keeper, sk, horse };
  };

  test('targets: tiles within 2 with a friendly unit on or beside them; nothing for an empty stretch', () => {
    const { s, keeper } = setup();
    const t = abilityTargets(s, keeper.id, 'smoke');
    expect(t).toContain('0,2');   // the Skirmisher's tile
    expect(t).toContain('0,0');   // the Keeper's own
    expect(t).toContain('0,1');   // beside both
    expect(t).not.toContain('3,0');
    expect(t).not.toContain('0,3');   // out of range
  });

  test('a Skirmisher on a field is hidden after smoke, through the next Woodland turn, and seen at stamp +3', () => {
    const { s, keeper, sk } = setup();
    expect(seenBy1(s, sk.id)).toBe(true);
    const { state } = run(s, ability(keeper, 'smoke', '0,2'));
    const v = state.units.find((u) => u.id === sk.id)!;
    expect(v.veilUntil).toBe(7);
    expect(isVeiled(state, v)).toBe(true);
    expect(seenBy1(state, sk.id)).toBe(false);
    state.stamp = 6; expect(seenBy1(state, sk.id)).toBe(false);   // the Mongol turn
    state.stamp = 7; expect(seenBy1(state, sk.id)).toBe(false);   // the next Woodland turn
    state.stamp = 8; expect(seenBy1(state, sk.id)).toBe(true);
  });

  test('every friendly unit on the tile and beside it is veiled, an enemy is not', () => {
    const { s, keeper, sk, horse } = setup();
    const near = addUnit(s, 'skirmisher', 0, 1, 2);
    const away = addUnit(s, 'skirmisher', 0, 3, 0);
    const { state } = run(s, ability(keeper, 'smoke', '0,2'));
    const of = (u: Unit): number | undefined => state.units.find((x) => x.id === u.id)!.veilUntil;
    expect(of(sk)).toBe(7); expect(of(near)).toBe(7);
    expect(of(away)).toBeUndefined(); expect(of(horse)).toBeUndefined(); expect(of(keeper)).toBeUndefined();
  });

  test('an enemy next to a veiled unit still sees it', () => {
    const { s, keeper, sk, horse } = setup();
    const { state } = run(s, ability(keeper, 'smoke', '0,2'));
    expect(seenBy1(state, sk.id)).toBe(false);
    state.units.find((u) => u.id === horse.id)!.pos = '0,3';
    expect(seenBy1(state, sk.id)).toBe(true);
  });

  test('using smoke does not break an existing veil', () => {
    const { s, keeper, sk } = setup();
    sk.veilUntil = 6;
    const { state } = run(s, ability(keeper, 'smoke', '0,0'));
    expect(state.units.find((u) => u.id === keeper.id)!.veilUntil).toBe(7);
    expect(state.units.find((u) => u.id === sk.id)!.veilUntil).toBe(6);   // too far to be re-veiled, and kept
  });
});

describe('rules 11: a veiled attacker', () => {
  // The Skirmisher on 0,0 (veiled), a Warrior on 1,0 that cannot see it unless adjacent. The Warrior is adjacent, so use
  // distance 2 with the bow: Archery known, Warrior on 2,0.
  const shoot = (terrain: 'field' | 'forest'): { state: MatchState; events: GameEvent[]; sk: Unit } => {
    const s = match(); give(s, 0, 'archery');
    if (terrain === 'forest') setTile(s, 0, 0, { terrain: 'forest' });
    const sk = addUnit(s, 'skirmisher', 0, 0, 0, { veilUntil: 7 });
    const w = addUnit(s, 'warrior', 1, 2, 0);
    addUnit(s, 'horseman', 1, -2, 0);   // sight 2: it sees the Skirmisher once the veil is gone
    // the Warrior's owner must not see the Skirmisher: nobody of theirs is next to it
    expect(seenBy1(s, sk.id)).toBe(false);
    const r = run(s, { type: 'attack', unit: sk.id, target: w.pos });
    return { ...r, sk };
  };

  test('on a field: an ambush (damage 6, no counter), then it is seen', () => {
    const { state, events, sk } = shoot('field');
    expect(events.find((e) => e.type === 'attacked')).toMatchObject({ damage: 6, counter: 0 });
    const after = state.units.find((u) => u.id === sk.id)!;
    expect(after.veilUntil).toBeUndefined();
    expect('veilUntil' in after).toBe(false);
    expect(isHidden(state, after)).toBe(false);
    expect(seenBy1(state, sk.id)).toBe(true);
  });

  test('in a forest: an ambush, and it stays hidden by the cover', () => {
    const { state, events, sk } = shoot('forest');
    expect(events.find((e) => e.type === 'attacked')).toMatchObject({ damage: 6, counter: 0 });
    expect(state.units.find((u) => u.id === sk.id)!.veilUntil).toBeUndefined();
    expect(seenBy1(state, sk.id)).toBe(false);
  });

  test('a Dash-strike loses the veil too, and a plain melee attack', () => {
    const s = match(); give(s, 0, 'archery');
    const sk = addUnit(s, 'skirmisher', 0, 0, 0, { veilUntil: 7 });
    addUnit(s, 'warrior', 1, 1, 1);
    const { state } = run(s, { type: 'attack', unit: sk.id, target: '1,1', dash: true });
    expect(state.units.find((u) => u.id === sk.id)!.veilUntil).toBeUndefined();
    const m = match();
    const sk2 = addUnit(m, 'skirmisher', 0, 0, 0, { veilUntil: 7 });
    addUnit(m, 'warrior', 1, 1, 0);
    const r = run(m, { type: 'attack', unit: sk2.id, target: '1,0' });
    expect(r.state.units.find((u) => u.id === sk2.id)!.veilUntil).toBeUndefined();
  });

  test('a counter does not break the veil of the unit that is hit', () => {
    const s = match();
    addUnit(s, 'warrior', 0, 0, 0);
    s.current = 1;
    const sk = addUnit(s, 'skirmisher', 0, 5 - 4, 0, { veilUntil: 7 });   // 1,0 beside the Warrior
    const att = addUnit(s, 'horseman', 1, 2, 0);
    const { state } = run(s, { type: 'attack', unit: att.id, target: sk.pos });
    expect(state.units.find((u) => u.id === sk.id)!.veilUntil).toBe(7);
  });
});
