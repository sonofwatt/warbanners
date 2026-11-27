// Gritty's horse: one detailed toon horse that every Gritty rider sits on (grittyRiders.ts), in the Hoplite's style
// (toonHoplite.ts, the rules in grittyToon.ts): faceted, outlined, more anatomy than the Bright horse (parts.ts).
//
// It is built in the mount's own frame, as the Bright horse is: facing +x, its near side toward +z, the body centred
// near SVG (-2, -6.5). It keeps the Bright horse's moving pieces and pivots: the legs (LEGS, about the ground, so a
// crouch settles the body over them) and the neck and head with the mane and the bridle (NECK, about the withers,
// NECK_AT), so the gait, idle and crouch code drive it unchanged.
//
// - Shape: a lofted barrel (withers, back, croup, belly and chest from one faceted profile), a lofted neck and head
//   (deep jowl, flat face, muzzle), jointed legs (forearm and gaskin, knee and hock, cannon, fetlock, pastern and a
//   horn hoof), a combed mane, a forelock and a long combed tail.
// - Tack: a saddle (seat, pommel, cantle, flap), a saddle cloth in the rider's colour, a girth, a breast collar, a
//   bridle (headstall, browband, noseband, throatlatch, bit rings) and reins. Riders add barding with `drape`.
// - Coats: the coat, a darker far side, the mane and tail, the hoof's horn, and optional dark points (lower legs),
//   a blaze, a dorsal stripe (a dun) or white socks.
// - Wear: scuffed, mud on the legs and belly; dented, scratches on the flank and shoulder; battered, a scabbed cut,
//   the saddle cloth's hem torn, the breast collar snapped; broken, the near rein snapped and the cloth half torn
//   away (gone for good: scarred keeps it gone); blood on the shoulder, flank and a foreleg (more at 2, and on the
//   neck); scarred, pale healed scars where the hair grew back white.
import { BufferGeometry, Float32BufferAttribute, ShapeUtils, TorusGeometry, Vector2, Vector3 } from 'three';
import { Kit, mix } from './kit';
import type { Surface, V3 } from './kit';
import { BLOOD, dirt, drip, ell, heavy, helmBroken, LEGS, NECK, NECK_AT, smear, worn } from './parts';
import type { Wear } from './parts';
import { GT, plate } from './grittyToon';

const { LEATHER, LEATHER_DARK } = GT;
/** Mud thrown up on legs and belly. */
export const MUD = '#4A3A28';
/** Iron of bits, rings and stirrups. */
export const IRON = '#8E9096';

export interface Coat {
  coat: string;
  /** The far side's legs, a shade darker. */
  shade: string;
  mane: string;
  hoof: string;
  /** Dark lower legs (a bay's or a dun's black points). */
  points?: string;
  /** A white blaze down the face. */
  blaze?: string;
  /** A dark stripe along the spine (a dun). */
  stripe?: string;
  /** White socks on the near legs. */
  socks?: string;
}

export interface Tack {
  /** The saddle cloth (the owner's colour, usually) and its trim. */
  cloth: string;
  trim: string;
  /** The saddle's leather (default dark leather). */
  saddle?: string;
  /** Metal fittings: the bit rings, the breast collar's boss (default iron). */
  metal?: string;
  /** No saddle cloth and no breast collar (a caparison or barding covers the horse instead). */
  noCloth?: boolean;
}

// ---- lofts: faceted tubes along a spine, the horse's body, neck and head ----

/** One ring of a loft: a point on the spine, the ring's half heights toward `up` and away from it, and its half width. */
export interface Ring { at: V3; up: number; down: number; w: number }

/**
 * A faceted tube through rings along a spine in this frame's xy plane: each ring is an ellipse across the spine,
 * its `up` side toward the spine's left normal (the back of a body running +x, the crest of a neck rising forward),
 * its width along z. The ends close to a point.
 */
