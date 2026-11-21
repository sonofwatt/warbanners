import { describe, expect, test } from 'vitest';
import { applyAction } from './apply';
import { CONFIG } from './data/config';
import { HERO_TRAITS } from './types';
import type { Action, GameEvent, TreasureOutcome } from './types';
import { rngInt } from './rng';
import { unitAt, unitById } from './state';
import { addUnit, blankMatch, must, rngFor, setTile } from './testkit';

const claim = (unit: number): Action => ({ type: 'claimTreasure', unit });
const treasureEvent = (events: GameEvent[]) => events.find((e) => e.type === 'treasure') as Extract<GameEvent, { type: 'treasure' }>;

// A match with a treasure at 1,0 and a settled Warrior on it, the draw fixed to `outcome`.
function setup(outcome: TreasureOutcome) {
  const s = blankMatch({ unexplored: true });
  setTile(s, 1, 0, { treasure: true });
  const u = addUnit(s, 'warrior', 0, 1, 0);
  s.rng = rngFor(outcome);
  return { s, u };
}
const play = (s: ReturnType<typeof blankMatch>, unit: number) => {
  const r = applyAction(s, claim(unit));
  const t = must(r);
  return { t, ev: r.ok ? treasureEvent(r.events) : (undefined as never), events: r.ok ? r.events : [] };
};

