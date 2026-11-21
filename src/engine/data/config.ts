import { deepFreeze } from './freeze';
import type { HexKey } from '../hex';
import type { BuildingId, DeedId, HeroTraitId, Resource, RewardId, TechId, Terrain, TreasureOutcome, UnitTypeId } from '../types';

// Every number the rules file leaves to tuning. `as const` keeps the literal values;
// `satisfies` checks the shape. Water has no cover in the rules (it cannot be entered), so 0.
export const CONFIG = deepFreeze({
  mapRadius: 6,
  capitals: ['-2,5', '2,-5'],
  startGold: [10, 10],
  terrain: {
    field: { enterCost: 2, cover: 1 },
    forest: { enterCost: 4, cover: 1.25 },
    mountain: { enterCost: 0, cover: 1.5 },   // 0 means "all remaining, only as the first step of a unit that has not moved"
    water: { enterCost: null, cover: 0 },
  },
  roadCost: 1, relayCost: 1, wallsCover: 2, mountainSightBonus: 1,
  citySightExtra: 1,                          // a city sees this many tiles beyond its territory radius
  hiddenRevealRange: 1,                       // a unit or city reveals a hidden unit within this distance
  blindedReach: 1,                            // a blinded unit attacks no farther than this
  attacksPerTurn: { doubleStrike: 2, base: 1 },
  newCity: { level: 1, radius: 1, growth: 0 },
  capitalIncome: 1,
  capacityBase: 1,                            // unit capacity is level + capacityBase (+ rewards)
  growthBase: 1,                              // growth to leave level L is L + growthBase (+ faction extra)
  mapgen: {
    field: 50, forest: 72, mountain: 86,
    orchard: 20, cropland: 40, game: 30, ore: 40,
    villagesPerHalf: 3, treasuresPerHalf: 2, maxAttempts: 50,
    rollRange: 100, villageMinDistance: 3, treasureMinCapitalDistance: 3, treasureMinFeatureDistance: 2,
  },
  techBase: [4, 6, 8],
  counterFactor: 0.75, steadfastFactor: 1.25, damageScale: 2.5, splashDivisor: 2,
  restHeal: { home: 4, neutral: 2, enemy: 1 }, abilityHeal: 4, hastenMp: 2, phalanxMax: 2, phalanxBonus: 1, tauntRange: 2, inspireAtk: 1, dustStormRange: 2,
  treasure: {
    gold: 5, exploreRadius: 4, unit: 'warrior',
    table: ['gold', 'explore', 'unit', 'relic', 'draught', 'map', 'mercenary'],
    mapRadius: 1, mercenary: 'sellsword', mercenaryTrait: 'tireless',
  },
  rewards: {
    2: ['gold', 'scout'],
    3: ['borders', 'barracks'],
    4: ['income', 'growth'],
    5: ['champion', 'support'],
  },
  rewardGold: 6, rewardScoutRadius: 3, rewardBorderRadius: 2, rewardCapacity: 2, rewardIncome: 1, rewardGrowth: 2,
  harvest: {
    orchard: { tech: 'foraging', cost: 2, growth: 1 },
    game: { tech: 'hunting', cost: 2, growth: 1 },
  },
  buildings: {
    farm: { tech: 'farming', cost: 5, growth: 2, on: 'field', resource: 'cropland', income: 0 },
    lumberCamp: { tech: 'forestry', cost: 3, growth: 1, on: 'forest', resource: null, income: 0 },
    mine: { tech: 'bronze', cost: 5, growth: 2, on: 'mountain', resource: 'ore', income: 0 },
    market: { tech: 'markets', cost: 6, growth: 1, on: 'field', resource: null, income: 2 },
  },
  walls: { tech: 'shieldwork', cost: 6 }, road: { tech: 'roads', cost: 1 },
  // Stage 2 (docs/rules/stage2-rules.md): first-draft numbers, tuned in plan 5 Task 8.
  heroes: {
    traitFor: { fight: 'fierce', march: 'tireless', survive: 'hardy', rest: 'watchful' },
    fightPerAttack: 1, fightPerKill: 2,
    thresholds: { fight: 14, march: 50, survive: 10, rest: 8 },
    agogeThresholds: { fight: 10, march: 20, survive: 9, rest: 6 },
    maxTraits: 3, heroAt: 2,
    fierceAtk: 1, fierceHp: 2, tirelessMove: 1, hardyDef: 1, watchfulSight: 1, agilityCut: 1, mythAtk: 1, mythDef: 1,
  },
} as const satisfies {
  mapRadius: number; capitals: readonly [HexKey, HexKey]; startGold: readonly [number, number];
  terrain: Record<Terrain, { enterCost: number | null; cover: number }>;
  roadCost: number; relayCost: number; wallsCover: number; mountainSightBonus: number;
  citySightExtra: number; hiddenRevealRange: number; blindedReach: number;
  attacksPerTurn: { doubleStrike: number; base: number };
  newCity: { level: number; radius: number; growth: number };
  capitalIncome: number; capacityBase: number; growthBase: number;
  mapgen: Record<string, number>;
  techBase: readonly [number, number, number];
  counterFactor: number; steadfastFactor: number; damageScale: number; splashDivisor: number;
  restHeal: { home: number; neutral: number; enemy: number }; abilityHeal: number; hastenMp: number; phalanxMax: number; phalanxBonus: number; tauntRange: number; inspireAtk: number; dustStormRange: number;
  treasure: {
    gold: number; exploreRadius: number; unit: string; table: readonly TreasureOutcome[];
    mapRadius: number; mercenary: UnitTypeId; mercenaryTrait: HeroTraitId;
  };
  rewards: Record<2 | 3 | 4 | 5, readonly [RewardId, RewardId]>;
  rewardGold: number; rewardScoutRadius: number; rewardBorderRadius: number; rewardCapacity: number;
  rewardIncome: number; rewardGrowth: number;
  harvest: Record<'orchard' | 'game', { tech: TechId; cost: number; growth: number }>;
  buildings: Record<BuildingId, { tech: TechId; cost: number; growth: number; on: Terrain; resource: Resource | null; income: number }>;
  walls: { tech: 'shieldwork'; cost: number }; road: { tech: 'roads'; cost: number };
  heroes: {
    traitFor: Record<DeedId, HeroTraitId>; fightPerAttack: number; fightPerKill: number;
    thresholds: Record<DeedId, number>; agogeThresholds: Record<DeedId, number>; maxTraits: number; heroAt: number;
    fierceAtk: number; fierceHp: number; tirelessMove: number; hardyDef: number; watchfulSight: number;
    agilityCut: number; mythAtk: number; mythDef: number;
  };
});
