import { expect, test } from 'vitest';
import { UNITS } from '../engine';
import type { MatchState, UnitTypeId } from '../engine';
import { addCity, addUnit, blankMatch, give, setTile } from '../engine/testkit';
import { aiInputFor } from './input';
import { chooseReward, chooseTech, chooseUnit, techGivesSomething } from './mix';
import { PERSONAS } from './persona';
import { planTurn } from './plan';
import { LEVEL_DIAL } from './types';

const has = (t: UnitTypeId, trait: string): boolean => (UNITS[t].traits as readonly string[]).includes(trait);

// A Spartan city with three Hoplites beside it and every tech, facing four enemy units of one type that its Scout sees.
function facing(enemy: UnitTypeId): MatchState {
  const s = blankMatch();
  addCity(s, 0, 0, 3);
  addCity(s, 1, 0, -3);
  give(s, 0, 'prospecting', 'spears', 'smithing', 'foraging', 'defence', 'trapping', 'archery', 'siege', 'gathering', 'riding', 'chivalry');
  give(s, 1, 'gathering', 'riding', 'trapping', 'archery', 'prospecting', 'spears');
  for (const [q, r] of [[-1, 1], [0, 1], [-1, 2]] as const) addUnit(s, 'hoplite', 0, q, r);   // two steps from the city
  addUnit(s, 'scout', 0, 1, -2);                        // beside three of them: since rules 7 a Scout sees 1 tile (was 2,0)
  for (const [q, r] of [[0, -1], [1, -1], [2, -2], [3, -2]] as const) addUnit(s, enemy, 1, q, r);
  s.players[0]!.gold = 20;
  return s;
}

test('the unit chosen answers the enemy units seen: anti-rider foot against riders, riders against archers', () => {
  const fits = (): boolean => true;
  const riders = chooseUnit(facing('horseman'), 0, PERSONAS.spartans, { fits, threatened: false })!;
  const archers = chooseUnit(facing('archer'), 0, PERSONAS.spartans, { fits, threatened: false })!;
  expect(has(riders, 'steadfast') || riders === 'defender').toBe(true);
  expect(has(archers, 'mounted')).toBe(true);
});

test('the planner trains what the seen enemies call for, not a fixed first choice', () => {
  const trained = (s: MatchState): UnitTypeId[] => planTurn(aiInputFor(s, 0), { dial: LEVEL_DIAL.normal, seed: 1, refused: [] })
    .actions.flatMap((a) => (a.type === 'train' ? [a.unitType] : []));
  const vsRiders = trained(facing('horseman'));
  const vsArchers = trained(facing('archer'));
  expect(vsRiders).toHaveLength(1);
  expect(vsArchers).toHaveLength(1);
  expect(vsRiders[0]).not.toBe(vsArchers[0]);
});

test('a type the gold buys next turn is saved for when it is wanted far more than anything affordable', () => {
  const s = facing('archer');
  s.players[0]!.gold = 2;                              // a Warrior or a Scout now; a Horseman (3) next turn
  for (const [q, r] of [[2, 2], [-2, 3]] as const) addUnit(s, 'hoplite', 0, q, r);
  s.players[0]!.techs = s.players[0]!.techs.filter((t) => t !== 'chivalry');   // a Knight (6) is out of reach next turn
  const fits = (t: UnitTypeId): boolean => UNITS[t].cost! <= 2;
  expect(chooseUnit(s, 0, PERSONAS.spartans, { fits, threatened: false })).toBeNull();
  expect(chooseUnit(s, 0, PERSONAS.spartans, { fits, threatened: true })).not.toBeNull();   // never while threatened
});

test('research follows the units wanted: Mongols facing archers go for chivalry, for Knights', () => {
  const s = blankMatch({ factions: ['spartans', 'mongols'] });
  addCity(s, 0, 0, 3);
  addCity(s, 1, 0, -3);
  give(s, 1, 'gathering', 'riding');
  for (const [q, r] of [[-1, 0], [0, 0], [1, 0]] as const) addUnit(s, 'archer', 0, q, r);
  addUnit(s, 'horseArcher', 1, 0, -2);
  const open = ['foraging', 'trapping', 'prospecting', 'chivalry'] as const;
  expect(chooseTech(s, 1, PERSONAS.mongols, open)).toBe('chivalry');
});

// A level-5 reward waiting in a Spartan city with a few units around.
function levelFive(faction: 'spartans' | 'mongols', units: { type: UnitTypeId; hp?: number }[]): MatchState {
  const s = blankMatch({ factions: faction === 'spartans' ? ['spartans', 'mongols'] : ['mongols', 'spartans'] });
  const c = addCity(s, 0, 0, 3, { level: 5, pendingRewards: [5] });
  addCity(s, 1, 0, -3);
  const spots = [[-1, 3], [1, 2], [0, 2], [-1, 2], [1, 1], [-2, 3], [2, 1], [-2, 2], [0, 1]] as const;
  units.forEach((u, i) => addUnit(s, u.type, 0, spots[i]![0], spots[i]![1], u.hp === undefined ? {} : { hp: u.hp }));
  void c;
  return s;
}

test('level 5: the champion with few strong units, the support with many wounded', () => {
  const few = levelFive('mongols', [{ type: 'horseman' }, { type: 'horseArcher' }]);
  const hurt = levelFive('spartans', [{ type: 'hoplite', hp: 4 }, { type: 'hoplite', hp: 5 }, { type: 'hoplite', hp: 3 }, { type: 'swordsman' }]);
  expect(chooseReward(few, 0, few.cities[0]!, 5)).toBe(0);
  expect(chooseReward(hurt, 0, hurt.cities[0]!, 5)).toBe(1);
  // and the planner takes them: before this change the Mongols always took the support and the Spartans the champion
  const pick = (s: MatchState): unknown => planTurn(aiInputFor(s, 0), { dial: LEVEL_DIAL.normal, seed: 1, refused: [] })
    .actions.find((a) => a.type === 'chooseReward');
  expect(pick(few)).toEqual({ type: 'chooseReward', city: 0, choice: 0 });
  expect(pick(hurt)).toEqual({ type: 'chooseReward', city: 0, choice: 1 });
});

