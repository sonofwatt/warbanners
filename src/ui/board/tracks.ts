// tracks3d: the marks units leave on the ground, worked out on this phone from the match's own action history. Visual
// only: nothing here is sent, saved or read by the engine. Every phone replays the same record, so every phone (and
// every reload of a save) agrees on the tracks, and each viewer only ever gets the tracks it was allowed to see.
//
// A move records only where a unit went from and to, not the way it took, so its route is the straight hex line
// between the two. On each tile of the route the unit's kind (foot, hoof, wheel) gains wear, and the edges it came in
// and went out by are noted, so the marks follow the way units crossed the tile.
//
// Secrecy: the viewer's own units always leave tracks. An enemy's move leaves tracks only when the viewer could see
// that unit both before and after the action, and then only on the route tiles the viewer could see both before and
// after it. A move through the fog, a unit coming out of hiding or one walking into the fog leaves nothing.
import { applyAction, createMatch, playerView, UNITS, visibleTiles } from '../../engine';
import type { Action, GameEvent, HexKey, MatchSettings, MatchState, PlayerId, UnitTypeId } from '../../engine';

export type TrackKind = 'foot' | 'hoof' | 'wheel';
export const KINDS: readonly TrackKind[] = ['foot', 'hoof', 'wheel'];

/** What one kind of track looks like on one tile: its wear step (0 none, 1 faint, 2 worn, 3 trodden) and its edges. */
export interface KindLook { level: number; edges: number } // edges: bit d = engine direction d (DIRS order)
/** Everything the board draws for the traffic on one tile. Equal looks draw equal ground. */
export interface TrackLook {
  foot: KindLook; hoof: KindLook; wheel: KindLook;
  path: number; // 0, 1 (the ground is flattened along the tracks) or 2 (a beaten path), from all traffic together
  road: number; // 0 (a light road, as before) to 3 (a busy road: wide, worn, dead grass either side)
}

// The wear steps. A kind's step from its own wear (a scout weighs half a pass), the path and the road from all wear
// on the tile. Few steps, so the 3D ground is rebuilt only when a tile crosses one.
export const KIND_STEPS: readonly number[] = [0.5, 4, 12];
export const PATH_STEPS: readonly number[] = [10, 24];
export const ROAD_STEPS: readonly number[] = [16, 30, 45];
const stepOf = (steps: readonly number[], w: number): number => steps.filter((s) => w >= s - 1e-9).length;

/** Which kind of mark a unit type leaves, and how much one pass weighs. */
export function kindOf(type: UnitTypeId): { kind: TrackKind; weight: number } {
  const traits: readonly string[] = UNITS[type]?.traits ?? [];
  if (traits.includes('siege') || traits.includes('camp')) return { kind: 'wheel', weight: 1 };
  if (traits.includes('mounted')) return { kind: 'hoof', weight: 1 };
  return { kind: 'foot', weight: type === 'scout' ? 0.5 : 1 };
}

// ---------------------------------------------------------------------------------------------------------------
// Hexes (engine DIRS order: [1,0], [1,-1], [0,-1], [-1,0], [-1,1], [0,1])

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
// Wear

interface KindWear { w: number; edge: number[]; level: number; edges: number }
interface TileWear { foot: KindWear; hoof: KindWear; wheel: KindWear; total: number }
const kindWear = (): KindWear => ({ w: 0, edge: [0, 0, 0, 0, 0, 0], level: 0, edges: 0 });

/** One viewer's wear, tile by tile. */
export type Wear = Map<HexKey, TileWear>;

/**
 * One pass of a unit over one tile, coming in by edge `inn` and going out by `out` (-1: it started or stopped here).
 * A kind's edges are fixed when its step changes, from the edges most used so far, so a tile only looks different
 * when it crosses a step.
 */
export function addPass(wear: Wear, at: HexKey, kind: TrackKind, weight: number, inn: number, out: number): void {
  let t = wear.get(at);
  if (t === undefined) wear.set(at, (t = { foot: kindWear(), hoof: kindWear(), wheel: kindWear(), total: 0 }));
  const k = t[kind];
  k.w += weight;
  t.total += weight;
  if (inn >= 0) k.edge[inn]! += weight;
  if (out >= 0) k.edge[out]! += weight;
  const level = stepOf(KIND_STEPS, k.w);
  if (level !== k.level) {
    k.level = level;
    const most = Math.max(...k.edge);
    k.edges = k.edge.reduce((m, c, d) => (c > 0 && c >= most * 0.25 ? m | (1 << d) : m), 0);
  }
}

