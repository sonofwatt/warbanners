import { CONFIG } from './data/config';
import { FACTIONS } from './data/factions';
import { UNITS } from './data/units';
import { DIRS, add, distance, key, parseKey } from './hex';
import type { HexKey } from './hex';
import { addDeed } from './heroes';
import { cityAt, cityById, hasOwn, hasTrait, isEnterable, tileAt, unitAt, unitById } from './state';
import type { Action, GameEvent, Handler, MatchState, Unit } from './types';

// rules 13: half-points of movement a unit starts its turn with
export function maxMp(s: MatchState, u: Unit): number {
  const faction = s.players[u.owner]?.faction;
  const bonus = faction !== undefined && hasTrait(u, 'mounted') ? FACTIONS[faction].mountedMoveBonus : 0;
  const tireless = u.heroTraits.includes('tireless') ? CONFIG.heroes.tirelessMove : 0;
  return 2 * (UNITS[u.type].move + tireless) + bonus;          // the faction bonus is in half-points (rules 6)
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

// rules 13 and 6: the territory a tile lies in, for a unit of `owner`
function territoryOf(s: MatchState, owner: number, k: HexKey): 'own' | 'neutral' | 'enemy' {
  const cityId = tileAt(s, k)?.cityId ?? null;
  const city = cityId === null ? undefined : cityById(s, cityId);
  if (city === undefined) return 'neutral';
  return city.owner === owner ? 'own' : 'enemy';
}

// rules 13 and 6: half-points this move may spend. A rider that rides by territory may not spend its faction's move
// bonus on a move that starts in enemy territory. Movement spent this turn comes out of the bonus first, so such a
// move loses only the part of the bonus still unspent (and a split move never loses it twice); what the move leaves is
// all the unit has.
function budgetOf(s: MatchState, u: Unit): number {
  const faction = FACTIONS[s.players[u.owner]!.faction];
  if (!faction.territoryRiding || !hasTrait(u, 'mounted') || territoryOf(s, u.owner, u.pos) !== 'enemy') return u.mp;
  const bonus = faction.mountedMoveBonus;
  const unspent = Math.max(0, Math.min(bonus, u.mp - (maxMp(s, u) - bonus)));
  return u.mp - unspent;
}

// rules 2, 9 and 13: tile it may stop on -> half-points left on arrival. A move never passes through a tile its owner
// had not explored when the move began; only a pathfinder may end on one (rules 6; CONFIG.closedFog off replays the
// older rule, where any unit could).
export function reachable(s: MatchState, unitId: number): Record<HexKey, number> {
  const u = unitById(s, unitId);
  if (u === undefined) return {};
  if (u.fresh || u.mp <= 0 || (u.acted && !hasTrait(u, 'retreat'))) return {};
  const faction = FACTIONS[s.players[u.owner]!.faction];
  const mounted = hasTrait(u, 'mounted');
  const explored = new Set(s.players[u.owner]!.explored);
  // rules 3 to 5 only: a move could end on one unexplored tile, and mounted Mongol riders kept moving after it
  const keepsMoveInFog = !CONFIG.closedFog && mounted && s.players[u.owner]!.faction === 'mongols';
  const entersFog = !CONFIG.closedFog || hasTrait(u, 'pathfinder');
  const fog = new Set<HexKey>();                            // unexplored tiles reached: ends of moves only
  const best = new Map<HexKey, number>([[u.pos, budgetOf(s, u)]]);
  const done = new Set<HexKey>();
  for (;;) {
    let from: HexKey | null = null;
    let left = 0;
    for (const [k, v] of best) {
      if (!done.has(k) && !fog.has(k) && v > 0 && (from === null || v > left)) { from = k; left = v; }
    }
    if (from === null) break;
    done.add(from);
    const firstStep = from === u.pos && !u.moved;
    for (const d of DIRS) {
      const to = key(add(parseKey(from), d));
      const tile = tileAt(s, to);
      if (tile === undefined || tile.terrain === 'water' || isEnemyAt(s, u.owner, to)) continue;
      if (!entersFog && !explored.has(to)) continue;
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
        // the normal forest cost, unless it is the first step; then the rest of the move is gone
        if (!firstStep && left < (CONFIG.terrain.forest.enterCost ?? 0)) continue;
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
      if (!explored.has(to)) {
        fog.add(to);
        if (!keepsMoveInFog) after = 0;
      }
      if (after > (best.get(to) ?? -1)) best.set(to, after);
    }
  }
  const out: Record<HexKey, number> = {};
  for (const [k, v] of best) {
    if (k !== u.pos && unitAt(s, k) === undefined) out[k] = v;
  }
  return out;
}

// rules 13: the lured unit follows the rider by one tile if a tile is free
function pullLured(s: MatchState, mover: Unit, from: HexKey, ev: GameEvent[]): void {
  const target = unitById(s, mover.lure!.target);
  if (target === undefined) return;
  const at = parseKey(target.pos);
  const gap = distance(parseKey(from), at);
  let dest: HexKey | null = null;
  const free = (k: HexKey): boolean => isEnterable(s, k) && unitAt(s, k) === undefined;
  if (gap === 1) dest = free(from) ? from : null;
  else if (gap === 2) {
    // the first shared neighbour in direction order that is free and enterable
    for (const d of DIRS) {
      const n = key(add(at, d));
      if (distance(parseKey(from), parseKey(n)) === 1 && free(n)) { dest = n; break; }
    }
  }
  if (dest === null) return;
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
  const intoFog = !s.players[u.owner]!.explored.includes(a.to);
  u.pos = a.to; u.mp = left; u.moved = true; u.enteredTurn = s.stamp;
  // rules 6: a pathfinder that ends a move in the fog has spent its turn: no more moving, attacking or abilities
  if (CONFIG.closedFog && intoFog) { u.mp = 0; u.attacks = 0; u.acted = true; u.itemTurn = s.stamp; }
  ev.push({ type: 'moved', unit: u.id, from, to: a.to });
  addDeed(s, u, 'march', distance(parseKey(from), parseKey(a.to)), ev);
  if (u.lure !== null) pullLured(s, u, from, ev);
  u.lure = null;
  return null;
};
