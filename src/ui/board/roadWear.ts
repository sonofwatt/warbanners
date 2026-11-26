// tracks3d: how worn each road is, worked out on this phone from the match's own action history. Visual only: nothing
// here is sent, saved or read by the engine. Every phone replays the same record, so every phone (and every reload of
// a save) agrees, and each viewer only ever gets the traffic it was allowed to see.
//
// A move records only where a unit went from and to, not the way it took, so its route is the straight hex line
// between the two. Each road tile on the route (a road there after the action, not a city) takes one pass. The wear
// is cut into a few steps, so the 3D ground is rebuilt only when a road crosses one.
//
// Secrecy: the viewer's own units always count. An enemy's move counts only when the viewer could see that unit both
// before and after the action, and then only on the route tiles the viewer could see both before and after it. A move
// through the fog, a unit coming out of hiding or one walking into the fog adds nothing.
import { applyAction, createMatch, playerView, visibleTiles } from '../../engine';
import type { Action, GameEvent, HexKey, MatchSettings, MatchState, PlayerId } from '../../engine';

/** Passes at which a road steps up: below the first it is a light road, as it always was; the last is the cap. */
export const ROAD_STEPS: readonly number[] = [16, 30, 45];
/** A road's wear step (0 to 3) for its passes. */
export const stepOf = (passes: number): number => ROAD_STEPS.filter((s) => passes >= s).length;

// ---------------------------------------------------------------------------------------------------------------
// Hexes (engine DIRS order)

const DIRS: readonly (readonly [number, number])[] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const parse = (k: HexKey): [number, number] => { const [q, r] = k.split(','); return [Number(q), Number(r)]; };
const keyOf = (q: number, r: number): HexKey => `${q === 0 ? 0 : q},${r === 0 ? 0 : r}`;

/** The direction from tile a to its neighbour b, or -1 when they are not neighbours. */
export function dirTo(a: HexKey, b: HexKey): number {
  const [aq, ar] = parse(a), [bq, br] = parse(b);
  return DIRS.findIndex(([dq, dr]) => aq + dq === bq && ar + dr === br);
}

/** The straight hex line from a to b, both ends included: each tile a neighbour of the one before. */
export function hexLine(a: HexKey, b: HexKey): HexKey[] {
  const [aq, ar] = parse(a), [bq, br] = parse(b);
  const n = (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(aq + ar - bq - br)) / 2;
  const out: HexKey[] = [];
  // A tiny nudge keeps a line along a seam from rounding to either side by chance: every phone rounds alike.
  const ax = aq + 1e-6, az = ar + 2e-6, bx = bq + 1e-6, bz = br + 2e-6;
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = -x - z;
    let rx = Math.round(x), rz = Math.round(z);
    const ry = Math.round(y);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (!(dy > dz)) rz = -rx - ry;
    out.push(keyOf(rx, rz));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// From actions

/** One viewer's passes, road tile by road tile. */
export type Passes = Map<HexKey, number>;

type Move = { unit: number; from: HexKey; to: HexKey };
const movesIn = (events: readonly GameEvent[]): Move[] => events.flatMap((e) => (
  e.type === 'moved' || e.type === 'advanced' || e.type === 'lured' ? [{ unit: e.unit, from: e.from, to: e.to }] : []));

/** Adds one accepted action (its events, the states before and after it) to each viewer's passes. */
export function addAction(passes: readonly Passes[], events: readonly GameEvent[], before: MatchState, after: MatchState): void {
  const moves = movesIn(events);
  if (moves.length === 0) return;
  const city = new Set(after.cities.map((c) => c.pos));
  const onRoad = (k: HexKey): boolean => after.tiles[k]?.road === true && !city.has(k);
  // What each viewer could see, worked out only when an enemy of theirs moved along a road.
  const sight: ({ tiles: Set<HexKey>; units: Set<number> } | null)[][] = passes.map(() => [null, null]);
  const seen = (viewer: PlayerId, which: 0 | 1): { tiles: Set<HexKey>; units: Set<number> } => {
    const hit = sight[viewer]![which] ?? null;
    if (hit !== null) return hit;
    const s = which === 0 ? before : after;
    return (sight[viewer]![which] = { tiles: visibleTiles(s, viewer), units: new Set(playerView(s, viewer).units.map((u) => u.id)) });
  };
  for (const m of moves) {
    const unit = before.units.find((u) => u.id === m.unit) ?? after.units.find((u) => u.id === m.unit);
    if (unit === undefined) continue;
    const roads = hexLine(m.from, m.to).filter(onRoad);
    if (roads.length === 0) continue;
    passes.forEach((p, v) => {
      const viewer = v as PlayerId;
      let shown: (k: HexKey) => boolean = () => true;
      if (unit.owner !== viewer) {
        const was = seen(viewer, 0), now = seen(viewer, 1);
        if (!was.units.has(unit.id) || !now.units.has(unit.id)) return;
        shown = (k) => was.tiles.has(k) && now.tiles.has(k);
      }
      for (const k of roads) if (shown(k)) p.set(k, (p.get(k) ?? 0) + 1);
    });
  }
}

/** Each road's wear step, for the roads that have one (a light road is left out). */
export function wearOf(passes: Passes): Map<HexKey, number> {
  const out = new Map<HexKey, number>();
  for (const [k, n] of passes) { const s = stepOf(n); if (s > 0) out.set(k, s); }
  return out;
}

/**
 * The passes of a match so far, for both seats, kept to extend action by action. `state` is the match after `count`
 * actions; `last` is the last action taken in, to check that a later record extends this one.
 */
export interface Traffic {
  settings: MatchSettings; count: number; state: MatchState; last: string | null; passes: [Passes, Passes];
}

export function startTraffic(settings: MatchSettings): Traffic {
  return { settings, count: 0, state: createMatch(settings), last: null, passes: [new Map(), new Map()] };
}

/** Whether `t` can be extended to the record's actions (the same match, and nothing taken in has changed since). */
export function extends_(t: Traffic, settings: MatchSettings, actions: readonly Action[]): boolean {
  if (t.settings.seed !== settings.seed || t.settings.factions.join() !== settings.factions.join()) return false;
  if (actions.length < t.count) return false;
  return t.count === 0 || JSON.stringify(actions[t.count - 1]) === t.last;
}

/**
 * Takes in the record's next actions, until all are in or `budgetMs` has passed (checked with `clock`, which the
 * caller passes, so this file reads no clock). Returns whether it is up to date. A refused action stops it for good:
 * the roads then stand as they were (they are only decoration).
 */
export function advance(t: Traffic, actions: readonly Action[], budgetMs = Infinity, clock?: () => number): boolean {
  const start = clock?.() ?? 0;
  while (t.count < actions.length) {
    const a = actions[t.count]!;
    const r = applyAction(t.state, a);
    if (!r.ok) { t.count = actions.length; t.last = JSON.stringify(actions[actions.length - 1]); return true; }
    addAction(t.passes, r.events, t.state, r.state);
    t.state = r.state;
    t.count++;
    t.last = JSON.stringify(a);
    if (clock !== undefined && t.count < actions.length && clock() - start >= budgetMs) return false;
  }
  return true;
}

/** The road wear one viewer sees, from a whole action list at once (for tests and scripts). */
export function roadWearOf(settings: MatchSettings, actions: readonly Action[], viewer: PlayerId): Map<HexKey, number> {
  const t = startTraffic(settings);
  advance(t, actions);
  return wearOf(t.passes[viewer === 0 ? 0 : 1]);
}
