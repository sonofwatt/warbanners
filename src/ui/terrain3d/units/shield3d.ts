// Shared pieces of the Gritty figures in 3D: a shell built on a grid (a front surface, its inside and walls where it
// is broken: helms and shields), finely cut marks that follow a curved surface, the owner's colour deepened, and the
// great domed bronze shield with the owner's chevron and its wear (a chip, a crack, about half gone when broken).
import { BufferGeometry, Color, Float32BufferAttribute, ShapeUtils, Vector2, Vector3 } from 'three';
import { mix } from './kit';
import type { Kit, PartOpts, Poly, Surface } from './kit';
import { BLOOD, bloody, crack, dent, ell, heavy, scratches, smear, worn } from './parts';
import type { Cut, Look, Wear } from './parts';

const BRONZE = '#5F4420';
const BRONZE_DARK = '#4A3618';
const BRONZE_LIT = '#E2C27A';
/** A fresh scratch in bronze: bright metal, not paint. */
const WORN_BRONZE = '#D8C49A';
const SHIELD_BACK = '#4A3626';

const sm = (o: PartOpts = {}): PartOpts => ({ ...o, smooth: true });

/**
 * The owner's colour deepened and saturated (a crimson for the Spartans), so it glows against Gritty's dull ground
 * and tells the sides apart at a glance.
 */
export function vivid(hex: string): string {
  const col = new Color(hex), hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  // A touch toward crimson (red leans to blue-red; other hues shift the same small step), saturated and deep.
  col.setHSL((hsl.h + 0.975) % 1, Math.min(1, hsl.s * 1.35 + 0.1), Math.max(0.18, hsl.l * 0.7));
  return '#' + col.getHexString();
}

/**
 * A finely cut mark on a curved surface: the polygon is triangulated, then split until no edge is longer than `step`,
 * so it follows the surface rather than cutting through it (a shield's dome, the helmet's opening).
 */
