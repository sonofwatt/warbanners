import { describe, expect, test } from 'vitest';
import { applyAction } from './apply';
import { CONFIG } from './data/config';
import { blockadeLoss, blockadeOf, cityIncome } from './economy';
import { addCity, addUnit, blankMatch, give, must } from './testkit';
import type { City, MatchState } from './types';

// Player 1 ends its turn and player 0's turn starts, paying player 0's income. Player 0 owns a city at 0,0.
function setup(level = 3, patch?: Partial<City>, faction: 'spartans' | 'mongols' = 'mongols'): { s: MatchState; c: City } {
  const s = blankMatch({ factions: [faction, faction === 'mongols' ? 'spartans' : 'mongols'] });
  const c = addCity(s, 0, 0, 0, { level, ...patch });
  addCity(s, 1, 3, 0);
  s.current = 1; s.players[0]!.turnsTaken = 1; s.players[1]!.turnsTaken = 1;
  s.players[0]!.gold = 0;
  return { s, c };
}
const startTurn = (s: MatchState) => applyAction(s, { type: 'endTurn' });

describe('blockade (rules 8)', () => {
  test('two enemy units next to a city blockade it: half its income, rounded down, is cut as its turn starts', () => {
    const { s, c } = setup(3);
    addUnit(s, 'warrior', 1, 1, 0); addUnit(s, 'warrior', 1, 0, 1);
    const income = cityIncome(s, c);                                     // level 3: 3 gold
    expect(blockadeOf(s, c)).toEqual({ enemies: 2, blockaded: true, cut: Math.floor(income * CONFIG.blockade.cut) });
    const r = startTurn(s);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[0]!.gold).toBe(income - 1);
    expect(r.events).toContainEqual({ type: 'blockaded', city: c.id, enemies: 2, gold: 1 });
    expect(r.events.findIndex((e) => e.type === 'blockaded')).toBeLessThan(r.events.findIndex((e) => e.type === 'turnStarted'));
  });

  test('one enemy is no blockade; the city tile itself and own units do not count', () => {
    const { s, c } = setup(4);
    addUnit(s, 'warrior', 1, 1, 0);
    addUnit(s, 'warrior', 1, 0, 0);                                       // on the city tile
    addUnit(s, 'warrior', 0, 0, 1); addUnit(s, 'warrior', 0, -1, 0);    // own units beside it
    addUnit(s, 'warrior', 1, 2, -2);                                      // two tiles away
    expect(blockadeOf(s, c)).toEqual({ enemies: 1, blockaded: false, cut: 0 });
    const r = must(startTurn(s));
    expect(r.players[0]!.gold).toBe(cityIncome(s, c));
  });

  test('unseen enemies count too', () => {
    const { s, c } = setup(4);
    addUnit(s, 'scout', 1, 1, 0); addUnit(s, 'scout', 1, -1, 0);        // hidden
    expect(blockadeOf(s, c).blockaded).toBe(true);
  });

  test('the cut never takes the city below the floor', () => {
    for (const level of [1, 2, 6]) {
      const { s, c } = setup(level);
      addUnit(s, 'warrior', 1, 1, 0); addUnit(s, 'warrior', 1, 0, 1); addUnit(s, 'warrior', 1, -1, 1);
      const income = cityIncome(s, c);
      const cut = Math.max(0, Math.min(Math.floor(income * CONFIG.blockade.cut), income - CONFIG.blockade.floor));
      expect(blockadeOf(s, c).cut).toBe(cut);
      expect(income - cut).toBeGreaterThanOrEqual(Math.min(income, CONFIG.blockade.floor));
      expect(must(startTurn(s)).players[0]!.gold).toBe(income - cut);
    }
    // level 1 earns 1 gold and keeps it; level 2 earns 2 and loses 1
    const one = setup(1); addUnit(one.s, 'warrior', 1, 1, 0); addUnit(one.s, 'warrior', 1, 0, 1);
    expect(blockadeOf(one.s, one.c)).toMatchObject({ blockaded: true, cut: 0 });
  });

  test('walls soften it to cutWalls', () => {
    const { s, c } = setup(8, { walls: true });
    addUnit(s, 'warrior', 1, 1, 0); addUnit(s, 'warrior', 1, 0, 1);
    expect(blockadeOf(s, c).cut).toBe(Math.floor(cityIncome(s, c) * CONFIG.blockade.cutWalls));
  });

  test('Spartans holding the walls tech (Deep stores) lose only cutSpartanTech in every city; Mongols get nothing from the tech', () => {
    const sp = setup(8, undefined, 'spartans');
    addUnit(sp.s, 'warrior', 1, 1, 0); addUnit(sp.s, 'warrior', 1, 0, 1);
    const income = cityIncome(sp.s, sp.c);
    expect(blockadeOf(sp.s, sp.c).cut).toBe(Math.floor(income * CONFIG.blockade.cut));
    give(sp.s, 0, 'walls');
    expect(blockadeOf(sp.s, sp.c).cut).toBe(Math.floor(income * CONFIG.blockade.cutSpartanTech));
    expect(blockadeLoss(sp.s, 0)).toBe(Math.floor(income * CONFIG.blockade.cutSpartanTech));
    const mo = setup(8);
    addUnit(mo.s, 'warrior', 1, 1, 0); addUnit(mo.s, 'warrior', 1, 0, 1);
    give(mo.s, 0, 'walls');
    expect(blockadeOf(mo.s, mo.c).cut).toBe(Math.floor(income * CONFIG.blockade.cut));
  });

  test('growth, rest healing and the other player are untouched', () => {
    const { s, c } = setup(3, { growth: 1 });
    addUnit(s, 'warrior', 1, 1, 0); addUnit(s, 'warrior', 1, 0, 1);
    const gold1 = s.players[1]!.gold;
    const r = must(startTurn(s));
    expect(r.cities.find((x) => x.id === c.id)).toMatchObject({ growth: 1, level: 3 });
    expect(r.players[1]!.gold).toBe(gold1);
  });
});
