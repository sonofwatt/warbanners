import { describe, expect, test } from 'vitest';
import { applyAction, legalActions } from './apply';
import { canCapture, canClaimTreasure } from './capture';
import { hashState } from './hash';
import { cityAt, cityById, unitAt, unitById } from './state';
import { addCity, addUnit, blankMatch, must, rngFor, setTile } from './testkit';
import type { Action } from './types';

describe('capture, elimination and resigning', () => {
  test('a village becomes a city, but not on the turn you arrive', () => {
    const s = blankMatch(); setTile(s, 1, 0, { village: true }); const u = addUnit(s, 'warrior', 0, 0, 0);
    const arrived = must(applyAction(s, { type: 'move', unit: u.id, to: '1,0' }));
    expect(applyAction(arrived, { type: 'capture', unit: u.id }).ok).toBe(false);
    const waited = structuredClone(arrived); waited.stamp += 2; const w = unitById(waited, u.id)!; w.moved = false; w.mp = 2; w.attacks = 1;
    const r = applyAction(waited, { type: 'capture', unit: u.id }); const t = must(r);
    const c = cityAt(t, '1,0')!;
    expect(c).toMatchObject({ owner: 0, level: 1, capital: false, radius: 1 });
    expect(t.tiles['1,0']!.village).toBe(false); expect(t.tiles['2,0']!.cityId).toBe(c.id);
    expect(unitById(t, u.id)).toMatchObject({ mp: 0, attacks: 0, acted: true });
    expect(t.players[0]!.gold).toBe(20);
    expect(r.ok && r.events).toContainEqual({ type: 'captured', city: c.id, by: 0 });
  });

  test('taking a city keeps its level and frees its units', () => {
    const s = blankMatch(); const c = addCity(s, 1, 0, 0, { level: 3, walls: true, pendingRewards: [2, 3] }); addCity(s, 1, 3, 0);
    const theirs = addUnit(s, 'warrior', 1, 2, 2, { home: c.id }); const u = addUnit(s, 'warrior', 0, 0, 0);
    const t = must(applyAction(s, { type: 'capture', unit: u.id }));
    expect(cityById(t, c.id)).toMatchObject({ owner: 0, level: 3, walls: true, pendingRewards: [] });
    expect(unitById(t, theirs.id)!.home).toBeNull();
    expect(unitById(t, u.id)).toMatchObject({ mp: 0, attacks: 0, acted: true });
    expect(t.winner).toBeNull();
  });

  test('losing your last city ends the match', () => {
    const s = blankMatch(); addCity(s, 1, 0, 0); addCity(s, 0, 3, 0); addUnit(s, 'warrior', 1, 2, 2); const u = addUnit(s, 'warrior', 0, 0, 0);
    const r = applyAction(s, { type: 'capture', unit: u.id }); const t = must(r);
    expect(t.players[1]!.alive).toBe(false); expect(t.units.every(x => x.owner === 0)).toBe(true); expect(t.winner).toBe(0);
    expect(r.ok && r.events.slice(-2)).toEqual([{ type: 'eliminated', player: 1 }, { type: 'matchOver', winner: 0 }]);
    for (const a of [{ type: 'endTurn' }, { type: 'move', unit: u.id, to: '1,0' }, { type: 'resign' }] as Action[])
      expect(applyAction(t, a)).toEqual({ ok: false, reason: 'match over' });
  });

  test('capture needs the right place and a fresh unit', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0); const u = addUnit(s, 'warrior', 0, 0, 0);
    expect(applyAction(s, { type: 'capture', unit: u.id }).ok).toBe(false);
    setTile(s, 2, 0, { village: true }); const v = addUnit(s, 'warrior', 0, 2, 0, { acted: true });
    expect(applyAction(s, { type: 'capture', unit: v.id }).ok).toBe(false);
    const m = addUnit(s, 'warrior', 0, 2, 0, { moved: true });
    expect(canCapture(s, m.id)).toBe(false);
  });

  test('a scout cannot take a city but can still take a village', () => {
    const s = blankMatch(); addCity(s, 1, 0, 0); addCity(s, 1, 6, 0); const u = addUnit(s, 'scout', 0, 0, 0);
    expect(canCapture(s, u.id)).toBe(false);
    expect(applyAction(s, { type: 'capture', unit: u.id }).ok).toBe(false);
    expect(legalActions(s).some(a => a.type === 'capture')).toBe(false);
    setTile(s, 3, 0, { village: true }); const v = addUnit(s, 'scout', 0, 3, 0);
    expect(canCapture(s, v.id)).toBe(true);
  });

  test('resigning hands the win to the other player', () => {
    const s = blankMatch(); const mine = addCity(s, 0, 0, 0); addCity(s, 1, 3, 0); addUnit(s, 'warrior', 0, 1, 0);
    const r = applyAction(s, { type: 'resign' }); const t = must(r);
    expect(t.winner).toBe(1); expect(t.players[0]!.alive).toBe(false);
    expect(t.units).toEqual([]); expect(cityById(t, mine.id)!.owner).toBe(0);
    expect(r.ok && r.events).toEqual([{ type: 'eliminated', player: 0 }, { type: 'matchOver', winner: 1 }]);
  });

  test('Mongol tribute: village 3, level 3 city 6', () => {
    const s = blankMatch({ factions: ['mongols', 'spartans'] }); setTile(s, 0, 0, { village: true });
    const u = addUnit(s, 'horseman', 0, 0, 0);
    expect(must(applyAction(s, { type: 'capture', unit: u.id })).players[0]!.gold).toBe(23);
    const s2 = blankMatch({ factions: ['mongols', 'spartans'] }); addCity(s2, 1, 0, 0, { level: 3 }); addCity(s2, 1, 3, 0);
    const v = addUnit(s2, 'horseman', 0, 0, 0);
    expect(must(applyAction(s2, { type: 'capture', unit: v.id })).players[0]!.gold).toBe(26);
  });

  test('a village capture leaves the other player alone', () => {
    const s = blankMatch(); setTile(s, 0, 0, { village: true }); addCity(s, 1, 3, 0); const e = addUnit(s, 'warrior', 1, 2, 2);
    const u = addUnit(s, 'warrior', 0, 0, 0);
    const t = must(applyAction(s, { type: 'capture', unit: u.id }));
    expect(t.players[1]!.alive).toBe(true); expect(unitById(t, e.id)).toBeDefined();
    expect(t.cities.filter(c => c.owner === 1)).toHaveLength(1); expect(t.winner).toBeNull();
  });

  test('the other player cannot capture on your turn', () => {
    const s = blankMatch(); setTile(s, 0, 0, { village: true }); addCity(s, 1, 3, 0); const e = addUnit(s, 'warrior', 1, 0, 0);
    expect(canCapture(s, e.id)).toBe(false);
    expect(applyAction(s, { type: 'capture', unit: e.id }).ok).toBe(false);
  });

  test('hostile unit ids are refused with the state untouched', () => {
    const s = blankMatch(); setTile(s, 0, 0, { village: true }); addUnit(s, 'warrior', 0, 0, 0);
    const before = hashState(s);
    for (const unit of ['constructor', '__proto__', null, -1, 999, undefined, NaN])
      expect(applyAction(s, { type: 'capture', unit } as unknown as Action).ok).toBe(false);
    expect(hashState(s)).toBe(before);
    expect(canCapture(s, 'constructor' as unknown as number)).toBe(false);
  });

  test('the captor moves home: it counts against the captured city, not the one it came from', () => {
    const s = blankMatch(); const old = addCity(s, 0, -3, 0); setTile(s, 1, 0, { village: true });
    const u = addUnit(s, 'warrior', 0, 1, 0, { home: old.id });
    const t = must(applyAction(s, { type: 'capture', unit: u.id }));
    const village = cityAt(t, '1,0')!;
    expect(unitById(t, u.id)!.home).toBe(village.id);
  });

  test('taking an enemy city makes it the captor\'s home, even past its capacity, and frees the old units', () => {
    const s = blankMatch(); const old = addCity(s, 0, -3, 0); const c = addCity(s, 1, 0, 0); addCity(s, 1, 3, 0);
    const theirs = addUnit(s, 'warrior', 1, 2, 2, { home: c.id }); addUnit(s, 'warrior', 0, -1, 0, { home: c.id });
    const u = addUnit(s, 'warrior', 0, 0, 0, { home: old.id });
    const t = must(applyAction(s, { type: 'capture', unit: u.id }));
    expect(unitById(t, u.id)!.home).toBe(c.id);
    expect(unitById(t, theirs.id)!.home).toBeNull();
  });

  test('a captor with no home keeps no home', () => {
    const s = blankMatch(); setTile(s, 1, 0, { village: true }); const u = addUnit(s, 'warrior', 0, 1, 0);
    expect(u.home).toBeNull();
    expect(unitById(must(applyAction(s, { type: 'capture', unit: u.id })), u.id)!.home).toBeNull();
  });
});

