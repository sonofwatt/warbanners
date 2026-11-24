import { CONFIG } from './data/config';
import { FACTIONS } from './data/factions';
import { TECH_TREE } from './data/techs';
import { DIRS, add, key, parseKey, range } from './hex';
import { harvestTech } from './tech';
import {
  cityAt, cityById, claimTerritory, firstFreeNeighbor, hasOwn, spawnUnit, tileAt, unitAt,
} from './state';
import type {
  Action, BuildingId, City, GameEvent, Handler, MatchState, PlayerId, RewardId, Tile,
} from './types';

// rules 6
export function cityIncome(_s: MatchState, c: City): number {
  return c.level + (c.capital ? CONFIG.capitalIncome : 0) + c.incomeBonus + (c.market ? CONFIG.buildings.market.income : 0);
}

// rules 8: the blockade of a city as things stand: the enemy units on the tiles next to it (seen or not; never its own
// tile; one unit to a tile, so this is the enemy-held tiles), whether that is a blockade, and the gold it would cut from the city's income (0 when not blockaded).
export interface Blockade { enemies: number; blockaded: boolean; cut: number }

export function blockadeOf(s: MatchState, c: City): Blockade {
  const B = CONFIG.blockade;
  if (!B.on) return { enemies: 0, blockaded: false, cut: 0 };
  const at = parseKey(c.pos);
  let enemies = 0;
  for (const d of DIRS) {
    const u = unitAt(s, key(add(at, d)));
    if (u !== undefined && u.owner !== c.owner) enemies += 1;
  }
  if (enemies < B.minTiles) return { enemies, blockaded: false, cut: 0 };
  const owner = s.players[c.owner]!;
  let rate: number = B.cut;
  if (c.walls) rate = Math.min(rate, B.cutWalls);
  if (FACTIONS[owner.faction].blockadeStores && owner.techs.includes(TECH_TREE.walls)) rate = Math.min(rate, B.cutSpartanTech);
  const income = cityIncome(s, c);
  return { enemies, blockaded: true, cut: Math.max(0, Math.min(Math.max(B.minCut, Math.floor(income * rate)), income - B.floor)) };
}

// The gold every blockade of p's cities would cut from p's next income, as things stand.
export function blockadeLoss(s: MatchState, p: PlayerId): number {
  let total = 0;
  for (const c of s.cities) if (c.owner === p) total += blockadeOf(s, c).cut;
  return total;
}

export function playerIncome(s: MatchState, p: PlayerId): number {
  let total = 0;
  for (const c of s.cities) if (c.owner === p) total += cityIncome(s, c);
  return total;
}

export function growthNeeded(s: MatchState, c: City): number {
  return c.level + CONFIG.growthBase + FACTIONS[s.players[c.owner]!.faction].growthExtra;
}

export function addGrowth(s: MatchState, c: City, n: number, ev: GameEvent[]): void {
  c.growth += n;
  while (c.growth >= growthNeeded(s, c)) {
    c.growth -= growthNeeded(s, c);
    c.level += 1;
    c.pendingRewards.push(c.level);
    ev.push({ type: 'cityLevel', city: c.id, level: c.level });
  }
}

export function unitCapacity(c: City): number {
  return c.level + CONFIG.capacityBase + c.capacityBonus;
}

// Levels above the last row of the table use the last row.
function rewardRow(level: number): readonly [RewardId, RewardId] {
  const top = Math.max(...Object.keys(CONFIG.rewards).map(Number));
  return CONFIG.rewards[Math.min(level, top) as keyof typeof CONFIG.rewards];
}

