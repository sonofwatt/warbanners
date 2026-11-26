import type { HexKey } from './hex';
export const RULES_VERSION = 10;
export type PlayerId = number;
export type FactionId = 'spartans' | 'mongols';
export type Terrain = 'field' | 'forest' | 'mountain' | 'water';
// rules 8 adds jewels (on mountains) and fish (on water)
export type Resource = 'orchard' | 'cropland' | 'game' | 'ore' | 'jewels' | 'fish';
// rules 8 adds the Orchard and the four upgrades (Plantation, Lumber mill, Foundry, Granary)
export type BuildingId = 'farm' | 'lumberCamp' | 'mine' | 'market' | 'orchard' | 'plantation' | 'lumberMill' | 'foundry' | 'granary';
// Both trees' techs: the rules 7 ladders (kept for the provenance replays) and the rules 8 tree; data/techs.ts says
// which tree each belongs to, and CONFIG.techTree which one is in play.
export type TechId = 'foraging' | 'farming' | 'markets' | 'riding' | 'roads' | 'chivalry'
  | 'hunting' | 'forestry' | 'engineering' | 'bronze' | 'shieldwork' | 'smithing'
  | 'defence' | 'walls' | 'orchards' | 'plantations' | 'trapping' | 'archery' | 'siege' | 'logging' | 'milling'
  | 'prospecting' | 'spears' | 'mining' | 'foundry' | 'gathering' | 'granary' | 'fishing';
export type UnitTypeId = 'warrior' | 'spearman' | 'swordsman' | 'defender' | 'archer' | 'horseman'
  | 'knight' | 'catapult' | 'hoplite' | 'kingsGuard' | 'piper' | 'scout'
  | 'horseArcher' | 'khansGuard' | 'skyCaller' | 'camp' | 'sellsword';
export type Trait = 'steadfast' | 'doubleStrike' | 'retreat' | 'chain' | 'splash' | 'siege' | 'mounted'
  | 'phalanx' | 'unbowed' | 'hidden' | 'noCityCapture' | 'steady' | 'inspire' | 'camp' | 'heal' | 'taunt' | 'hasten' | 'dustStorm'
  | 'pathfinder';
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
  harvested: boolean;                    // rules 8: its resource was harvested (the resource stays, for building on)
  road: boolean; village: boolean; treasure: boolean;
  cityId: number | null;                 // the city whose territory this tile is in
}
export interface City {
  id: number; pos: HexKey; owner: PlayerId; capital: boolean;
  level: number; growth: number; radius: number; walls: boolean; market: boolean;
  incomeBonus: number; capacityBonus: number;
  pendingRewards: number[];              // levels awaiting a choice, oldest first
  linked: boolean;                       // rules 7: has paid its connection bonus to this owner (true for capitals)
}
export interface Unit {
  id: number; type: UnitTypeId; owner: PlayerId; pos: HexKey; hp: number;
  mp: number;                            // half-points of movement left this turn
  bonusMp: number;                       // rules 6: half-points of the riding bonus in mp not yet spent this turn (0 but for riders by territory)
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
  hunkered: boolean;                     // rules 7: dug in until it moves or acts of its own accord; public
  momentum: number;                      // rules 7: a chain unit's momentum left this turn (0 for any other unit); public
  turnEnded: boolean;                    // rules 8: a step onto or off a mountain ended its turn; nothing, not even haste, lets it move again; public
  // rules 9: stamp of the turn it last unhunkered (absent until it first does, so older states hash as before); a unit
  // that unhunkered this turn may not hunker again this turn; public
  unhunkeredTurn?: number;
  // rules 10: stamp of the turn it entered its first relay tile (absent until it first does, so older states hash as
  // before); from then on that turn every relay tile costs CONFIG.relayCost; public
  relayTurn?: number;
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
// The advanced match options. Each is optional and its absence means the default (today's game), so older records,
// saves and replays read the same. Only `chests` is a rule (mapgen reads it); weather and time of day are looks the
// engine never reads, kept here so a resumed or online match keeps them. 'random' is resolved by the app from the seed.
export type ChestSetting = 'few' | 'normal' | 'many';
export type WeatherSetting = 'clear' | 'cloudy' | 'rain' | 'snow' | 'random';
export type TimeSetting = 'day' | 'dawn' | 'dusk' | 'night' | 'random';
export interface MatchSettings {
  seed: number; factions: [FactionId, FactionId];
  chests?: ChestSetting; weather?: WeatherSetting; time?: TimeSetting;
}

export type Action =
  | { type: 'move'; unit: number; to: HexKey }
  | { type: 'attack'; unit: number; target: HexKey; lure?: boolean }
  | { type: 'ability'; unit: number; ability: AbilityId; target: HexKey }
  | { type: 'capture'; unit: number }
  | { type: 'claimTreasure'; unit: number }
  | { type: 'useItem'; unit: number }
  | { type: 'hunker'; unit: number }
  | { type: 'unhunker'; unit: number }                               // rules 9: the owner ends a unit's hunker
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
  | { type: 'momentum'; unit: number; spent: number; left: number } // rules 7: the momentum a chain unit paid for a kill
  | { type: 'chainEnded'; unit: number }                             // rules 6: a hero trait from the kill ended the chain; rules 7: so does a short kill
  | { type: 'lured'; unit: number; from: HexKey; to: HexKey }
  | { type: 'ability'; unit: number; ability: AbilityId; target: HexKey }
  | { type: 'trained'; unit: number; at: HexKey }
  | { type: 'captured'; city: number; by: PlayerId }
  | { type: 'capitalMoved'; player: PlayerId; city: number }       // rules 7: the player's capital was taken, this city is it now
  // trait: the relic's gift; found: the treasure a map shows; unit: the id of a spawned Warrior or Sellsword
  | { type: 'treasure'; at: HexKey; outcome: TreasureOutcome; trait?: HeroTraitId; found?: HexKey; unit?: number }
  | { type: 'usedItem'; unit: number; item: ItemId }
  | { type: 'hunkered'; unit: number }                              // rules 7
  | { type: 'hunkerEnded'; unit: number }                           // rules 7: it moved, acted or was lured; rules 9: or its owner unhunkered it
  | { type: 'restHealed'; unit: number; hp: number }                // rules 8: a hunkered unit healed hp at the end of its owner's turn
  | { type: 'blockaded'; city: number; enemies: number; gold: number }  // rules 8: the city's income was cut by gold as its owner's turn began
  | { type: 'connected'; city: number; capital: number }           // rules 7: roads first joined the city to the capital
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
