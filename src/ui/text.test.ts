import { expect, test } from 'vitest';
import { CONFIG, DEEDS, FACTIONS, HERO_TRAITS, TECHS, UNITS } from '../engine';
import type { BuildingId, ItemId, TreasureOutcome, FactionId, TechId, UnitTypeId } from '../engine';
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

test('every hero trait, deed, item and treasure outcome has text, and blurbs carry the CONFIG numbers', () => {
  const H = CONFIG.heroes;
  for (const t of HERO_TRAITS) { expect(T.heroTrait[t].name).toBeTruthy(); expect(T.heroTrait[t].blurb.length).toBeGreaterThan(10); }
  for (const d of DEEDS) expect(T.deed[d]).toBeTruthy();
  for (const i of ['draught'] as ItemId[]) { expect(T.item[i].name).toBeTruthy(); expect(T.item[i].blurb.length).toBeGreaterThan(10); }
  for (const o of CONFIG.treasure.table) expect(T.treasure[o as TreasureOutcome], o).toBeTruthy();
  expect(T.heroTrait.fierce.blurb).toContain(`+${H.fierceAtk} attack and +${H.fierceHp} health`);
  expect(T.heroTrait.tireless.blurb).toContain(`+${H.tirelessMove} movement`);
  expect(T.heroTrait.hardy.blurb).toContain(`+${H.hardyDef} defence`);
  expect(T.heroTrait.watchful.blurb).toContain(`Sees ${H.watchfulSight} tile farther and takes ${H.agilityCut} less damage`);
  expect(T.ui.mythTouchBlurb).toContain(`+${H.mythAtk} attack and +${H.mythDef} defence`);
});
test('the sellsword blurb names its trait through the text table', () => {
  expect(T.unit.sellsword.blurb).toContain(T.heroTrait[CONFIG.treasure.mercenaryTrait].name);
});
test('hero digest lines read as sentences', () => {
  expect(digestText({ kind: 'traitEarned', unitType: 'warrior', trait: 'hardy' })).toBe('Your Warrior earned Hardy.');
  expect(digestText({ kind: 'heroMade', unitType: 'warrior' })).toBe('Your Warrior is now a hero.');
});