describe('the treasure draw', () => {
  test.each(['gold', 'explore', 'unit', 'relic', 'draught', 'map', 'mercenary'] as TreasureOutcome[])('a claim can give %s', (outcome) => {
    const { s, u } = setup(outcome);
    setTile(s, 3, 0, { treasure: true });   // so a map has somewhere to point
    const { t, ev } = play(s, u.id);
    expect(ev.outcome).toBe(outcome);
    expect(t.tiles['1,0']!.treasure).toBe(false);
    if (outcome === 'gold') expect(t.players[0]!.gold).toBe(25);
    if (outcome === 'explore') expect(t.players[0]!.explored.length).toBeGreaterThan(10);
    if (outcome === 'unit') expect(unitById(t, ev.unit!)).toMatchObject({ type: 'warrior', fresh: true, home: null });
    if (outcome === 'relic') expect(unitById(t, u.id)!.heroTraits).toEqual([ev.trait]);
    if (outcome === 'draught') expect(unitById(t, u.id)!.item).toBe('draught');
    if (outcome === 'map') expect(ev.found).toBe('3,0');
    if (outcome === 'mercenary') expect(unitById(t, ev.unit!)!.type).toBe('sellsword');
  });

  test('one draw per claim, plus one for a granted relic', () => {
    const n = CONFIG.treasure.table.length;
    const d = setup('draught');
    expect(play(d.s, d.u.id).t.rng).toBe(rngInt(d.s.rng, n)[1]);
    const r = setup('relic');                                  // holds none: four traits to pick from
    expect(play(r.s, r.u.id).t.rng).toBe(rngInt(rngInt(r.s.rng, n)[1], HERO_TRAITS.length)[1]);
  });

  test('a relic grants a trait the unit lacks and names it', () => {
    const { s, u } = setup('relic');
    u.heroTraits = ['fierce'];
    const { t, ev, events } = play(s, u.id);
    expect(['tireless', 'hardy', 'watchful']).toContain(ev.trait);
    expect(unitById(t, u.id)!.heroTraits).toEqual(['fierce', ev.trait]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'heroTrait', unit: u.id, trait: ev.trait }));
  });

  test('a relic on a full unit is gold', () => {
    const { s, u } = setup('relic');
    u.heroTraits = HERO_TRAITS.slice(0, CONFIG.heroes.maxTraits) as typeof u.heroTraits;
    const rng = s.rng;
    const { t, ev } = play(s, u.id);
    expect(ev).toEqual({ type: 'treasure', at: '1,0', outcome: 'gold' });
    expect(t.rng).toBe(rngInt(rng, CONFIG.treasure.table.length)[1]);   // a fallback draws no second time
    expect(t.players[0]!.gold).toBe(25);
    expect(unitById(t, u.id)!.heroTraits).toHaveLength(CONFIG.heroes.maxTraits);
  });

  test('a relic on a Camp is gold', () => {
    const s = blankMatch({ unexplored: true }); setTile(s, 1, 0, { treasure: true });
    const u = addUnit(s, 'camp', 0, 1, 0); s.rng = rngFor('relic');
    const { t, ev } = play(s, u.id);
    expect(ev.outcome).toBe('gold'); expect(unitById(t, u.id)!.heroTraits).toEqual([]);
  });

  test('a draught for a unit already carrying one is gold', () => {
    const { s, u } = setup('draught'); u.item = 'draught';
    const { t, ev } = play(s, u.id);
    expect(ev.outcome).toBe('gold'); expect(t.players[0]!.gold).toBe(25); expect(unitById(t, u.id)!.item).toBe('draught');
  });

  test('a draught for a unit that cannot attack is gold', () => {
    const s = blankMatch({ unexplored: true }); setTile(s, 1, 0, { treasure: true });
    const u = addUnit(s, 'camp', 0, 1, 0); s.rng = rngFor('draught');
    const { t, ev } = play(s, u.id);
    expect(ev.outcome).toBe('gold'); expect(unitById(t, u.id)!.item).toBeNull();
  });

  test('a map explores around the nearest unexplored treasure and names it', () => {
    const { s, u } = setup('map');
    setTile(s, -1, 4, { treasure: true }); setTile(s, 2, 1, { treasure: true });   // 2,1 is nearer (distance 2) than -1,4 (distance 4)
    const { t, ev } = play(s, u.id);
    expect(ev).toMatchObject({ outcome: 'map', found: '2,1' });
    const seen = new Set(t.players[0]!.explored);
    for (const k of ['2,1', '3,1', '1,1', '2,2', '2,0', '3,0', '1,2']) expect(seen.has(k)).toBe(true);
    expect(seen.has('-1,4')).toBe(false);
  });

  test('a map breaks distance ties by key', () => {
    const { s, u } = setup('map');
    setTile(s, 1, 2, { treasure: true }); setTile(s, 1, -2, { treasure: true });   // both at distance 2 from 1,0
    expect(play(s, u.id).ev.found).toBe('1,-2');
  });

  test('a map with every other treasure explored is the explore outcome', () => {
    const { s, u } = setup('map');
    setTile(s, 3, 0, { treasure: true });
    s.players[0]!.explored = ['3,0'];
    const { t, ev } = play(s, u.id);
    expect(ev).toEqual({ type: 'treasure', at: '1,0', outcome: 'explore' });
    expect(t.players[0]!.explored.length).toBeGreaterThan(10);
  });

  test('a map with no other treasure at all is the explore outcome', () => {
    const { s, u } = setup('map');
    expect(play(s, u.id).ev.outcome).toBe('explore');
  });

  test('a sellsword arrives fresh, Tireless, counting against no city', () => {
    const { s, u } = setup('mercenary');
    const { t, ev, events } = play(s, u.id);
    const m = unitById(t, ev.unit!)!;
    expect(m).toMatchObject({ type: 'sellsword', owner: 0, home: null, heroTraits: ['tireless'], fresh: true, hp: 15 });
    expect(unitAt(t, m.pos)).toBe(m);
    expect(events).toContainEqual({ type: 'heroTrait', unit: m.id, trait: 'tireless', hero: false });
  });

  test('a sellsword or warrior with no free neighbour is gold', () => {
    for (const outcome of ['unit', 'mercenary'] as const) {
      const s = blankMatch({ radius: 1 }); setTile(s, 1, 0, { treasure: true });
      setTile(s, 1, -1, { terrain: 'water' }); setTile(s, 0, 1, { terrain: 'water' });
      addUnit(s, 'warrior', 0, 0, 0); const u = addUnit(s, 'warrior', 0, 1, 0);
      s.rng = rngFor(outcome);
      const { t, ev } = play(s, u.id);
      expect(t.units).toHaveLength(2); expect(t.players[0]!.gold).toBe(25); expect(ev.outcome).toBe('gold');
    }
  });

  test('a claim still takes the whole turn', () => {
    const { s, u } = setup('draught');
    expect(unitById(play(s, u.id).t, u.id)).toMatchObject({ mp: 0, attacks: 0, acted: true });
  });
});
