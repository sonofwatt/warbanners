import { deepFreeze } from './freeze';
import type { HexKey } from '../hex';
import type { BuildingId, DeedId, HeroTraitId, Resource, RewardId, TechId, Terrain, TreasureOutcome, UnitTypeId } from '../types';
import type { TechTreeId } from './techs';

// Every number the rules file leaves to tuning. `as const` keeps the literal values;
// `satisfies` checks the shape. Water has no cover in the rules (it cannot be entered), so 0.
export const CONFIG = deepFreeze({
  mapRadius: 6,
  // rules 8: the tech tree in play (data/techs.ts). 'rules7' replays the four ladders of rules 7, their harvests that
  // cleared the resource, and maps without jewels or fish; only the provenance tests switch it.
  techTree: 'rules8' as TechTreeId,
  capitals: ['-2,5', '2,-5'],
  startGold: [10, 12],
  terrain: {
    field: { enterCost: 2, cover: 1 },
    forest: { enterCost: 4, cover: 1.25 },
    mountain: { enterCost: 0, cover: 1.5 },   // 0 means "all remaining, only as the first step of a unit that has not moved"
    water: { enterCost: null, cover: 0 },
  },
  roadCost: 1, relayCost: 1, wallsCover: 2, mountainSightBonus: 1,
  // rules 8: a ranged unit (range 2 or more) on a mountain has +rangeBonus range for its own attacks (never its
  // counter), and a shot at a target beyond its normal range does longShotScale of the damage, rounded, never below 1.
  // With endsTurn, a step onto or off a mountain ends the unit's turn, and a unit leaves a mountain only as the first
  // step of a move. rangeBonus 0 and endsTurn false replay rules 7; only the provenance tests turn them off.
  // tech: a unit steps onto a mountain (by a move or a kill advance) only once its owner has researched it; stepping
  // off needs none. null replays rules 7 (no tech needed).
  mountain: { rangeBonus: 1, longShotScale: 0.8, endsTurn: true, tech: 'prospecting' as TechId | null },
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
  citySightExtra: 0,                          // a city sees this many tiles beyond its territory radius (1 before rules 8)
  hiddenRevealRange: 1,                       // a unit or city reveals a hidden unit within this distance
  blindedReach: 1,                            // a blinded unit attacks no farther than this
  attacksPerTurn: { doubleStrike: 2, base: 1 },
  newCity: { level: 1, radius: 1, growth: 0 },
  capitalIncome: 1,
  capacityBase: 1,                            // unit capacity is level + capacityBase (+ rewards)
  growthBase: 1,                              // growth to leave level L is L + growthBase (+ faction extra)
  // rules 9: the faction's growthExtra counts only when leaving this level or a higher one, so every city needs
  // 1 + growthBase growth for its first level-up and the Spartan extra (-2 since rules 9's tuning) applies from level 2
  // on. 1 with the Spartan extra at -1 replays rules 8 (the extra on every level); only the provenance tests set it back.
  growthExtraFrom: 2,
  mapgen: {
    field: 50, forest: 72, mountain: 86,
    orchard: 20, cropland: 40, game: 30, ore: 40,
    // rules 8, cumulative after ore on the same roll: a mountain is ore below 40, jewels from 40 to below 55; water is
    // fish below 25. Placed only where the tree in play harvests them.
    jewels: 55, fish: 25,
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
  // rules 8, healAtTurnEnd: a unit hunkered when its owner ends the turn heals then (restHealAt, as it stands at that
  // moment) and not at the start of that owner's next turn. Off replays rules 7 (the heal waits for the next turn).
  // rules 8, drinkKeepsHunker: drinking a draught neither stops a unit from hunkering this turn nor ends its hunker.
  // Off replays rules 7 (a drink counted as acting for both).
  // rules 9, unhunker: the owner may end a unit's hunker on their turn (CONFIG.hunker.unhunker). Off replays rules 8
  // (no such action); only the provenance tests turn it off.
  hunker: { on: true, def: 1, restBonus: 1, abilityHealBonus: 1, besideEnemyShare: 0.5, healAtTurnEnd: true, drinkKeepsHunker: true, unhunker: true },
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
  rewardGold: 5, rewardScoutRadius: 3, rewardBorderRadius: 2, rewardCapacity: 2, rewardIncome: 1, rewardGrowth: 2,
  // The techs that open harvests, buildings, walls and roads are in the tree (data/techs.ts). rules 8: wild grain
  // (cropland), jewels and fish are harvested too.
  harvest: {
    orchard: { cost: 2, growth: 1 },
    game: { cost: 2, growth: 1 },
    cropland: { cost: 2, growth: 1 },
    jewels: { cost: 2, growth: 1 },
    fish: { cost: 2, growth: 1 },
  },
  // `on` is the terrain; the tree says which resources a building stands on. rules 8: an upgrade replaces the
  // improvement it upgrades on the same tile, for more gold and more growth (first numbers, to be tuned by sims).
  buildings: {
    farm: { cost: 5, growth: 2, on: 'field', upgrades: null, income: 0 },
    lumberCamp: { cost: 4, growth: 2, on: 'forest', upgrades: null, income: 0 },   // rules 7: cost 4 (was 3), growth 2 (was 1)
    mine: { cost: 5, growth: 2, on: 'mountain', upgrades: null, income: 0 },
    market: { cost: 6, growth: 3, on: 'field', upgrades: null, income: 2 },         // rules 9: growth 3 (2 in rules 7 and 8, 1 before)
    orchard: { cost: 5, growth: 2, on: 'field', upgrades: null, income: 0 },
    plantation: { cost: 7, growth: 3, on: 'field', upgrades: 'orchard', income: 0 },
    lumberMill: { cost: 6, growth: 3, on: 'forest', upgrades: 'lumberCamp', income: 0 },
    foundry: { cost: 7, growth: 3, on: 'mountain', upgrades: 'mine', income: 0 },
    granary: { cost: 7, growth: 3, on: 'field', upgrades: 'farm', income: 0 },
  },
  walls: { cost: 6 }, road: { cost: 1 },
  // rules 8, blockade: a city with enemy units on at least minTiles of the tiles next to it (seen or not, never its own
  // tile; minTiles 3 is David's, not a tuning lever) when its owner's turn starts loses cut of that turn's income,
  // rounded down.
  // A walled city loses cutWalls instead, and a city of a faction with blockadeStores whose owner holds the tree's
  // walls tech loses cutSpartanTech (the lowest rate that applies). Whatever the rate, a blockade costs at least minCut
  // gold (David's, fixed like minTiles), but never takes the city below floor. Off replays rules 7; only the
  // provenance tests turn it off.
  blockade: { on: true, minTiles: 3, cut: 0.5, cutWalls: 0.25, cutSpartanTech: 0.15, minCut: 1, floor: 1 },
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
  mapRadius: number; techTree: TechTreeId; capitals: readonly [HexKey, HexKey]; startGold: readonly [number, number];
  terrain: Record<Terrain, { enterCost: number | null; cover: number }>;
  roadCost: number; relayCost: number; wallsCover: number; mountainSightBonus: number;
  mountain: { rangeBonus: number; longShotScale: number; endsTurn: boolean; tech: TechId | null };
  closedFog: boolean; levelUpEndsChain: boolean; connectGrowth: number; capitalMoves: boolean;
  citySightExtra: number; hiddenRevealRange: number; blindedReach: number;
  attacksPerTurn: { doubleStrike: number; base: number };
  newCity: { level: number; radius: number; growth: number };
  capitalIncome: number; capacityBase: number; growthBase: number; growthExtraFrom: number;
  mapgen: Record<string, number>;
  techBase: readonly [number, number, number];
  counterFactor: number; steadfastFactor: number; damageScale: number; splashDivisor: number;
  restHeal: { home: number; neutral: number; enemy: number }; abilityHeal: number; hastenMp: number; phalanxMax: number; phalanxBonus: number; tauntRange: number; inspireAtk: number; dustStormRange: number;
  hunker: { on: boolean; def: number; restBonus: number; abilityHealBonus: number; besideEnemyShare: number; healAtTurnEnd: boolean; drinkKeepsHunker: boolean; unhunker: boolean };
  brace: { mates: number; def: number };
  momentum: { start: Partial<Record<UnitTypeId, number>>; price: Record<UnitTypeId, number>; bracedPrice: number };
  treasure: {
    gold: number; exploreRadius: number; unit: string; table: readonly TreasureOutcome[];
    mapRadius: number; mercenary: UnitTypeId; mercenaryTrait: HeroTraitId;
  };
  rewards: Record<2 | 3 | 4 | 5, readonly [RewardId, RewardId]>;
  rewardGold: number; rewardScoutRadius: number; rewardBorderRadius: number; rewardCapacity: number;
  rewardIncome: number; rewardGrowth: number;
  harvest: Record<Exclude<Resource, 'ore'>, { cost: number; growth: number }>;
  buildings: Record<BuildingId, { cost: number; growth: number; on: Terrain; upgrades: BuildingId | null; income: number }>;
  walls: { cost: number }; road: { cost: number };
  blockade: { on: boolean; minTiles: number; cut: number; cutWalls: number; cutSpartanTech: number; minCut: number; floor: number };
  heroes: {
    traitFor: Record<DeedId, HeroTraitId>; fightPerAttack: number; fightPerKill: number;
    thresholds: Record<DeedId, number>; agogeThresholds: Record<DeedId, number>; maxTraits: number; heroAt: number;
    fierceAtk: number; fierceHp: number; tirelessMove: number; hardyDef: number; watchfulSight: number;
    agilityCut: number; mythAtk: number; mythDef: number;
  };
});
