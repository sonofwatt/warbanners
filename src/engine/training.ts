import { FACTIONS } from './data/factions';
import { UNITS } from './data/units';
import { unitCapacity } from './economy';
import { cityById, hasOwn, spawnUnit, unitAt } from './state';
import type { Action, Handler, MatchState, PlayerId, UnitTypeId } from './types';

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