const claim = (unit: number): Action => ({ type: 'claimTreasure', unit });

describe('claiming a treasure (rules 12)', () => {
  test('the outcome follows the first draw over the table: explore', () => {
    const s = blankMatch({ unexplored: true }); setTile(s, 1, 0, { treasure: true }); const u = addUnit(s, 'warrior', 0, 1, 0);
    s.rng = rngFor('explore');
    const r = applyAction(s, claim(u.id)); const t = must(r);
    expect(t.tiles['1,0']!.treasure).toBe(false);
    expect(r.ok && r.events).toEqual([{ type: 'treasure', at: '1,0', outcome: 'explore' }]);
    expect(t.players[0]!.explored).toContain('4,-3');     // within 4 of 1,0 (the far edge of the radius-4 board)
    expect(t.rng).not.toBe(s.rng);
    expect(unitById(t, u.id)).toMatchObject({ pos: '1,0', mp: 0, attacks: 0, acted: true });
  });

  test('gold', () => {
    const s = blankMatch(); setTile(s, 1, 0, { treasure: true }); const u = addUnit(s, 'warrior', 0, 1, 0);
    s.rng = rngFor('gold');
    expect(must(applyAction(s, claim(u.id))).players[0]!.gold).toBe(25);
  });

  test('a unit appears on the first free neighbour, fresh and with no home', () => {
    const s = blankMatch(); setTile(s, 1, 0, { treasure: true }); const u = addUnit(s, 'warrior', 0, 1, 0);
    s.rng = rngFor('unit');
    const t = must(applyAction(s, claim(u.id)));
    expect(unitAt(t, '2,0')).toMatchObject({ type: 'warrior', owner: 0, home: null, fresh: true });
    expect(t.players[0]!.gold).toBe(20);
  });

  test('a unit with nowhere to stand becomes 5 gold', () => {
    const s = blankMatch({ radius: 1 }); setTile(s, 1, 0, { treasure: true });
    setTile(s, 1, -1, { terrain: 'water' }); setTile(s, 0, 1, { terrain: 'water' });
    addUnit(s, 'warrior', 0, 0, 0); const u = addUnit(s, 'warrior', 0, 1, 0);
    s.rng = rngFor('unit');
    const t = must(applyAction(s, claim(u.id)));
    expect(t.units).toHaveLength(2); expect(t.players[0]!.gold).toBe(25);
  });

  test('not on the turn the unit arrives: it must still be there at the start of its next turn', () => {
    const s = blankMatch(); addCity(s, 0, -3, 0); addCity(s, 1, 3, 0); setTile(s, 1, 0, { treasure: true });
    const u = addUnit(s, 'warrior', 0, 0, 0);
    const arrived = must(applyAction(s, { type: 'move', unit: u.id, to: '1,0' }));
    expect(canClaimTreasure(arrived, u.id)).toBe(false);
    expect(applyAction(arrived, claim(u.id))).toEqual({ ok: false, reason: 'cannot claim a treasure here' });
    const theirTurn = must(applyAction(arrived, { type: 'endTurn' }));
    expect(canClaimTreasure(theirTurn, u.id)).toBe(false);                 // not its owner's turn
    const next = must(applyAction(theirTurn, { type: 'endTurn' }));
    expect(canClaimTreasure(next, u.id)).toBe(true);
    expect(legalActions(next)).toContainEqual(claim(u.id));
    expect(must(applyAction(next, claim(u.id))).tiles['1,0']!.treasure).toBe(false);
  });

  test('needs a treasure, an unmoved unit that has not acted, and no fresh unit', () => {
    const s = blankMatch(); setTile(s, 1, 0, { treasure: true }); setTile(s, 2, 0, { treasure: true }); setTile(s, 3, 0, { treasure: true });
    expect(canClaimTreasure(s, addUnit(s, 'warrior', 0, 0, 0).id)).toBe(false);          // no treasure
    expect(canClaimTreasure(s, addUnit(s, 'warrior', 0, 1, 0, { moved: true }).id)).toBe(false);
    expect(canClaimTreasure(s, addUnit(s, 'warrior', 0, 2, 0, { acted: true }).id)).toBe(false);
    const f = addUnit(s, 'warrior', 0, 3, 0, { fresh: true });
    expect(canClaimTreasure(s, f.id)).toBe(false);
    f.fresh = false;
    expect(canClaimTreasure(s, f.id)).toBe(true);
  });

  test('an enemy unit standing on a treasure may claim it on its own turn', () => {
    const s = blankMatch(); setTile(s, 1, 0, { treasure: true }); const e = addUnit(s, 'warrior', 1, 1, 0);
    expect(canClaimTreasure(s, e.id)).toBe(false);
    s.current = 1;
    const t = must(applyAction(s, claim(e.id)));
    expect(t.tiles['1,0']!.treasure).toBe(false);
  });

  test('hostile unit ids are refused with the state untouched', () => {
    const s = blankMatch(); setTile(s, 0, 0, { treasure: true }); addUnit(s, 'warrior', 0, 0, 0);
    const before = hashState(s);
    for (const unit of ['constructor', '__proto__', null, -1, 999, undefined, NaN])
      expect(applyAction(s, { type: 'claimTreasure', unit } as unknown as Action).ok).toBe(false);
    expect(hashState(s)).toBe(before);
    expect(canClaimTreasure(s, 'constructor' as unknown as number)).toBe(false);
  });
});

