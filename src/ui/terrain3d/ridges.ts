// water3d: mountain ridges. Where two mountain tiles touch, the pair is drawn, RIDGE_CHANCE of the time, as one ridge:
// a crest of rock from one tile's main peak to the other's, dipping to a saddle where it crosses their shared edge.
// Visual only: nothing in the engine, the map or the rules knows of it. Pure maths, no three.js; build.ts makes the
// rock from the sections here.
//
// The choice is made per touching pair, from the two tiles' keys and the match's seed, so every viewer and every
// redraw agrees, and a pair never changes its mind when the fog lifts from more of the range (a choice per whole range
// would, as the range is found to be larger). Pairs that join share a tile chain into ridges of three and more.
//
// Each tile's own content keeps its place and reads on its tile: the crest runs between the main peaks at the back of
// the tiles, along a side edge on the way to a lower neighbour, and it is drawn narrower and lower wherever it would
// come near what stands on a tile (ore, jewels, a mine or foundry, a chest).
//
// Later, mountains will take their shape from their biome: ridgeChance (and only it) decides which pairs join.
import type { HexKey } from '../../engine';
import { chestSpot } from './buildingLayout';
import type { GlMap, GlTile } from './input';
import { centre, EDGE_NB, hash2, mountainPeaks, parse, R, shownResource } from './layout';
import type { Peak } from './layout';
import { MINE_FLAT } from './townLayout';

/** How often a touching pair of mountains is drawn as one ridge. */
export const RIDGE_CHANCE = 0.3;

/** A 32 bit string hash (FNV-1a with a final mix), so nearby keys and seeds scatter. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

/** The pair's roll, 0 to 1: the same whichever tile asks, for this match's seed. */
export function ridgeRoll(a: HexKey, b: HexKey, seed: number): number {
  const [x, y] = a < b ? [a, b] : [b, a];
  return hash32(`${x}|${y}|${seed}`) / 4294967296;
}

/**
 * Whether two touching mountain tiles are drawn as one ridge. Self-contained, so a later biome look can replace it:
 * it sees only the pair and the seed.
 */
export function ridgeChance(a: HexKey, b: HexKey, seed: number): boolean {
  return ridgeRoll(a, b, seed) < RIDGE_CHANCE;
}

const isMountain = (t: GlTile | undefined): t is GlTile => t !== undefined && t.terrain === 'mountain' && !t.city;