export function loft(k: Kit, rings: readonly Ring[], seg: number, colour: string, o: { gloss?: number; hull?: number } = {}): void {
  const pts = rings.map((r, i) => ringPoints(rings, i, seg));
  const pos: number[] = [];
  const push = (a: Vector3, b: Vector3, c: Vector3, out: Vector3): void => {
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const tri = n.dot(out) >= 0 ? [a, b, c] : [a, c, b];
    for (const v of tri) pos.push(v.x, v.y, v.z);
  };
  for (let i = 0; i + 1 < rings.length; i++) {
    const ca = new Vector3(...rings[i]!.at), cb = new Vector3(...rings[i + 1]!.at);
    for (let j = 0; j < seg; j++) {
      const a = pts[i]![j]!, b = pts[i]![(j + 1) % seg]!, c = pts[i + 1]![j]!, d = pts[i + 1]![(j + 1) % seg]!;
      const mid = a.clone().add(b).add(c).add(d).multiplyScalar(0.25);
      const out = mid.clone().sub(ca.clone().add(cb).multiplyScalar(0.5));
      push(a, b, d, out);
      push(a, d, c, out);
    }
  }
  // Close each end with a fan to its spine point.
  for (const [i, dir] of [[0, -1], [rings.length - 1, 1]] as const) {
    const r = rings[i]!;
    if (Math.max(r.up, r.down, r.w) < 0.05) continue;
    const c = new Vector3(...r.at);
    const t = tangent(rings, i).multiplyScalar(dir);
    for (let j = 0; j < seg; j++) push(pts[i]![j]!, pts[i]![(j + 1) % seg]!, c, t);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  k.add(g, colour, { gloss: o.gloss ?? 0.15, hull: o.hull ?? 1 });
}

function tangent(rings: readonly Ring[], i: number): Vector3 {
  const a = new Vector3(...rings[Math.max(0, i - 1)]!.at), b = new Vector3(...rings[Math.min(rings.length - 1, i + 1)]!.at);
  return b.sub(a).normalize();
}

/** The point of ring i at angle u (0 on its up side, pi/2 on the near side, +z), pushed out by `lift`. */
export function ringPoint(rings: readonly Ring[], i: number, u: number, lift = 0): Vector3 {
  const r = rings[i]!, t = tangent(rings, i);
  const n = new Vector3(-t.y, t.x, 0);
  const cu = Math.cos(u), su = Math.sin(u);
  const h = (cu >= 0 ? r.up : r.down) + lift;
  return new Vector3(...r.at).addScaledVector(n, cu * h).add(new Vector3(0, 0, su * (r.w + lift)));
}

function ringPoints(rings: readonly Ring[], i: number, seg: number): Vector3[] {
  const out: Vector3[] = [];
  for (let j = 0; j < seg; j++) out.push(ringPoint(rings, i, (j / seg) * Math.PI * 2));
  return out;
}

/** A ring between two rings of a loft (t from 0 to 1 along the whole spine), by straight interpolation. */
export function ringAt(rings: readonly Ring[], t: number): { i: number; f: number } {
  const x = Math.min(rings.length - 1.0001, Math.max(0, t * (rings.length - 1)));
  return { i: Math.floor(x), f: x - Math.floor(x) };
}

/** A point on a loft's surface at t along it (0 to 1) and angle u, lifted off it by `lift`. */
export function loftPoint(rings: readonly Ring[], t: number, u: number, lift = 0): V3 {
  const { i, f } = ringAt(rings, t);
  const p = ringPoint(rings, i, u, lift).lerp(ringPoint(rings, i + 1, u, lift), f);
  return [p.x, p.y, p.z];
}

// ---- the body: one profile along x ----

/** The barrel's profile, tail to chest: x, the spine's height, the half heights up and down, the half width. */
const BODY: readonly (readonly [number, number, number, number, number])[] = [
  [-15.0, 15.6, 0.4, 0.4, 0.4],
  [-14.4, 15.4, 3.4, 3.0, 3.0],
  [-12.4, 15.0, 5.3, 5.2, 4.4],
  [-11.0, 14.8, 5.75, 5.6, 4.75],
  [-9.6, 14.6, 5.9, 5.9, 4.9],
  [-6.0, 14.1, 5.5, 5.9, 4.9],
  [-1.8, 13.9, 5.2, 6.1, 4.9],
  [2.6, 14.0, 5.4, 6.0, 4.8],
  [5.6, 14.3, 5.6, 5.8, 4.5],
  [8.4, 13.8, 4.8, 5.6, 4.0],
  [10.4, 13.4, 3.0, 4.0, 3.0],
  [11.2, 13.4, 0.5, 0.6, 0.5],
];
export const BODY_RINGS: readonly Ring[] = BODY.map(([x, y, up, down, w]) => ({ at: [x, y, 0], up, down, w }));

/** The body's section at x: its spine height, half heights and half width (interpolated along the profile). */
export function section(x: number): { cy: number; up: number; down: number; w: number } {
  const b = BODY;
  if (x <= b[0]![0]) return { cy: b[0]![1], up: b[0]![2], down: b[0]![3], w: b[0]![4] };
  for (let i = 0; i + 1 < b.length; i++) {
    const a = b[i]!, c = b[i + 1]!;
    if (x <= c[0]) {
      const f = (x - a[0]) / (c[0] - a[0]);
      const l = (p: number, q: number): number => p + (q - p) * f;
      return { cy: l(a[1], c[1]), up: l(a[2], c[2]), down: l(a[3], c[3]), w: l(a[4], c[4]) };
    }
  }
  const e = b[b.length - 1]!;
  return { cy: e[1], up: e[2], down: e[3], w: e[4] };
}

/** The angle about the body's spine (0 on top, pi/2 on the near side, pi below) of the near side at height y. */
function bodyAngle(x: number, y: number): number {
  const s = section(x);
  return y >= s.cy ? Math.acos(Math.min(1, (y - s.cy) / s.up)) : Math.PI - Math.acos(Math.min(1, (s.cy - y) / s.down));
}

/** The body's near side as a surface for marks: (x, y) in the mount's frame, lifted by `lift`. */
export function flank(lift = 0): Surface {
  return (x, y) => {
    const s = section(x), u = bodyAngle(x, y);
    const z = Math.sin(u) * (s.w + lift);
    const n = new Vector3(0, Math.cos(u) / (y >= s.cy ? s.up : s.down), Math.sin(u) / s.w).normalize();
    return { p: [x, y, Math.max(z, 0.3)], n: [n.x, n.y, n.z] };
  };
}

/** A point on the body's surface at x and angle u (0 on top, pi/2 near side, -pi/2 far side). */
export function bodyPoint(x: number, u: number, lift = 0): V3 {
  const s = section(x), cu = Math.cos(u);
  return [x, s.cy + cu * ((cu >= 0 ? s.up : s.down) + lift), Math.sin(u) * (s.w + lift)];
}

// ---- drapes: cloth and barding laid over the body ----

export interface DrapeOpts {
  x0: number; x1: number;
  /** The top edge's angle on the far side (negative), and the bottom edge's on the near side, per column (t 0 to 1). */
  far: number;
  near: (t: number) => number;
  /** How far off the body (default 0.3). Past the body's widest (u beyond pi/2) the cloth hangs straight down. */
  off?: number;
  /** Columns along x and rows round the body. */
  nx?: number; nu?: number;
  gloss?: number;
  hull?: number;
}

/**
 * A sheet laid over the body (a saddle cloth, a caparison, barding): it follows the body from the far side over the
 * back and down the near side, and below the widest point hangs straight down, as cloth does. One sided, wound
 * outward; the body fills it from behind.
 */
export function drape(k: Kit, colour: string, o: DrapeOpts): void {
  const nx = o.nx ?? 4, nu = o.nu ?? 6, off = o.off ?? 0.3;
  const pt = (x: number, u: number): Vector3 => {
    const s = section(x);
    if (u > Math.PI / 2) return new Vector3(x, s.cy - (u - Math.PI / 2) * (s.down + off) * 0.95, s.w + off);
    if (u < -Math.PI / 2) return new Vector3(x, s.cy + (u + Math.PI / 2) * (s.down + off) * 0.95, -(s.w + off));
    const cu = Math.cos(u);
    return new Vector3(x, s.cy + cu * ((cu >= 0 ? s.up : s.down) + off), Math.sin(u) * (s.w + off));
  };
  const pos: number[] = [];
  for (let i = 0; i < nx; i++) {
    const ta = i / nx, tb = (i + 1) / nx;
    const xa = o.x0 + (o.x1 - o.x0) * ta, xb = o.x0 + (o.x1 - o.x0) * tb;
    const ba = o.near(ta), bb = o.near(tb);
    for (let j = 0; j < nu; j++) {
      const ua0 = o.far + (ba - o.far) * (j / nu), ua1 = o.far + (ba - o.far) * ((j + 1) / nu);
      const ub0 = o.far + (bb - o.far) * (j / nu), ub1 = o.far + (bb - o.far) * ((j + 1) / nu);
      const a = pt(xa, ua0), b = pt(xa, ua1), c = pt(xb, ub0), d = pt(xb, ub1);
      const s = section((xa + xb) / 2);
      const centre = new Vector3((xa + xb) / 2, s.cy, 0);
      for (const tri of [[a, b, d], [a, d, c]] as const) {
        const m = tri[0].clone().add(tri[1]).add(tri[2]).multiplyScalar(1 / 3);
        const out = m.clone().sub(centre); out.x = 0;
        const n = tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0]));
        const vs = n.dot(out) >= 0 ? tri : [tri[0], tri[2], tri[1]];
        for (const v of vs) pos.push(v.x, v.y, v.z);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  k.add(g, colour, { gloss: o.gloss ?? 0.1, hull: o.hull ?? 0.6 });
}

/** The near side of a drape `off` off the body, as a surface for marks on it (x, y in the mount's frame). */
export function drapeSurf(off = 0.3): Surface {
  return (x, y) => {
    const s = section(x);
    if (y < s.cy) return { p: [x, y, s.w + off], n: [0, 0, 1] };
    const u = Math.acos(Math.min(1, (y - s.cy) / (s.up + off)));
    const n = new Vector3(0, Math.cos(u) / s.up, Math.sin(u) / s.w).normalize();
    return { p: [x, y, Math.max(0.3, Math.sin(u) * (s.w + off))], n: [n.x, n.y, n.z] };
  };
}

// ---- the head and neck (built inside the NECK piece) ----

/** The neck from the withers up to the poll. */
export const NECK_RINGS: readonly Ring[] = [
  { at: [4.6, 15.4, 0], up: 4.6, down: 4.4, w: 3.9 },
  { at: [7.4, 21.4, 0], up: 3.3, down: 3.3, w: 2.8 },
  { at: [9.9, 26.6, 0], up: 2.5, down: 2.6, w: 2.2 },
  { at: [11.4, 29.8, 0], up: 1.9, down: 2.0, w: 1.9 },
];
/** The head from the poll to the muzzle: the deep jowl, the flat face, the muzzle. */
export const HEAD_RINGS: readonly Ring[] = [
  { at: [11.0, 31.2, 0], up: 0.4, down: 0.4, w: 0.4 },
  { at: [11.8, 30.6, 0], up: 1.9, down: 2.7, w: 2.2 },
  { at: [14.2, 28.6, 0], up: 1.6, down: 2.2, w: 2.0 },
  { at: [17.0, 26.3, 0], up: 1.25, down: 1.35, w: 1.5 },
  { at: [18.9, 24.8, 0], up: 1.35, down: 1.3, w: 1.5 },
  { at: [19.5, 24.3, 0], up: 0.5, down: 0.5, w: 0.6 },
];
const hp = (t: number, u: number, lift = 0.1): V3 => loftPoint(HEAD_RINGS, t, u, lift);

/** A chain of thin rods along points: a strap. */
export function strap(k: Kit, pts: readonly V3[], r: number, colour: string, hull = 0): void {
  for (let i = 0; i + 1 < pts.length; i++) k.rod(pts[i]!, pts[i + 1]!, r, colour, { seg: 4, caps: false, hull });
}

/** A quadratic sag between a and b, dropping `sag` at the middle: a slack rein or a loose strap. */
function sagged(a: V3, b: V3, sag: number, n = 4): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, d = 4 * t * (1 - t) * sag;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - d, a[2] + (b[2] - a[2]) * t]);
  }
  return out;
}

