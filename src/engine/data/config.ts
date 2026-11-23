import { deepFreeze } from './freeze';
import type { HexKey } from '../hex';
import type { BuildingId, DeedId, HeroTraitId, Resource, RewardId, TechId, Terrain, TreasureOutcome, UnitTypeId } from '../types';

// Every number the rules file leaves to tuning. `as const` keeps the literal values;
// `satisfies` checks the shape. Water has no cover in the rules (it cannot be entered), so 0.
export const CONFIG = deepFreeze({
  mapRadius: 6,
  capitals: ['-2,5', '2,-5'],
  startGold: [10, 12],
  terrain: {
    field: { enterCost: 2, cover: 1 },
    forest: { enterCost: 4, cover: 1.25 },
    mountain: { enterCost: 0, cover: 1.5 },   // 0 means "all remaining, only as the first step of a unit that has not moved"
    water: { enterCost: null, cover: 0 },
  },
  roadCost: 1, relayCost: 1, wallsCover: 2, mountainSightBonus: 1,
  // rules 6: no move passes through a tile its owner had not explored when the move began, and only a pathfinder
  // (the Spartan Scout) may end a move on one, which ends its turn. Off replays rules 3 to 5 (any unit could end a move
  // on one unexplored tile, and a mounted Mongol kept its movement after it); only the provenance test turns it off.
  closedFog: true,
  // rules 7: the first time a city is joined to its owner's capital by roads and own cities, it and the capital each
  // gain this much growth. 0 replays rules 6; only the provenance tests turn it off.
  connectGrowth: 1,
  // rules 7: a captured capital becomes an ordinary city for its captor, and the loser's best remaining city becomes
  // their capital at once. Off replays rules 6 (a captured capital stayed one); only the provenance tests turn it off.
  capitalMoves: true,
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
  // rules 6: a chain unit that earns a hero trait from its own attack gets no extra attack from that kill.
  levelUpEndsChain: true,
  restHeal: { home: 4, neutral: 2, enemy: 1 }, abilityHeal: 4, hastenMp: 2, phalanxMax: 2, phalanxBonus: 1, tauntRange: 2, inspireAtk: 1, dustStormRange: 2,
  // rules 7, Hunker: +def when attacked (before cover), +restBonus to a resting heal, +abilityHealBonus to a Heal. Beside a
  // seen enemy a hunkered unit still heals the regular resting heal times besideEnemyShare, rounded up. Off removes the
  // action; only the provenance tests turn it off.
  hunker: { on: true, def: 1, restBonus: 1, abilityHealBonus: 1, besideEnemyShare: 0.5 },
  // rules 7, phalanx brace: a phalanx unit with at least `mates` friendly phalanx units beside it is braced. Against a
  // chain attacker it has +def defence (before cover), and it costs the momentum bracedPrice in place of its own price.
  brace: { mates: 2, def: 2 },
  // rules 7, momentum (replaces the rules 5 chain health cost): a chain unit starts each of its owner's turns with
  // start[type]. A kill costs the dead unit's price; a paid kill gives one more attack. An attack whose price is more
  // than the momentum left does 1 less damage per missing point (never below 1), gives no extra attack and sets the
  // momentum to 0. Draft prices (docs/superpowers/plans/2026-11-23-momentum.md).
  momentum: {
    start: { knight: 7, khansGuard: 8 } as Partial<Record<UnitTypeId, number>>,
    price: {
      scout: 0,
      warrior: 1, archer: 1, horseman: 1, spearman: 1, catapult: 1, piper: 1, skyCaller: 1,
      hoplite: 2, swordsman: 2, horseArcher: 2, knight: 2, sellsword: 2, camp: 2,
      defender: 3, kingsGuard: 3, khansGuard: 3,
    },
    bracedPrice: 4,
  },
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
    lumberCamp: { tech: 'forestry', cost: 4, growth: 2, on: 'forest', resource: null, income: 0 },   // rules 7: cost 4 (was 3), growth 2 (was 1)
    mine: { tech: 'bronze', cost: 5, growth: 2, on: 'mountain', resource: 'ore', income: 0 },
    market: { tech: 'markets', cost: 6, growth: 2, on: 'field', resource: null, income: 2 },         // rules 7: growth 2 (was 1)
  },
  walls: { tech: 'shieldwork', cost: 6 }, road: { tech: 'roads', cost: 1 },
  // Stage 2 (docs/rules/stage2-rules.md). Thresholds tuned by simulated matches in plan 5 Task 8
  // (docs/superpowers/plans/2026-11-20-plan-5-tuning-log.md); the trait sizes are the first draft, kept.
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
  closedFog: boolean; levelUpEndsChain: boolean; connectGrowth: number; capitalMoves: boolean;
  citySightExtra: number; hiddenRevealRange: number; blindedReach: number;
  attacksPerTurn: { doubleStrike: number; base: number };
  newCity: { level: number; radius: number; growth: number };
  capitalIncome: number; capacityBase: number; growthBase: number;
  mapgen: Record<string, number>;
  techBase: readonly [number, number, number];
  counterFactor: number; steadfastFactor: number; damageScale: number; splashDivisor: number;
  restHeal: { home: number; neutral: number; enemy: number }; abilityHeal: number; hastenMp: number; phalanxMax: number; phalanxBonus: number; tauntRange: number; inspireAtk: number; dustStormRange: number;
  hunker: { on: boolean; def: number; restBonus: number; abilityHealBonus: number; besideEnemyShare: number };
  brace: { mates: number; def: number };
  momentum: { start: Partial<Record<UnitTypeId, number>>; price: Record<UnitTypeId, number>; bracedPrice: number };
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
