import { FACTIONS } from './data/factions';
import { TECH_TREE } from './data/techs';
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
      && (TECH_TREE.units[t] === undefined || player.techs.includes(TECH_TREE.units[t]!));
  });
}

export function unitsOf(s: MatchState, cityId: number): number {
  return s.units.filter((u) => u.home === cityId).length;
}

// Why the current player cannot train `unitType` in city `cityId`, or null when they can.
export function trainRefusal(s: MatchState, cityId: unknown, unitType: unknown): string | null {
  if (typeof cityId !== 'number' || typeof unitType !== 'string' || !hasOwn(UNITS, unitType)) {
    return 'bad training';
  }
  const city = cityById(s, cityId);
  if (city === undefined || city.owner !== s.current) return 'not your city';
  if (!trainable(s, s.current).includes(unitType as UnitTypeId)) return 'cannot train that';
  if (unitAt(s, city.pos) !== undefined) return 'city tile is occupied';
  if (unitsOf(s, city.id) >= unitCapacity(city)) return 'city is at capacity';
  if (s.players[s.current]!.gold < unitCost(s, s.current, unitType as UnitTypeId)!) return 'not enough gold';
  return null;
}

export const trainHandler: Handler<Extract<Action, { type: 'train' }>> = (s, a, ev) => {
  const refusal = trainRefusal(s, a.city, a.unitType);
  if (refusal !== null) return refusal;
  const city = cityById(s, a.city)!;
  s.players[s.current]!.gold -= unitCost(s, s.current, a.unitType)!;
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

// Why the current player cannot have camp `unitId` train `unitType` onto tile `to`, or null when they can.
export function campTrainRefusal(s: MatchState, unitId: unknown, unitType: unknown, to: unknown): string | null {
  if (typeof unitId !== 'number' || typeof unitType !== 'string' || !hasOwn(UNITS, unitType)
    || typeof to !== 'string' || tileAt(s, to) === undefined) return 'bad training';
  const camp = unitById(s, unitId);
  if (camp === undefined || camp.owner !== s.current || !hasTrait(camp, 'camp')) return 'not your camp';
  if (camp.fresh) return 'camp was trained this turn';
  if (camp.moved || camp.acted) return 'camp already used this turn';
  if (distance(parseKey(camp.pos), parseKey(to)) !== 1) return 'tile is not next to the camp';
  if (!isEnterable(s, to) || unitAt(s, to) !== undefined) return 'tile is not free';
  if (!trainable(s, s.current).includes(unitType as UnitTypeId)) return 'cannot train that';
  if (campCity(s, s.current) === null) return 'no city has room';
  if (s.players[s.current]!.gold < unitCost(s, s.current, unitType as UnitTypeId)!) return 'not enough gold';
  return null;
}

export const campTrainHandler: Handler<Extract<Action, { type: 'campTrain' }>> = (s, a, ev) => {
  const refusal = campTrainRefusal(s, a.unit, a.unitType, a.to);
  if (refusal !== null) return refusal;
  const camp = unitById(s, a.unit)!;
  const city = campCity(s, s.current)!;
  s.players[s.current]!.gold -= unitCost(s, s.current, a.unitType)!;
  const u = spawnUnit(s, a.unitType, camp.owner, a.to, city.id);
  camp.acted = true;
  camp.mp = 0;
  ev.push({ type: 'trained', unit: u.id, at: u.pos });
  return null;
};