function headAndNeck(k: Kit, hc: Coat, tack: Tack, w: Wear, o: HorseOpts): void {
  loft(k, NECK_RINGS, 9, hc.coat);
  loft(k, HEAD_RINGS, 8, hc.coat);
  // The ears, pricked forward a little.
  for (const s of [-1, 1]) {
    k.rod([11.6, 32.0, s * 1.0], [11.9, 35.4, s * 1.4], 0.85, s > 0 ? hc.coat : hc.shade, { r1: 0.12, seg: 4 });
    if (s > 0) k.rod([11.75, 32.4, 1.55], [11.95, 34.6, 1.65], 0.4, mix(hc.coat, '#000000', 0.45), { r1: 0.08, seg: 3, hull: 0 });
  }
  // The eyes: a dark almond under a heavy brow, a glint of white at the corner.
  for (const s of [-1, 1]) {
    const e = hp(0.32, s * 1.25, 0.05);
    k.ball(e, 1, '#160E0A', { detail: 0, hull: 0, s: [0.75, 0.55, 0.45] });
    if (s > 0) {
      k.ball([e[0] - 0.55, e[1] + 0.05, e[2] + 0.12], 0.22, '#E6DDCF', { detail: 0, hull: 0 });
      k.rod(hp(0.24, 1.0, 0.25), hp(0.42, 1.05, 0.25), 0.32, mix(hc.coat, '#000000', 0.35), { seg: 3, hull: 0 });
    }
  }
  // Nostrils and the mouth's line.
  for (const s of [-1, 1]) k.ball(hp(0.9, s * 1.05, 0.0), 1, '#1A110C', { detail: 0, hull: 0, s: [0.45, 0.38, 0.3] });
  k.rod(hp(0.8, 2.3, 0.05), hp(0.97, 2.0, 0.05), 0.16, '#2A1A12', { seg: 3, hull: 0 });
  if (hc.blaze) for (let i = 0; i < 3; i++) k.rod(hp(0.18 + i * 0.24, 0, 0.02), hp(0.38 + i * 0.24, 0, 0.02), 0.62 - i * 0.08, hc.blaze, { seg: 4, hull: 0, caps: false });
  // The mane: a combed crest of hair along the top of the neck, falling to the near side, and the forelock.
  if (!o.noMane) mane(k, hc, w);
  // The bridle: headstall, browband, noseband, throatlatch, bit rings; reins back to the saddle.
  const strapC = tack.saddle ?? LEATHER_DARK, metal = tack.metal ?? IRON;
  for (const s of [-1, 1]) strap(k, [hp(0.12, s * 0.2), hp(0.2, s * 1.4), hp(0.5, s * 1.55), hp(0.8, s * 1.75)], 0.3, strapC);
  strap(k, [hp(0.15, -1.3), hp(0.15, -0.5), hp(0.15, 0.5), hp(0.15, 1.3)], 0.3, strapC);
  const nose = [0, 0.8, 1.6, 2.4, 3.1, -2.4, -1.6, -0.8, 0].map((u) => hp(0.76, u, 0.12));
  if (!helmBroken(w)) strap(k, nose, 0.34, strapC);
  else strap(k, nose.slice(0, 4), 0.34, strapC);
  strap(k, [hp(0.2, 1.4), hp(0.24, 2.4), hp(0.24, 3.1)], 0.26, strapC);
  const bit: V3 = hp(0.86, 1.75, 0.15), bitFar: V3 = hp(0.86, -1.75, 0.15);
  for (const p of [bit, bitFar]) {
    const t = new TorusGeometry(0.55, 0.16, 3, 8);
    t.translate(p[0], p[1], p[2]);
    k.add(t, metal, { gloss: 0.6, hull: 0 });
  }
  // The reins: slack from the bit to the pommel. Broken, the near rein is snapped and hangs from the bit.
  const pommel: V3 = [3.1, 21.4, 1.0], pommelFar: V3 = [3.1, 21.4, -1.0];
  strap(k, sagged(bitFar, pommelFar, 1.4), 0.28, strapC);
  if (helmBroken(w)) strap(k, [bit, [bit[0] - 1.2, bit[1] - 2.4, bit[2] + 0.4], [bit[0] - 1.0, bit[1] - 4.6, bit[2] + 0.6]], 0.28, strapC);
  else strap(k, sagged(bit, pommel, 1.6), 0.28, strapC);
  // Wear on the neck: scratches, and blood when it bleeds hard.
  const neckS: Surface = (x, y) => {
    // The near side of the neck, roughly: the plane through the neck's near-side points.
    const t = Math.min(1, Math.max(0, (y - 15.4) / (29.8 - 15.4)));
    const p = loftPoint(NECK_RINGS, t, Math.PI / 2, 0.05);
    return { p: [x, y, p[2]], n: [0.3, 0.1, 1] };
  };
  if (worn(w, 2)) for (const [x0, y0, x1, y1] of [[8.2, 25.0, 9.6, 23.4], [7.0, 21.8, 8.4, 20.4]] as const) k.line([x0, y0, x1, y1], 0.32, mix(hc.coat, '#FFFFFF', 0.45), neckS);
  if (w.scarred === true && w.blood === 0) k.line([8.0, 24.2, 8.8, 22.6, 9.0, 21.2], 0.45, mix(hc.coat, '#F2E8DA', 0.6), neckS);
  if (heavy(w)) smear(k, neckS, 8.4, 24.8, 0.2, -1, 4.0, 1.3);
  o.neck?.();
}

