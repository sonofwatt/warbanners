import { describe, expect, test } from 'vitest';
import { applyAction } from './apply';
import { cityById, unitById } from './state';
import { addCity, addUnit, blankMatch, must } from './testkit';

const end = { type: 'endTurn' } as const;

describe('endTurn', () => {
  test('turn passes and comes back with income', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0, { capital: true }); addCity(s, 1, 3, 0, { capital: true });
    const t1 = must(applyAction(s, end));
    expect([t1.current, t1.stamp, t1.players[0]!.turnsTaken]).toEqual([1, 6, 1]);
    expect(t1.players[1]!.gold).toBe(20);
    const t2 = must(applyAction(t1, end));
    expect(t2.current).toBe(0); expect(t2.players[0]!.gold).toBe(22);
    const t3 = must(applyAction(t2, end));
    expect(t3.players[1]!.gold).toBe(22);
  });
  test('stamp and turnsTaken bookkeeping over four endTurns', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0); addCity(s, 1, 3, 0);
    let t = s;
    for (let i = 0; i < 4; i++) t = must(applyAction(t, end));
    expect(t.stamp).toBe(9);
    expect(t.current).toBe(0);
    expect(t.players.map((p) => p.turnsTaken)).toEqual([2, 2]);
  });
  test('units get their turn back', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0); addCity(s, 1, 3, 0);
    const u = addUnit(s, 'swordsman', 0, 0, 1, { mp: 0, attacks: 0, moved: true, acted: true });
    const t = must(applyAction(must(applyAction(s, end)), end));
    expect(unitById(t, u.id)).toMatchObject({ mp: 2, attacks: 2, moved: false, acted: false });
  });
  test('resting heals 4 at home and 2 away, never past full, and only if the unit did nothing', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0); addCity(s, 1, 3, 0);
    const home = addUnit(s, 'warrior', 0, 1, 0, { hp: 3 }); const away = addUnit(s, 'warrior', 0, -3, 0, { hp: 3 });
    const nearlyFull = addUnit(s, 'warrior', 0, 0, 1, { hp: 9 }); const busy = addUnit(s, 'warrior', 0, 0, -1, { hp: 3, moved: true });
    const t = must(applyAction(must(applyAction(s, end)), end));
    expect([home, away, nearlyFull, busy].map((u) => unitById(t, u.id)!.hp)).toEqual([7, 5, 10, 3]);
  });
  test('a unit in an enemy city territory heals the away amount', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0); addCity(s, 1, 3, 0);
    const u = addUnit(s, 'warrior', 0, 2, 0, { hp: 3 });
    const t = must(applyAction(must(applyAction(s, end)), end));
    expect(unitById(t, u.id)!.hp).toBe(5);
  });
  test('an unchosen reward takes its first option, and statuses wear off', () => {
    const s = blankMatch(); const c = addCity(s, 0, 0, 0, { level: 2, pendingRewards: [2] }); addCity(s, 1, 3, 0);
    const u = addUnit(s, 'warrior', 0, 1, 0, { taunted: true, blinded: true });
    const t = must(applyAction(s, end));
    expect(cityById(t, c.id)!.pendingRewards).toEqual([]); expect(t.players[0]!.gold).toBe(26);
    expect(unitById(t, u.id)).toMatchObject({ taunted: false, blinded: false });
  });
  test('a Mongol mounted unit gets its bonus movement back', () => {
    const s = blankMatch({ factions: ['mongols', 'spartans'] }); addCity(s, 0, 0, 0); addCity(s, 1, 3, 0);
    const h = addUnit(s, 'horseman', 0, 1, 0, { mp: 0 });
    const t = must(applyAction(must(applyAction(s, end)), end));
    expect(unitById(t, h.id)!.mp).toBe(6);
  });
  test('turnStarted names the next player', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0); addCity(s, 1, 3, 0);
    const r = applyAction(s, end);
    expect(r.ok && r.events.at(-1)).toEqual({ type: 'turnStarted', player: 1 });
  });
  test('lure is cleared at end of turn', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0); addCity(s, 1, 3, 0);
    const foe = addUnit(s, 'warrior', 1, 3, 1);
    const u = addUnit(s, 'horseman', 0, 1, 0, { lure: { target: foe.id, from: '1,0' } });
    const t = must(applyAction(s, end));
    expect(unitById(t, u.id)!.lure).toBeNull();
  });
  test('a finished match refuses endTurn', () => {
    const s = blankMatch(); s.winner = 0;
    expect(applyAction(s, end).ok).toBe(false);
  });
});