/** The edges of mountain tile k that join a neighbour into a ridge (both drawn, both mountains, and the roll says so). */
export function ridgeEdges(map: GlMap, k: HexKey): number[] {
  if (!isMountain(map.tiles[k])) return [];
  const { q, r } = parse(k);
  const out: number[] = [];
  EDGE_NB.forEach(([dq, dr], e) => {
    const nk = `${q + dq},${r + dr}`;
    if (isMountain(map.tiles[nk]) && ridgeChance(k, nk, map.seed ?? 0)) out.push(e);
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The crest

/** What the crest keeps clear of on a tile (world x, z): a round spot (rad) or a box (half sizes hx, hz). */
export interface Anchor { x: number; z: number; rad: number; hx?: number; hz?: number }

/** Where a mountain tile's content stands, in world space, from the tile alone (no roads, no neighbours). */
export function ridgeAnchors(t: GlTile, q: number, r: number): Anchor[] {
  const c = centre(q, r);
  // The unit's place in the middle needs none: its figure draws over the terrain, and the crest keeps to the back.
  const out: Anchor[] = [];
  const res = shownResource(t);
  if (res === 'ore') out.push({ x: c.x + 11, z: c.z + 13, rad: 5 });
  if (res === 'jewels') out.push({ x: c.x + 11, z: c.z + 13, rad: 8 });
  if (t.building === 'mine' || t.building === 'foundry') {
    const hx = (MINE_FLAT.x1 - MINE_FLAT.x0) / 2, hz = (MINE_FLAT.z1 - MINE_FLAT.z0) / 2;
    out.push({ x: c.x + MINE_FLAT.x0 + hx, z: c.z + MINE_FLAT.z0 + hz, rad: 0, hx, hz });
    if (t.building === 'foundry') out.push({ x: c.x + 12, z: c.z + 6, rad: 7 });
  }
  const chest = chestSpot(t);
  if (chest !== null) out.push({ x: c.x + chest.x, z: c.z + chest.z, rad: 6 * chest.s });
  return out;
}

const anchorDist = (a: Anchor, x: number, z: number): number => {
  if (a.hx === undefined || a.hz === undefined) return Math.hypot(x - a.x, z - a.z) - a.rad;
  const dx = Math.max(0, Math.abs(x - a.x) - a.hx), dz = Math.max(0, Math.abs(z - a.z) - a.hz);
  return Math.hypot(dx, dz) - a.rad;
};

/** One cross-section of the crest (world x, z), its direction along the ridge, crest height and half width at the foot. */
export interface RidgeSection { x: number; z: number; tx: number; tz: number; h: number; w: number }
/**
 * A tile's half of one ridge: from its own main peak out to where the ridge crosses into its neighbour (the last
 * section, which the neighbour's half starts with, exactly). `peak` is the height of the taller of the two main peaks,
 * for the snow line. The upper tile's half also carries the ridge's tooth: a small peak standing on the saddle, where
 * the crest crosses the edge, so the range reads as peaks along a crest (null where the crest is held low there).
 */
export interface RidgeHalf { edge: number; sections: RidgeSection[]; peak: number; tooth: { x: number; z: number; h: number; b: number; rot: number } | null }

/** How wide the crest's foot is for its height: about the peaks' own slope. */
export const RIDGE_SLOPE = 0.5;
const FOOT = 2.5; // the foot's least half width, beyond the slope
const STEP = 3; // world units between sections

// Edge e of a tile runs from corner e-1 to corner e (corners at 30 + 60i degrees). The crest crosses each lower edge
// (0: right, 1: front right, 2: front left) toward its back corner, and on the way to a front edge it runs out along
// the tile's side, so the front of the tile stays clear.
const corner = (i: number): [number, number] => { const a = ((30 + 60 * (((i % 6) + 6) % 6)) * Math.PI) / 180; return [R * Math.cos(a), R * Math.sin(a)]; };
const CROSS: Record<number, { back: number; front: number; t: number; via: [number, number] | null }> = {
  0: { back: 5, front: 0, t: 0.3, via: null },
  1: { back: 0, front: 1, t: 0.12, via: [23, -3] },
  2: { back: 2, front: 1, t: 0.12, via: [-23, -3] },
};

/**
 * The whole ridge between upper tile a and its neighbour across edge e (0, 1 or 2): the path in world space, the
 * arc length where it crosses the shared edge, and the peaks it joins. The same numbers whichever tile asks.
 */
export function ridgePath(map: GlMap, a: HexKey, e: number): { pts: [number, number][]; cross: number; pa: Peak; pb: Peak } | null {
  const ta = map.tiles[a];
  const { q, r } = parse(a);
  const [dq, dr] = EDGE_NB[e]!;
  const bq = q + dq, br = r + dr;
  const tb = map.tiles[`${bq},${br}`];
  const spec = CROSS[e];
  if (!isMountain(ta) || !isMountain(tb) || spec === undefined) return null;
  const pa = mountainPeaks(ta, q, r)[0], pb = mountainPeaks(tb, bq, br)[0];
  if (pa === undefined || pb === undefined) return null;
  const ca = centre(q, r), cb = centre(bq, br);
  const [bx, bz] = corner(spec.back), [fx, fz] = corner(spec.front);
  const cross: [number, number] = [ca.x + bx + (fx - bx) * spec.t, ca.z + bz + (fz - bz) * spec.t];
  const pts: [number, number][] = [[ca.x + pa.x, ca.z + pa.z]];
  if (spec.via !== null) pts.push([ca.x + spec.via[0], ca.z + spec.via[1]]);
  pts.push(cross, [cb.x + pb.x, cb.z + pb.z]);
  let len = 0;
  for (let i = 1; i < pts.length - 1; i++) len += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  return { pts, cross: len, pa, pb };
}

function along(pts: readonly [number, number][], s: number): [number, number] {
  let left = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1]!, [bx, bz] = pts[i]!;
    const l = Math.hypot(bx - ax, bz - az);
    if (left <= l || i === pts.length - 1) { const u = l > 0 ? Math.min(1, left / l) : 0; return [ax + (bx - ax) * u, az + (bz - az) * u]; }
    left -= l;
  }
  return pts[pts.length - 1]!;
}
const pathLength = (pts: readonly [number, number][]): number => {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  return n;
};

/**
 * The crest's height at arc length s: high where it leaves each main peak (inside the peak's own rock), falling to a
 * saddle about a third of the lower peak's height where it crosses the edge, with a low knoll or two on the way.
 */
function crestHeight(s: number, len: number, cross: number, pa: Peak, pb: Peak, seed: number): number {
  const fromPeak = (d: number, p: Peak): number => 0.72 * p.h * Math.pow(Math.max(0, 1 - d / (1.25 * p.b)), 1.1);
  const saddle = 0.34 * Math.min(pa.h, pb.h);
  const knoll = 0.1 * Math.min(pa.h, pb.h) * Math.sin(((s - cross) / 9 + seed * 6.28) * 1.3) ** 2;
  return Math.max(saddle + knoll, fromPeak(s, pa), fromPeak(len - s, pb));
}

/**
 * The halves of the ridges that tile k carries, one for each joined edge. Each half's sections run from k's main peak
 * (a little out from its summit) to the crossing; the two halves of a ridge share that crossing section exactly.
 */
export function ridgeHalves(map: GlMap, k: HexKey): RidgeHalf[] {
  const out: RidgeHalf[] = [];
  const { q, r } = parse(k);
  for (const e of ridgeEdges(map, k)) {
    // The ridge belongs to the pair; its path is worked out from the upper tile (edges 0, 1, 2 go down or right).
    const upper = e <= 2;
    const [dq, dr] = EDGE_NB[e]!;
    const ak = upper ? k : `${q + dq},${r + dr}`;
    const path = ridgePath(map, ak, upper ? e : e - 3);
    if (path === null) continue;
    const { pts, cross, pa, pb } = path;
    const len = pathLength(pts);
    const ta = map.tiles[ak]!, a = parse(ak);
    const tb = map.tiles[upper ? `${q + dq},${r + dr}` : k]!, b = parse(upper ? `${q + dq},${r + dr}` : k);
    const anchors = [...ridgeAnchors(ta, a.q, a.r), ...ridgeAnchors(tb, b.q, b.r)];
    const seed = hash2(a.q * 1.7 + b.q, a.r * 2.3 + b.r);
    const [s0, s1] = upper ? [0.3 * pa.b, cross] : [cross, len - 0.3 * pb.b];
    const n = Math.max(2, Math.ceil((s1 - s0) / STEP));
    const sections: RidgeSection[] = [];
    for (let i = 0; i <= n; i++) {
      // Each half runs from its own peak outward, so the crossing is its last section.
      const s = upper ? (i === n ? cross : s0 + ((s1 - s0) * i) / n) : s1 - ((s1 - s0) * i) / n;
      const [x, z] = along(pts, s);
      const [ax, az] = along(pts, s - 1.5), [bx, bz] = along(pts, s + 1.5);
      const tl = Math.hypot(bx - ax, bz - az) || 1;
      let h = crestHeight(s, len, cross, pa, pb, seed);
      let w = RIDGE_SLOPE * h + FOOT;
      // Keep clear of what stands on either tile: narrower, and so lower, wherever it comes near.
      for (const an of anchors) {
        const room = anchorDist(an, x, z) - 1.5;
        if (room < w) { w = Math.max(0, room); h = Math.min(h, Math.max(0, (w - FOOT) / RIDGE_SLOPE)); }
      }
      sections.push({ x, z, tx: (bx - ax) / tl, tz: (bz - az) / tl, h, w });
    }
    const x = sections[sections.length - 1]!;
    const th = 1.55 * x.h;
    const tooth = upper && x.h > 7 ? { x: x.x, z: x.z, h: th, b: Math.min(x.w + 1, th * 0.5), rot: seed * 6.28 } : null;
    out.push({ edge: e, sections, peak: Math.max(pa.h, pb.h), tooth });
  }
  return out;
}