export function applyReward(s: MatchState, c: City, choice: 0 | 1, ev: GameEvent[]): void {
  const level = c.pendingRewards.shift()!;
  const reward = rewardRow(level)[choice];
  const player = s.players[c.owner]!;
  switch (reward) {
    case 'gold':
      player.gold += CONFIG.rewardGold;
      break;
    case 'scout': {
      const seen = new Set(player.explored);
      for (const h of range(parseKey(c.pos), CONFIG.rewardScoutRadius)) {
        if (tileAt(s, key(h)) !== undefined) seen.add(key(h));
      }
      player.explored = [...seen].sort();
      break;
    }
    case 'borders':
      c.radius = CONFIG.rewardBorderRadius;
      claimTerritory(s, c);
      break;
    case 'barracks':
      c.capacityBonus += CONFIG.rewardCapacity;
      break;
    case 'income':
      c.incomeBonus += CONFIG.rewardIncome;
      break;
    case 'growth':
      addGrowth(s, c, CONFIG.rewardGrowth, ev);
      break;
    case 'champion':
    case 'support': {
      const type = FACTIONS[player.faction][reward];
      const at = unitAt(s, c.pos) === undefined ? c.pos : firstFreeNeighbor(s, c.pos);
      if (at === null) player.gold += CONFIG.rewardGold;
      else spawnUnit(s, type, c.owner, at, null);
      break;
    }
  }
  ev.push({ type: 'reward', city: c.id, reward });
}

// The tile at `at` when it is a real tile in the current player's territory and holds no city.
function ownTile(s: MatchState, at: unknown): { tile: Tile; city: City } | null {
  if (typeof at !== 'string') return null;
  const tile = tileAt(s, at);
  if (tile === undefined || tile.cityId === null || cityAt(s, at) !== undefined) return null;
  const city = cityById(s, tile.cityId);
  return city !== undefined && city.owner === s.current ? { tile, city } : null;
}

// Why the current player cannot harvest the resource at `at`, or null when they can. rules 8: a harvested tile, or one
// with a building on it, has nothing more to harvest.
export function harvestRefusal(s: MatchState, at: unknown): string | null {
  const own = ownTile(s, at);
  if (own === null) return 'not your territory';
  const { tile } = own;
  const tech = tile.resource === null ? null : harvestTech(tile.resource);
  if (tech === null || tile.harvested || tile.building !== null) return 'nothing to harvest';
  const rule = CONFIG.harvest[tile.resource as keyof typeof CONFIG.harvest];
  const player = s.players[s.current]!;
  if (!player.techs.includes(tech)) return 'missing tech';
  if (player.gold < rule.cost) return 'not enough gold';
  return null;
}

export const harvestHandler: Handler<Extract<Action, { type: 'harvest' }>> = (s, a, ev) => {
  const refusal = harvestRefusal(s, a.at);
  if (refusal !== null) return refusal;
  const { tile, city } = ownTile(s, a.at)!;
  const rule = CONFIG.harvest[tile.resource as keyof typeof CONFIG.harvest];
  s.players[s.current]!.gold -= rule.cost;
  if (TECH_TREE.harvestKeepsTile) tile.harvested = true;   // rules 8: the resource stays, for building on
  else tile.resource = null;
  addGrowth(s, city, rule.growth, ev);
  ev.push({ type: 'built', at: a.at, what: 'harvest' });
  return null;
};

// Why the current player cannot build `building` at `at`, or null when they can. A building stands on its terrain
// and on one of the resources the tree lists for it; rules 8, an upgrade stands on the improvement it upgrades and
// replaces it.
export function buildRefusal(s: MatchState, at: unknown, building: unknown): string | null {
  if (typeof building !== 'string' || !hasOwn(CONFIG.buildings, building)) return 'unknown building';
  const tree = TECH_TREE.buildings[building as BuildingId];
  if (tree === undefined) return 'unknown building';
  const own = ownTile(s, at);
  if (own === null) return 'not your territory';
  const { tile, city } = own;
  const rule = CONFIG.buildings[building as BuildingId];
  if (rule.upgrades !== null) {
    if (tile.building === building) return 'already built';
    if (tile.building !== rule.upgrades || tile.terrain !== rule.on) return 'wrong tile';
  } else {
    if (tile.building !== null) return 'already built';
    if (tile.terrain !== rule.on || !tree.on.includes(tile.resource)) return 'wrong tile';
  }
  if (building === 'market' && city.market) return 'city already has a market';
  const player = s.players[s.current]!;
  if (!player.techs.includes(tree.tech)) return 'missing tech';
  if (player.gold < rule.cost) return 'not enough gold';
  return null;
}

