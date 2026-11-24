// What stands on each tile of the 3D terrain, laid out in world units around the tile centre. Pure maths, no
// three.js, so it can be tested in Node.
//
// World space: x = board x, z = board y / SQUASH (the true ground depth, +z toward the viewer), y = height.
// Every terrain has four layouts, picked per tile so no two neighbours share one, and each tile also turns its
// layout (one of six turns) so the same layout reads differently. The light never turns with it: only the
// layout does. Tall things (peaks, the grove behind what shares a forest) keep to the back of the tile.
import type { HexKey } from '../../engine';
import { THICK_3D } from './input';
import type { GlMap, GlTile } from './input';

export const R = 30; // board/layout.ts
export const SQUASH = 0.62; // board/layout.ts
export const SQ3 = Math.sqrt(3);
export const COS_E = Math.sqrt(1 - SQUASH * SQUASH);
export const WALL = THICK_3D / COS_E; // wall depth in world units, so it shows THICK_3D board units tall
export const WATER_Y = -2.2; // water sits a little below the land, so the shore shows a bank
export const INR = (R * SQ3) / 2; // inradius
export const ROAD_HALF = 2.7; // half width of a road in world units (the SVG stroke is 4.6 wide)

export const TERRAIN_ID = { field: 0, forest: 1, mountain: 2, water: 3, sand: 4, fog: 5 } as const;
export const RES_ID = { none: 0, cropland: 1, orchard: 2, game: 3, ore: 4 } as const;

// Neighbour directions by edge-normal angle 0, 60, ..., 300 degrees (world, z toward the viewer).
export const EDGE_NB: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

export function parse(k: HexKey): { q: number; r: number } {
  const [q, r] = k.split(',').map(Number);
  return { q: q ?? 0, r: r ?? 0 };
}
export const centre = (q: number, r: number): { x: number; z: number } => ({ x: R * SQ3 * (q + r / 2), z: 1.5 * R * r });

/** Four layouts per terrain: (3q + r) mod 4 differs between any two neighbours. */
export function variantOf(q: number, r: number): number {
  return (((q * 7 + r * 13) % 4) + 4) % 4;
}
/** One of six turns per tile, by a hash, so equal layouts on far apart tiles still differ. */
export function turnOf(q: number, r: number): number {
  return Math.min(5, Math.floor(hash2(q * 1.37 + 0.5, r * 2.11 - 0.3) * 6));
}

// ---------------------------------------------------------------------------------------------------------------
// Small helpers

export function hash2(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function vnoise(x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y);
  const fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function edgeDist(lx: number, lz: number): number {
  let m = -Infinity;
  for (let e = 0; e < 6; e++) {
    const a = (e * Math.PI) / 3;
    m = Math.max(m, lx * Math.cos(a) + lz * Math.sin(a));
  }
  return INR - m;
}
/** Distance to the edges whose index is in `edges` (Infinity when none). */
export function distToEdges(lx: number, lz: number, edges: readonly number[]): number {
  let m = Infinity;
  for (const e of edges) {
    const a = (e * Math.PI) / 3;
    m = Math.min(m, INR - (lx * Math.cos(a) + lz * Math.sin(a)));
  }
  return m;
}
/** Turn a layout point by `turn` sixths of a circle about the tile centre. */
export function spin(x: number, z: number, turn: number): [number, number] {
  const a = (turn * Math.PI) / 3;
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - z * s, x * s + z * c];
}

// ---------------------------------------------------------------------------------------------------------------
// Layouts

/**
 * A peak: x, z, height (world units), base radius, ridge turn, the side ridge that carries a shoulder (-1: none)
 * and how much snow (0 none, 1 a cap on the top band, 2 the full broken snow line).
 */
export interface Peak { x: number; z: number; h: number; b: number; rot: number; shoulder: number; snow: 0 | 1 | 2; ore?: boolean }

