import { describe, expect, test } from 'vitest';
import { TECHS, createMatch, distance, parseKey } from '../engine';
import type { Action, FactionId, MatchState, PlayerId, TechId } from '../engine';
import { addCity, addUnit, blankMatch, give } from '../engine/testkit';
import { aiInputFor, believedState, viewKey } from './input';
import { availableTypes, chooseReward, factionTypes } from './mix';
import { PERSONAS } from './persona';
import { planTurn, snareScore } from './plan';
import { runMatch } from './sim';
import type { SimResult } from './sim';
import { LEVEL_DIAL } from './types';

// rules 11: the AI plays the Woodland Nations. Seeded matches at normal against the Mongols, the Woodland side taking
// the first seat on odd seeds and the second on even ones.
const SEEDS = [1, 2, 3, 4];
const MAX_ROUNDS = 60;

const seatOf = (seed: number): PlayerId => (seed % 2 === 1 ? 0 : 1);
function play(seed: number): SimResult {
  const factions: [FactionId, FactionId] = seatOf(seed) === 0 ? ['woodland', 'mongols'] : ['mongols', 'woodland'];
  return runMatch({ seed, factions, seats: [{ level: 'normal' }, { level: 'normal' }], maxRounds: MAX_ROUNDS });
}

// The Woodland side's own actions: those played while it was the current player (each turn ends with its endTurn).
function woodlandActions(r: SimResult, seat: PlayerId): Action[] {
  const out: Action[] = [];
  let current: PlayerId = 0;
  for (const a of r.actions) {
    if (current === seat) out.push(a);
    if (a.type === 'endTurn') current = current === 0 ? 1 : 0;
  }
  return out;
}

describe('the AI plays the Woodland Nations', () => {
  const results = new Map<number, SimResult>();
  const result = (seed: number): SimResult => {
    if (!results.has(seed)) results.set(seed, play(seed));
    return results.get(seed)!;
  };

  test('a seeded match against the Mongols at normal finishes within 60 rounds with no refused action', () => {
    const r = result(2);
    expect(r.winner).not.toBeNull();
    expect(r.rounds).toBeLessThanOrEqual(MAX_ROUNDS);
    expect(r.refusals).toBe(0);
    // On the other seeds the only refusals are moves (a step onto a hidden Woodland unit the mover could not see).
    for (const seed of SEEDS) {
      expect(result(seed).nonMoveRefusals).toBe(0);
      expect(result(seed).winner).not.toBeNull();
    }
  }, 900_000);

  test('over 4 seeds it trains every Woodland unit and takes a Dash-strike, sets a snare and uses smoke', () => {
    const trained = new Set<string>();
    let dashes = 0; let snares = 0; let smokes = 0;
    for (const seed of SEEDS) {
      const r = result(seed);
      const seat = seatOf(seed);
      for (const t of Object.keys(r.sides[seat]!.unitsTrained)) trained.add(t);
      for (const a of woodlandActions(r, seat)) {
        if (a.type === 'attack' && a.dash === true) dashes += 1;
        if (a.type === 'ability' && a.ability === 'snare') snares += 1;
        if (a.type === 'ability' && a.ability === 'smoke') smokes += 1;
      }
    }
    expect(trained).toContain('skirmisher');
    expect(trained).toContain('woodlandHunter');
    expect(trained).toContain('trapper');
    expect(dashes).toBeGreaterThan(0);
    expect(snares).toBeGreaterThan(0);
    expect(smokes).toBeGreaterThan(0);
  }, 900_000);

  test('the planner never lists or trains a Warrior or an Archer for the Woodland Nations', () => {
    expect(factionTypes('woodland')).not.toContain('warrior');
    expect(factionTypes('woodland')).not.toContain('archer');
    const s = createMatch({ seed: 1, factions: ['woodland', 'mongols'] });
    s.players[0]!.techs = Object.keys(TECHS) as TechId[];
    const types = availableTypes(s, 0);
    expect(types).toContain('skirmisher');
    expect(types).toContain('woodlandHunter');
    expect(types).not.toContain('warrior');
    expect(types).not.toContain('archer');
    expect(PERSONAS.woodland.mix.warrior).toBeUndefined();
    expect(PERSONAS.woodland.mix.archer).toBeUndefined();
    for (const seed of SEEDS) {
      const r = result(seed);
      const seat = seatOf(seed);
      expect(r.sides[seat]!.unitsTrained.warrior).toBeUndefined();
      expect(r.sides[seat]!.unitsTrained.archer).toBeUndefined();
    }
  }, 900_000);

  test('the Woodland persona is the tuned one', () => {
    const p = PERSONAS.woodland;
    expect([p.formation, p.hold, p.spread, p.raid, p.forestPenalty, p.counter]).toEqual([0.5, 0.4, 4, 1, -1, 1]);
    expect(p.techOrder).toEqual([
      'trapping', 'archery', 'foraging', 'logging', 'gathering', 'farming', 'prospecting', 'spears', 'siege', 'orchards',
      'riding', 'defence', 'walls', 'mining', 'smithing', 'granary', 'chivalry', 'milling', 'plantations', 'foundry', 'fishing',
    ]);
    expect(p.mix).toEqual({
      skirmisher: 5, woodlandHunter: 2.5, trapper: 0.6, spearman: 0.8, catapult: 0.6, swordsman: 0.6, defender: 0.4,
      horseman: 0.4, knight: 0.4,
    });
  });
});

