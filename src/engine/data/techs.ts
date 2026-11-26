import { CONFIG } from './config';
import { deepFreeze } from './freeze';
import type { BuildingId, FactionId, Resource, TechId, UnitTypeId } from '../types';

// The tech screen's branches, in the order it shows them.
export type BranchId = 'orchards' | 'hunting' | 'mountains' | 'plains' | 'waters';
export const BRANCHES: readonly BranchId[] = ['orchards', 'hunting', 'mountains', 'plains', 'waters'];

// tier is the column (1 to 3). row: in rules 8 a column 1 tech splits into a top row (units) and a bottom row (tile
// improvements); null for a column 1 tech and for every tech of the rules 7 ladders.
export interface TechDef { tier: 1 | 2 | 3; requires: TechId | null; branch: BranchId; row: 'top' | 'bottom' | null }

// Everything a tech opens, by tree. A unit, harvest or building the tree does not name needs no tech (units) or does
// not exist in that tree (harvests and buildings). `on` lists the resources a building stands on (null: a tile with
// none); an upgrade (CONFIG.buildings[b].upgrades) stands on its improvement instead and lists none.
export interface TreeDef {
  techs: Partial<Record<TechId, TechDef>>;          // in the order the tech screen and legalActions list them
  start: Record<FactionId, TechId>;
  units: Partial<Record<UnitTypeId, TechId>>;
  harvest: Partial<Record<Resource, TechId>>;
  buildings: Partial<Record<BuildingId, { tech: TechId; on: readonly (Resource | null)[] }>>;
  walls: TechId; road: TechId;
  // rules 8: a harvest marks the tile harvested and keeps its resource for building on (rules 7 cleared it)
  harvestKeepsTile: boolean;
}

export type TechTreeId = 'rules7' | 'rules8';

export const TECH_TREES: Record<TechTreeId, TreeDef> = deepFreeze({
  // rules 7: four branches, each a ladder of three tiers
  rules7: {
    techs: {
      foraging: { tier: 1, requires: null, branch: 'orchards', row: null },
      farming: { tier: 2, requires: 'foraging', branch: 'orchards', row: null },
      markets: { tier: 3, requires: 'farming', branch: 'orchards', row: null },
      riding: { tier: 1, requires: null, branch: 'plains', row: null },
      roads: { tier: 2, requires: 'riding', branch: 'plains', row: null },
      chivalry: { tier: 3, requires: 'roads', branch: 'plains', row: null },
      hunting: { tier: 1, requires: null, branch: 'hunting', row: null },
      forestry: { tier: 2, requires: 'hunting', branch: 'hunting', row: null },
      engineering: { tier: 3, requires: 'forestry', branch: 'hunting', row: null },
      bronze: { tier: 1, requires: null, branch: 'mountains', row: null },
      shieldwork: { tier: 2, requires: 'bronze', branch: 'mountains', row: null },
      smithing: { tier: 3, requires: 'shieldwork', branch: 'mountains', row: null },
    },
    start: { spartans: 'bronze', mongols: 'riding' },
    units: {
      spearman: 'bronze', swordsman: 'smithing', defender: 'shieldwork', archer: 'hunting', horseman: 'riding',
      knight: 'chivalry', catapult: 'engineering', hoplite: 'bronze', horseArcher: 'riding', camp: 'roads',
    },
    harvest: { orchard: 'foraging', game: 'hunting' },
    buildings: {
      farm: { tech: 'farming', on: ['cropland'] },
      lumberCamp: { tech: 'forestry', on: [null] },
      mine: { tech: 'bronze', on: ['ore'] },
      market: { tech: 'markets', on: [null] },
    },
    walls: 'shieldwork', road: 'roads',
    harvestKeepsTile: false,
  },
  // rules 8: five branches. Column 1 is a simple resource; it splits into a unit row (top) and an improvement row
  // (bottom), each one more tech long. A column 3 tech needs only its own column 2 tech.
  rules8: {
    techs: {
      foraging: { tier: 1, requires: null, branch: 'orchards', row: null },
      defence: { tier: 2, requires: 'foraging', branch: 'orchards', row: 'top' },
      walls: { tier: 3, requires: 'defence', branch: 'orchards', row: 'top' },
      orchards: { tier: 2, requires: 'foraging', branch: 'orchards', row: 'bottom' },
      plantations: { tier: 3, requires: 'orchards', branch: 'orchards', row: 'bottom' },
      trapping: { tier: 1, requires: null, branch: 'hunting', row: null },
      archery: { tier: 2, requires: 'trapping', branch: 'hunting', row: 'top' },
      siege: { tier: 3, requires: 'archery', branch: 'hunting', row: 'top' },
      logging: { tier: 2, requires: 'trapping', branch: 'hunting', row: 'bottom' },
      milling: { tier: 3, requires: 'logging', branch: 'hunting', row: 'bottom' },
      prospecting: { tier: 1, requires: null, branch: 'mountains', row: null },
      spears: { tier: 2, requires: 'prospecting', branch: 'mountains', row: 'top' },
      smithing: { tier: 3, requires: 'spears', branch: 'mountains', row: 'top' },
      mining: { tier: 2, requires: 'prospecting', branch: 'mountains', row: 'bottom' },
      foundry: { tier: 3, requires: 'mining', branch: 'mountains', row: 'bottom' },
      gathering: { tier: 1, requires: null, branch: 'plains', row: null },
      riding: { tier: 2, requires: 'gathering', branch: 'plains', row: 'top' },
      chivalry: { tier: 3, requires: 'riding', branch: 'plains', row: 'top' },
      farming: { tier: 2, requires: 'gathering', branch: 'plains', row: 'bottom' },
      granary: { tier: 3, requires: 'farming', branch: 'plains', row: 'bottom' },
      fishing: { tier: 1, requires: null, branch: 'waters', row: null },
    },
    start: { spartans: 'prospecting', mongols: 'gathering' },
    units: {
      defender: 'defence', archer: 'archery', catapult: 'siege', spearman: 'spears', hoplite: 'spears',
      swordsman: 'smithing', horseman: 'riding', horseArcher: 'riding', camp: 'riding', knight: 'chivalry',
    },
    harvest: { orchard: 'foraging', game: 'trapping', jewels: 'prospecting', cropland: 'gathering', fish: 'fishing' },
    buildings: {
      farm: { tech: 'farming', on: ['cropland'] },
      lumberCamp: { tech: 'logging', on: [null, 'game'] },
      mine: { tech: 'mining', on: ['ore'] },
      market: { tech: 'granary', on: [null] },
      orchard: { tech: 'orchards', on: ['orchard'] },
      plantation: { tech: 'plantations', on: [] },
      lumberMill: { tech: 'milling', on: [] },
      foundry: { tech: 'foundry', on: [] },
      granary: { tech: 'granary', on: [] },
    },
    walls: 'walls', road: 'riding',
    harvestKeepsTile: true,
  },
});

// The tree in play (CONFIG.techTree). Only the provenance tests switch it to rules 7.
export const TECH_TREE: TreeDef = TECH_TREES[CONFIG.techTree];
export const TECHS: Partial<Record<TechId, TechDef>> = TECH_TREE.techs;