export interface SheetOpts {
  t0: number; t1: number;
  /** The top edge's angle (far side, negative) and the bottom edge's per column boundary (near side). */
  far: number;
  near: (j: number) => number;
  /** The lift off the loft at angle u. */
  lift: (u: number) => number;
  cols: number; rows: number;
  /** The colour of column i. */
  colour: (i: number) => string;
  hull?: number; gloss?: number;
}

/** A sheet laid over a loft (a mane, a crinet, a chanfron): columns along it, rows round it, one sided, outward. */
export function loftSheet(k: Kit, rings: readonly Ring[], o: SheetOpts): void {
  const centre = (t: number): Vector3 => {
    const { i, f } = ringAt(rings, t);
    return new Vector3(...rings[i]!.at).lerp(new Vector3(...rings[i + 1]!.at), f);
  };
  const pt = (t: number, u: number): Vector3 => new Vector3(...loftPoint(rings, t, u, o.lift(u)));
  for (let i = 0; i < o.cols; i++) {
    const ta = o.t0 + ((o.t1 - o.t0) * i) / o.cols, tb = o.t0 + ((o.t1 - o.t0) * (i + 1)) / o.cols;
    const ba = o.near(i), bb = o.near(i + 1);
    const pos: number[] = [];
    for (let r = 0; r < o.rows; r++) {
      const u = (b: number, rr: number): number => o.far + ((b - o.far) * rr) / o.rows;
      const a = pt(ta, u(ba, r)), b = pt(ta, u(ba, r + 1)), c = pt(tb, u(bb, r)), d = pt(tb, u(bb, r + 1));
      for (const tri of [[a, b, d], [a, d, c]] as const) {
        const m = tri[0].clone().add(tri[1]).add(tri[2]).multiplyScalar(1 / 3);
        const out = m.clone().sub(centre((ta + tb) / 2));
        const n = tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0]));
        const vs = n.dot(out) >= 0 ? tri : [tri[0], tri[2], tri[1]];
        for (const v of vs) pos.push(v.x, v.y, v.z);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    k.add(g, o.colour(i), { hull: o.hull ?? 0.55, gloss: o.gloss ?? 0.1 });
  }
}

