import { expect, test } from 'vitest';
import { BRANCHES, CONFIG, DEEDS, FACTIONS, HERO_TRAITS, TECHS, UNITS } from '../engine';
import type { BuildingId, ItemId, TreasureOutcome, FactionId, TechId, UnitTypeId } from '../engine';
import { digestText, reasonText, T, unlocks } from './text';

test('every id the engine knows has a name', () => {
  for (const id of Object.keys(UNITS)) { expect(T.unit[id as UnitTypeId].name).toBeTruthy(); expect(T.unit[id as UnitTypeId].blurb.length).toBeGreaterThan(10); }
  for (const id of Object.keys(TECHS)) expect(T.tech[id as TechId]).toBeTruthy();
  for (const id of Object.keys(CONFIG.buildings)) expect(T.building[id as BuildingId]).toBeTruthy();
  for (const id of BRANCHES) expect(T.branch[id]).toBeTruthy();
  for (const id of Object.keys(T.resource)) expect(T.harvestVerb[id as keyof typeof T.harvestVerb]).toBeTruthy();
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
  expect(unlocks('riding')).toEqual(expect.arrayContaining(['Horseman', 'Horse Archer', 'Camp', T.ui.road]));
  expect(unlocks('spears')).toEqual(expect.arrayContaining(['Spearman', 'Hoplite']));
  expect(unlocks('mining')).toEqual([T.building.mine]);
  expect(unlocks('defence')).toEqual(['Defender']);
  expect(unlocks('walls')).toEqual([T.ui.walls]);
  expect(unlocks('granary')).toEqual([T.building.market, T.building.granary]);
  expect(unlocks('foraging')).toEqual([T.harvestVerb.orchard]);
  expect(unlocks('prospecting')).toEqual([T.harvestVerb.jewels, T.ui.climbMountains]);
  expect(unlocks('fishing')).toEqual([T.harvestVerb.fish]);
  for (const id of Object.keys(TECHS)) expect(unlocks(id as TechId).length, id).toBeGreaterThan(0);
  // rules 8: Riding opens the Camp and no road for the Mongols, the road and no Camp for the Spartans; Walls opens
  // nothing for the Spartans (they build none), so only that one is empty
  expect(unlocks('riding', 'mongols')).toEqual(['Horseman', 'Horse Archer', 'Camp']);
  expect(unlocks('riding', 'spartans')).toEqual(['Horseman', T.ui.road]);
  expect(unlocks('walls', 'spartans')).toEqual([]);
  for (const f of ['spartans', 'mongols'] as const) {
    for (const id of Object.keys(TECHS)) if (!(f === 'spartans' && id === 'walls')) expect(unlocks(id as TechId, f).length, `${f} ${id}`).toBeGreaterThan(0);
  }
  // rules 8: the climbing tech says it lets units climb, and the mountain tile says which tech that is
  const climb = CONFIG.mountain.tech!;
  expect(unlocks(climb)).toContain(T.ui.climbMountains);
  for (const id of Object.keys(TECHS)) if (id !== climb) expect(unlocks(id as TechId)).not.toContain(T.ui.climbMountains);
  expect(T.ui.mountainBlurb).toContain(T.tech[climb]);
});
test('digest lines read as sentences', () => {
  expect(digestText({ at: '0,0', kind: 'unitLost', unitType: 'warrior', by: 'horseman' })).toBe('Your Warrior was lost to a Horseman.');
  expect(digestText({ at: '0,0', kind: 'unitHurt', unitType: 'warrior', damage: 4, by: null })).toBe('Your Warrior took 4 damage.');
  expect(digestText({ at: '0,0', kind: 'cityLost' })).toBe('You lost a city.');
  expect(digestText({ at: '0,0', kind: 'tileTaken', by: 'knight' })).toBe('The Knight moved into its place.');
  expect(digestText({ at: '0,0', kind: 'treasureTaken' })).toBe('The enemy claimed a treasure.');
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
  expect(digestText({ at: '0,0', kind: 'traitEarned', unitType: 'warrior', trait: 'hardy' })).toBe('Your Warrior earned Hardy.');
  expect(digestText({ at: '0,0', kind: 'heroMade', unitType: 'warrior' })).toBe('Your Warrior is now a hero.');
});

test('rules 8: the mountain text names every ranged type from the unit data and takes its numbers from CONFIG', () => {
  const ranged = (Object.keys(UNITS) as UnitTypeId[]).filter((t) => UNITS[t].range >= 2);
  expect(ranged.length).toBeGreaterThan(0);
  for (const t of ranged) expect(T.ui.mountainBlurb).toContain(T.unit[t].name);
  expect(T.ui.mountainBlurb).toContain(`${Math.round(CONFIG.mountain.longShotScale * 100)}% of the damage`);
  for (const t of (Object.keys(UNITS) as UnitTypeId[]).filter((x) => UNITS[x].range < 2)) expect(T.ui.mountainBlurb).not.toContain(`${T.unit[t].name},`);
});
test('rules 8 additions: whatsNew names the climbing tech, the Scout, Mongol riding and the hunker heal', () => {
  expect(T.ui.whatsNew).toContain(T.tech[CONFIG.mountain.tech!]);
  expect(T.ui.whatsNew).toContain(`${T.unit.scout.name} sees ${UNITS.scout.sight} tiles`);
  expect(T.ui.whatsNew).toContain('build no roads');
  expect(T.ui.whatsNew).toContain('heals at the end of its turn');
  expect(T.unit.scout.blurb).not.toContain('fog');
});
test('rules 8: whatsNew is two sentences and names the new tree from the data', () => {
  expect(T.ui.whatsNew.match(/[.!?](\s|$)/g)).toHaveLength(2);
  expect(T.ui.whatsNew).toContain(`${BRANCHES.length} branches`);
  expect(T.ui.whatsNew).toContain(`${CONFIG.mountain.rangeBonus} tile`);
  for (const r of ['jewels', 'fish'] as const) expect(T.ui.whatsNew).toContain(T.resource[r].toLowerCase());
});