test('a player may resign out of turn, and only a real living player', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0); addCity(s, 1, 3, 0);
  const t = must(applyAction(s, { type: 'resign', player: 1 }));
  expect(t.winner).toBe(0); expect(t.players[1]!.alive).toBe(false); expect(t.current).toBe(0);
  for (const player of [2, -1, 0.5, '1', null]) {
    expect(applyAction(s, { type: 'resign', player } as never)).toEqual({ ok: false, reason: 'invalid player' });
  }
  expect(must(applyAction(s, { type: 'resign' })).winner).toBe(1);
});

test('a resign without a player is exactly the old resign', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0); addCity(s, 1, 3, 0);
  const a = applyAction(s, { type: 'resign' }); const b = applyAction(s, { type: 'resign', player: s.current });
  expect(a.ok && hashState(a.state)).toBe(b.ok && hashState(b.state));
  expect(a.ok && a.events).toEqual(b.ok && b.events);
});

test('a resigning current player hands the turn on when others remain', () => {
  const s = blankMatch(); s.players.push({ ...structuredClone(s.players[1]!), id: 2 });
  addCity(s, 0, 0, 0); addCity(s, 1, 3, 0); addCity(s, 2, -3, 0);
  const r = applyAction(s, { type: 'resign', player: 0 }); const t = must(r);
  expect(t.winner).toBeNull(); expect(t.current).toBe(1);
  const viaEnd = must(applyAction(s, { type: 'endTurn' }));
  expect(t.stamp).toBe(viaEnd.stamp);
  expect(r.ok && r.events.map(e => e.type)).toEqual(['eliminated', 'turnStarted']);
});
