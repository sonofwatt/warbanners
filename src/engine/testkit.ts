import { UNITS } from './data/units';
import { key, range } from './hex';
import { foundCity, freshAttacks, spawnUnit } from './state';
import { RULES_VERSION } from './types';
import type {
  City, FactionId, MatchState, PlayerId, Result, TechId, Tile, Unit, UnitTypeId,
} from './types';

export function blankMatch(opts?: { radius?: number; factions?: [FactionId, FactionId] }): MatchState {
  const radius = opts?.radius ?? 4;
  const factions = opts?.factions ?? ['spartans', 'mongols'];
  const tiles: Record<string, Tile> = {};
  for (const h of range({ q: 0, r: 0 }, radius)) {
    tiles[key(h)] = {
      terrain: 'field', resource: null, building: null, road: false, village: false,
      treasure: false, cityId: null,
    };
  }
  return {
    rulesVersion: RULES_VERSION, seed: 0, rng: 1, radius, tiles, cities: [], units: [],
    players: factions.map((faction, i) => ({
      id: i, faction, gold: 20, techs: [], explored: [], alive: true, turnsTaken: 0,
    })),
    current: 0, stamp: 5, nextUnitId: 0, nextCityId: 0, winner: null,
  };
}

export function addUnit(
  s: MatchState, type: UnitTypeId, owner: PlayerId, q: number, r: number, patch?: Partial<Unit>,
): Unit {
  const u = spawnUnit(s, type, owner, key({ q, r }), null);
  u.mp = 2 * UNITS[type].move;
  u.attacks = freshAttacks(type);
  u.enteredTurn = 0;
  Object.assign(u, patch);
  return u;
}

export function addCity(s: MatchState, owner: PlayerId, q: number, r: number, patch?: Partial<City>): City {
  const c = foundCity(s, owner, key({ q, r }), false);
  Object.assign(c, patch);
  return c;
}

export function setTile(s: MatchState, q: number, r: number, patch: Partial<Tile>): void {
  const t = s.tiles[key({ q, r })];
  if (t === undefined) throw new Error(`no tile at ${q},${r}`);
  Object.assign(t, patch);
}

export function give(s: MatchState, player: PlayerId, ...techs: TechId[]): void {
  const p = s.players[player];
  if (p === undefined) throw new Error(`no player ${player}`);
  for (const t of techs) if (!p.techs.includes(t)) p.techs.push(t);
}

export function must(r: Result): MatchState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}