let fineCount = 0;
export function fineDecal(k: Kit, poly: Poly, colour: string, surf: Surface, step: number, lift = 0.1, clip?: (x: number, y: number) => [number, number]): void {
  const contour: Vector2[] = [];
  // Densify the outline first.
  for (let i = 0; i + 1 < poly.length; i += 2) {
    const a = new Vector2(poly[i]!, poly[i + 1]!);
    const j = (i + 2) % poly.length;
    const b = new Vector2(poly[j]!, poly[j + 1]!);
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / step));
    for (let t = 0; t < n; t++) contour.push(a.clone().lerp(b, t / n));
  }
  if (ShapeUtils.isClockWise(contour)) contour.reverse();
  const tris = ShapeUtils.triangulateShape(contour, []);
  const flat: Vector2[][] = [];
  const split = (t: Vector2[], depth: number): void => {
    const [a, b, c] = t as [Vector2, Vector2, Vector2];
    const ab = a.distanceTo(b), bc = b.distanceTo(c), ca = c.distanceTo(a);
    const m = Math.max(ab, bc, ca);
    if (m <= step || depth > 6) { flat.push(t); return; }
    if (m === ab) { const d = a.clone().lerp(b, 0.5); split([a, d, c], depth + 1); split([d, b, c], depth + 1); }
    else if (m === bc) { const d = b.clone().lerp(c, 0.5); split([a, b, d], depth + 1); split([a, d, c], depth + 1); }
    else { const d = c.clone().lerp(a, 0.5); split([a, b, d], depth + 1); split([d, b, c], depth + 1); }
  };
  for (const t of tris) split(t.map((i) => contour[i]!), 0);
  // Clipped to what is there: every corner beyond the surface's edge is moved onto the edge, so the mark ends cleanly
  // along it (a triangle wholly beyond it flattens to nothing on the edge).
  if (clip) for (const t of flat) for (const v of t) { const [x, y] = clip(v.x, v.y); v.set(x, y); }
  const up = lift + Math.min(0.2, 0.006 * fineCount++);
  const pos: number[] = [], nor: number[] = [];
  for (const t of flat) {
    const vs = t.map((v) => {
      const s = surf(v.x, v.y);
      return { p: new Vector3(s.p[0] + s.n[0] * up, s.p[1] + s.n[1] * up, s.p[2] + s.n[2] * up), n: s.n };
    });
    const face = vs[1]!.p.clone().sub(vs[0]!.p).cross(vs[2]!.p.clone().sub(vs[0]!.p));
    if (face.dot(new Vector3(...vs[0]!.n)) < 0) vs.reverse();
    for (const v of vs) { pos.push(v.p.x, v.p.y, v.p.z); nor.push(...v.n); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  k.add(g, colour, { hull: 0 }, true);
}

// ---- a shell on a grid: a front surface, an optional back surface (its inside) and walls where it is broken ----

export interface Shell {
  nu: number; nv: number; wrapU?: boolean;
  /** The outer surface and the inner one at grid point (i, j), i across (0..nu), j along (0..nv). */
  front: (i: number, j: number) => Vector3;
  back?: (i: number, j: number) => Vector3;
  /** Whether cell (i, j) is there (a broken piece is not), and whether its inside is drawn. */
  keep?: (i: number, j: number) => boolean;
  backKeep?: (i: number, j: number) => boolean;
  /** A point the shell wraps round: the front faces away from it, the back toward it. */
  inside: Vector3;
  /** A tint per grid point (a dirty hem), multiplied into the colour. */
  tint?: (i: number, j: number) => readonly [number, number, number];
}

export function shell(k: Kit, sh: Shell, colour: string, backColour: string, edge: string, o: PartOpts = {}): void {
  const { nu, nv } = sh;
  const cols = sh.wrapU ? nu : nu + 1;
  const idx = (i: number, j: number): number => j * cols + (sh.wrapU ? ((i % nu) + nu) % nu : i);
  const keep = (i: number, j: number): boolean => {
    if (j < 0 || j >= nv) return false;
    if (sh.wrapU) i = ((i % nu) + nu) % nu; else if (i < 0 || i >= nu) return false;
    return sh.keep?.(i, j) ?? true;
  };
  const surface = (at: (i: number, j: number) => Vector3, on: (i: number, j: number) => boolean, toward: boolean, col: string, opts: PartOpts, tinted: boolean): void => {
    const pos: number[] = [], tint: number[] = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) {
      const p = at(i, j); pos.push(p.x, p.y, p.z);
      const t = tinted && sh.tint ? sh.tint(i, j) : [1, 1, 1];
      tint.push(t[0]!, t[1]!, t[2]!);
    }
    const index: number[] = [];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      if (!keep(i, j) || !on(i, j)) continue;
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
      index.push(a, b, c, a, c, d);
    }
    if (index.length === 0) return;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    if (sh.tint && tinted) g.setAttribute('color', new Float32BufferAttribute(tint, 3));
    // Face the right way: test the first triangle against the point the shell wraps round.
    const pa = new Vector3().fromArray(pos, index[0]! * 3), pb = new Vector3().fromArray(pos, index[1]! * 3), pc = new Vector3().fromArray(pos, index[2]! * 3);
    const nrm = pb.clone().sub(pa).cross(pc.clone().sub(pa));
    const away = pa.clone().sub(sh.inside).dot(nrm) > 0;
    if (away === toward) for (let t = 0; t < index.length; t += 3) { const s = index[t + 1]!; index[t + 1] = index[t + 2]!; index[t + 2] = s; }
    g.setIndex(index);
    g.computeVertexNormals();
    k.add(g, col, sm(opts));
  };
  surface(sh.front, () => true, false, colour, o, true);
  if (sh.back === undefined) return;
  const bk = (i: number, j: number): boolean => sh.backKeep?.(i, j) ?? true;
  surface(sh.back, bk, true, backColour, { hull: 0 }, false);
  // Walls along every edge of a kept cell whose neighbour is gone (a break) or beyond the grid (the rim).
  const back = sh.back;
  const wall: number[] = [];
  const quad = (p0: Vector3, p1: Vector3, cellMid: Vector3): void => {
    const [i0, j0, i1, j1] = [p0.x, p0.y, p1.x, p1.y];
    const f0 = sh.front(i0, j0), f1 = sh.front(i1, j1), b0 = back(i0, j0), b1 = back(i1, j1);
    const mid = f0.clone().add(f1).multiplyScalar(0.5);
    const out = mid.clone().sub(cellMid);
    const n = f1.clone().sub(f0).cross(b0.clone().sub(f0));
    const tri = n.dot(out) > 0 ? [f0, f1, b1, f0, b1, b0] : [f0, b1, f1, f0, b0, b1];
    for (const v of tri) wall.push(v.x, v.y, v.z);
  };
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    if (!keep(i, j) || !bk(i, j)) continue;
    const mid = sh.front(i, j).add(sh.front(i + 1, j)).add(sh.front(i + 1, j + 1)).add(sh.front(i, j + 1)).multiplyScalar(0.25);
    const g = (a: number, b: number): Vector3 => new Vector3(a, b, 0);
    if (!keep(i, j - 1)) quad(g(i, j), g(i + 1, j), mid);
    if (!keep(i, j + 1)) quad(g(i, j + 1), g(i + 1, j + 1), mid);
    if (!keep(i - 1, j)) quad(g(i, j), g(i, j + 1), mid);
    if (!keep(i + 1, j)) quad(g(i + 1, j), g(i + 1, j + 1), mid);
  }
  if (wall.length > 0) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(wall, 3));
    k.add(g, edge, { hull: 0, gloss: o.gloss });
  }
}

