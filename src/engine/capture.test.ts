import { describe, expect, test } from 'vitest';
import { applyAction } from './apply';
import { canCapture } from './capture';
import { hashState } from './hash';
import { cityAt, cityById, unitById } from './state';
import { addCity, addUnit, blankMatch, must, setTile } from './testkit';
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
});
