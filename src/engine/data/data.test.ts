import { test, expect } from 'vitest';
import { UNITS } from './units';
import { TECHS } from './techs';
import { FACTIONS } from './factions';
import { CONFIG } from './config';

test('every unit row matches the rules file spot checks', () => {
  expect(UNITS.warrior).toMatchObject({ atk: 4, def: 3, range: 1, move: 1, hp: 10, sight: 1, cost: 2, tech: null, faction: null });
  expect(UNITS.hoplite).toMatchObject({ atk: 4, def: 5, hp: 15, cost: 4, tech: 'bronze', faction: 'spartans' });
  expect(UNITS.hoplite.traits).toEqual(['steadfast', 'phalanx']);
  expect(UNITS.kingsGuard.cost).toBeNull();
  expect(UNITS.camp).toMatchObject({ atk: 0, range: 0, cost: 6, tech: 'roads', faction: 'mongols' });
  expect(Object.keys(UNITS)).toHaveLength(16);
});
test('tech tree is four ladders of three', () => {
  expect(Object.keys(TECHS)).toHaveLength(12);
  expect(TECHS.smithing).toEqual({ tier: 3, requires: 'shieldwork' });
  for (const t of Object.values(TECHS)) if (t.requires) expect(TECHS[t.requires].tier).toBe(t.tier - 1);
});
test('references resolve', () => {
  for (const u of Object.values(UNITS)) if (u.tech) expect(TECHS[u.tech]).toBeDefined();
  for (const f of Object.values(FACTIONS)) {
    expect(UNITS[f.champion].cost).toBeNull(); expect(UNITS[f.support].cost).toBeNull();
    expect(TECHS[f.startTech].tier).toBe(1);
  }
  expect(CONFIG.rewards[5]).toEqual(['champion', 'support']);
  expect(CONFIG.buildings.market).toMatchObject({ tech: 'markets', cost: 6, growth: 1, on: 'field', resource: null, income: 2 });
});
