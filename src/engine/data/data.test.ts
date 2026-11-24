import { test, expect } from 'vitest';
import { UNITS } from './units';
import { BRANCHES, TECHS, TECH_TREE, TECH_TREES } from './techs';
import type { TechDef } from './techs';
import type { TechId } from '../types';
import { FACTIONS } from './factions';
import { CONFIG } from './config';

test('every unit row matches the rules file spot checks', () => {
  expect(UNITS.warrior).toMatchObject({ atk: 4, def: 3, range: 1, move: 1, hp: 10, sight: 1, cost: 2, faction: null });
  expect(UNITS.hoplite).toMatchObject({ atk: 4, def: 5, hp: 15, cost: 3, faction: 'spartans' });
  expect(UNITS.hoplite.traits).toEqual(['steadfast', 'phalanx']);
  expect(UNITS.kingsGuard.cost).toBeNull();
  expect(UNITS.camp).toMatchObject({ atk: 0, range: 0, cost: 6, faction: 'mongols' });
  expect(UNITS.sellsword).toEqual({ atk: 5, def: 3, range: 1, move: 1, hp: 15, sight: 1, cost: null, faction: null, traits: [] });
  expect(Object.keys(UNITS)).toHaveLength(17);
});
test('the rules 7 tree is four ladders of three', () => {
  const t7 = TECH_TREES.rules7.techs;
  expect(Object.keys(t7)).toHaveLength(12);
  expect(t7.smithing).toMatchObject({ tier: 3, requires: 'shieldwork' });
  for (const t of Object.values(t7)) if (t.requires) expect(t7[t.requires]!.tier).toBe(t.tier - 1);
  expect(TECH_TREES.rules7.units).toMatchObject({ hoplite: 'bronze', camp: 'roads' });
  expect(TECH_TREES.rules7.start).toEqual({ spartans: 'bronze', mongols: 'riding' });
});
test('rules 8: five branches; column 1 forks into a top and a bottom row, each one tech longer', () => {
  expect(CONFIG.techTree).toBe('rules8');
  expect(TECHS).toBe(TECH_TREES.rules8.techs);
  const defs = Object.entries(TECHS) as [TechId, TechDef][];
  expect(defs).toHaveLength(21);
  for (const b of BRANCHES) {
    const mine = defs.filter(([, d]) => d.branch === b);
    expect(mine.filter(([, d]) => d.tier === 1)).toHaveLength(1);
    const root = mine.find(([, d]) => d.tier === 1)![0];
    for (const row of ['top', 'bottom'] as const) {
      const r = mine.filter(([, d]) => d.row === row);
      if (b === 'waters') { expect(r).toHaveLength(0); continue; }
      const [c2, c3] = [r.find(([, d]) => d.tier === 2)!, r.find(([, d]) => d.tier === 3)!];
      expect(r).toHaveLength(2);
      expect(c2[1].requires).toBe(root);
      expect(c3[1].requires).toBe(c2[0]);
    }
  }
  expect(TECH_TREE.start).toEqual({ spartans: 'prospecting', mongols: 'gathering' });
  expect(TECH_TREE.units).toMatchObject({ defender: 'defence', archer: 'archery', catapult: 'siege', spearman: 'spears', hoplite: 'spears',
    swordsman: 'smithing', horseman: 'riding', horseArcher: 'riding', camp: 'riding', knight: 'chivalry' });
  expect(TECH_TREE.walls).toBe('walls'); expect(TECH_TREE.road).toBe('riding'); expect(CONFIG.mountain.tech).toBe('prospecting');
  expect(TECH_TREE.buildings.market!.tech).toBe('granary');
});
test('references resolve', () => {
  for (const tree of Object.values(TECH_TREES)) {
    const has = (t: TechId): boolean => tree.techs[t] !== undefined;
    for (const t of Object.values(tree.units)) expect(has(t)).toBe(true);
    for (const t of Object.values(tree.harvest)) expect(has(t)).toBe(true);
    for (const b of Object.values(tree.buildings)) expect(has(b.tech)).toBe(true);
    for (const t of Object.values(tree.start)) expect(tree.techs[t]!.tier).toBe(1);
    expect(has(tree.walls) && has(tree.road)).toBe(true);
  }
  for (const f of Object.values(FACTIONS)) { expect(UNITS[f.champion].cost).toBeNull(); expect(UNITS[f.support].cost).toBeNull(); }
  // every upgrade upgrades a building of the same tree, on the same terrain, and costs and gives more
  for (const [b, rule] of Object.entries(CONFIG.buildings)) {
    if (rule.upgrades === null) continue;
    const base = CONFIG.buildings[rule.upgrades];
    expect(base.upgrades, b).toBeNull(); expect(base.on).toBe(rule.on);
    expect(rule.cost).toBeGreaterThan(base.cost); expect(rule.growth).toBeGreaterThan(base.growth);
  }
  expect(CONFIG.rewards[5]).toEqual(['champion', 'support']);
  expect(CONFIG.buildings.lumberCamp).toMatchObject({ cost: 4, growth: 2, on: 'forest', income: 0 });   // rules 7: cost 4 (was 3), growth 2 (was 1)
  expect(CONFIG.buildings.market).toMatchObject({ cost: 6, growth: 2, on: 'field', income: 2 });   // rules 7: growth 2 (was 1)
});