test('the other levels by situation: barracks for a full city, borders otherwise; scout reward in the dark', () => {
  const s = blankMatch();
  const c = addCity(s, 0, 0, 3, { level: 3, pendingRewards: [3] });
  addCity(s, 1, 0, -3);
  expect(chooseReward(s, 0, c, 3)).toBe(0);
  for (const [q, r] of [[-1, 3], [1, 2], [0, 2], [-1, 2]] as const) addUnit(s, 'warrior', 0, q, r).home = c.id;
  expect(chooseReward(s, 0, c, 3)).toBe(1);
  expect(chooseReward(s, 0, c, 2)).toBe(0);            // everything explored: gold
  s.players[0]!.explored = [];
  expect(chooseReward(s, 0, c, 2)).toBe(1);
});

// A level-4 Spartan city one growth short of level 5 with an orchard to harvest, no room to train and three badly hurt Hoplites. Before
// this change the AI did not buy growth short of the last step, and a level reached in the economy phase was left to the
// engine, which takes option 0 (the champion) when the turn ends.
test('growth is bought on the way to a level, and a level reached late in the turn gets its reward chosen', () => {
  const s = levelFive('spartans', [{ type: 'hoplite', hp: 4 }, { type: 'hoplite', hp: 5 }, { type: 'hoplite', hp: 3 }]);
  const c = s.cities[0]!;
  Object.assign(c, { level: 4, growth: 4, pendingRewards: [] });
  give(s, 0, 'foraging');
  setTile(s, 1, 3, { resource: 'orchard', cityId: c.id });
  c.capacityBonus = -c.level - 1;                       // no room, so no gold goes on training
  s.players[0]!.gold = 2;
  const plan = planTurn(aiInputFor(s, 0), { dial: LEVEL_DIAL.normal, seed: 1, refused: [] });
  const harvest = plan.actions.findIndex((a) => a.type === 'harvest');
  const reward = plan.actions.findIndex((a) => a.type === 'chooseReward');
  expect(harvest).toBeGreaterThanOrEqual(0);
  expect(reward).toBeGreaterThan(harvest);
  expect(plan.actions[reward]).toEqual({ type: 'chooseReward', city: c.id, choice: 1 });
});

// rules 8: a tech is bought only when it gives the player something now (or leads to a tech that does).
test('a tech with nothing for the player now is not worth gold: Fishing with no fish, an upgrade with nothing to upgrade, Deep stores until nearly blockaded', () => {
  const s = blankMatch();
  addCity(s, 0, 0, 2); addCity(s, 1, 0, -3);
  give(s, 0, 'prospecting', 'foraging', 'orchards', 'gathering');
  const gives = (t: Parameters<typeof techGivesSomething>[3]): boolean => techGivesSomething(s, 0, PERSONAS.spartans, t);
  expect(gives('fishing')).toBe(false);
  setTile(s, 1, 2, { terrain: 'water', resource: 'fish' });            // in the city's territory
  expect(gives('fishing')).toBe(true);
  expect(gives('plantations')).toBe(false);
  setTile(s, -1, 2, { terrain: 'field', resource: 'orchard', building: 'orchard' });
  expect(gives('plantations')).toBe(true);
  expect(gives('spears')).toBe(true);                                   // the Hoplite
  expect(gives('walls')).toBe(false);                                   // Deep stores, and no enemy beside a city
  addUnit(s, 'warrior', 1, 0, 1);
  expect(gives('walls')).toBe(false);                                   // one enemy beside it is not a blockade (David)
  addUnit(s, 'warrior', 1, 1, 1);
  expect(gives('walls')).toBe(true);                                    // two of the three tiles a blockade needs: nearly
  expect(gives('defence')).toBe(true);
  const m = blankMatch({ factions: ['mongols', 'spartans'] });
  addCity(m, 0, 0, 2); addCity(m, 1, 0, -3);
  expect(techGivesSomething(m, 0, PERSONAS.mongols, 'walls')).toBe(true);   // Walls, which the Mongols build
});

test('blockaded cities make the walls tech the one to buy', () => {
  const s = blankMatch();
  addCity(s, 0, 0, 2, { level: 4 }); addCity(s, 1, 0, -3);
  give(s, 0, 'prospecting', 'foraging', 'defence');
  const open = ['walls', 'orchards', 'trapping', 'gathering'] as const;
  const calm = chooseTech(s, 0, PERSONAS.spartans, [...open]);
  addUnit(s, 'warrior', 1, 1, 2); addUnit(s, 'warrior', 1, 0, 3); addUnit(s, 'warrior', 1, -1, 2);
  expect(calm).not.toBe('walls');
  expect(chooseTech(s, 0, PERSONAS.spartans, [...open])).toBe('walls');
});

test('level 5: with two supports alive the champion is taken, however many are wounded', () => {
  const hurt = levelFive('spartans', [
    { type: 'hoplite', hp: 4 }, { type: 'hoplite', hp: 5 }, { type: 'hoplite', hp: 3 }, { type: 'piper' }, { type: 'piper' },
  ]);
  expect(chooseReward(hurt, 0, hurt.cities[0]!, 5)).toBe(0);
});
