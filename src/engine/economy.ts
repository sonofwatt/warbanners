import { CONFIG } from './data/config';
import { FACTIONS } from './data/factions';
import { key, parseKey, range } from './hex';
import {
  cityAt, cityById, claimTerritory, firstFreeNeighbor, hasOwn, spawnUnit, tileAt, unitAt,
} from './state';
import type {
  Action, City, GameEvent, Handler, MatchState, PlayerId, RewardId, Tile,
} from './types';

// rules 6
export function cityIncome(_s: MatchState, c: City): number {
  return c.level + (c.capital ? 1 : 0) + c.incomeBonus + (c.market ? CONFIG.marketIncome : 0);
}

export function playerIncome(s: MatchState, p: PlayerId): number {
  let total = 0;
  for (const c of s.cities) if (c.owner === p) total += cityIncome(s, c);
  return total;
}

export function growthNeeded(s: MatchState, c: City): number {
  return c.level + 1 + FACTIONS[s.players[c.owner]!.faction].growthExtra;
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
  return c.level + 1 + c.capacityBonus;
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

export const harvestHandler: Handler<Extract<Action, { type: 'harvest' }>> = (s, a, ev) => {
  const own = ownTile(s, a.at);
  if (own === null) return 'not your territory';
  const { tile, city } = own;
  if (tile.resource === null || !hasOwn(CONFIG.harvest, tile.resource)) return 'nothing to harvest';
  const rule = CONFIG.harvest[tile.resource as keyof typeof CONFIG.harvest];
  const player = s.players[s.current]!;
  if (!player.techs.includes(rule.tech)) return 'missing tech';
  if (player.gold < rule.cost) return 'not enough gold';
  player.gold -= rule.cost;
  tile.resource = null;
  addGrowth(s, city, rule.growth, ev);
  ev.push({ type: 'built', at: a.at, what: 'harvest' });
  return null;
};

export const buildHandler: Handler<Extract<Action, { type: 'build' }>> = (s, a, ev) => {
  if (typeof a.building !== 'string' || !hasOwn(CONFIG.buildings, a.building)) return 'unknown building';
  const own = ownTile(s, a.at);
  if (own === null) return 'not your territory';
  const { tile, city } = own;
  const rule = CONFIG.buildings[a.building];
  if (tile.building !== null) return 'already built';
  if (tile.terrain !== rule.on || tile.resource !== rule.resource) return 'wrong tile';
  if (a.building === 'market' && city.market) return 'city already has a market';
  const player = s.players[s.current]!;
  if (!player.techs.includes(rule.tech)) return 'missing tech';
  if (player.gold < rule.cost) return 'not enough gold';
  player.gold -= rule.cost;
  tile.building = a.building;
  if (a.building === 'market') city.market = true;
  addGrowth(s, city, rule.growth, ev);
  ev.push({ type: 'built', at: a.at, what: a.building });
  return null;
};

export const roadHandler: Handler<Extract<Action, { type: 'road' }>> = (s, a, ev) => {
  if (typeof a.at !== 'string') return 'bad road';
  const tile = tileAt(s, a.at);
  if (tile === undefined || cityAt(s, a.at) !== undefined) return 'cannot build a road there';
  if (tile.terrain !== 'field' && tile.terrain !== 'forest') return 'cannot build a road there';
  if (tile.road) return 'already a road';
  if (tile.cityId !== null && cityById(s, tile.cityId)?.owner !== s.current) return 'not your territory';
  const player = s.players[s.current]!;
  if (!player.techs.includes(CONFIG.road.tech)) return 'missing tech';
  if (player.gold < CONFIG.road.cost) return 'not enough gold';
  player.gold -= CONFIG.road.cost;
  tile.road = true;
  ev.push({ type: 'built', at: a.at, what: 'road' });
  return null;
};

export const wallsHandler: Handler<Extract<Action, { type: 'buildWalls' }>> = (s, a, ev) => {
  if (typeof a.city !== 'number') return 'bad walls';
  const city = cityById(s, a.city);
  if (city === undefined || city.owner !== s.current) return 'not your city';
  if (city.walls) return 'already walled';
  const player = s.players[s.current]!;
  if (!FACTIONS[player.faction].canBuildWalls) return 'your faction cannot build walls';
  if (!player.techs.includes(CONFIG.walls.tech)) return 'missing tech';
  if (player.gold < CONFIG.walls.cost) return 'not enough gold';
  player.gold -= CONFIG.walls.cost;
  city.walls = true;
  ev.push({ type: 'built', at: city.pos, what: 'walls' });
  return null;
};

export const rewardHandler: Handler<Extract<Action, { type: 'chooseReward' }>> = (s, a, ev) => {
  if (typeof a.city !== 'number' || (a.choice !== 0 && a.choice !== 1)) return 'bad reward';
  const city = cityById(s, a.city);
  if (city === undefined || city.owner !== s.current) return 'not your city';
  if (city.pendingRewards.length === 0) return 'no reward pending';
  applyReward(s, city, a.choice, ev);
  return null;
};