export const buildHandler: Handler<Extract<Action, { type: 'build' }>> = (s, a, ev) => {
  const refusal = buildRefusal(s, a.at, a.building);
  if (refusal !== null) return refusal;
  const { tile, city } = ownTile(s, a.at)!;
  const rule = CONFIG.buildings[a.building];
  s.players[s.current]!.gold -= rule.cost;
  tile.building = a.building;
  if (a.building === 'market') city.market = true;
  addGrowth(s, city, rule.growth, ev);
  ev.push({ type: 'built', at: a.at, what: a.building });
  return null;
};

// Why the current player cannot lay a road at `at`, or null when they can. The tile must be explored,
// otherwise accepting or refusing the road would reveal its terrain.
export function roadRefusal(s: MatchState, at: unknown): string | null {
  if (typeof at !== 'string') return 'bad road';
  const player = s.players[s.current]!;
  if (!FACTIONS[player.faction].canBuildRoads) return 'your faction cannot build roads';   // rules 8
  if (!player.explored.includes(at)) return 'cannot build a road there';
  const tile = tileAt(s, at);
  if (tile === undefined || cityAt(s, at) !== undefined) return 'cannot build a road there';
  if (tile.terrain !== 'field' && tile.terrain !== 'forest') return 'cannot build a road there';
  if (tile.road) return 'already a road';
  if (tile.cityId !== null && cityById(s, tile.cityId)?.owner !== s.current) return 'not your territory';
  if (!player.techs.includes(TECH_TREE.road)) return 'missing tech';
  if (player.gold < CONFIG.road.cost) return 'not enough gold';
  return null;
}

export const roadHandler: Handler<Extract<Action, { type: 'road' }>> = (s, a, ev) => {
  const refusal = roadRefusal(s, a.at);
  if (refusal !== null) return refusal;
  s.players[s.current]!.gold -= CONFIG.road.cost;
  tileAt(s, a.at)!.road = true;
  ev.push({ type: 'built', at: a.at, what: 'road' });
  return null;
};

// Why the current player cannot wall city `cityId`, or null when they can.
export function wallsRefusal(s: MatchState, cityId: unknown): string | null {
  if (typeof cityId !== 'number') return 'bad walls';
  const city = cityById(s, cityId);
  if (city === undefined || city.owner !== s.current) return 'not your city';
  if (city.walls) return 'already walled';
  const player = s.players[s.current]!;
  if (!FACTIONS[player.faction].canBuildWalls) return 'your faction cannot build walls';
  if (!player.techs.includes(TECH_TREE.walls)) return 'missing tech';
  if (player.gold < CONFIG.walls.cost) return 'not enough gold';
  return null;
}

export const wallsHandler: Handler<Extract<Action, { type: 'buildWalls' }>> = (s, a, ev) => {
  const refusal = wallsRefusal(s, a.city);
  if (refusal !== null) return refusal;
  const city = cityById(s, a.city)!;
  s.players[s.current]!.gold -= CONFIG.walls.cost;
  city.walls = true;
  ev.push({ type: 'built', at: city.pos, what: 'walls' });
  return null;
};

// Why the current player cannot take reward `choice` in city `cityId`, or null when they can.
export function rewardRefusal(s: MatchState, cityId: unknown, choice: unknown): string | null {
  if (typeof cityId !== 'number' || (choice !== 0 && choice !== 1)) return 'bad reward';
  const city = cityById(s, cityId);
  if (city === undefined || city.owner !== s.current) return 'not your city';
  if (city.pendingRewards.length === 0) return 'no reward pending';
  return null;
}

export const rewardHandler: Handler<Extract<Action, { type: 'chooseReward' }>> = (s, a, ev) => {
  const refusal = rewardRefusal(s, a.city, a.choice);
  if (refusal !== null) return refusal;
  applyReward(s, cityById(s, a.city)!, a.choice, ev);
  return null;
};