function mane(k: Kit, hc: Coat, w: Wear): void {
  const deep = mix(hc.mane, '#000000', 0.3), light = mix(hc.mane, '#FFFFFF', 0.14);
  // The mane: combed locks laid over the top of the neck and falling down its near side, a saw-toothed edge of
  // lock tips. Battered, a hank of it is hacked short.
  const hacked = (j: number): boolean => worn(w, 3) && (j === 4);
  loftSheet(k, NECK_RINGS, {
    t0: 0.02, t1: 0.97, far: -0.55, cols: 8, rows: 3,
    near: (j) => (hacked(j) ? 0.45 : j % 2 === 0 ? 1.0 : 1.5),
    lift: (u) => 0.25 + 0.9 * Math.max(0, Math.cos(u * 1.2)),
    colour: (i) => (i % 3 === 1 ? deep : i % 3 === 2 ? light : hc.mane),
  });
  // The forelock over the brow.
  k.slab([-0.9, 0.6, 0.9, 0.6, 1.0, -1.6, 0.3, -3.0, -0.4, -2.0, -1.0, -2.6], 0.9, hc.mane, [12.6, 31.8, 0.3], [0.2, 0.15, -0.9], { hull: 0.5 });
}

// ---- the legs (the LEGS piece) ----

interface LegSpec { x: number; z: number; hind: boolean; near: boolean }
const LEG_SPECS: readonly LegSpec[] = [
  { x: 7.8, z: -2.5, hind: false, near: false },
  { x: -7.2, z: -2.6, hind: true, near: false },
  { x: 5.0, z: 2.6, hind: false, near: true },
  { x: -10.0, z: 2.7, hind: true, near: true },
];