// Mountains: one large main peak with a straight summit, about 35 to 38 board units on screen, and two or three
// smaller peaks around it at 40 to 62 percent of its height. Peaks on the left stand behind the main peak, so its
// lit left face is never covered; only the shaded right side has a peak beside it. [x, z, height fraction, base].
interface MountainLayout { main: [number, number, number, number, number]; subs: [number, number, number, number][] }
const MOUNTAINS: MountainLayout[] = [
  { main: [-1, -3, 46.75, 22, 0.10], subs: [[13, -10, 0.55, 11], [-12, -13, 0.45, 9]] },
  { main: [1, -4, 48.45, 21, -0.12], subs: [[-12, -12, 0.6, 11], [16, -1, 0.42, 8], [4, -16, 0.5, 9]] },
  { main: [-2, -2, 45.05, 23, 0.22], subs: [[15, -6, 0.62, 10], [-10, -15, 0.4, 8]] },
  { main: [0, -5, 47.5, 21, -0.05], subs: [[-13, -11, 0.5, 10], [11, -14, 0.58, 9], [16, 5, 0.4, 7]] },
];

// Forest trees: [x, z, scale]. A full forest, and a grove along the back when something shares the tile.
const FORESTS: [number, number, number][][] = [
  [[-1, -12, 1.0], [-12, -2, 0.95], [10, -3, 1.05], [-4, 8, 0.9], [9, 10, 0.85], [-15, 11, 0.7]],
  [[-9, -11, 1.05], [8, -12, 0.9], [-1, -1, 1.0], [-13, 8, 0.85], [11, 4, 1.0], [2, 13, 0.75]],
  [[2, -13, 0.9], [-10, -5, 1.1], [12, -6, 0.95], [-3, 5, 0.95], [-14, 12, 0.7], [10, 11, 0.8]],
  [[-6, -13, 0.85], [7, -9, 1.1], [-14, 1, 0.9], [15, 6, 0.8], [-3, 2, 0.8], [3, 14, 0.7], [-10, 13, 0.65]],
];
const GROVES: [number, number, number][][] = [
  [[-13, -8, 0.85], [-1, -15, 0.9], [12, -9, 0.8], [-20, 1, 0.7]],
  [[-14, -10, 0.9], [-2, -14, 0.8], [11, -11, 0.9], [19, -2, 0.65]],
  [[-11, -12, 0.85], [3, -15, 0.85], [15, -6, 0.75], [-19, -1, 0.65]],
  [[-16, -6, 0.75], [-6, -15, 0.9], [7, -14, 0.8], [17, -7, 0.85]],
];
// Orchards: three or four fruit trees.
const ORCHARDS: [number, number, number][][] = [
  [[-9, -5, 1], [8, -8, 0.95], [1, 7, 1.05]],
  [[-10, 2, 1.0], [4, -10, 1.05], [10, 6, 0.9]],
  [[-6, -9, 0.95], [11, -2, 1.0], [-5, 8, 0.95]],
  [[-11, -6, 0.85], [2, -12, 0.85], [12, -1, 0.85], [-2, 8, 0.9]],
];

/** Low things on open ground and water: kind, x, z, size, seed. */
export type BitKind = 'bush' | 'stone' | 'flower' | 'grass' | 'lily' | 'reed' | 'islet';
export interface Bit { kind: BitKind; x: number; z: number; s: number; seed: number }
export type PropKind = 'orchard' | 'deer' | 'ore';
// `y`, when set, is the height the prop stands at (an ore deposit on a peak's slope); otherwise the ground's.
export interface Prop { kind: PropKind; x: number; z: number; s: number; flip: boolean; seed: number; y?: number }

export interface Setup {
  t: GlTile;
  q: number;
  r: number;
  v: number;
  turn: number;
  res: GlTile['resource'];
  links: number[] | null;
  trees: [number, number, number][];
  peaks: Peak[];
  props: Prop[];
  bits: Bit[];
  blobs: [number, number, number, number][]; // soft shadows on the ground: x, z, radius, strength
  tufts: [number, number, number, number][];
  hillEdges: number[];
}

