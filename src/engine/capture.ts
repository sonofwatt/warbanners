import { CONFIG } from './data/config';
import { FACTIONS } from './data/factions';
import { key, parseKey, range } from './hex';
import type { HexKey } from './hex';
import { rngInt } from './rng';
import { cityAt, firstFreeNeighbor, foundCity, removeUnit, spawnUnit, tileAt, unitById } from './state';
import type { Action, GameEvent, Handler, MatchState, PlayerId, Unit } from './types';

// rules 12: a unit that entered its tile on an earlier turn and has not moved or acted this turn
function settled(s: MatchState, unitId: number): Unit | undefined {
  if (typeof unitId !== 'number') return undefined;
  const u = unitById(s, unitId);
  if (u === undefined || u.owner !== s.current) return undefined;
  if (u.fresh || u.moved || u.acted || u.enteredTurn >= s.stamp) return undefined;
  return u;
}

// rules 12
export function canCapture(s: MatchState, unitId: number): boolean {
  const u = settled(s, unitId);
  if (u === undefined) return false;
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
    if (u.home !== null) u.home = cityId;
  } else {
    const previous = existing.owner;
    existing.owner = u.owner;
    for (const x of s.units) if (x.home === existing.id) x.home = null;
    if (u.home !== null) u.home = existing.id;
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

// rules 12: a treasure is claimed by a unit that has stood on it since an earlier turn
export function canClaimTreasure(s: MatchState, unitId: number): boolean {
  const u = settled(s, unitId);
  return u !== undefined && tileAt(s, u.pos)?.treasure === true;
}

export const claimTreasureHandler: Handler<Extract<Action, { type: 'claimTreasure' }>> = (s, a, ev) => {
  if (!canClaimTreasure(s, a.unit)) return 'cannot claim a treasure here';
  const u = unitById(s, a.unit)!;
  const tile = tileAt(s, u.pos)!;
  const player = s.players[u.owner]!;
  const [roll, next] = rngInt(s.rng, CONFIG.treasure.outcomes);
  s.rng = next;
  let outcome: 'gold' | 'explore' | 'unit' = 'gold';
  if (roll === 1) {
    outcome = 'explore';
    const seen = new Set<HexKey>(player.explored);
    for (const h of range(parseKey(u.pos), CONFIG.treasure.exploreRadius)) {
      if (tileAt(s, key(h)) !== undefined) seen.add(key(h));
    }
    player.explored = [...seen].sort();
  } else if (roll === 2) {
    const spot = firstFreeNeighbor(s, u.pos);
    if (spot === null) player.gold += CONFIG.treasure.gold;
    else { spawnUnit(s, CONFIG.treasure.unit, u.owner, spot, null); outcome = 'unit'; }
  } else {
    player.gold += CONFIG.treasure.gold;
  }
  tile.treasure = false;
  u.mp = 0; u.attacks = 0; u.acted = true;
  ev.push({ type: 'treasure', at: u.pos, outcome });
  return null;
};

export const resignHandler: Handler<Extract<Action, { type: 'resign' }>> = (s, _a, ev) => {
  eliminate(s, s.current, ev);
  return null;
};