function leg(k: Kit, l: LegSpec, hc: Coat, w: Wear): void {
  const upperC = l.near ? hc.coat : hc.shade;
  let lowerC = hc.points ?? upperC;
  if (l.near && hc.socks) lowerC = hc.socks;
  if (!l.near && hc.points) lowerC = mix(hc.points, '#000000', 0.15);
  if (worn(w, 1)) lowerC = mix(lowerC, MUD, l.near ? 0.45 : 0.3);
  const { x, z } = l;
  // The upper leg (forearm or gaskin), the joint (knee or hock), the cannon, the fetlock, the pastern, the hoof.
  const top: V3 = l.hind ? [x + 1.2, 13.2, z * 0.55] : [x + 0.2, 12.0, z * 0.6];
  const joint: V3 = l.hind ? [x - 1.3, 6.9, z] : [x + 0.4, 6.4, z];
  const fet: V3 = [x + (l.hind ? -0.5 : 0.6), 2.5, z];
  const toe: V3 = [x + (l.hind ? 0.1 : 1.2), 1.35, z];
  k.rod(top, joint, l.hind ? 2.5 : 1.8, upperC, { r1: 1.05, seg: 6, caps: false });
  k.ball(joint, 1.18, l.hind ? upperC : lowerC, { detail: 0, s: [1.05, 1.1, 0.9] });
  k.rod(joint, fet, 0.92, lowerC, { r1: 0.82, seg: 6, caps: false });
  k.ball(fet, 1.02, lowerC, { detail: 0, s: [1.15, 1, 0.95] });
  k.rod(fet, toe, 0.82, lowerC, { r1: 0.78, seg: 5, caps: false });
  k.frustum([toe[0] + 0.25, 0, z], 0, 1.65, 1.4, 1.0, hc.hoof, { seg: 7, gloss: 0.3 });
}

/** A horse's leg drip, near fore: blood run down from the shoulder. */
function legBlood(k: Kit): void {
  const s: Surface = (x, y) => ({ p: [x, y, 2.6 + 1.6], n: [0, 0, 1] });
  drip(k, s, 5.3, 10.6, 3.4, 0.7);
}

// ---- the saddle and its cloth (fixed body) ----

