import { CONFIG } from './data/config';
import { FACTIONS } from './data/factions';
import { UNITS } from './data/units';
import { DIRS, add, distance, key, parseKey, range } from './hex';
import type { HexKey } from './hex';
import { rngInt } from './rng';
import { cityAt, cityById, firstFreeNeighbor, hasOwn, hasTrait, isEnterable, spawnUnit, tileAt, unitAt, unitById } from './state';
import type { Action, GameEvent, Handler, MatchState, Unit } from './types';

// rules 13: half-points of movement a unit starts its turn with
export function maxMp(s: MatchState, u: Unit): number {
  const faction = s.players[u.owner]?.faction;
  const bonus = faction !== undefined && hasTrait(u, 'mounted') ? FACTIONS[faction].mountedMoveBonus : 0;
  return 2 * (UNITS[u.type].move + bonus);
}

function isEnemyAt(s: MatchState, owner: number, k: HexKey): boolean {
  const o = unitAt(s, k);
  return o !== undefined && o.owner !== owner;
}

function nextToEnemy(s: MatchState, owner: number, k: HexKey): boolean {
  const at = parseKey(k);
  return DIRS.some((d) => isEnemyAt(s, owner, key(add(at, d))));
}

function hasRoadOrCity(s: MatchState, k: HexKey): boolean {
  return tileAt(s, k)?.road === true || cityAt(s, k) !== undefined;
}

// rules 2 and 9: tile it may stop on -> half-points left on arrival
export function reachable(s: MatchState, unitId: number): Record<HexKey, number> {
  const u = unitById(s, unitId);
  if (u === undefined) return {};
  if (u.mp <= 0 || (u.acted && !hasTrait(u, 'retreat'))) return {};
  const faction = FACTIONS[s.players[u.owner]!.faction];
  const mounted = hasTrait(u, 'mounted');
  const best = new Map<HexKey, number>([[u.pos, u.mp]]);
  const done = new Set<HexKey>();
  for (;;) {
    let from: HexKey | null = null;
    let left = 0;
    for (const [k, v] of best) {
      if (!done.has(k) && v > 0 && (from === null || v > left)) { from = k; left = v; }
    }
    if (from === null) break;
    done.add(from);
    const firstStep = from === u.pos && !u.moved;
    for (const d of DIRS) {
      const to = key(add(parseKey(from), d));
      const tile = tileAt(s, to);
      if (tile === undefined || tile.terrain === 'water' || isEnemyAt(s, u.owner, to)) continue;
      let cost: number;
      let forced = false;                                   // costs everything that is left
      if (faction.relayRiders && tile.cityId !== null && cityById(s, tile.cityId)?.owner === u.owner) {
        cost = CONFIG.relayCost;
      } else if (hasRoadOrCity(s, from) && hasRoadOrCity(s, to)) {
        cost = CONFIG.roadCost;
      } else if (tile.terrain === 'mountain') {
        if (!firstStep) continue;
        cost = left; forced = true;
      } else if (mounted && faction.forestStopsMounted && tile.terrain === 'forest') {
        cost = left; forced = true;
      } else {
        cost = CONFIG.terrain[tile.terrain].enterCost ?? left;
      }
      let after = left - cost;
      if (forced) after = 0;
      else if (cost > left) {
        if (!firstStep) continue;
        after = 0;
      }
      if (nextToEnemy(s, u.owner, to)) after = 0;
      if (after > (best.get(to) ?? -1)) best.set(to, after);
    }
  }
  const out: Record<HexKey, number> = {};
  for (const [k, v] of best) {
    if (k !== u.pos && unitAt(s, k) === undefined) out[k] = v;
  }
  return out;
}

// rules 12: called when a unit ends a move on a tile
export function collectTreasure(s: MatchState, u: Unit, ev: GameEvent[]): void {
  const tile = tileAt(s, u.pos);
  if (tile === undefined || !tile.treasure) return;
  const player = s.players[u.owner]!;
  const [roll, next] = rngInt(s.rng, 3);
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
  ev.push({ type: 'treasure', at: u.pos, outcome });
}

// rules 13: the lured unit follows the rider by one tile if the tile is free
function pullLured(s: MatchState, mover: Unit, from: HexKey, ev: GameEvent[]): void {
  const target = unitById(s, mover.lure!.target);
  if (target === undefined) return;
  const at = parseKey(target.pos);
  const gap = distance(parseKey(from), at);
  let dest: HexKey | null = null;
  if (gap === 1) dest = from;
  else if (gap === 2) {
    for (const d of DIRS) {
      const n = key(add(at, d));
      if (distance(parseKey(from), parseKey(n)) === 1) { dest = n; break; }
    }
  }
  if (dest === null || !isEnterable(s, dest) || unitAt(s, dest) !== undefined) return;
  const old = target.pos;
  target.pos = dest; target.enteredTurn = s.stamp;
  ev.push({ type: 'lured', unit: target.id, from: old, to: dest });
}

export const moveHandler: Handler<Extract<Action, { type: 'move' }>> = (s, a, ev) => {
  if (typeof a.unit !== 'number' || typeof a.to !== 'string') return 'bad move';
  const u = unitById(s, a.unit);
  if (u === undefined) return 'no such unit';
  if (u.owner !== s.current) return 'not your unit';
  const options = reachable(s, u.id);
  if (!hasOwn(options, a.to)) return 'cannot reach that tile';
  const left = options[a.to]!;
  const from = u.pos;
  u.pos = a.to; u.mp = left; u.moved = true; u.enteredTurn = s.stamp;
  ev.push({ type: 'moved', unit: u.id, from, to: a.to });
  collectTreasure(s, u, ev);
  if (u.lure !== null) pullLured(s, u, from, ev);
  u.lure = null;
  return null;
};
