import { describe, expect, test } from 'vitest';
import { applyAction } from './apply';
import { CONFIG } from './data/config';
import { blockadeLoss, blockadeOf, cityIncome } from './economy';
import { addCity, addUnit, blankMatch, give, must } from './testkit';
import type { City, MatchState } from './types';

// The gold a blockade at `rate` takes from `income`: rounded down, at least minCut (1, David's), never below floor.
const expected = (income: number, rate: number): number =>
  Math.max(0, Math.min(Math.max(CONFIG.blockade.minCut, Math.floor(income * rate)), income - CONFIG.blockade.floor));

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
  test('enemy units on three tiles next to a city blockade it: half its income, rounded down, is cut as its turn starts', () => {
    expect(CONFIG.blockade.minTiles).toBe(3);                            // David's, not a tuning lever
    const { s, c } = setup(3);
    addUnit(s, 'warrior', 1, 1, 0); addUnit(s, 'warrior', 1, 0, 1); addUnit(s, 'warrior', 1, -1, 0);
    const income = cityIncome(s, c);                                     // level 3: 3 gold
    expect(blockadeOf(s, c)).toEqual({ enemies: 3, blockaded: true, cut: expected(income, CONFIG.blockade.cut) });
    const r = startTurn(s);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[0]!.gold).toBe(income - 1);
    expect(r.events).toContainEqual({ type: 'blockaded', city: c.id, enemies: 3, gold: 1 });
    expect(r.events.findIndex((e) => e.type === 'blockaded')).toBeLessThan(r.events.findIndex((e) => e.type === 'turnStarted'));
  });

  test('two enemy tiles are no blockade; the city tile itself and own units do not count', () => {
    const { s, c } = setup(4);
    addUnit(s, 'warrior', 1, 1, 0); addUnit(s, 'warrior', 1, 1, -1);
    addUnit(s, 'warrior', 1, 0, 0);                                       // on the city tile
    addUnit(s, 'warrior', 0, 0, 1); addUnit(s, 'warrior', 0, -1, 0);    // own units beside it
    addUnit(s, 'warrior', 1, 2, -2);                                      // two tiles away
    expect(blockadeOf(s, c)).toEqual({ enemies: 2, blockaded: false, cut: 0 });
    const r = must(startTurn(s));
    expect(r.players[0]!.gold).toBe(cityIncome(s, c));
  });

  test('unseen enemies count too', () => {
    const { s, c } = setup(4);
    addUnit(s, 'scout', 1, 1, 0); addUnit(s, 'scout', 1, -1, 0); addUnit(s, 'scout', 1, 0, 1);   // hidden
    expect(blockadeOf(s, c).blockaded).toBe(true);
  });

  test('a blockade costs at least 1 gold and never takes the city below 1 gold', () => {
    expect(CONFIG.blockade.minCut).toBe(1);                              // David's, fixed
    for (const level of [1, 2, 6]) {
      const { s, c } = setup(level);
      addUnit(s, 'warrior', 1, 1, 0); addUnit(s, 'warrior', 1, 0, 1); addUnit(s, 'warrior', 1, -1, 1);
      const income = cityIncome(s, c);
      const cut = expected(income, CONFIG.blockade.cut);
      expect(blockadeOf(s, c).cut).toBe(cut);
      expect(income - cut).toBeGreaterThanOrEqual(Math.min(income, CONFIG.blockade.floor));
      expect(must(startTurn(s)).players[0]!.gold).toBe(income - cut);
    }
    // level 1 earns 1 gold and keeps it: the only blockade that costs nothing
    const one = setup(1); addUnit(one.s, 'warrior', 1, 1, 0); addUnit(one.s, 'warrior', 1, 0, 1); addUnit(one.s, 'warrior', 1, -1, 0);
    expect(blockadeOf(one.s, one.c)).toMatchObject({ blockaded: true, cut: 0 });
    // level 2 with Walls: a quarter of 2 rounds to 0, but the blockade still takes 1 and the city keeps 1
    const two = setup(2, { walls: true }); addUnit(two.s, 'warrior', 1, 1, 0); addUnit(two.s, 'warrior', 1, 0, 1); addUnit(two.s, 'warrior', 1, -1, 0);
    expect(blockadeOf(two.s, two.c).cut).toBe(1);
    // level 3 for Spartans with Deep stores: 15% of 3 rounds to 0, but the blockade still takes 1
    const sp = setup(3, undefined, 'spartans'); give(sp.s, 0, 'walls');
    addUnit(sp.s, 'warrior', 1, 1, 0); addUnit(sp.s, 'warrior', 1, 0, 1); addUnit(sp.s, 'warrior', 1, -1, 0);
    expect(blockadeOf(sp.s, sp.c).cut).toBe(1);
  });

  test('walls soften it to cutWalls', () => {
    const { s, c } = setup(8, { walls: true });
    addUnit(s, 'warrior', 1, 1, 0); addUnit(s, 'warrior', 1, 0, 1); addUnit(s, 'warrior', 1, -1, 0);
    expect(blockadeOf(s, c).cut).toBe(expected(cityIncome(s, c), CONFIG.blockade.cutWalls));
  });

  test('Spartans holding the walls tech (Deep stores) lose only cutSpartanTech in every city; Mongols get nothing from the tech', () => {
    const sp = setup(8, undefined, 'spartans');
    addUnit(sp.s, 'warrior', 1, 1, 0); addUnit(sp.s, 'warrior', 1, 0, 1); addUnit(sp.s, 'warrior', 1, -1, 0);
    const income = cityIncome(sp.s, sp.c);
    expect(blockadeOf(sp.s, sp.c).cut).toBe(expected(income, CONFIG.blockade.cut));
    give(sp.s, 0, 'walls');
    expect(blockadeOf(sp.s, sp.c).cut).toBe(expected(income, CONFIG.blockade.cutSpartanTech));
    expect(blockadeLoss(sp.s, 0)).toBe(expected(income, CONFIG.blockade.cutSpartanTech));
    const mo = setup(8);
    addUnit(mo.s, 'warrior', 1, 1, 0); addUnit(mo.s, 'warrior', 1, 0, 1); addUnit(mo.s, 'warrior', 1, -1, 0);
    give(mo.s, 0, 'walls');
    expect(blockadeOf(mo.s, mo.c).cut).toBe(expected(income, CONFIG.blockade.cut));
  });

  test('growth, rest healing and the other player are untouched', () => {
    const { s, c } = setup(3, { growth: 1 });
    addUnit(s, 'warrior', 1, 1, 0); addUnit(s, 'warrior', 1, 0, 1); addUnit(s, 'warrior', 1, -1, 0);
    const gold1 = s.players[1]!.gold;
    const r = must(startTurn(s));
    expect(r.cities.find((x) => x.id === c.id)).toMatchObject({ growth: 1, level: 3 });
    expect(r.players[1]!.gold).toBe(gold1);
  });
});