function saddle(k: Kit, hc: Coat, tack: Tack, w: Wear): void {
  const leather = tack.saddle ?? LEATHER_DARK;
  const broken = helmBroken(w);
  // The saddle cloth, over the back and down both sides, its hem trimmed. Battered, its near corner is torn;
  // broken (and scarred), the back half of it is torn away for good.
  if (!tack.noCloth) {
    const torn = worn(w, 3);
    const x0 = broken ? -1.6 : -5.6;
    const near = (t: number): number => {
      const base = 1.95;
      if (broken) return base - [0.1, 0.55, 0.15, 0.35, 0][Math.round(t * 4)]!;
      if (torn) return base - [0, 0, 0, 0.45, 0.2][Math.round(t * 4)]!;
      return base;
    };
    drape(k, tack.cloth, { x0, x1: 4.2, far: -1.75, near, nx: 4, nu: 5, off: 0.3 });
    const ds = drapeSurf(0.32);
    const hemY = (x: number): number => { const s = section(x); return s.cy - (near((x - x0) / (4.2 - x0)) - Math.PI / 2) * (s.down + 0.3) * 0.95; };
    const trimPts: number[] = [];
    for (let i = 0; i <= 4; i++) { const xx = x0 + 0.2 + ((4.0 - x0) * i) / 4; trimPts.push(xx, hemY(xx) + 0.55); }
    k.line(trimPts, 0.55, tack.trim, ds);
    if (broken) tearLine(k, ds, [-1.6, 18.6, -1.2, 16.4, -1.8, 14.0, -1.3, 11.8], tack.cloth);
    if (worn(w, 1)) dirt(k, ds, 1.6, hemY(1.6) + 1.6, 3.4, tack.cloth);
  }
  // The girth round the belly, a buckle on it.
  k.line([1.3, 17.6, 1.5, 13.0, 1.8, 8.4], 1.1, leather, flank(0.18));
  k.decal(ell(1.55, 11.6, 0.55, 0.5, 6), tack.metal ?? IRON, flank(0.3));
  // The seat, the pommel in front and the high cantle behind; the flap down the near side.
  k.ball([-0.8, 19.7, 0], 1, leather, { detail: 1, s: [4.0, 1.15, 3.4], gloss: 0.3 });
  k.rod([2.4, 19.4, 0], [3.4, 21.8, 0], 1.25, leather, { r1: 0.85, seg: 6, gloss: 0.3 });
  k.ball([3.45, 21.9, 0], 0.75, tack.trim, { detail: 0, hull: 0.5, gloss: 0.5 });
  k.box([-4.6, 20.6, 0], [1.1, 2.8, 5.2], leather, { rot: [0, 0, 0.42], gloss: 0.3 });
  const fz = (x: number, y: number): V3 => [x, y, section(x).w * Math.sin(bodyAngle(x, y)) + 0.75];
  plate(k, [fz(-3.6, 19.2), fz(2.2, 19.2), fz(2.8, 15.0), fz(1.6, 13.6), fz(-3.0, 13.6), fz(-4.0, 15.4)], leather, [-0.6, 14, 0], { gloss: 0.3, hull: 0.5 });
  k.line([-2.8, 14.2, 1.8, 14.2], 0.25, mix(leather, '#FFFFFF', 0.2), (x, y) => ({ p: fz(x, y), n: [0, 0, 1] }));
  if (worn(w, 2)) k.line([-2.0, 17.6, -0.4, 16.4], 0.28, mix(leather, '#FFFFFF', 0.4), (x, y) => ({ p: fz(x, y), n: [0, 0, 1] }));
  // The breast collar: round the chest from the saddle, a boss in the middle. Battered, snapped and hanging.
  const metal = tack.metal ?? IRON;
  const chest = [bodyPoint(3.6, 1.25, 0.25), bodyPoint(6.8, 1.55, 0.3), bodyPoint(9.0, 1.4, 0.3), bodyPoint(10.6, 0.9, 0.3), [11.2, 13.4, 0] as V3];
  if (tack.noCloth) { /* under the barding */ } else if (worn(w, 3)) {
    strap(k, chest.slice(0, 2), 0.42, leather, 0.4);
    const end = chest[1]!;
    strap(k, [end, [end[0] + 0.4, end[1] - 2.6, end[2] + 0.3]], 0.42, leather, 0.4);
  } else strap(k, chest, 0.42, leather, 0.4);
  if (!worn(w, 3) && !tack.noCloth) k.ball(bodyPoint(10.0, 1.2, 0.5), 0.75, metal, { detail: 0, hull: 0.4, gloss: 0.5 });
  if (hc.stripe) k.line([-13.4, 15.4 + 5.3, -9.6, 20.5, -6.0, 19.6, -4.4, 19.3], 0.7, hc.stripe, (x, y) => ({ p: bodyPoint(x, 0, 0.05), n: [0, 1, 0] }));
}

/**
 * A large mark finely cut to follow a curved surface (a piebald's patch): the outline densified, triangulated, and
 * split until no edge is longer than `step`, so its middle lies on the surface rather than cutting through it.
 */
