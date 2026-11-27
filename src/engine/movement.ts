import { CONFIG } from './data/config';
import { endHunker } from './hunker';
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

// rules 6: the half-points of a unit's maxMp that are its faction's riding bonus, for a mounted unit of a faction that
// rides by territory (u.bonusMp starts each turn at this).
export function ridingBonus(s: MatchState, u: Unit): number {
  const faction = FACTIONS[s.players[u.owner]!.faction];
  return faction.territoryRiding && hasTrait(u, 'mounted') ? faction.mountedMoveBonus : 0;
}

// rules 6: does this move start where a rider by territory may not spend its bonus (enemy territory)?
function bonusBarred(s: MatchState, u: Unit): boolean {
  return ridingBonus(s, u) > 0 && territoryOf(s, u.owner, u.pos) === 'enemy';
}

// rules 13 and 6: half-points this move may spend. A rider by territory may not spend the part of its bonus still
// unspent (u.bonusMp) on a move that starts in enemy territory. Movement spent this turn comes out of the bonus first
// (moveHandler), so a split move never loses it twice, and haste never counts as bonus.
function budgetOf(s: MatchState, u: Unit): number {
  return bonusBarred(s, u) ? Math.max(0, u.mp - u.bonusMp) : u.mp;
}

// rules 2, 9 and 13: tile it may stop on -> half-points left on arrival. A move never passes through a tile its owner
// had not explored when the move began; only a pathfinder may end on one (rules 6; CONFIG.closedFog off replays the
// older rule, where any unit could).
export function reachable(s: MatchState, unitId: number): Record<HexKey, number> {
  const u = unitById(s, unitId);
  if (u === undefined) return {};
  const out: Record<HexKey, number> = {};
  for (const [k, v] of explore(s, u)) out[k] = v.left;
  return out;
}

// rules 10: has this unit already entered its first relay tile this turn (or does the rule not apply)? From then on
// every relay tile costs CONFIG.relayCost; until then a relay tile costs what it would without relay riders.
function relayOpen(s: MatchState, u: Unit): boolean {
  return !CONFIG.relayFirstFull || u.relayTurn === s.stamp;
}

interface Step { cost: number; forced: boolean }

// The search behind reachable: tile it may stop on -> half-points left, and whether the best way there has opened
// relay riding for the rest of the turn (rules 10). The search runs over (tile, relay open) pairs.
function explore(s: MatchState, u: Unit): Map<HexKey, { left: number; open: boolean }> {
  const result = new Map<HexKey, { left: number; open: boolean }>();
  if (u.fresh || u.turnEnded || u.mp <= 0 || (u.acted && !hasTrait(u, 'retreat'))) return result;
  const faction = FACTIONS[s.players[u.owner]!.faction];
  const mounted = hasTrait(u, 'mounted');
  const relays = faction.relayRiders && (mounted || !faction.relayMountedOnly);   // rules 8: mounted units only
  const climbs = canClimb(s, u.owner);                     // rules 8: may step onto a mountain at all
  const explored = new Set(s.players[u.owner]!.explored);
  // rules 3 to 5 only: a move could end on one unexplored tile, and mounted Mongol riders kept moving after it
  const keepsMoveInFog = !CONFIG.closedFog && mounted && s.players[u.owner]!.faction === 'mongols';
  const entersFog = !CONFIG.closedFog || hasTrait(u, 'pathfinder');
  const node = (k: HexKey, open: boolean): string => `${k}|${open ? 1 : 0}`;
  const fog = new Set<string>();                            // unexplored tiles reached: ends of moves only
  const startOpen = relayOpen(s, u);
  const best = new Map<string, { k: HexKey; open: boolean; left: number }>([[node(u.pos, startOpen), { k: u.pos, open: startOpen, left: budgetOf(s, u) }]]);
  const done = new Set<string>();
  // What a step costs without relay riders (null: it may not be taken).
  const plainStep = (from: HexKey, to: HexKey, terrain: string, left: number, firstStep: boolean): Step | null => {
    if (hasRoadOrCity(s, from) && hasRoadOrCity(s, to)) return { cost: CONFIG.roadCost, forced: false };
    if (terrain === 'mountain') return firstStep ? { cost: left, forced: true } : null;
    if (mounted && faction.forestStopsMounted && terrain === 'forest') {
      // the normal forest cost, unless it is the first step; then the rest of the move is gone
      if (!firstStep && left < (CONFIG.terrain.forest.enterCost ?? 0)) return null;
      return { cost: left, forced: true };
    }
    // rules 11: a forest costs a forest-striding faction's units a field's cost
    const cover = terrain === 'forest' && faction.forestStride ? 'field' : terrain;
    return { cost: CONFIG.terrain[cover as keyof typeof CONFIG.terrain].enterCost ?? left, forced: false };
  };
  for (;;) {
    let cur: { k: HexKey; open: boolean; left: number } | null = null;
    let curNode = '';
    for (const [n, v] of best) {
      if (!done.has(n) && !fog.has(n) && v.left > 0 && (cur === null || v.left > cur.left)) { cur = v; curNode = n; }
    }
    if (cur === null) break;
    done.add(curNode);
    const { k: from, left } = cur;
    const firstStep = from === u.pos && !u.moved;
    const offMountain = CONFIG.mountain.endsTurn && tileAt(s, from)?.terrain === 'mountain';
    for (const d of DIRS) {
      const to = key(add(parseKey(from), d));
      const tile = tileAt(s, to);
      if (tile === undefined || tile.terrain === 'water' || isEnemyAt(s, u.owner, to)) continue;
      if (!entersFog && !explored.has(to)) continue;
      if (!climbs && tile.terrain === 'mountain') continue;   // rules 8: climbing needs CONFIG.mountain.tech
      let step: Step | null;
      let open = cur.open;
      if (offMountain || (CONFIG.mountain.endsTurn && tile.terrain === 'mountain')) {
        // rules 8: onto or off a mountain only as the first step, for everything left; it ends the turn (moveHandler).
        // Before the road and relay costs, should a city or road ever stand on a mountain.
        if (!firstStep) continue;
        step = { cost: left, forced: true };
      } else if (relays && tile.cityId !== null && cityById(s, tile.cityId)?.owner === u.owner) {
        if (open) step = { cost: CONFIG.relayCost, forced: false };
        else {
          // rules 10: the first relay tile of the turn costs what it would without relay riders. A tile relay riding
          // would not make cheaper (a road) does not count as that first tile.
          step = plainStep(from, to, tile.terrain, left, firstStep);
          if (step === null || step.forced || step.cost > CONFIG.relayCost) open = true;
        }
      } else {
        step = plainStep(from, to, tile.terrain, left, firstStep);
      }
      if (step === null) continue;
      const { cost, forced } = step;
      let after = left - cost;
      if (forced) after = 0;
      else if (cost > left) {
        if (!firstStep) continue;
        after = 0;
      }
      if (nextToEnemy(s, u.owner, to)) after = 0;
      const n = node(to, open);
      if (!explored.has(to)) {
        fog.add(n);
        if (!keepsMoveInFog) after = 0;
      }
      if (after > (best.get(n)?.left ?? -1)) best.set(n, { k: to, open, left: after });
    }
  }
  for (const v of best.values()) {
    if (v.k === u.pos || unitAt(s, v.k) !== undefined) continue;
    const had = result.get(v.k);
    // the most movement left; on a tie, the way that has opened relay riding (it is never worse later in the turn)
    if (had === undefined || v.left > had.left || (v.left === had.left && v.open && !had.open)) result.set(v.k, { left: v.left, open: v.open });
  }
  return result;
}

