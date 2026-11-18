import { FACTIONS } from './data/factions';
import { cityAt, foundCity, removeUnit, tileAt, unitById } from './state';
import type { Action, GameEvent, Handler, MatchState, PlayerId } from './types';

// rules 12
export function canCapture(s: MatchState, unitId: number): boolean {
  if (typeof unitId !== 'number') return false;
  const u = unitById(s, unitId);
  if (u === undefined || u.owner !== s.current) return false;
  if (u.moved || u.acted || u.enteredTurn >= s.stamp) return false;
  const city = cityAt(s, u.pos);
  if (city !== undefined) return city.owner !== u.owner;
  return tileAt(s, u.pos)?.village === true;
}

// rules 12: no player is left with cities, or a player resigns
export function eliminate(s: MatchState, p: PlayerId, ev: GameEvent[]): void {
  s.players[p]!.alive = false;
  for (const u of s.units.filter((x) => x.owner === p)) removeUnit(s, u.id);
  ev.push({ type: 'eliminated', player: p });
  const alive = s.players.filter((x) => x.alive);
  if (alive.length === 1) {
    s.winner = alive[0]!.id;
    ev.push({ type: 'matchOver', winner: alive[0]!.id });
  }
}

export const captureHandler: Handler<Extract<Action, { type: 'capture' }>> = (s, a, ev) => {
  if (!canCapture(s, a.unit)) return 'cannot capture here';
  const u = unitById(s, a.unit)!;
  const captor = s.players[u.owner]!;
  const def = FACTIONS[captor.faction];
  const existing = cityAt(s, u.pos);
  let cityId: number;
  if (existing === undefined) {
    tileAt(s, u.pos)!.village = false;
    cityId = foundCity(s, u.owner, u.pos, false).id;
    captor.gold += def.tributeVillage;
  } else {
    const previous = existing.owner;
    existing.owner = u.owner;
    for (const x of s.units) if (x.home === existing.id) x.home = null;
    existing.pendingRewards = [];
    if (def.tributeCityBase > 0) captor.gold += def.tributeCityBase + existing.level;
    cityId = existing.id;
    u.mp = 0; u.attacks = 0; u.acted = true;
    ev.push({ type: 'captured', city: cityId, by: u.owner });
    if (!s.cities.some((c) => c.owner === previous)) eliminate(s, previous, ev);
    return null;
  }
  u.mp = 0; u.attacks = 0; u.acted = true;
  ev.push({ type: 'captured', city: cityId, by: u.owner });
  return null;
};

export const resignHandler: Handler<Extract<Action, { type: 'resign' }>> = (s, _a, ev) => {
  eliminate(s, s.current, ev);
  return null;
};
