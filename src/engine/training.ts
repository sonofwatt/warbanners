import { FACTIONS } from './data/factions';
import { UNITS } from './data/units';
import { unitCapacity } from './economy';
import { cityById, hasOwn, hasTrait, isEnterable, spawnUnit, tileAt, unitAt, unitById } from './state';
import { distance, parseKey } from './hex';
import type { Action, City, Handler, MatchState, PlayerId, UnitTypeId } from './types';

// rules 8 and 13: the mounted discount applies to shared mounted units only
export function unitCost(s: MatchState, p: PlayerId, type: UnitTypeId): number | null {
  const def = UNITS[type];
  if (def.cost === null) return null;
  const mounted = def.faction === null && def.traits.includes('mounted');
  return mounted ? def.cost - FACTIONS[s.players[p]!.faction].mountedDiscount : def.cost;
}

export function trainable(s: MatchState, p: PlayerId): UnitTypeId[] {
  const player = s.players[p]!;
  return (Object.keys(UNITS) as UnitTypeId[]).filter((t) => {
    const def = UNITS[t];
    return (def.faction === null || def.faction === player.faction) && def.cost !== null
      && (def.tech === null || player.techs.includes(def.tech));
  });
}

export function unitsOf(s: MatchState, cityId: number): number {
  return s.units.filter((u) => u.home === cityId).length;
}

export const trainHandler: Handler<Extract<Action, { type: 'train' }>> = (s, a, ev) => {
  if (typeof a.city !== 'number' || typeof a.unitType !== 'string' || !hasOwn(UNITS, a.unitType)) {
    return 'bad training';
  }
  const city = cityById(s, a.city);
  if (city === undefined || city.owner !== s.current) return 'not your city';
  if (!trainable(s, s.current).includes(a.unitType)) return 'cannot train that';
  if (unitAt(s, city.pos) !== undefined) return 'city tile is occupied';
  if (unitsOf(s, city.id) >= unitCapacity(city)) return 'city is at capacity';
  const player = s.players[s.current]!;
  const cost = unitCost(s, s.current, a.unitType)!;
  if (player.gold < cost) return 'not enough gold';
  player.gold -= cost;
  const u = spawnUnit(s, a.unitType, city.owner, city.pos, city.id);
  ev.push({ type: 'trained', unit: u.id, at: u.pos });
  return null;
};

// rules 13: the owner's city with the most free capacity, lowest id on a tie
export function campCity(s: MatchState, p: PlayerId): City | null {
  let best: City | null = null;
  let bestFree = 0;
  for (const c of s.cities) {
    if (c.owner !== p) continue;
    const free = unitCapacity(c) - unitsOf(s, c.id);
    if (free > bestFree) { best = c; bestFree = free; }
  }
  return best;
}

export const campTrainHandler: Handler<Extract<Action, { type: 'campTrain' }>> = (s, a, ev) => {
  if (typeof a.unit !== 'number' || typeof a.unitType !== 'string' || !hasOwn(UNITS, a.unitType)
    || typeof a.to !== 'string' || tileAt(s, a.to) === undefined) return 'bad training';
  const camp = unitById(s, a.unit);
  if (camp === undefined || camp.owner !== s.current || !hasTrait(camp, 'camp')) return 'not your camp';
  if (camp.moved || camp.acted) return 'camp already used this turn';
  if (distance(parseKey(camp.pos), parseKey(a.to)) !== 1) return 'tile is not next to the camp';
  if (!isEnterable(s, a.to) || unitAt(s, a.to) !== undefined) return 'tile is not free';
  if (!trainable(s, s.current).includes(a.unitType)) return 'cannot train that';
  const city = campCity(s, s.current);
  if (city === null) return 'no city has room';
  const player = s.players[s.current]!;
  const cost = unitCost(s, s.current, a.unitType)!;
  if (player.gold < cost) return 'not enough gold';
  player.gold -= cost;
  const u = spawnUnit(s, a.unitType, camp.owner, a.to, city.id);
  camp.acted = true;
  camp.mp = 0;
  ev.push({ type: 'trained', unit: u.id, at: u.pos });
  return null;
};