// rules 8: may units of `player` step onto a mountain? Only once the player has researched CONFIG.mountain.tech (none
// needed when it is null). Takes anything with players, so a player's view works too.
export function canClimb(s: Pick<MatchState, 'players'>, player: number): boolean {
  const tech = CONFIG.mountain.tech;
  return tech === null || s.players[player]?.techs.includes(tech) === true;
}

// rules 8: does a move from `from` to `to` step onto or off a mountain, and so end the unit's turn? Takes anything with
// tiles, so a player's view works too (the UI marks such moves).
export function mountainStep(s: Pick<MatchState, 'tiles'>, from: HexKey, to: HexKey): boolean {
  const isPeak = (k: HexKey): boolean => hasOwn(s.tiles, k) && s.tiles[k]!.terrain === 'mountain';
  return CONFIG.mountain.endsTurn && (isPeak(from) || isPeak(to));
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
  endHunker(target, ev);   // rules 7: pulled off its ground
}

export const moveHandler: Handler<Extract<Action, { type: 'move' }>> = (s, a, ev) => {
  if (typeof a.unit !== 'number' || typeof a.to !== 'string') return 'bad move';
  const u = unitById(s, a.unit);
  if (u === undefined) return 'no such unit';
  if (u.owner !== s.current) return 'not your unit';
  const option = explore(s, u).get(a.to);
  if (option === undefined) return 'cannot reach that tile';
  const left = option.left;
  // rules 10: the move entered its first relay tile of the turn, so later relay tiles this turn cost CONFIG.relayCost
  if (option.open && !relayOpen(s, u)) u.relayTurn = s.stamp;
  const from = u.pos;
  const intoFog = !s.players[u.owner]!.explored.includes(a.to);
  // rules 6: spending comes out of the riding bonus first; a move from enemy territory forfeits what was left of it
  u.bonusMp = bonusBarred(s, u) ? 0 : Math.max(0, u.bonusMp - (u.mp - left));
  u.pos = a.to; u.mp = left; u.moved = true; u.enteredTurn = s.stamp;
  // rules 6: a pathfinder that ends a move in the fog has spent its turn: no more moving, attacking or abilities
  if (CONFIG.closedFog && intoFog) { u.mp = 0; u.attacks = 0; u.acted = true; u.itemTurn = s.stamp; }
  // rules 8: a step onto or off a mountain ends the turn the same way, and for good: not even haste moves it again
  if (mountainStep(s, from, a.to)) {
    u.mp = 0; u.bonusMp = 0; u.attacks = 0; u.acted = true; u.itemTurn = s.stamp; u.turnEnded = true;
  }
  ev.push({ type: 'moved', unit: u.id, from, to: a.to });
  addDeed(s, u, 'march', distance(parseKey(from), parseKey(a.to)), ev);
  if (u.lure !== null) pullLured(s, u, from, ev);
  u.lure = null;
  return null;
};
