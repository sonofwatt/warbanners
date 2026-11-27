import { CONFIG } from './data/config';
import { UNITS } from './data/units';
import { FACTIONS } from './data/factions';
import { distance, key, parseKey, range } from './hex';
import type { HexKey } from './hex';
import { canEarnTraits, grantTrait } from './heroes';
import { rngInt } from './rng';
import { treasureUnitFor } from './economy';
import { cityAt, firstFreeNeighbor, foundCity, removeUnit, spawnUnit, tileAt, unitById } from './state';
import { passTurn } from './turn';
import { HERO_TRAITS } from './types';
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
  if (city !== undefined) return city.owner !== u.owner && !UNITS[u.type].traits.includes('noCityCapture');
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

// rules 12 (rules version 7): a player who lost their capital and still has cities gets a new one at once: the highest
// level, then the most growth points, then the nearest to the lost capital's tile, then the lowest id. It starts linked.
function moveCapital(s: MatchState, p: PlayerId, lost: HexKey, ev: GameEvent[]): void {
  const from = parseKey(lost);
  const next = s.cities.filter((c) => c.owner === p)
    .map((c) => ({ c, d: distance(from, parseKey(c.pos)) }))
    .sort((a, b) => b.c.level - a.c.level || b.c.growth - a.c.growth || a.d - b.d || a.c.id - b.c.id)[0]!.c;
  next.capital = true;
  next.linked = true;
  ev.push({ type: 'capitalMoved', player: p, city: next.id });
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
    const lostCapital = existing.capital && CONFIG.capitalMoves;
    if (lostCapital) existing.capital = false;          // rules 7: an ordinary city for its captor
    existing.linked = existing.capital;                 // rules 7: a new owner can earn the connection bonus again
    if (def.tributeCityBase > 0) captor.gold += def.tributeCityBase + existing.level;
    cityId = existing.id;
    u.mp = 0; u.attacks = 0; u.acted = true; u.itemTurn = s.stamp;
    ev.push({ type: 'captured', city: cityId, by: u.owner });
    if (!s.cities.some((c) => c.owner === previous)) eliminate(s, previous, ev);
    else if (lostCapital) moveCapital(s, previous, existing.pos, ev);
    return null;
  }
  u.mp = 0; u.attacks = 0; u.acted = true; u.itemTurn = s.stamp;
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
  const [roll, next] = rngInt(s.rng, CONFIG.treasure.table.length);
  s.rng = next;
  const drawn = CONFIG.treasure.table[roll]!;
  const event: Extract<GameEvent, { type: 'treasure' }> = { type: 'treasure', at: u.pos, outcome: drawn };
  const gold = (): void => { player.gold += CONFIG.treasure.gold; event.outcome = 'gold'; };
  const explore = (around: HexKey, radius: number): void => {
    const seen = new Set<HexKey>(player.explored);
    for (const h of range(parseKey(around), radius)) {
      if (tileAt(s, key(h)) !== undefined) seen.add(key(h));
    }
    player.explored = [...seen].sort();
  };
  if (drawn === 'gold') {
    gold();
  } else if (drawn === 'explore') {
    explore(u.pos, CONFIG.treasure.exploreRadius);
  } else if (drawn === 'unit' || drawn === 'mercenary') {
    const spot = firstFreeNeighbor(s, u.pos);
    if (spot === null) gold();
    else if (drawn === 'unit') event.unit = spawnUnit(s, treasureUnitFor(s.players[u.owner]!.faction), u.owner, spot, null).id;
    else {
      const sellsword = spawnUnit(s, CONFIG.treasure.mercenary, u.owner, spot, null);
      event.unit = sellsword.id;
      grantTrait(s, sellsword, CONFIG.treasure.mercenaryTrait, ev);
    }
  } else if (drawn === 'relic') {
    const lacking = HERO_TRAITS.filter((x) => !u.heroTraits.includes(x));
    if (!canEarnTraits(u) || u.heroTraits.length >= CONFIG.heroes.maxTraits || lacking.length === 0) gold();
    else {
      const [pick, after] = rngInt(s.rng, lacking.length);
      s.rng = after;
      const trait = lacking[pick]!;
      grantTrait(s, u, trait, ev);
      event.trait = trait;
    }
  } else if (drawn === 'draught') {
    if (u.item === null && UNITS[u.type].atk > 0 && UNITS[u.type].range > 0) { u.item = 'draught'; u.itemTurn = s.stamp; }
    else gold();
  } else {
    // map: the nearest other treasure this player has not explored, by distance then key
    const here = parseKey(u.pos);
    const known = new Set<HexKey>(player.explored);
    const found = Object.keys(s.tiles).sort()
      .filter((k) => s.tiles[k]!.treasure && k !== u.pos && !known.has(k))
      .map((k) => ({ k, d: distance(here, parseKey(k)) }))
      .reduce<{ k: HexKey; d: number } | null>((best, c) => (best === null || c.d < best.d ? c : best), null);
    if (found === null) {
      explore(u.pos, CONFIG.treasure.exploreRadius);
      event.outcome = 'explore';
    } else {
      explore(found.k, CONFIG.treasure.mapRadius);
      event.found = found.k;
    }
  }
  tile.treasure = false;
  u.mp = 0; u.attacks = 0; u.acted = true; u.itemTurn = s.stamp;
  ev.push(event);
  return null;
};

// `player` absent means the player whose turn it is. Anyone alive may resign, on their own turn or another's.
export const resignHandler: Handler<Extract<Action, { type: 'resign' }>> = (s, a, ev) => {
  const p = a.player === undefined ? s.current : a.player;
  if (!Number.isInteger(p) || s.players[p]?.alive !== true) return 'invalid player';
  eliminate(s, p, ev);
  if (s.winner === null && p === s.current) passTurn(s, p, ev);
  return null;
};