// Roads: as Road in features.tsx, a track from the tile centre to the middle of each edge whose neighbour has a
// road or a city. Edge e has its normal at 60e degrees, so its middle is INR * (cos, sin) of that angle.
export function roadLinks(map: GlMap, k: HexKey): number[] | null {
  const t = map.tiles[k];
  if (!t || !t.road || t.city) return null;
  const { q, r } = parse(k);
  const links: number[] = [];
  EDGE_NB.forEach(([dq, dr], e) => {
    const nt = map.tiles[`${q + dq},${r + dr}`];
    if (nt && (nt.road || nt.city)) links.push(e);
  });
  return links;
}
export function roadDist(links: readonly number[] | null, lx: number, lz: number): number {
  if (!links) return Infinity;
  let m = Math.hypot(lx, lz) - (links.length ? 3.4 : 4.5) + ROAD_HALF;
  for (const e of links) {
    const ex = INR * Math.cos((e * Math.PI) / 3), ez = INR * Math.sin((e * Math.PI) / 3);
    const t = Math.max(0, Math.min(1, (lx * ex + lz * ez) / (INR * INR)));
    m = Math.min(m, Math.hypot(lx - ex * t, lz - ez * t));
  }
  return m;
}
/** Keep a prop of radius rad off the road: nudge it away from the track, or drop it (null) when it will not fit. */
export function offRoad(links: readonly number[] | null, x: number, z: number, rad: number): [number, number] | null {
  if (!links) return edgeDist(x, z) > rad * 0.6 ? [x, z] : null;
  for (let i = 0; i < 12; i++) {
    const d = roadDist(links, x, z);
    if (d >= rad + ROAD_HALF) return edgeDist(x, z) > rad * 0.6 ? [x, z] : null;
    const gx = roadDist(links, x + 0.5, z) - roadDist(links, x - 0.5, z);
    const gz = roadDist(links, x, z + 0.5) - roadDist(links, x, z - 0.5);
    const gl = Math.hypot(gx, gz) || 1;
    x += (gx / gl) * 1.5;
    z += (gz / gl) * 1.5;
  }
  return null;
}

// Wild cropland: scattered tufts of grass and wheat, clumped by noise, never in rows. [x, z, size, seed].
function tuftsFor(q: number, r: number, links: number[] | null): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < 160 && out.length < 40; i++) {
    const x = (hash2(q * 3.1 + i, r * 1.7 - i) - 0.5) * 2 * INR;
    const z = (hash2(r * 2.3 - i * 1.3, q + i * 0.37) - 0.5) * 2 * R;
    if (edgeDist(x, z) < 3.5 || roadDist(links, x, z) < ROAD_HALF + 2.5) continue;
    // Clumps and bare patches: a tuft only takes where the noise says the stand is thick.
    const dense = vnoise(x * 0.11 + q * 5.3, z * 0.11 + r * 3.9);
    if (dense < 0.32 + 0.22 * hash2(i, q - r)) continue;
    out.push([x, z, 0.6 + 0.6 * dense * hash2(i * 1.9, r + q * 0.3) + 0.3 * hash2(i, i), hash2(i * 7.7, q * 1.1 + r)]);
  }
  return out;
}

/** Peaks for a mountain tile: the main peak, then the smaller ones. */
export function peaksFor(v: number, turn: number, shared: boolean, mine: boolean): Peak[] {
  const L = MOUNTAINS[v]!;
  const [mx, mz, mh, mb, mrot] = L.main;
  const shoulder = turn % 2 === 0 ? 2 : 0; // the shoulder's side flips with the turn
  // The turn spins the ridges a little: the faces change, the lit-left and shaded-right split stays.
  const main: Peak = { x: mx, z: mz, h: mh, b: mb, rot: mrot + (turn - 2.5) * 0.05, shoulder, snow: 2 };
  if (shared) {
    // Ore or a mine shares the tile: the main peak keeps its full form, moved back and aside.
    Object.assign(main, { x: mx + (mine ? 6 : -4), z: mz - (mine ? 6 : 5), h: mh * (mine ? 0.9 : 0.96), b: mb * 0.9 });
  }
  const out: Peak[] = [main];
  L.subs.forEach(([x, z, f, b], i) => {
    if (shared && z > -8) return; // keep the front of the tile clear for the ore or the mine
    if (shared && Math.abs(x - main.x) < 8) return;
    const fit = Math.min(b, edgeDist(x, z) / 0.95);
    if (fit < 5) return;
    out.push({ x, z, h: main.h * f, b: fit, rot: turn * 0.7 + i * 1.3, shoulder: -1, snow: f >= 0.55 ? 1 : 0 });
  });
  return out;
}

