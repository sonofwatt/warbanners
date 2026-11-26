// The 3D water: a clear surface over a shallow bed, and the fish of a fish tile swimming under it. Pure maths, no
// three.js, so it can be tested in Node; water.ts builds the meshes and its shaders follow fishAt line for line.
//
// The bed lies under every water tile, shallow where the water meets land (or a fogged tile, or the board's back rim)
// and deepest in open water. Where two water tiles meet, both beds fall away alike, so the bed runs on unbroken; the
// walls between them are left out. A front edge on the board's rim keeps its water column, where the falls pour.
import type { HexKey } from '../../engine';
import type { GlMap } from './input';
import { centre, distToEdges, EDGE_NB, edgeDist, hash2, INR, parse, smooth, SQUASH, COS_E, variantOf, vnoise, WATER_Y } from './layout';

/** How deep the bed lies below the surface in open water, in world units. */
export const BED_DEPTH = 7.5;
/** The least depth of water over the bed, even at the shore: the bed never meets the surface, so the two never fight. */
export const BED_MIN = 0.45;
/** How far from a shallow edge the bed takes to fall to its full depth. */
export const BED_REACH = 16;

const hexDist = (q: number, r: number): number => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
const isWater = (map: GlMap, k: HexKey): boolean => { const t = map.tiles[k]; return t !== undefined && t.terrain === 'water' && !t.city; };

/**
 * The edges of a water tile where its bed comes up shallow: every edge but those to another water tile, and those on
 * the board's front rim (1 and 2 off the board), where the water column shows and the falls pour.
 */
export function shallowEdges(map: GlMap, k: HexKey): number[] {
  const { q, r } = parse(k);
  const out: number[] = [];
  EDGE_NB.forEach(([dq, dr], e) => {
    const nk = `${q + dq},${r + dr}`;
    if (isWater(map, nk)) return;
    if ((e === 1 || e === 2) && hexDist(q + dq, r + dr) > map.radius) return;
    out.push(e);
  });
  return out;
}

/** The edges of a water tile that meet another water tile: no wall is built there, so the bed runs on. */
export function openEdges(map: GlMap, k: HexKey): number[] {
  const { q, r } = parse(k);
  const out: number[] = [];
  EDGE_NB.forEach(([dq, dr], e) => { if (isWater(map, `${q + dq},${r + dr}`)) out.push(e); });
  return out;
}

/** How far the bed has fallen toward its full depth (0 to 1) at a distance from the nearest shallow edge. */
export const bedFall = (d: number): number => smooth(0, BED_REACH, d);

/**
 * The depth of water over the bed at a tile point (local), with soft sand ripples. The ripples follow world space,
 * so two water tiles side by side agree along their shared edge.
 */
