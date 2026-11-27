import { describe, expect, test } from 'vitest';
import { applyAction } from './apply';
import { CONFIG } from './data/config';
import { rewardOptions, treasureUnitFor } from './economy';
import { cityById, createMatch, firstFreeNeighbor, unitAt, unitById } from './state';
import { addCity, addUnit, blankMatch, give, must, rngFor, setTile } from './testkit';
import type { FactionId, MatchState, Resource, Terrain, TechId } from './types';

const woodlandMatch = (): MatchState => blankMatch({ factions: ['woodland', 'mongols'] });

const harvests: [Resource, Terrain, TechId][] = [
  ['orchard', 'field', 'foraging'], ['cropland', 'field', 'gathering'], ['game', 'forest', 'trapping'],
  ['jewels', 'mountain', 'prospecting'], ['fish', 'water', 'fishing'],
];

describe('Woodland harvests', () => {
  test.each(harvests)('a Woodland %s harvest costs its price and pays 3 back', (resource, terrain, tech) => {
    const s = woodlandMatch(); addCity(s, 0, 0, 0); give(s, 0, tech);
    s.players[0]!.gold = 10;
    setTile(s, 1, 0, { terrain, resource });
    const rule = CONFIG.harvest[resource as keyof typeof CONFIG.harvest];
    const t = must(applyAction(s, { type: 'harvest', at: '1,0' }));
    expect(t.players[0]!.gold).toBe(10 - rule.cost + 3);
    expect(cityById(t, 0)!.growth).toBe(rule.growth);
  });

  test('a Woodland game harvest in the capital land: gold 10 gives 11, growth +1', () => {
    const s = woodlandMatch(); addCity(s, 0, 0, 0, { capital: true });
    s.players[0]!.gold = 10; give(s, 0, 'trapping');
    setTile(s, 1, 0, { terrain: 'forest', resource: 'game' });
    const t = must(applyAction(s, { type: 'harvest', at: '1,0' }));
    expect(t.players[0]!.gold).toBe(11);
    expect(cityById(t, 0)!.growth).toBe(1);
  });

  test('a Spartan harvest pays nothing back', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0); give(s, 0, 'foraging');
    s.players[0]!.gold = 10;
    setTile(s, 1, 0, { resource: 'orchard' });
    expect(must(applyAction(s, { type: 'harvest', at: '1,0' })).players[0]!.gold).toBe(8);
  });
});

describe('Woodland building growth', () => {
  const growthAfter = (factions: [FactionId, FactionId], building: 'farm' | 'market' | 'lumberCamp') => {
    const s = blankMatch({ factions }); addCity(s, 0, 0, 0, { level: 5 });
    s.players[0]!.gold = 30;
    give(s, 0, 'farming', 'gathering', 'granary', 'logging');
    if (building === 'farm') setTile(s, 1, 0, { resource: 'cropland', harvested: true });
    if (building === 'lumberCamp') setTile(s, 1, 0, { terrain: 'forest' });
    const t = must(applyAction(s, { type: 'build', at: '1,0', building }));
    return { t, growth: cityById(t, 0)!.growth };
  };

  test('a Woodland building gives its full growth, as everyone\'s does', () => {
    expect(CONFIG.buildings.farm.growth).toBe(2);
    expect(CONFIG.buildings.lumberCamp.growth).toBe(2);
    expect(CONFIG.buildings.market.growth).toBe(3);
    expect(growthAfter(['woodland', 'mongols'], 'farm').growth).toBe(2);
    expect(growthAfter(['woodland', 'mongols'], 'market').growth).toBe(3);
    expect(growthAfter(['woodland', 'mongols'], 'lumberCamp').growth).toBe(2);
    expect(growthAfter(['mongols', 'spartans'], 'farm').growth).toBe(2);
  });

  test('a Woodland Market still gives +2 income', () => {
    const { t } = growthAfter(['woodland', 'mongols'], 'market');
    expect(cityById(t, 0)!.market).toBe(true);
    expect(CONFIG.buildings.market.income).toBe(2);
  });
});

describe('Woodland rewards', () => {
  const city = (s: MatchState) => s.cities[0]!;

  test('the reward pair by level', () => {
    const s = woodlandMatch(); addCity(s, 0, 0, 0);
    const pairs = [2, 3, 4, 5, 6, 9].map((l) => rewardOptions(s, city(s), l));
    expect(pairs).toEqual([
      ['gold', 'scout'], ['borders', 'barracks'], ['champion', 'support'],
      ['champion', 'support'], ['champion', 'support'], ['champion', 'support'],
    ]);
  });

  test('a Spartan city keeps the old table', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0);
    expect(rewardOptions(s, city(s), 4)).toEqual(['income', 'growth']);
    expect(rewardOptions(s, city(s), 6)).toEqual(['champion', 'support']);
  });

  test.each([[0, 'warChief'], [1, 'smokeKeeper']] as const)('choosing %i at level 4 spawns a %s', (choice, type) => {
    const s = woodlandMatch(); const c = addCity(s, 0, 0, 0);
    c.pendingRewards.push(4);
    const t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice }));
    expect(t.units.filter((u) => u.owner === 0).map((u) => u.type)).toEqual([type]);
  });
});

describe('the Woodland start', () => {
  test('a Skirmisher on the capital and a Trapper next to it', () => {
    const s = createMatch({ seed: 7, factions: ['woodland', 'mongols'] });
    const p = s.players[0]!;
    const capital = s.cities[0]!;
    expect(p.techs).toEqual(['trapping']);
    expect(capital.level).toBe(1);
    const mine = s.units.filter((u) => u.owner === 0);
    expect(mine.map((u) => u.type)).toEqual(['skirmisher', 'trapper']);
    expect(mine[0]!.pos).toBe(capital.pos);
    const trapper = mine[1]!;
    // the same neighbour a reward unit would take, taken with the Skirmisher already on the capital
    const probe = structuredClone(s);
    probe.units = probe.units.filter((u) => u.id !== trapper.id);
    expect(trapper.pos).toBe(firstFreeNeighbor(probe, capital.pos));
    for (const u of mine) {
      expect(u.fresh).toBe(false);
      expect(u.home).toBe(capital.id);
      expect(u.mp).toBeGreaterThan(0);
      expect(u.attacks).toBeGreaterThanOrEqual(0);
    }
    expect(unitAt(s, capital.pos)).toBe(mine[0]);
  });

  test('a Spartan start has one unit', () => {
    const s = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
    expect(s.units.filter((u) => u.owner === 0)).toHaveLength(1);
  });
});

describe('the treasure unit', () => {
  test('treasureUnitFor follows the faction', () => {
    expect(treasureUnitFor('woodland')).toBe('skirmisher');
    expect(treasureUnitFor('spartans')).toBe('warrior');
    expect(treasureUnitFor('mongols')).toBe('warrior');
  });

  test('a Woodland treasure "unit" gives a Skirmisher', () => {
    const s = blankMatch({ factions: ['woodland', 'mongols'], unexplored: true });
    setTile(s, 1, 0, { treasure: true });
    const u = addUnit(s, 'skirmisher', 0, 1, 0);
    s.rng = rngFor('unit');
    const r = applyAction(s, { type: 'claimTreasure', unit: u.id });
    const t = must(r);
    const ev = r.ok ? r.events.find((e) => e.type === 'treasure') : undefined;
    expect(unitById(t, (ev as { unit: number }).unit)!.type).toBe('skirmisher');
  });
});