export function patch(k: Kit, poly: readonly number[], colour: string, surf: Surface, step: number, lift = 0.08): void {
  const contour: Vector2[] = [];
  for (let i = 0; i + 1 < poly.length; i += 2) {
    const a = new Vector2(poly[i]!, poly[i + 1]!), j = (i + 2) % poly.length, b = new Vector2(poly[j]!, poly[j + 1]!);
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / step));
    for (let t = 0; t < n; t++) contour.push(a.clone().lerp(b, t / n));
  }
  if (ShapeUtils.isClockWise(contour)) contour.reverse();
  const out: Vector2[][] = [];
  const split = (t: Vector2[], depth: number): void => {
    const [a, b, c] = t as [Vector2, Vector2, Vector2];
    const ab = a.distanceTo(b), bc = b.distanceTo(c), ca = c.distanceTo(a), m = Math.max(ab, bc, ca);
    if (m <= step || depth > 5) { out.push(t); return; }
    if (m === ab) { const d = a.clone().lerp(b, 0.5); split([a, d, c], depth + 1); split([d, b, c], depth + 1); }
    else if (m === bc) { const d = b.clone().lerp(c, 0.5); split([a, b, d], depth + 1); split([a, d, c], depth + 1); }
    else { const d = c.clone().lerp(a, 0.5); split([a, b, d], depth + 1); split([d, b, c], depth + 1); }
  };
  for (const t of ShapeUtils.triangulateShape(contour, [])) split(t.map((i) => contour[i]!), 0);
  const pos: number[] = [], nor: number[] = [];
  for (const t of out) {
    const vs = t.map((v) => { const s = surf(v.x, v.y); return { p: new Vector3(s.p[0] + s.n[0] * lift, s.p[1] + s.n[1] * lift, s.p[2] + s.n[2] * lift), n: s.n }; });
    const face = vs[1]!.p.clone().sub(vs[0]!.p).cross(vs[2]!.p.clone().sub(vs[0]!.p));
    if (face.dot(new Vector3(...vs[0]!.n)) < 0) vs.reverse();
    for (const v of vs) { pos.push(v.p.x, v.p.y, v.p.z); nor.push(...v.n); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  k.add(g, colour, { hull: 0 }, true);
}

/** The torn edge of cloth: a dark ragged line, cloth-coloured shadow beside it. */
export function tearLine(k: Kit, s: Surface, pts: readonly number[], cloth: string): void {
  k.line(pts, 0.5, mix(cloth, '#000000', 0.55), s);
}

// ---- the horse ----

export interface HorseOpts {
  /** Extra parts on the neck and head (the NECK piece): a crinet, a chanfron, a plume. */
  neck?: () => void;
  /** Barding covers the flank: its marks (mud, scratches, cuts, blood, scars) go on the barding instead. */
  covered?: boolean;
  /** No mane (a crinet covers the neck). */
  noMane?: boolean;
}

/**
 * The Gritty horse, in the mount's frame (facing +x, near side +z). Riders add their barding over it (drape) and
 * their own neck pieces (`o.neck`).
 */
export function grittyHorse(k: Kit, hc: Coat, tack: Tack, w: Wear, o: HorseOpts = {}): void {
  k.pivot(LEGS, [0, 0, 0], () => {
    for (const l of LEG_SPECS) leg(k, l, hc, w);
    if (w.blood >= 1) legBlood(k);
  });
  // The barrel, from the croup to the chest.
  loft(k, BODY_RINGS, 12, hc.coat);
  // The tail: the dock, then a long combed fall of hair.
  k.rod([-14.2, 18.6, 0], [-15.9, 15.6, 0], 1.25, hc.mane, { r1: 1.0, seg: 5 });
  const tail = [-0.9, 0.4, 0.8, 0.6, 1.6, -3.6, 1.3, -7.6, 2.0, -10.2, 0.6, -11.4, 0.0, -10.4, -0.9, -11.0, -1.0, -7.2, -1.6, -3.2];
  k.slab(tail, 1.6, hc.mane, [-16.0, 15.4, 0], [0, 0, -0.14], { hull: 0.7 });
  const tf: Surface = (x, y) => ({ p: [x, y, 0.82], n: [0, 0, 1] });
  const deep = mix(hc.mane, '#000000', 0.32), light = mix(hc.mane, '#FFFFFF', 0.2);
  k.frame([-16.0, 15.4, 0], [0, 0, -0.14], () => {
    k.line([0.2, 0, 0.6, -4.4, 0.8, -9.2], 0.2, light, tf);
    k.line([-0.4, -0.6, -0.5, -5.6, -0.2, -9.6], 0.2, deep, tf);
    k.line([1.0, -1.2, 1.2, -5.0, 1.5, -8.4], 0.18, deep, tf);
  });
  // Coat detail: the shoulder's line and the hip's point, a little darker.
  const sh = mix(hc.coat, '#000000', 0.2);
  k.line([7.0, 17.6, 6.0, 13.8, 6.6, 10.6], 0.35, sh, flank(0.06));
  k.line([-8.0, 18.0, -10.4, 15.6], 0.3, sh, flank(0.06));
  k.pivot(NECK, NECK_AT, () => headAndNeck(k, hc, tack, w, o));
  saddle(k, hc, tack, w);
  // Wear on the flank: mud low on the belly, scratches, a scabbed cut, blood; healed scars.
  if (o.covered) return;
  const fl = flank(0.06);
  if (worn(w, 1)) { dirt(k, fl, -5.4, 9.8, 4.4, hc.coat); dirt(k, fl, 6.6, 9.6, 3.4, hc.coat); }
  const pale = mix(hc.coat, '#FFFFFF', 0.45);
  if (worn(w, 2)) for (const m of [[-7.6, 16.4, -5.4, 14.2], [-7.0, 17.6, -4.6, 15.4], [6.2, 15.8, 8.0, 13.4]] as const) k.line(m, 0.3, pale, fl);
  if (worn(w, 3)) { k.line([-10.6, 13.2, -8.6, 11.2, -7.2, 10.8], 0.55, '#3A1A12', fl); k.line([-10.4, 13.6, -8.4, 11.6], 0.18, pale, fl); }
  if (w.scarred === true && w.blood === 0) {
    const scar = mix(hc.coat, '#F2E8DA', 0.62);
    k.line([7.4, 16.6, 6.4, 14.4, 7.0, 12.4], 0.6, scar, fl);
    k.line([-9.0, 17.2, -6.6, 14.4], 0.5, scar, fl);
  }
  if (w.blood >= 1) { smear(k, fl, 7.2, 15.4, 0.2, -1, 4.2, 1.5); smear(k, fl, -8.6, 15.6, 0.3, -1, 3.0, 1.2); }
  if (heavy(w)) {
    smear(k, fl, -4.4, 12.4, -0.2, -1, 3.4, 1.4);
    drip(k, fl, -8.2, 12.0, 2.8, 0.8);
    k.decal(ell(5.4, 10.0, 0.5, 0.4, 6), BLOOD, fl);
  }
}

/** The height of the horse's back at the seat, for riders. */
export const SADDLE_TOP = 20.9;