export function tileSetup(map: GlMap, k: HexKey): Setup {
  const t = map.tiles[k]!;
  const { q, r } = parse(k);
  const v = variantOf(q, r);
  const turn = turnOf(q, r);
  const city = t.city;
  const res = !city && t.building === null && !t.village && !t.treasure && t.resource ? t.resource : null;
  // A mine replaces its ore. A mountain that shares its tile with ore, a mine or a treasure keeps its full peak,
  // moved a little back and aside; the ore shrinks into the front corner instead.
  const shared = t.terrain === 'mountain' && (res === 'ore' || t.building === 'mine' || t.treasure);
  const links = roadLinks(map, k);
  const out: Setup = { t, q, r, v, turn, res, links, trees: [], peaks: [], props: [], bits: [], blobs: [], tufts: [], hillEdges: [] };
  if (city) return out;
  const seed = hash2(q, r) * 6.28;
  const free = res === null && t.building === null && !t.village && !t.treasure;
  if (t.terrain === 'mountain') {
    out.peaks = peaksFor(v, turn, shared, t.building === 'mine');
    for (const p of out.peaks) out.blobs.push([p.x + 6 * (p.h / 47), p.z + 3, p.b * 1.05, p.snow === 2 ? 0.28 : 0.2]);
  }
  if (t.terrain === 'forest') {
    const along = !free;
    if (along) {
      // A grove along the back: mirrored by the turn, never spun to the front.
      const m = turn % 2 === 0 ? 1 : -1;
      for (const [x, z, s] of GROVES[v]!) {
        const p = offRoad(links, x * m, z, 5.6 * s);
        if (p) out.trees.push([p[0], p[1], s]);
      }
    } else {
      for (const [x0, z0, s] of FORESTS[v]!) {
        const [x, z] = spin(x0, z0, turn);
        const p = offRoad(links, x, z, 5.6 * s);
        if (p) out.trees.push([p[0], p[1], s]);
      }
    }
  }
  const place = (kind: PropKind, x: number, z: number, s: number, rad: number, flip = false): void => {
    const p = offRoad(links, x, z, rad * s);
    if (p) out.props.push({ kind, x: p[0], z: p[1], s, flip, seed: seed + out.props.length });
  };
  if (res === 'orchard') {
    for (const [x0, z0, s] of ORCHARDS[v]!) {
      const [x, z] = spin(x0, z0, turn);
      place('orchard', x, z, s, 5.4);
    }
  }
  if (res === 'game') {
    const flip = turn % 2 === 1;
    const m = flip ? -1 : 1;
    if (v === 2) {
      place('deer', -6 * m, 4, 0.95, 6, flip);
      place('deer', 9 * m, -6, 0.7, 5, !flip);
    } else if (v === 3) {
      place('deer', 2 * m, 7, 1, 6, flip);
      out.bits.push({ kind: 'bush', x: -12 * m, z: -9, s: 1.1, seed });
    } else {
      place('deer', (v === 0 ? 1 : -2) * m, v === 0 ? 6 : 3, 1, 6, flip);
    }
  }
  if (res === 'ore') {
    if (shared) {
      place('ore', 11, 13, 0.62, 7, turn % 2 === 1);
      // An ore mountain reads at a glance: rust-tinted rock and deposits scattered over its foot and slopes.
      for (const pk of out.peaks) pk.ore = true;
      for (const d of oreDeposits(out.peaks, q, r)) out.props.push({ kind: 'ore', ...d, flip: d.seed > 0.5 });
    } else {
      const [x, z] = ([[0, 9], [-5, 8], [5, 7], [0, 5]] as const)[v]!;
      place('ore', x, z, v === 3 ? 0.9 : 1, 7, turn % 2 === 1);
    }
  }
  if (res === 'cropland') out.tufts = tuftsFor(q, r, links);
  if (free && (t.terrain === 'field' || t.terrain === 'water')) out.bits.push(...bitsFor(t.terrain, v, turn, q, r, links, map));
  for (const [x, z, s] of out.trees) out.blobs.push([x, z, 6.5 * s, 0.32]);
  for (const p of out.props) out.blobs.push([p.x, p.z, (p.kind === 'orchard' ? 7 : 8) * p.s, 0.3]);
  for (const b of out.bits) if (b.kind === 'bush') out.blobs.push([b.x, b.z, 4.5 * b.s, 0.22]);
  // Rolling hills on open land next to a mountain: purely cosmetic, a board unit or two high.
  if (t.terrain !== 'mountain' && t.terrain !== 'water') {
    EDGE_NB.forEach(([dq, dr], e) => { if (map.tiles[`${q + dq},${r + dr}`]?.terrain === 'mountain') out.hillEdges.push(e); });
  }
  return out;
}

