import type { HexKey } from './hex';
export const RULES_VERSION = 4;
export type PlayerId = number;
export type FactionId = 'spartans' | 'mongols';
export type Terrain = 'field' | 'forest' | 'mountain' | 'water';
export type Resource = 'orchard' | 'cropland' | 'game' | 'ore';
export type BuildingId = 'farm' | 'lumberCamp' | 'mine' | 'market';
export type TechId = 'foraging' | 'farming' | 'markets' | 'riding' | 'roads' | 'chivalry'
  | 'hunting' | 'forestry' | 'engineering' | 'bronze' | 'shieldwork' | 'smithing';
export type UnitTypeId = 'warrior' | 'spearman' | 'swordsman' | 'defender' | 'archer' | 'horseman'
  | 'knight' | 'catapult' | 'hoplite' | 'kingsGuard' | 'piper' | 'scout'
  | 'horseArcher' | 'khansGuard' | 'skyCaller' | 'camp' | 'sellsword';
export type Trait = 'steadfast' | 'doubleStrike' | 'retreat' | 'chain' | 'splash' | 'siege' | 'mounted'
  | 'phalanx' | 'unbowed' | 'hidden' | 'noCityCapture' | 'steady' | 'inspire' | 'camp' | 'heal' | 'taunt' | 'hasten' | 'dustStorm';
export type AbilityId = 'heal' | 'taunt' | 'hasten' | 'dustStorm';
// Every ability, in the order legalActions lists them.
export const ABILITIES: readonly AbilityId[] = ['heal', 'taunt', 'hasten', 'dustStorm'];
// Stage 2: what a unit does with its life (deeds) and the trait each deed earns.
export type DeedId = 'fight' | 'march' | 'survive' | 'rest';
export const DEEDS: readonly DeedId[] = ['fight', 'march', 'survive', 'rest'];
export type HeroTraitId = 'fierce' | 'tireless' | 'hardy' | 'watchful';
export const HERO_TRAITS: readonly HeroTraitId[] = ['fierce', 'tireless', 'hardy', 'watchful'];
export type Deeds = Record<DeedId, number>;
export type ItemId = 'draught';
// What a treasure claim can give, in the order of CONFIG.treasure.table.
export type TreasureOutcome = 'gold' | 'explore' | 'unit' | 'relic' | 'draught' | 'map' | 'mercenary';
export type RewardId = 'gold' | 'scout' | 'borders' | 'barracks' | 'income' | 'growth' | 'champion' | 'support';

export interface Tile {
  terrain: Terrain; resource: Resource | null; building: BuildingId | null;
  road: boolean; village: boolean; treasure: boolean;
  cityId: number | null;                 // the city whose territory this tile is in
}
export interface City {
  id: number; pos: HexKey; owner: PlayerId; capital: boolean;
  level: number; growth: number; radius: number; walls: boolean; market: boolean;
  incomeBonus: number; capacityBonus: number;
  pendingRewards: number[];              // levels awaiting a choice, oldest first
}
export interface Unit {
  id: number; type: UnitTypeId; owner: PlayerId; pos: HexKey; hp: number;
  mp: number;                            // half-points of movement left this turn
  attacks: number;                       // attacks or abilities left this turn
  home: number | null;                   // city whose capacity it uses
  enteredTurn: number;                   // value of MatchState.stamp when it entered its tile
  moved: boolean; acted: boolean;        // this turn
  rested: boolean;                       // did nothing on its owner's previous turn
  taunted: boolean; blinded: boolean;
  lure: { target: number; from: HexKey } | null;
  fresh: boolean;                        // spawned this turn; cleared when its owner's next turn starts
  deeds: Deeds;                          // running totals, never reset; private to the owner (playerView zeroes the rest)
  heroTraits: HeroTraitId[];             // in the order earned; public
  item: ItemId | null;                   // a carried one-use item; public
  itemTurn: number | null;               // stamp of the turn it found or drank its item or spent its whole turn capturing or claiming (a draught waits for a later turn; a drink holds one attack back from abilities); public
}
export interface Player {
  id: PlayerId; faction: FactionId; gold: number; techs: TechId[];
  explored: HexKey[];                    // kept sorted
  alive: boolean; turnsTaken: number;
}
export interface MatchState {
  rulesVersion: number; seed: number; rng: number; radius: number;
  tiles: Record<HexKey, Tile>; cities: City[]; units: Unit[]; players: Player[];
  current: PlayerId;
  stamp: number;                         // +1 at every endTurn
  nextUnitId: number; nextCityId: number;
  winner: PlayerId | null;
}
export interface MatchSettings { seed: number; factions: [FactionId, FactionId]; }

export type Action =
  | { type: 'move'; unit: number; to: HexKey }
  | { type: 'attack'; unit: number; target: HexKey; lure?: boolean }
  | { type: 'ability'; unit: number; ability: AbilityId; target: HexKey }
  | { type: 'capture'; unit: number }
  | { type: 'claimTreasure'; unit: number }
  | { type: 'useItem'; unit: number }
  | { type: 'train'; city: number; unitType: UnitTypeId }
  | { type: 'campTrain'; unit: number; unitType: UnitTypeId; to: HexKey }
  | { type: 'harvest'; at: HexKey }
  | { type: 'build'; at: HexKey; building: BuildingId }
  | { type: 'buildWalls'; city: number }
  | { type: 'road'; at: HexKey }
  | { type: 'research'; tech: TechId }
  | { type: 'chooseReward'; city: number; choice: 0 | 1 }
  | { type: 'endTurn' }
  | { type: 'resign'; player?: PlayerId };

export type GameEvent =
  | { type: 'moved'; unit: number; from: HexKey; to: HexKey }
  | { type: 'attacked'; unit: number; target: number; damage: number; counter: number }
  | { type: 'splashed'; target: number; damage: number }
  | { type: 'died'; unit: number }
  | { type: 'advanced'; unit: number; from: HexKey; to: HexKey }   // a melee killer steps into the tile
  | { type: 'lured'; unit: number; from: HexKey; to: HexKey }
  | { type: 'ability'; unit: number; ability: AbilityId; target: HexKey }
  | { type: 'trained'; unit: number; at: HexKey }
  | { type: 'captured'; city: number; by: PlayerId }
  // trait: the relic's gift; found: the treasure a map shows; unit: the id of a spawned Warrior or Sellsword
  | { type: 'treasure'; at: HexKey; outcome: TreasureOutcome; trait?: HeroTraitId; found?: HexKey; unit?: number }
  | { type: 'usedItem'; unit: number; item: ItemId }
  | { type: 'cityLevel'; city: number; level: number }
  | { type: 'reward'; city: number; reward: RewardId }
  | { type: 'built'; at: HexKey; what: BuildingId | 'road' | 'walls' | 'harvest' }
  | { type: 'researched'; tech: TechId }
  | { type: 'heroTrait'; unit: number; trait: HeroTraitId; hero: boolean }   // hero: this trait brought the unit to heroAt
  | { type: 'turnStarted'; player: PlayerId }
  | { type: 'eliminated'; player: PlayerId }
  | { type: 'matchOver'; winner: PlayerId };

export type Result = { ok: true; state: MatchState; events: GameEvent[] } | { ok: false; reason: string };

// A handler gets a draft that applyAction already cloned. It mutates the draft, pushes events,
// and returns null on success or a short refusal reason.
export type Handler<A> = (s: MatchState, a: A, ev: GameEvent[]) => string | null;
