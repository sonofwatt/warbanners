import { describe, expect, test } from 'vitest';
import { distance, isHidden, key, parseKey, playerView, startTech, visibleTiles } from '../engine';
import type { Action, HexKey, MatchState } from '../engine';
import { addCity, addUnit, blankMatch, setTile } from '../engine/testkit';
import { riskOf, riskyTiles } from './assess';
import { aiInputFor, believedState } from './input';
import { planTurn } from './plan';
import { forestByWoodland, spartanLine } from './scenarios';
import { LEVEL_DIAL } from './types';

// rules 11: the AI is wary of forests near the Woodland Nations (spec section 7), from what its player knows alone.

const HARD = { dial: LEVEL_DIAL.hard, seed: 1, refused: [] as Action[] };

const risky = (s: MatchState, me = 1): Set<HexKey> => riskyTiles(believedState(aiInputFor(s, me)), me);
function firstMove(s: MatchState, unit: number): HexKey | undefined {
  const a = planTurn(aiInputFor(s, 1), HARD).actions.find((x) => x.type === 'move' && x.unit === unit);
  return a?.type === 'move' ? a.to : undefined;
}

describe('riskyTiles', () => {
  test('a forest beside Woodland land the AI sees but has no unit next to is risky, and so is every tile within 2', () => {
    const { state, forest } = forestByWoodland({ type: 'horseman', q: 1, r: 0 });
    expect(visibleTiles(state, 1).has(forest)).toBe(true);     // in sight, yet a Woodland unit there would stay hidden
    const tiles = risky(state);
    for (const k of Object.keys(state.tiles)) expect(tiles.has(k), k).toBe(distance(parseKey(k), parseKey(forest)) <= 2);
  });

  test('an AI unit next to the forest sees units on it, so it is no longer risky', () => {
    const { state } = forestByWoodland({ type: 'horseman', q: 1, r: 0 });
    addUnit(state, 'warrior', 1, 2, 0);
    expect(risky(state).size).toBe(0);
  });

  test('a forest far from Woodland land is risky only near a Woodland unit the AI sees now', () => {
    const s = blankMatch({ factions: ['woodland', 'mongols'], radius: 6 });
    addCity(s, 0, 0, 5);
    addCity(s, 1, 0, -6);
    s.current = 1;
    setTile(s, 4, -4, { terrain: 'forest' });
    addUnit(s, 'horseman', 1, 1, -4);               // 3 off the forest: sees it, and the field below, but nothing in it
    expect(risky(s).size).toBe(0);
    addUnit(s, 'trapper', 0, 2, -3);                // a seen Woodland unit 2 off the forest
    expect(risky(s).has(key({ q: 4, r: -4 }))).toBe(true);
  });

  test('without a rival that hides in forests there are no risky tiles', () => {
    expect(risky(forestByWoodland({ type: 'horseman', q: 1, r: 0, rival: 'spartans' }).state).size).toBe(0);
    expect(risky(spartanLine(), 0).size).toBe(0);
  });

  test('a forest with a seen unit on it is not risky', () => {
    const { state } = forestByWoodland({ type: 'horseman', q: 1, r: 0 });
    addUnit(state, 'trapper', 1, 2, 1);
    expect(riskOf(believedState(aiInputFor(state, 1)), 1).forests.size).toBe(0);
  });
});

describe('the planner and risky tiles', () => {
  test('a wounded Horseman does not end beside the unseen forest, where it would against the Spartans', () => {
    const { state, unit } = forestByWoodland({ type: 'horseman', q: 1, r: 0, hp: 4 });
    const tiles = risky(state);
    const to = firstMove(state, unit);
    expect(to).toBeDefined();
    expect(tiles.has(to!)).toBe(false);
    // the same position with a Spartan city: the Horseman's best move ends on one of those tiles
    const control = forestByWoodland({ type: 'horseman', q: 1, r: 0, hp: 4, rival: 'spartans' });
    expect(tiles.has(firstMove(control.state, control.unit)!)).toBe(true);
  });

  test('a full-health Defender walks in next to the unseen forest to reveal it', () => {
    const { state, unit, forest } = forestByWoodland({ type: 'defender', q: 1, r: 0 });
    const to = firstMove(state, unit);
    expect(distance(parseKey(to!), parseKey(forest))).toBe(1);
    const control = forestByWoodland({ type: 'defender', q: 1, r: 0, rival: 'spartans' });
    expect(distance(parseKey(firstMove(control.state, control.unit)!), parseKey(forest))).toBeGreaterThan(1);
  });

  test("a hidden Skirmisher's true position never changes the AI's input or its plan", () => {
    const without = forestByWoodland({ type: 'horseman', q: 1, r: 0, hp: 4 });
    const withIt = forestByWoodland({ type: 'horseman', q: 1, r: 0, hp: 4, skirmisher: true });
    const skirmisher = withIt.state.units.find((u) => u.type === 'skirmisher')!;
    expect(isHidden(withIt.state, skirmisher)).toBe(true);
    expect(playerView(withIt.state, 1).visible).toContain(withIt.forest);   // its tile is in sight; the unit is not
    const a = aiInputFor(without.state, 1);
    const b = aiInputFor(withIt.state, 1);
    expect(b).toEqual(a);
    for (const dial of [LEVEL_DIAL.easy, LEVEL_DIAL.normal, LEVEL_DIAL.hard]) {
      for (const seed of [1, 2, 3]) {
        const opts = { dial, seed, refused: [] as Action[] };
        expect(planTurn(b, opts)).toEqual(planTurn(a, opts));
      }
    }
  });
});

describe('believedState and Archery', () => {
  test('a Woodland rival is believed to know Archery from its 4th turn; other rivals only their start tech', () => {
    const { state } = forestByWoodland({ type: 'horseman', q: 1, r: 0 });
    state.players[0]!.turnsTaken = 3;
    expect(believedState(aiInputFor(state, 1)).players[0]!.techs).not.toContain('archery');
    state.players[0]!.turnsTaken = 4;
    expect(believedState(aiInputFor(state, 1)).players[0]!.techs).toContain('archery');
    const spartans = forestByWoodland({ type: 'horseman', q: 1, r: 0, rival: 'spartans' }).state;
    spartans.players[0]!.turnsTaken = 9;
    expect(believedState(aiInputFor(spartans, 1)).players[0]!.techs).toEqual([startTech('spartans')]);
  });
});