/**
 * Five to seven ore deposits for an ore mountain, besides the one in the front corner: on the front slopes of the
 * peaks (with their height) and on the scree at the main peak's foot. All kept off the middle of the tile, where a
 * unit stands, and on the tile.
 */
export function oreDeposits(peaks: readonly Peak[], q: number, r: number): { x: number; z: number; s: number; seed: number; y?: number }[] {
  const out: { x: number; z: number; s: number; seed: number; y?: number }[] = [];
  const free = (x: number, z: number, rad: number): boolean =>
    Math.hypot(x, z) > 11 && edgeDist(x, z) > rad && out.every((o) => Math.hypot(o.x - x, o.z - z) > rad * 1.6) && Math.hypot(x - 11, z - 13) > 8;
  let i = 0;
  // Slopes: the faces toward the viewer (+z), a fifth to a third of the way up.
  for (const p of peaks) {
    for (const side of [-1, 1]) {
      const a = Math.PI / 2 + side * (0.55 + 0.4 * hash2(q + i, r - i));
      const t = 0.12 + 0.2 * hash2(r + i * 1.7, q * 0.3);
      const rr = p.b * Math.pow(1 - t, 1.08) * 0.8;
      const x = p.x + rr * Math.cos(a), z = p.z + rr * Math.sin(a);
      const s = 0.38 + 0.18 * hash2(i, q + r);
      i++;
      if (free(x, z, 5 * s)) out.push({ x, z, s, seed: hash2(q * 1.3 + i, r * 2.1 - i), y: t * p.h * 0.9 });
      if (out.length >= 4) break;
    }
    if (out.length >= 4) break;
  }
  // The foot of the main peak, on the scree either side and in front.
  const m = peaks[0];
  if (m !== undefined) {
    for (const a of [0.35, 2.75, 1.25, 1.95, -0.2, 3.35]) {
      const d = m.b * (1.0 + 0.15 * hash2(q - i, r + i));
      const x = m.x + d * Math.cos(a), z = m.z + d * Math.sin(a);
      const s = 0.45 + 0.25 * hash2(i * 2.3, q - r);
      i++;
      if (free(x, z, 5 * s)) out.push({ x, z, s, seed: hash2(q + i * 0.7, r - i * 1.1) });
      if (out.length >= 7) break;
    }
  }
  return out;
}

