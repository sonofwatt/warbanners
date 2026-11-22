import { CONFIG } from './data/config';
import { FACTIONS } from './data/factions';
import { UNITS } from './data/units';
import { DIRS, add, key, parseKey, range } from './hex';
import type { HexKey } from './hex';
import { generateMap } from './mapgen';
import { ABILITIES, RULES_VERSION } from './types';
import { maxMp, ridingBonus } from './movement';
import { freshDeeds } from './heroes';
import { refreshExplored } from './vision';
import type { City, MatchSettings, MatchState, PlayerId, Tile, Trait, Unit, UnitTypeId } from './types';

export function hasTrait(u: Unit, t: Trait): boolean {
  return UNITS[u.type].traits.includes(t);
}

export function unitById(s: MatchState, id: number): Unit | undefined {
  return s.units.find((u) => u.id === id);
}

export function unitAt(s: MatchState, k: HexKey): Unit | undefined {
  return s.units.find((u) => u.pos === k);
}

export function cityById(s: MatchState, id: number): City | undefined {
  return s.cities.find((c) => c.id === id);
}

export function cityAt(s: MatchState, k: HexKey): City | undefined {
  return s.cities.find((c) => c.pos === k);
}

export function hasOwn(obj: object, k: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, k);
}

// A tile by key. Inherited names such as 'constructor' are not tiles.
export function tileAt(s: MatchState, k: HexKey): Tile | undefined {
  return typeof k === 'string' && hasOwn(s.tiles, k) ? s.tiles[k] : undefined;
}

export function isEnterable(s: MatchState, k: HexKey): boolean {
  const t = tileAt(s, k);
  return t !== undefined && t.terrain !== 'water';
}

export function firstFreeNeighbor(s: MatchState, k: HexKey): HexKey | null {
  const from = parseKey(k);
  for (const d of DIRS) {
    const n = key(add(from, d));
    if (isEnterable(s, n) && unitAt(s, n) === undefined) return n;
  }
  return null;
}

export function freshAttacks(type: UnitTypeId): number {
  const def = UNITS[type];
  if (def.traits.includes('doubleStrike')) return CONFIG.attacksPerTurn.doubleStrike;
  if (def.atk === 0 && !def.traits.some((t) => (ABILITIES as readonly Trait[]).includes(t))) return 0;
  return CONFIG.attacksPerTurn.base;
}

export function spawnUnit(
  s: MatchState, type: UnitTypeId, owner: PlayerId, pos: HexKey, home: number | null,
): Unit {
  const u: Unit = {
    id: s.nextUnitId, type, owner, pos, hp: UNITS[type].hp, mp: 0, bonusMp: 0, attacks: 0, home,
    enteredTurn: s.stamp, moved: false, acted: false, rested: false,
    taunted: false, blinded: false, lure: null, fresh: true,
    deeds: freshDeeds(), heroTraits: [], item: null, itemTurn: null,
  };
  s.nextUnitId += 1;
  s.units.push(u);
  return u;
}

export function removeUnit(s: MatchState, id: number): void {
  s.units = s.units.filter((u) => u.id !== id);
  for (const u of s.units) {
    if (u.lure !== null && u.lure.target === id) u.lure = null;
  }
}

export function claimTerritory(s: MatchState, city: City): void {
  for (const h of range(parseKey(city.pos), city.radius)) {
    const t = tileAt(s, key(h));
    if (t !== undefined && t.cityId === null) t.cityId = city.id;
  }
}

export function foundCity(s: MatchState, owner: PlayerId, pos: HexKey, capital: boolean): City {
  const c: City = {
    id: s.nextCityId, pos, owner, capital, level: CONFIG.newCity.level, growth: CONFIG.newCity.growth,
    radius: CONFIG.newCity.radius, walls: false, market: false,
    incomeBonus: 0, capacityBonus: 0, pendingRewards: [], linked: capital,
  };
  s.nextCityId += 1;
  s.cities.push(c);
  claimTerritory(s, c);
  return c;
}

export function createMatch(settings: MatchSettings): MatchState {
  const seed = settings.seed >>> 0;                    // -1 and 4294967295 are the same match
  const map = generateMap(seed, CONFIG.mapRadius);
  const s: MatchState = {
    rulesVersion: RULES_VERSION, seed, rng: map.rng, radius: CONFIG.mapRadius,
    tiles: map.tiles, cities: [], units: [],
    players: settings.factions.map((faction, i) => ({
      id: i, faction, gold: CONFIG.startGold[i]!, techs: [FACTIONS[faction].startTech],
      explored: [], alive: true, turnsTaken: 0,
    })),
    current: 0, stamp: 0, nextUnitId: 0, nextCityId: 0, winner: null,
  };
  for (const p of s.players) foundCity(s, p.id, CONFIG.capitals[p.id]!, true);
  for (const p of s.players) {
    const city = s.cities[p.id]!;
    const type = FACTIONS[p.faction].startUnit;
    const u = spawnUnit(s, type, p.id, city.pos, city.id);
    u.mp = maxMp(s, u); u.bonusMp = ridingBonus(s, u);
    u.attacks = freshAttacks(type);
    u.fresh = false;
  }
  for (const p of s.players) refreshExplored(s, p.id);
  return s;
}
