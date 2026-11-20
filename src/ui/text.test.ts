import { expect, test } from 'vitest';
import { CONFIG, FACTIONS, TECHS, UNITS } from '../engine';
import type { BuildingId, FactionId, TechId, UnitTypeId } from '../engine';
import { digestText, reasonText, T, unlocks } from './text';

test('every id the engine knows has a name', () => {
  for (const id of Object.keys(UNITS)) { expect(T.unit[id as UnitTypeId].name).toBeTruthy(); expect(T.unit[id as UnitTypeId].blurb.length).toBeGreaterThan(10); }
  for (const id of Object.keys(TECHS)) expect(T.tech[id as TechId]).toBeTruthy();
  for (const id of Object.keys(CONFIG.buildings)) expect(T.building[id as BuildingId]).toBeTruthy();
  for (const id of Object.keys(FACTIONS)) expect(T.faction[id as FactionId]).toBeTruthy();
  const traits = new Set(Object.values(UNITS).flatMap(u => u.traits));
  for (const t of traits) expect(T.trait[t].blurb.length).toBeGreaterThan(10);
  for (const pair of Object.values(CONFIG.rewards)) for (const r of pair) expect(T.reward[r].name).toBeTruthy();
});
test('every refusal a panel can show has a line', () => {
  for (const r of ['not enough gold', 'missing tech', 'city is at capacity', 'city tile is occupied', 'cannot train that',
    'not your territory', 'nothing to harvest', 'already built', 'wrong tile', 'city already has a market', 'already a road',
    'cannot build a road there', 'already walled', 'your faction cannot build walls', 'no city has room']) {
    expect(T.reason[r], r).toBeTruthy();
  }
  expect(reasonText('some new reason')).toBe('Some new reason');
});
test('what a tech unlocks comes from the data', () => {
  expect(unlocks('riding')).toEqual(expect.arrayContaining(['Horseman', 'Horse Archer']));
  expect(unlocks('bronze')).toEqual(expect.arrayContaining(['Spearman', 'Hoplite', T.building.mine]));
  expect(unlocks('shieldwork')).toEqual(expect.arrayContaining(['Defender', T.ui.walls]));
  expect(unlocks('roads')).toEqual(expect.arrayContaining(['Camp', T.ui.road]));
  for (const id of Object.keys(TECHS)) expect(unlocks(id as TechId).length, id).toBeGreaterThan(0);
});
test('digest lines read as sentences', () => {
  expect(digestText({ kind: 'unitLost', unitType: 'warrior', by: 'horseman' })).toBe('Your Warrior was lost to a Horseman.');
  expect(digestText({ kind: 'unitHurt', unitType: 'warrior', damage: 4, by: null })).toBe('Your Warrior took 4 damage.');
  expect(digestText({ kind: 'cityLost' })).toBe('You lost a city.');
  expect(digestText({ kind: 'tileTaken', by: 'knight' })).toBe('The Knight moved into its place.');
  expect(digestText({ kind: 'treasureTaken' })).toBe('The enemy claimed a treasure.');
});