/** Field and water details, all low, kept off the middle where a unit stands. */
function bitsFor(terrain: 'field' | 'water', v: number, turn: number, q: number, r: number, links: number[] | null, map: GlMap): Bit[] {
  const out: Bit[] = [];
  const at = (kind: BitKind, x0: number, z0: number, s: number, i: number): void => {
    const [x, z] = spin(x0, z0, turn);
    if (edgeDist(x, z) < 4 * s + 1.5) return;
    if (roadDist(links, x, z) < ROAD_HALF + 2.5 * s) return;
    out.push({ kind, x, z, s, seed: hash2(q * 2.7 + i, r * 1.9 - i) });
  };
  if (terrain === 'field') {
    // Grass clumps on every field, a few more on the plain layout.
    const n = v === 3 ? 9 : 5;
    for (let i = 0; i < n; i++) {
      const a = hash2(q + i * 1.7, r - i * 0.9) * Math.PI * 2;
      const d = 9 + hash2(i * 3.1, q * r + 2) * 13;
      at('grass', Math.cos(a) * d, Math.sin(a) * d, 0.7 + 0.4 * hash2(i, q + r), i);
    }
    if (v === 0) { at('bush', -13, -8, 1.1, 20); at('bush', -8, -13, 0.8, 21); at('bush', 14, 8, 0.7, 22); }
    if (v === 1) { at('stone', 12, -9, 1.0, 30); at('stone', 15, -5, 0.6, 31); at('stone', -11, 10, 0.75, 32); }
    if (v === 2) {
      for (let i = 0; i < 11; i++) {
        const a = 0.6 + hash2(i * 1.3, q) * 1.6; // a patch on one side
        const d = 11 + hash2(r, i * 2.2) * 9;
        at('flower', Math.cos(a + Math.PI) * d, Math.sin(a + Math.PI) * d * 0.8, 1, 40 + i);
      }
      at('bush', 13, -10, 0.85, 23);
    }
  } else {
    if (v === 1) { at('islet', 11, -8, 1, 50); }
    if (v === 2) { for (const [x, z, s, i] of [[-12, -6, 1, 60], [-8, -11, 0.8, 61], [12, 9, 0.9, 62], [15, 4, 0.7, 63]] as const) at('lily', x, z, s, i); }
    if (v === 3) {
      // Reeds by a shore when there is one, else a few lily pads.
      const { q: tq, r: tr } = { q, r };
      const shore = EDGE_NB.findIndex(([dq, dr]) => { const n = map.tiles[`${tq + dq},${tr + dr}`]; return n !== undefined && n.terrain !== 'water'; });
      if (shore >= 0) {
        const a = (shore * Math.PI) / 3;
        for (let i = 0; i < 3; i++) {
          const side = (i - 1) * 8;
          const x = Math.cos(a) * 17 - Math.sin(a) * side, z = Math.sin(a) * 17 + Math.cos(a) * side;
          if (edgeDist(x, z) > 3) out.push({ kind: 'reed', x, z, s: 0.9 + 0.2 * hash2(i, q), seed: hash2(i * 4.1, r + q) });
        }
      } else {
        at('lily', 10, -9, 1, 70);
        at('lily', -13, 7, 0.8, 71);
      }
    }
  }
  return out;
}

/** Ground height under the tile (local coordinates), shared by the lattice and by anything standing on it. */
export function heightFn(setup: Setup): (lx: number, lz: number) => number {
  const { q, r } = setup;
  return (lx, lz) => {
    const fade = smooth(0, 7, edgeDist(lx, lz));
    let h = 0;
    for (const p of setup.peaks) {
      // Low scree foothills rising into the foot of each peak.
      const d = Math.hypot(lx - p.x, lz - p.z);
      h = Math.max(h, 4.0 * (p.snow === 2 ? 1 : 0.7) * smooth(p.b + 9, p.b * 0.6, d));
    }
    if (setup.peaks.length) h += 1.6 * vnoise(lx * 0.12 + q * 3.1, lz * 0.12 + r * 1.3);
    if (setup.hillEdges.length) {
      // Swells, highest toward the mountain: at most about 2.4 world units, under 2 board units on screen.
      const near = smooth(30, 6, distToEdges(lx, lz, setup.hillEdges));
      const n = vnoise(lx * 0.075 + q * 4.7, lz * 0.075 + r * 2.9);
      h += 2.4 * (0.45 + 0.55 * near) * smooth(0.2, 0.9, n) * smooth(1, 9, edgeDist(lx, lz));
    }
    if (setup.res === 'cropland') h += 0.5 * vnoise(lx * 0.3 + q, lz * 0.3 + r);
    // Roads are packed flat.
    const onRoad = smooth(ROAD_HALF + 3, ROAD_HALF, roadDist(setup.links, lx, lz));
    return h * fade * (1 - 0.7 * onRoad);
  };
}