/** The look of every tile with wear. */
export function looksOf(wear: Wear): Map<HexKey, TrackLook> {
  const out = new Map<HexKey, TrackLook>();
  for (const [k, t] of wear) {
    out.set(k, {
      foot: { level: t.foot.level, edges: t.foot.edges },
      hoof: { level: t.hoof.level, edges: t.hoof.edges },
      wheel: { level: t.wheel.level, edges: t.wheel.edges },
      path: stepOf(PATH_STEPS, t.total),
      road: stepOf(ROAD_STEPS, t.total),
    });
  }
  return out;
}

/** A short code for a look: equal codes draw equal ground. */
export function lookCode(l: TrackLook): string {
  return `${l.foot.level}${l.foot.edges.toString(36)}.${l.hoof.level}${l.hoof.edges.toString(36)}.${l.wheel.level}${l.wheel.edges.toString(36)}.${l.path}${l.road}`;
}

// ---------------------------------------------------------------------------------------------------------------
// From actions

type Move = { unit: number; from: HexKey; to: HexKey };
const movesIn = (events: readonly GameEvent[]): Move[] => events.flatMap((e) => (
  e.type === 'moved' || e.type === 'advanced' || e.type === 'lured' ? [{ unit: e.unit, from: e.from, to: e.to }] : []));

/**
 * Adds one accepted action (its events, the states before and after it) to each viewer's wear. Water tiles take no
 * wear: nothing is ever drawn on them.
 */
export function addAction(wears: readonly Wear[], events: readonly GameEvent[], before: MatchState, after: MatchState): void {
  const moves = movesIn(events);
  if (moves.length === 0) return;
  // What each viewer could see, worked out only when an enemy of theirs moved.
  const sight: ({ tiles: Set<HexKey>; units: Set<number> } | null)[][] = wears.map(() => [null, null]);
  const seen = (viewer: PlayerId, which: 0 | 1): { tiles: Set<HexKey>; units: Set<number> } => {
    const hit = sight[viewer]![which] ?? null;
    if (hit !== null) return hit;
    const s = which === 0 ? before : after;
    const tiles = visibleTiles(s, viewer);
    const units = new Set(playerView(s, viewer).units.map((u) => u.id));
    return (sight[viewer]![which] = { tiles, units });
  };
  for (const m of moves) {
    const unit = before.units.find((u) => u.id === m.unit) ?? after.units.find((u) => u.id === m.unit);
    if (unit === undefined) continue;
    const { kind, weight } = kindOf(unit.type);
    const route = hexLine(m.from, m.to);
    wears.forEach((wear, v) => {
      const viewer = v as PlayerId;
      let shown: ((k: HexKey) => boolean) | null = null;
      if (unit.owner !== viewer) {
        const was = seen(viewer, 0), now = seen(viewer, 1);
        if (!was.units.has(unit.id) || !now.units.has(unit.id)) return;
        shown = (k) => was.tiles.has(k) && now.tiles.has(k);
      }
      route.forEach((k, i) => {
        if (shown !== null && !shown(k)) return;
        const terrain = (after.tiles[k] ?? before.tiles[k])?.terrain;
        if (terrain === undefined || terrain === 'water') return;
        const inn = i > 0 ? dirTo(k, route[i - 1]!) : -1;
        const out = i < route.length - 1 ? dirTo(k, route[i + 1]!) : -1;
        addPass(wear, k, kind, weight, inn, out);
      });
    });
  }
}

/**
 * The wear of a match so far, for both seats, kept to extend action by action. `state` is the match after `count`
 * actions; `last` is the last action taken in, to check that a later record extends this one.
 */
export interface Traffic {
  settings: MatchSettings; count: number; state: MatchState; last: string | null; wears: [Wear, Wear];
}

export function startTraffic(settings: MatchSettings): Traffic {
  return { settings, count: 0, state: createMatch(settings), last: null, wears: [new Map(), new Map()] };
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
 * the tracks then stand as they were (they are only decoration).
 */
export function advance(t: Traffic, actions: readonly Action[], budgetMs = Infinity, clock?: () => number): boolean {
  const start = clock?.() ?? 0;
  while (t.count < actions.length) {
    const a = actions[t.count]!;
    const r = applyAction(t.state, a);
    if (!r.ok) { t.count = actions.length; t.last = JSON.stringify(actions[actions.length - 1]); return true; }
    addAction(t.wears, r.events, t.state, r.state);
    t.state = r.state;
    t.count++;
    t.last = JSON.stringify(a);
    if (clock !== undefined && t.count < actions.length && clock() - start >= budgetMs) return false;
  }
  return true;
}

/** The tracks one viewer sees, from a whole action list at once (for tests and scripts). */
export function tracksOf(settings: MatchSettings, actions: readonly Action[], viewer: PlayerId): Map<HexKey, TrackLook> {
  const t = startTraffic(settings);
  advance(t, actions);
  return looksOf(t.wears[viewer === 0 ? 0 : 1]);
}