// ---- the shield: a great domed bronze shield, the owner's mark on it ----

const SR = 9.6;
const SRINGS = [0, 0.24, 0.45, 0.63, 0.78, 0.885, 1.0];
const SNU = 24;
const DOME = 2.5;
const shieldZ = (r: number): number => {
  const rf = SR * 0.885;
  if (r <= rf) return DOME * (1 - (r / rf) * (r / rf)) * 0.9 + 0.1 * DOME * (1 - r / rf);
  return -0.3 * (r - rf) / (SR - rf);
};
const shieldSurf: Surface = (x, y) => {
  const r = Math.hypot(x, y), e = 0.05;
  const z = shieldZ(r);
  const dz = (shieldZ(r + e) - shieldZ(Math.max(0, r - e))) / (2 * e);
  const n = new Vector3(r > 1e-4 ? (-dz * x) / r : 0, r > 1e-4 ? (-dz * y) / r : 0, 1).normalize();
  return { p: [x, y, z], n: [n.x, n.y, n.z] };
};

/** A point of the face (shield frame, y up) pulled in radially where a piece is chipped out of the rim. */
function chipped(x: number, y: number, cuts: readonly Cut[], jag: number): [number, number] {
  const r = Math.hypot(x, y);
  const svg = ((-Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  for (const c of cuts) {
    const s = ((c.from % 360) + 360) % 360, e = ((c.to % 360) + 360) % 360;
    const inside = s <= e ? svg >= s && svg <= e : svg >= s || svg <= e;
    if (inside && r > c.inner) { const k = (c.inner + jag) / r; return [x * k, y * k]; }
  }
  return [x, y];
}

/** The domed bronze shield in its own frame (face toward +z), with its wear; `sectors` round the rim. */
export function bronzeShield(k: Kit, c: Look, w: Wear, sectors = SNU): void {
  fineCount = 0;
  shield(k, c, w, sectors);
}

function shield(k: Kit, c: Look, w: Wear, nu = SNU): void {
  const broken = worn(w, 4);
  const cuts: Cut[] = [];
  if (worn(w, 3) && !broken) cuts.push({ from: 285, to: 318, inner: SR * 0.62 });
  if (broken) cuts.push({ from: 300, to: 322, inner: SR * 0.8 });
  const JAG = [0.0, 0.6, 1.1, 0.4, -0.5, -0.2, 0.7, 1.3, 0.3, -0.6, -0.1, 0.5, 0.9, 0.2, -0.4, 0.1, 0.6];
  const at = (x: number, y: number, back: boolean, jag: number): Vector3 => {
    const [px, py] = chipped(x, y, cuts, jag);
    return new Vector3(px, py, shieldZ(Math.hypot(px, py)) - (back ? 0.75 : 0));
  };
  const NV = 12;
  const yMax = SR * 0.97;
  /** Broken: where the break runs at height y (the same jagged line the rows of what is left start from). */
  const breakAt = (y: number): number => {
    const f = Math.min(NV, Math.max(0, ((y + yMax) / (2 * yMax)) * NV)), j = Math.min(NV - 1, Math.floor(f)), u = f - j;
    const xb = (jj: number): number => { const yy = -yMax + (2 * yMax * jj) / NV; return Math.min(Math.sqrt(Math.max(0, SR * SR - yy * yy)) - 0.6, -SR * 0.24 + JAG[jj % JAG.length]!); };
    return xb(j) + (xb(j + 1) - xb(j)) * u;
  };
  /** A point of the face moved onto what is still there: in from the break, in from a chip out of the rim. */
  const there = (x: number, y: number): [number, number] => {
    let px = broken ? Math.max(x, breakAt(y) + 0.3) : x, py = y;
    const r = Math.hypot(px, py), svg = ((-Math.atan2(py, px) * 180) / Math.PI + 360) % 360;
    for (const ct of cuts) if (svg >= ct.from && svg <= ct.to && r > ct.inner - 0.4) { const f = (ct.inner - 0.4) / r; px *= f; py *= f; }
    return [px, py];
  };
  if (!broken) {
    // Whole (or chipped): a disc in rings, the outer ring at the rim's edge.
    const pt = (i: number, j: number, back: boolean): Vector3 => {
      const a = (i / nu) * Math.PI * 2, r = SRINGS[j]! * SR;
      return at(Math.cos(a) * r, Math.sin(a) * r, back, (i % 2 ? 0.35 : -0.25) * (j / (SRINGS.length - 1)));
    };
    shell(k, { nu, nv: SRINGS.length - 1, wrapU: true, front: (i, j) => pt(i, j, false), back: (i, j) => pt(i, j, true), inside: new Vector3(0, 0, -6) },
      BRONZE, SHIELD_BACK, BRONZE_DARK, { gloss: 0.5 });
  } else {
    // Broken: nearly half is gone. What is left runs from a jagged break left of the middle to the right rim, in rows.
    const ACROSS = [0, 0.22, 0.42, 0.6, 0.76, 0.88, 0.96, 1.0];
    const pt = (i: number, j: number, back: boolean): Vector3 => {
      const y = -yMax + (2 * yMax * j) / NV;
      const xr = Math.sqrt(Math.max(0, SR * SR - y * y));
      const xb = Math.min(xr - 0.6, -SR * 0.24 + JAG[j % JAG.length]!);
      return at(xb + (xr - xb) * ACROSS[i]!, y, back, 0.25 * (j % 2 ? 1 : -1));
    };
    shell(k, { nu: ACROSS.length - 1, nv: NV, front: (i, j) => pt(i, j, false), back: (i, j) => pt(i, j, true), inside: new Vector3(0, 0, -6) },
      BRONZE, SHIELD_BACK, mix(BRONZE_DARK, BRONZE_LIT, 0.35), { gloss: 0.5 });
  }
  // The rim's darker band and the owner's mark, a chevron, clipped to whatever of the face is left.
  const ring: number[] = [];
  for (let i = 0; i <= 28; i++) { const a = (i / 28) * Math.PI * 2; ring.push(Math.cos(a) * SR * 0.895, Math.sin(a) * SR * 0.895); }
  if (!worn(w, 3)) k.line(ring, 0.22, BRONZE_DARK, shieldSurf);
  const mark = vivid(c.main);
  const lam = [0, 6.6, 5.2, -5.6, 2.7, -5.6, 0, 0.9, -2.7, -5.6, -5.2, -5.6];
  const damaged = cuts.length > 0;
  fineDecal(k, lam, mark, shieldSurf, damaged ? 1.4 : 2.0, 0.08, damaged ? there : undefined);
  shieldWear(k, w);
}

/** The shield face's wear: scratches, dents, a crack from the chip; spattered blood on what is left. */
function shieldWear(k: Kit, w: Wear): void {
  const s = shieldSurf;
  if (worn(w, 1)) scratches(k, s, worn(w, 4) ? [[2.6, -3.8, 4.4, -2.6]] : [[-4.6, 3.6, -2.8, 4.6], [2.6, -3.8, 4.4, -2.6], [-1.2, -5.6, 0.4, -4.8]], WORN_BRONZE, 0.18);
  if (worn(w, 2)) { dent(k, s, 3.6, 2.2, 1.35, BRONZE); dent(k, s, 1.2, -5.2, 1.0, BRONZE); if (!worn(w, 4)) dent(k, s, -3.8, -1.4, 1.25, BRONZE); }
  if (worn(w, 3)) crack(k, s, [2.8, 4.9, 2.4, 3.6, 3.0, 2.4, 2.0, 1.0], 0.22);
  if (worn(w, 4)) crack(k, s, [1.4, -2.0, 2.8, -3.2, 3.4, -5.0], 0.22);
  if (bloody(w, 1)) smear(k, s, 2.2, -1.2, -0.3, -1, 3.0, 1.1);
  if (heavy(w)) {
    smear(k, s, 4.4, 3.8, -0.2, -1, 3.4, 1.2);
    for (const [x, y, r] of [[5.6, 0.4, 0.35], [2.6, 5.4, 0.3], [1.4, 2.6, 0.25], [4.8, -3.6, 0.32]] as const) k.decal(ell(x, y, r, r, 6), BLOOD, s);
  }
}