export function bedDepthFn(shallow: readonly number[], q: number, r: number): (lx: number, lz: number) => number {
  const c = centre(q, r);
  return (lx, lz) => {
    const f = shallow.length ? bedFall(distToEdges(lx, lz, shallow)) : 1;
    const wx = c.x + lx, wz = c.z + lz;
    const ripple = 0.55 * (vnoise(wx * 0.09, wz * 0.09) - 0.5) + 0.25 * (vnoise(wx * 0.35 + 7.3, wz * 0.2) - 0.5);
    return BED_MIN + (BED_DEPTH - BED_MIN) * f * (1 + ripple * 0.35 * f);
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The bed's stones and weeds

/** Low things on the bed: a pale stone, a weed clump (a few blades), or a scatter of pebbles. */
export interface BedBit { kind: 'rock' | 'weed' | 'pebbles'; x: number; z: number; s: number; seed: number }

/** Two to four stones and weeds per water tile, off the middle, more often in the shallows. Never on the rim. */
export function bedBits(q: number, r: number, v: number): BedBit[] {
  const out: BedBit[] = [];
  const n = 3 + ((v + q + 2 * r) & 1);
  for (let i = 0; i < 10 && out.length < n; i++) {
    const a = hash2(q * 1.9 + i * 3.7, r * 2.3 - i) * Math.PI * 2;
    const d = 9 + hash2(i * 2.9 + q, r * 1.1 + i) * 12;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (edgeDist(x, z) < 5) continue;
    if (out.some((b) => Math.hypot(b.x - x, b.z - z) < 8)) continue;
    const pick = hash2(i * 5.3 + r, q * 0.7 - i);
    const kind = pick < 0.4 ? 'weed' : pick < 0.72 ? 'rock' : 'pebbles';
    out.push({ kind, x, z, s: 0.75 + 0.45 * hash2(i, q - r), seed: hash2(q + i * 0.37, r - i * 0.61) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Fish

/**
 * The fish's own clock wraps every FISH_PERIOD seconds of the water's motion clock (falls.ts FLOW_PERIOD is a whole
 * number of these), and every fish swims a whole number of laps, and wags its tail a whole number of times, per
 * period: so the wrap is seamless. The clock stands still at rest and under reduced motion, and so do the fish.
 */
export const FISH_PERIOD = 100;
/** How far a fish's body reaches from its path's point, to the tip of its tail, at size 1 (world units). */
export const FISH_HALF = 5.4;
/** The least distance a fish keeps from its tile's edge, its body included. */
export const FISH_MARGIN = 5;

/**
 * One fish's loop, local to its tile: a rounded ellipse (radii ra, rb, turned by rot) round (cx, cz), swum `laps`
 * times per period (the sign is the way round), from `phase`. It bobs a little at its depth below the surface and
 * wags its tail `wag` times per period.
 */
export interface FishPath {
  cx: number; cz: number; ra: number; rb: number; rot: number; phase: number;
  laps: number; depth: number; size: number; wag: number;
}

/** The fish of a fish tile: three (two on the odd layouts), or one, smaller, once the tile is harvested. */
export function fishPaths(q: number, r: number, v: number, faded: boolean): FishPath[] {
  const count = faded ? 1 : v % 2 === 1 ? 2 : 3;
  const out: FishPath[] = [];
  const spin = hash2(q * 3.3 + 1, r * 1.7 - 2) * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const h = (k: number): number => hash2(q * 1.31 + i * 7.1 + k, r * 2.17 - i * 3.3 + k * 0.7);
    const a = spin + (i * Math.PI * 2) / count;
    const off = 1 + 2 * h(1);
    const size = (faded ? 1.05 : 1.25 + 0.15 * h(2)) * (i === 0 ? 1.05 : 1);
    const ra = 5.5 + 2.5 * h(3), rb = 4 + 2 * h(4);
    // A lap of about 9 to 13 seconds: unhurried, fish gliding, not racing.
    const laps = (8 + Math.floor(h(5) * 4)) * (h(6) < 0.5 ? -1 : 1);
    out.push({
      cx: Math.cos(a) * off, cz: Math.sin(a) * off, ra, rb, rot: h(7) * Math.PI, phase: h(8) * Math.PI * 2,
      laps, depth: 1.7 + 1.6 * h(9), size, wag: 140 + Math.floor(h(10) * 50),
    });
  }
  return out;
}

/** Where on its loop the fish is: the angle theta, at clock t (seconds). */
export function fishTheta(p: FishPath, t: number): number {
  const u = (((t % FISH_PERIOD) + FISH_PERIOD) % FISH_PERIOD) / FISH_PERIOD;
  return p.phase + Math.PI * 2 * p.laps * u;
}
/** A point on the loop (local), for the angle theta. */
export function fishPoint(p: FishPath, th: number): [number, number] {
  const k = 1 + 0.12 * Math.sin(2 * th + p.phase);
  const x = p.ra * Math.cos(th) * k, z = p.rb * Math.sin(th) * k;
  const c = Math.cos(p.rot), s = Math.sin(p.rot);
  return [p.cx + x * c - z * s, p.cz + x * s + z * c];
}

/** The fish's pose at clock t: its place (local x, z and world y) and its heading (radians, 0 along +x). */
export function fishAt(p: FishPath, t: number): { x: number; y: number; z: number; heading: number } {
  const th = fishTheta(p, t);
  const [x, z] = fishPoint(p, th);
  const d = 0.01 * Math.sign(p.laps);
  const [ax, az] = fishPoint(p, th - d), [bx, bz] = fishPoint(p, th + d);
  return { x, y: WATER_Y - p.depth - 0.35 * Math.sin(2 * th), z, heading: Math.atan2(bz - az, bx - ax) };
}

/** Whether a fish's loop keeps its whole body on its tile, FISH_MARGIN from the edge, all the way round. */
export function fishInside(p: FishPath, samples = 360): boolean {
  for (let i = 0; i < samples; i++) {
    const [x, z] = fishPoint(p, (i / samples) * Math.PI * 2);
    if (edgeDist(x, z) < FISH_MARGIN + FISH_HALF * p.size) return false;
  }
  return true;
}

/** Where the fish tiles' fish are, with their on-screen boxes (board units) for the ambient loop's on-screen test. */
export interface FishSpot { key: HexKey; q: number; r: number; x: number; z: number; paths: FishPath[]; box: { x0: number; x1: number; y0: number; y1: number } }

export function fishSpots(map: GlMap): FishSpot[] {
  const out: FishSpot[] = [];
  for (const k of Object.keys(map.tiles).sort()) {
    const t = map.tiles[k]!;
    if (t.terrain !== 'water' || t.resource !== 'fish' || t.city || t.building !== null || t.village || t.treasure) continue;
    const { q, r } = parse(k);
    const c = centre(q, r);
    const v = variantOf(q, r);
    const paths = fishPaths(q, r, v, t.harvested);
    const bx = c.x, by = c.z * SQUASH - WATER_Y * COS_E;
    out.push({ key: k, q, r, x: c.x, z: c.z, paths, box: { x0: bx - INR, x1: bx + INR, y0: by - INR * SQUASH, y1: by + INR * SQUASH + 8 } });
  }
  return out;
}