// A Woodland city at level 4 with a reward waiting: rules 11 offers the champion or the support there.
function woodlandLevelFour(hp: number[]): MatchState {
  const s = blankMatch({ factions: ['woodland', 'mongols'] });
  addCity(s, 0, 0, 3, { level: 4, pendingRewards: [4] });
  addCity(s, 1, 0, -3);
  const spots = [[-1, 3], [1, 2], [0, 2], [-1, 2], [1, 1]] as const;
  hp.forEach((h, i) => addUnit(s, 'skirmisher', 0, spots[i]![0], spots[i]![1], { hp: h }));
  return s;
}

test('a Woodland city at level 4 chooses between the champion and the support', () => {
  const few = woodlandLevelFour([10]);
  const hurt = woodlandLevelFour([3, 4, 3, 10]);
  expect(chooseReward(few, 0, few.cities[0]!, 4)).toBe(0);    // champion: too few strong units
  expect(chooseReward(hurt, 0, hurt.cities[0]!, 4)).toBe(1);  // support: three wounded
});

test('the believed state and the view key carry the AI\'s own snares and never a rival\'s', () => {
  const s = blankMatch({ factions: ['woodland', 'mongols'] });
  addCity(s, 0, 0, 3);
  addCity(s, 1, 0, -3);
  s.snares = [{ owner: 0, at: '1,1' }, { owner: 1, at: '-1,1' }];
  const input = aiInputFor(s, 0);
  expect(believedState(input).snares).toEqual([{ owner: 0, at: '1,1' }]);
  expect(believedState(aiInputFor(s, 1)).snares).toEqual([{ owner: 1, at: '-1,1' }]);
  const before = viewKey(input);
  s.snares = [{ owner: 1, at: '-1,1' }];
  expect(viewKey(aiInputFor(s, 0))).not.toBe(before);
  s.snares = [{ owner: 0, at: '1,1' }, { owner: 1, at: '2,-2' }];
  expect(viewKey(aiInputFor(s, 0))).toBe(before);
  // with no snares the believed state has none, as before rules 11
  expect('snares' in believedState(aiInputFor(blankMatch(), 0))).toBe(false);
});

// A Smoke Keeper beside two Skirmishers on open fields, three or four tiles from two Mongol Horse Archers that could shoot them
// next turn. Veiled, they could be hit only by a rider that comes next to them.
function aboutToBeHit(): MatchState {
  const s = blankMatch({ factions: ['woodland', 'mongols'], radius: 6 });
  addCity(s, 0, 0, 5);
  addCity(s, 1, 0, -6);
  give(s, 0, 'archery');
  addUnit(s, 'smokeKeeper', 0, 0, 0);
  addUnit(s, 'skirmisher', 0, 1, -1, { fresh: true });
  addUnit(s, 'skirmisher', 0, -1, 0, { fresh: true });
  addUnit(s, 'woodlandHunter', 0, 1, -3, { fresh: true });   // a lookout that sees the riders
  addUnit(s, 'horseArcher', 1, 0, -4);
  addUnit(s, 'horseArcher', 1, -1, -3);
  return s;
}

test('the planner smokes a group that is about to be hit', () => {
  const s = aboutToBeHit();
  const plan = planTurn(aiInputFor(s, 0), { dial: LEVEL_DIAL.normal, seed: 1, refused: [] }).actions;
  const smoke = plan.find((a) => a.type === 'ability' && a.ability === 'smoke');
  expect(smoke).toMatchObject({ unit: 0 });
  // and the veil covers the whole group
  const at = parseKey((smoke as { target: string }).target);
  for (const u of s.units.filter((x) => x.owner === 0 && x.type !== 'woodlandHunter')) expect(distance(at, parseKey(u.pos))).toBeLessThanOrEqual(1);
});

test('a snare scores 0.3 on a way into the own land from a seen enemy at most 4 tiles off, 0 elsewhere', () => {
  const s = blankMatch({ factions: ['woodland', 'mongols'], radius: 6 });
  addCity(s, 0, 0, 3);                  // its territory: the tiles within 1 of 0,3
  addCity(s, 1, 0, -6);
  addUnit(s, 'horseman', 1, 0, -2);
  expect(snareScore(s, 0, '0,1')).toBe(0.3);      // next to the territory, on the way from 0,-2 to 0,3
  expect(snareScore(s, 0, '0,2')).toBe(0.3);      // in it, 4 from the rider
  expect(snareScore(s, 0, '-3,3')).toBe(0);       // off the land
  s.units[0]!.pos = '0,-3';
  expect(snareScore(s, 0, '0,2')).toBe(0);        // 5 from the rider
  s.units[0]!.pos = '0,1';
  expect(snareScore(s, 0, '0,4')).toBe(0);        // in the land, 3 from the rider, but behind the city
  expect(snareScore(s, 0, '0,2')).toBe(0.3);
});
