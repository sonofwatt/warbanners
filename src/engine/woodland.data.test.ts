import { describe, expect, it } from 'vitest';
import { CONFIG, FACTIONS, RULES_VERSION, UNITS, factionUnits, type UnitTypeId } from './index';
import { TECH_TREES } from './data/techs';

describe('Woodland Nations data (rules 11)', () => {
  it('is rules 11', () => {
    expect(RULES_VERSION).toBe(11);
  });
  it('the Woodland units have the spec numbers', () => {
    expect(UNITS.skirmisher).toMatchObject({ atk: 5, def: 2, range: 1, move: 1, hp: 10, sight: 2, cost: 3, faction: 'woodland' });
    expect(UNITS.skirmisher.traits).toEqual(['bow', 'agile', 'ambush', 'dashStrike']);
    expect(UNITS.woodlandHunter).toMatchObject({ atk: 4, def: 2, range: 2, move: 1, hp: 10, sight: 2, cost: 4 });
    expect(UNITS.woodlandHunter.traits).toEqual(['ambush', 'forestEye', 'noMountainRange']);
    expect(UNITS.warChief).toMatchObject({ atk: 6, def: 5, range: 1, move: 1, hp: 20, sight: 2, cost: null });
    expect(UNITS.warChief.traits).toEqual(['ambush', 'doubleStrike']);
    expect(UNITS.smokeKeeper).toMatchObject({ atk: 2, def: 2, range: 1, move: 1, hp: 10, sight: 2, cost: null });
    expect(UNITS.smokeKeeper.traits).toEqual(['heal', 'guide', 'smoke']);
    expect(UNITS.trapper).toMatchObject({ atk: 2, def: 2, range: 1, move: 1, hp: 10, sight: 1, cost: 2 });
    expect(UNITS.trapper.traits).toEqual(['snare']);
  });
  it('momentum prices', () => {
    expect(['skirmisher', 'woodlandHunter', 'smokeKeeper', 'trapper'].map((t) => CONFIG.momentum.price[t as UnitTypeId])).toEqual([1, 1, 1, 1]);
    expect(CONFIG.momentum.price.warChief).toBe(3);
  });
  it('the config numbers', () => {
    expect(CONFIG.woodland).toEqual({ bowAtk: 4, bowShare: 0.7, dashArrowShare: 0.33, dashCounterShare: 0.33, ambushAtk: 1,
      forestEyeRange: 1, snareDamage: 3, snareMax: 3, smokeRange: 2, veilTurns: 2 });
  });
  it('the faction', () => {
    expect(FACTIONS.woodland).toMatchObject({ startUnit: 'skirmisher', extraStartUnit: 'trapper', champion: 'warChief',
      support: 'smokeKeeper', cityCover: 1.5, canBuildWalls: true, growthExtra: 0, capitalStartLevel: 1, canBuildRoads: true,
      forestStride: true, forestHidden: true, harvestGold: 3, buildingGrowthCut: 1, championFromLevel: 4,
      replaces: { warrior: 'skirmisher', archer: 'woodlandHunter' } });
    expect(FACTIONS.spartans).toMatchObject({ forestStride: false, forestHidden: false, harvestGold: 0, buildingGrowthCut: 0,
      championFromLevel: 5, replaces: {}, extraStartUnit: null });
    expect(FACTIONS.mongols).toMatchObject({ forestStride: false, forestHidden: false, harvestGold: 0, buildingGrowthCut: 0,
      championFromLevel: 5, replaces: {}, extraStartUnit: null });
    expect(TECH_TREES.rules8.start.woodland).toBe('trapping');
    expect(TECH_TREES.rules8.units).toMatchObject({ woodlandHunter: 'archery', trapper: 'trapping' });
  });
  it('Woodland trains neither the Warrior nor the Archer; the others lose nothing', () => {
    expect(factionUnits('woodland')).not.toContain('warrior');
    expect(factionUnits('woodland')).not.toContain('archer');
    expect(factionUnits('woodland')).toEqual(expect.arrayContaining(['skirmisher', 'woodlandHunter', 'trapper', 'spearman', 'catapult']));
    expect(factionUnits('spartans')).toEqual(expect.arrayContaining(['warrior', 'archer', 'hoplite']));
  });
});
