// The Gritty Hoplite in 3D: a realistic figure, our own design in the spirit of a heroic Greek spearman. Real human
// proportions (about seven and a half heads tall), a bare sculpted torso and arms, a leather kilt and belt, bronze
// greaves, a long cloak and a horsehair crest in the owner's colour, a closed bronze helmet with a T-shaped opening,
// a great domed bronze shield with the owner's mark and a long spear. Smooth shaded (the parts keep their own normals)
// and drawn with the Gritty light (shaders.ts GRITTY_LIGHT). Used only in Gritty; Bright keeps the toon hoplite.
//
// Same figure space as the toon figures (kit.ts): feet on y 0, x to the right of the screen, z toward the viewer.
// The moving pieces keep the toon names (the spear WEAPON, the shield with its arm SHIELD, the shins LEGS, the feet
// FEET) so the strike, block, idle and gait code drives it unchanged; the thighs are one more piece (THIGHS) so the
// hunker crouch can bend the knees (crouch.ts has its own guard for this figure).
//
// Wear follows the 2D art (art/factionUnits.tsx hoplite, art/wear.tsx): scratches and dirt, then dents, then a chip
// out of the shield's rim, a crack, a torn crest and cloak hem; broken, about half the shield is gone, the spear is
// snapped and a cheek plate is broken out of the helmet, showing the face. Blood from battered, more at level 2, on
// the skin, the face under the gap and the ground. Scarred: the gap stays, with a pale scar on the cheek.
import {
  BufferGeometry, Color, CylinderGeometry, Euler, Float32BufferAttribute, LatheGeometry, Quaternion, ShapeUtils, SphereGeometry,
  Vector2, Vector3,
} from 'three';
import { ground, Kit, mix } from './kit';
import type { PartOpts, Poly, Surface, SurfacePoint, V3 } from './kit';
import {
  BLOOD, BLOOD_LIGHT, bloody, crack, dent, dirt, drip, ell, FEET, heavy, helmBroken, LEGS, SCAR, SCAR_DARK,
  scratches, setYaw, smear, smearPoly, worn,
} from './parts';
import type { Cut, Look, Wear } from './parts';

// ---- palette: realistic and a little muted already (the Gritty shader mutes every figure further) ----

const SKIN = '#987049';
const SKIN_DARK = '#624629';
const BRONZE = '#5F4420';
const BRONZE_DARK = '#4A3618';
const BRONZE_LIT = '#E2C27A';
const BRONZE_IN = '#2A1E12';
/** A fresh scratch in bronze: bright metal, not paint. */
const WORN_BRONZE = '#D8C49A';
/** The torn edge of the bronze where a cheek plate broke away: bright fresh metal. */
const BRONZE_TORN = '#F0D896';
const SLIT = '#0A0806';
const LEATHER = '#6A4A33';
const LEATHER_DARK = '#3A281B';
const SHAFT = '#5E4733';
const IRON = '#8B8E92';
const IRON_DARK = '#5D6166';
const SHIELD_BACK = '#4A3626';
/** A healed scar on this darker skin: paler than the toon SCAR so it shows. */
const SCAR_PALE = '#EBCDB4';
const SCAR_LINE = '#C99C82';

/**
 * The owner's colour on this figure, deepened and saturated (a crimson for the Spartans): the Gritty light does not
 * mute the realistic figures, so this glows against the dull ground and tells the sides apart at a glance.
 */
function vivid(hex: string): string {
  const col = new Color(hex), hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  // A touch toward crimson (red leans to blue-red; other hues shift the same small step), saturated and deep.
  col.setHSL((hsl.h + 0.975) % 1, Math.min(1, hsl.s * 1.35 + 0.1), Math.max(0.18, hsl.l * 0.7));
  return '#' + col.getHexString();
}

/** The thighs: a piece of their own, turning about the hips, so a crouch bends the knees. */
export const THIGHS = 'thighs';
const WEAPON = 'weapon';
const SHIELD = 'shield';
const TIP_FORWARD: V3 = [1, 0, 0];

/** How far the figure turns toward the right of the screen (figures.ts STAND_YAW). */
const YAW = 0.38;

// ---- the body's landmarks (world units; the figure is about 47 tall to the crown of the helmet) ----

const HIP_Y = 23.4;
const KNEE_Y = 12.6;
const ANKLE_Y = 2.0;
const SHOULDER: V3 = [6.15, 36.3, -0.1];
/** The spear hand (the figure's right, on the screen's right) and the shield hand. */
const SPEAR_HAND: V3 = [11.0, 27.6, 3.3];
const SHIELD_HAND: V3 = [-9.4, 27.2, 4.2];
const HELM_C: V3 = [0, 44.1, 0.3];
const HEAD_C: V3 = [0, 43.75, 0.15];
const HEAD_R: V3 = [2.6, 3.3, 2.95];

// ---- smooth solids ----

const sm = (o: PartOpts = {}): PartOpts => ({ ...o, smooth: true });

/** A smooth ellipsoid at c with radii r, turned by rot (YXZ), `w` x `h` segments. */
function blob(k: Kit, c: V3, r: V3, colour: string, o: PartOpts & { w?: number; h?: number; rot?: V3; cavity?: V3; dusty?: boolean } = {}): void {
  const g = new SphereGeometry(1, o.w ?? 8, o.h ?? 6);
  if (o.cavity) {
    // A muscle: darker where it turns away from its own front and meets the body, so the hollows between muscles
    // sit in deep shade (ambient occlusion by hand).
    const n = g.attributes.normal!, tint: number[] = [];
    for (let i = 0; i < n.count; i++) {
      const d = n.getX(i) * o.cavity[0] + n.getY(i) * o.cavity[1] + n.getZ(i) * o.cavity[2];
      const t = 0.42 + 0.58 * Math.min(1, Math.max(0, (d + 0.15) / 0.75));
      tint.push(t, t * 0.94, t * 0.9);
    }
    g.setAttribute('color', new Float32BufferAttribute(tint, 3));
  }
  g.scale(...r);
  if (o.rot) g.applyQuaternion(new Quaternion().setFromEuler(new Euler(o.rot[0], o.rot[1], o.rot[2], 'YXZ')));
  g.translate(...c);
  if (o.dusty) {
    // Dust over the muscle's own shading: multiply into the tint it has.
    const had = g.attributes.color;
    dust(g);
    if (had) { const now = g.attributes.color!; for (let i = 0; i < now.count; i++) now.setXYZ(i, now.getX(i) * had.getX(i), now.getY(i) * had.getY(i), now.getZ(i) * had.getZ(i)); }
  }
  k.add(g, colour, sm(o));
}

/** A smooth tapered limb from a (radius r0) to b (radius r1), open ended (its joints are blobs). */
function limb(k: Kit, a: V3, b: V3, r0: number, r1: number, colour: string, o: PartOpts & { seg?: number; dusty?: boolean } = {}): void {
  const va = new Vector3(...a), vb = new Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new CylinderGeometry(r1, r0, len, o.seg ?? 8, o.dusty ? 3 : 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), vb.clone().sub(va).normalize()));
  g.translate(...a);
  if (o.dusty) dust(g);
  k.add(g, colour, sm(o));
}

/** Dust of the field on the lower legs: duller and paler toward the ground (by height in the figure frame). */
function dust(g: { attributes: { position?: { count: number; getY(i: number): number } }; setAttribute(n: string, a: Float32BufferAttribute): unknown }): void {
  const pos = g.attributes.position!, tint: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - 1) / 13));
    tint.push(0.8 + 0.2 * t, 0.78 + 0.22 * t, 0.74 + 0.26 * t);
  }
  g.setAttribute('color', new Float32BufferAttribute(tint, 3));
}

/** A smooth solid of revolution about the vertical through (x, z): profile [r, y] from the bottom up, depth squashed by sz. */
function lathe(k: Kit, at: V3, profile: readonly (readonly [number, number])[], colour: string, o: PartOpts & { sz?: number; seg?: number; from?: number; arc?: number } = {}): void {
  const g = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), o.seg ?? 14, o.from ?? 0, o.arc ?? Math.PI * 2);
  g.scale(1, 1, o.sz ?? 1);
  g.translate(at[0], at[1], at[2]);
  k.add(g, colour, sm(o));
}

/** The radius of a lathe profile at height y (linear between its points). */
function radiusAt(profile: readonly (readonly [number, number])[], y: number): number {
  if (y <= profile[0]![1]) return profile[0]![0];
  for (let i = 1; i < profile.length; i++) {
    const [r1, y1] = profile[i]!, [r0, y0] = profile[i - 1]!;
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
  }
  return profile.at(-1)![0];
}

/** The front of a lathe (x, y in the figure's frame), for marks. */
function onLathe(at: V3, profile: readonly (readonly [number, number])[], sz: number): (x: number, y: number) => SurfacePoint | null {
  return (x, y) => {
    const r = radiusAt(profile, y);
    const dx = x - at[0];
    if (Math.abs(dx) >= r * 0.98) return null;
    const zr = Math.sqrt(r * r - dx * dx);
    const slope = (radiusAt(profile, y + 0.2) - radiusAt(profile, y - 0.2)) / 0.4;
    const n = new Vector3(dx / r, -slope * 0.8, zr / r / sz).normalize();
    return { p: [x, y, at[2] + sz * zr], n: [n.x, n.y, n.z] };
  };
}

/** The front of an upright ellipsoid, for marks; null outside it. */
function onBlob(c: V3, r: V3): (x: number, y: number) => SurfacePoint | null {
  return (x, y) => {
    const dx = (x - c[0]) / r[0], dy = (y - c[1]) / r[1];
    const q = 1 - dx * dx - dy * dy;
    if (q <= 0.0025) return null;
    const dz = Math.sqrt(q);
    const n = new Vector3(dx / r[0], dy / r[1], dz / r[2]).normalize();
    return { p: [x, y, c[2] + r[2] * dz], n: [n.x, n.y, n.z] };
  };
}

/** Whichever of several surfaces stands furthest forward at (x, y): a torso with its muscles over it. */
function frontmost(list: readonly ((x: number, y: number) => SurfacePoint | null)[], fallback: Surface): Surface {
  return (x, y) => {
    let best: SurfacePoint | null = null;
    for (const f of list) {
      const s = f(x, y);
      if (s !== null && (best === null || s.p[2] > best.p[2])) best = s;
    }
    return best ?? fallback(x, y);
  };
}

/** The front of an upright cylinder (a shin, a thigh), x across and y up. */
const onUpright = (cx: number, cz: number, r: number): Surface => (x, y) => {
  const dx = Math.max(-r * 0.95, Math.min(r * 0.95, x - cx));
  const dz = Math.sqrt(r * r - dx * dx);
  return { p: [x, y, cz + dz], n: [dx / r, 0, dz / r] };
};

/**
 * A finely cut mark on a curved surface: the polygon is triangulated, then split until no edge is longer than `step`,
 * so it follows the surface rather than cutting through it (a shield's dome, the helmet's opening).
 */
let fineCount = 0;
function fineDecal(k: Kit, poly: Poly, colour: string, surf: Surface, step: number, lift = 0.1): void {
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

interface Shell {
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

function shell(k: Kit, sh: Shell, colour: string, backColour: string, edge: string, o: PartOpts = {}): void {
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

// ---- the helmet: a closed bronze helm, its cheek plates meeting in front ----

const HA = 3.15, HB = 4.0, HD = 3.75;
/** How far below the helmet's centre its lower edge comes, in front and at the back (the neck guard). */
const DROP_FRONT = 3.7, DROP_BACK = 4.2;
const HNU = 24, HNV = 10;

/** A point on the helmet at angle th (0 = the front, toward +x positive) and height param v (0 the crown, 0.5 the equator, 1 the rim). */
function helmPoint(th: number, v: number, inset = 0): Vector3 {
  const back = Math.max(0, -Math.cos(th)), front = Math.max(0, Math.cos(th));
  let rad: number, yy: number;
  if (v <= 0.5) {
    const ph = v * Math.PI;
    rad = Math.sin(ph);
    yy = HB * Math.cos(ph);
  } else {
    const tt = (v - 0.5) * 2;
    // Below the eyes the cheek plates come down almost straight, closing a little toward the chin; the neck guard
    // at the back flares out.
    rad = (1 - 0.1 * tt * tt) * (1 - 0.1 * tt * tt * front * front) * (1 + 0.12 * tt * tt * back);
    yy = -(DROP_FRONT + (DROP_BACK - DROP_FRONT) * back) * tt;
  }
  const x = HA * rad * Math.sin(th), z = HD * rad * Math.cos(th) * (1 + 0.04 * front);
  const p = new Vector3(HELM_C[0] + x, HELM_C[1] + yy, HELM_C[2] + z);
  if (inset > 0) {
    const c = new Vector3(HELM_C[0], Math.min(HELM_C[1], p.y + 1.2), HELM_C[2]);
    const d = p.clone().sub(c);
    p.sub(d.normalize().multiplyScalar(inset));
  }
  return p;
}

/**
 * The helmet's surface for marks: x across the face (about world units at the eyes), y up from the helmet's centre
 * (the eyes are near y 0.3, the rim near -3.25).
 */
const helmSurf: Surface = (x, y) => {
  const th = x / HA;
  const v = y >= 0 ? Math.acos(Math.min(1, y / HB)) / Math.PI : 0.5 + Math.min(1, -y / DROP_FRONT) / 2;
  const p = helmPoint(th, v);
  const e = 0.01;
  const du = helmPoint(th + e, v).sub(helmPoint(th - e, v));
  const dv = helmPoint(th, Math.min(1, v + e)).sub(helmPoint(th, Math.max(0, v - e)));
  const n = du.cross(dv).normalize();
  if (n.dot(p.clone().sub(new Vector3(...HELM_C))) < 0) n.negate();
  return { p: [p.x, p.y, p.z], n: [n.x, n.y, n.z] };
};

/** An ellipsoid's surface for marks, x across (θ times the x radius) and y up from its centre. */
const ellSurf = (c: V3, r: V3): Surface => (x, y) => {
  const th = x / r[0];
  const ph = Math.acos(Math.max(-0.99, Math.min(0.99, y / r[1])));
  const s = Math.sin(ph);
  const p = new Vector3(c[0] + r[0] * s * Math.sin(th), c[1] + r[1] * Math.cos(ph), c[2] + r[2] * s * Math.cos(th));
  const n = new Vector3((p.x - c[0]) / (r[0] * r[0]), (p.y - c[1]) / (r[1] * r[1]), (p.z - c[2]) / (r[2] * r[2])).normalize();
  return { p: [p.x, p.y, p.z], n: [n.x, n.y, n.z] };
};

/** The T of the helmet's face: the eye slits, the channels beside the nose guard and the slot between the cheek plates. */
function tOpening(): number[] {
  const right: [number, number][] = [
    [0.55, 0.78], [1.0, 0.8], [1.5, 0.72], [1.9, 0.56], [2.15, 0.34],
    [1.9, 0.04], [1.5, -0.12], [1.0, -0.2], [0.66, -0.28],
    [0.46, -0.7], [0.39, -1.2], [0.32, -1.75], [0.29, -2.5], [0.34, -3.1], [0.42, -3.64],
  ];
  const nose: [number, number][] = [[0.27, 0.7], [0.27, -0.45], [0.24, -1.1], [0.14, -1.45], [0, -1.53]];
  const pts: number[] = [];
  for (const [x, y] of right) pts.push(x, y);
  for (let i = right.length - 1; i >= 0; i--) pts.push(-right[i]![0], right[i]![1]);
  for (const [x, y] of nose) pts.push(-x, y);
  for (let i = nose.length - 2; i >= 0; i--) pts.push(nose[i]![0], nose[i]![1]);
  return pts;
}

/** The cells of the helmet broken out when it is broken: the whole near cheek plate (the figure's left, toward the viewer). */
const HELM_GAP = new Set([
  '10,4', '10,5', '10,6', '10,7', '10,8', '10,9', '9,4', '9,5', '9,6', '9,7', '9,8', '9,9', '8,4', '8,5', '8,6', '8,7', '8,8', '8,9',
  '7,5', '7,6', '7,7', '7,8', '7,9', '6,6', '6,7', '6,8', '6,9', '5,8', '5,9',
]);
/** Whether helmet grid point (i, j) lies on the edge of the broken gap (a corner of a gap cell and of a kept one). */
function onGapEdge(i: number, j: number): boolean {
  let gap = 0, kept = 0;
  for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]] as const) {
    if (b < 0 || b >= HNV) continue;
    if (HELM_GAP.has(`${(a + HNU) % HNU},${b}`)) gap++; else kept++;
  }
  return gap > 0 && kept > 0;
}
/** A torn edge: the points along the gap pushed in and out a little, so the break is jagged, not a staircase. */
const TEAR = [0.09, -0.07, 0.12, -0.1, 0.05, 0.11, -0.08, 0.07];

function helmet(k: Kit, c: Look, w: Wear): void {
  const broken = helmBroken(w);
  const th = (i: number): number => (i / HNU - 0.5) * Math.PI * 2;
  const v = (j: number): number => j / HNV;
  const tornPoint = (i: number, j: number, inset: number): Vector3 => {
    if (!broken || !onGapEdge(i, j) || j >= HNV) return helmPoint(th(i), v(j), inset);
    const n = (i * 5 + j * 3) % TEAR.length;
    return helmPoint(th(i) + TEAR[n]! * 1.6, Math.min(1, v(j) + TEAR[(n + 3) % TEAR.length]! * 0.5), inset);
  };
  shell(k, {
    nu: HNU, nv: HNV, wrapU: true,
    front: (i, j) => tornPoint(i, j, 0),
    back: (i, j) => tornPoint(i, j, 0.42),
    keep: (i, j) => !(broken && HELM_GAP.has(`${i},${j}`)),
    backKeep: (i, j) => j >= 5 || (broken && j >= 3 && i >= 4 && i <= 11),
    inside: new Vector3(...HELM_C),
  }, BRONZE, BRONZE_IN, BRONZE_TORN, { gloss: 0.55 });
  // The opening, dark inside; a brow ridge over each eye; the rim's darker edge.
  // Broken, the near half of the opening went with the cheek plate: only the strip beside the nose guard keeps it.
  fineDecal(k, broken ? tOpening().map((v, i) => (i % 2 === 0 ? Math.max(v, -0.7) : v)) : tOpening(), SLIT, helmSurf, 0.9, 0.06);
  for (const s of broken ? [1] : [-1, 1]) k.line([s * 0.28, 1.1, s * 1.1, 1.14, s * 1.85, 0.94, s * 2.35, 0.55], 0.16, mix(BRONZE, BRONZE_LIT, 0.55), helmSurf);
  k.line([-2.6, -3.5, -1.2, -3.58, 1.2, -3.58, 2.6, -3.5], 0.2, BRONZE_DARK, helmSurf);
  // The crest's holder along the top.
  k.box([0, HELM_C[1] + HB - 0.05, HELM_C[2] - 0.6], [0.9, 0.7, 4.6], BRONZE_DARK);
  // Wear: scratches, then dents, then a crack; broken, a cheek plate is gone (the gap above).
  if (worn(w, 1)) scratches(k, helmSurf, [[-2.1, 2.3, -0.9, 3.1], [0.8, 3.0, 2.0, 2.3], [1.3, -0.8, 2.3, -1.6]], WORN_BRONZE, 0.15);
  if (worn(w, 2)) { dent(k, helmSurf, 1.5, 2.2, 0.7, BRONZE); dent(k, helmSurf, -1.0, 3.0, 0.55, BRONZE); }
  if (worn(w, 3)) crack(k, helmSurf, [2.2, 1.6, 2.0, 0.9, 2.4, 0.2], 0.16);
  if (heavy(w)) for (const [x, y, r] of [[1.6, -1.9, 0.22], [2.0, -2.5, 0.16], [0.9, 1.6, 0.14]] as const) k.decal(ell(x, y, r, r, 6), BLOOD, helmSurf);
  crest(k, c, w);
}

/** The horsehair crest: a thin, tall fan of hair front to back over the helmet, ragged at its edge; torn short from battered. */
function crest(k: Kit, c: Look, w: Wear): void {
  const top = HELM_C[1] + HB;
  // Darker than the cloak: the crest stands in the full key light.
  const red = mix(vivid(c.main), '#000000', 0.3), deep = mix(vivid(c.main), '#000000', 0.6), lit = vivid(c.main);
  // The outer edge (z, y) from the front over the top to the tail at the back, and the root along the helmet's top.
  const outer: [number, number][] = [
    [2.6, top + 0.4], [3.6, top + 3.4], [3.4, top + 6.6], [2.0, top + 9.4], [-0.4, top + 11.2], [-3.2, top + 11.6],
    [-5.9, top + 10.6], [-7.9, top + 8.2], [-9.0, top + 5.0], [-9.3, top + 1.4], [-8.8, top - 2.6],
  ];
  const root: [number, number][] = [[2.2, top - 0.5], [0.6, top + 0.05], [-1.8, top + 0.05], [-4.0, top - 0.5], [-5.6, top - 1.4], [-6.8, top - 2.8]];
  const along = (pts: readonly (readonly [number, number])[], t: number): [number, number] => {
    const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), u = f - i;
    return [pts[i]![0] + (pts[i + 1]![0] - pts[i]![0]) * u, pts[i]![1] + (pts[i + 1]![1] - pts[i]![1]) * u];
  };
  const torn = worn(w, 3);
  // Battered, the back of the brush is torn away: only the strands from the front 45 percent stay, ragged.
  const reach = torn ? 0.45 : 1;
  const at: V3 = [0, 0, HELM_C[2] - 0.6];
  // A thin core so no light shows through the fan, its edge ragged.
  const core: number[] = [];
  const NC = 18;
  for (let n = 0; n <= NC; n++) {
    const t = (n / NC) * reach;
    const [oz, oy] = along(outer, t), [rz, ry] = along(root, t);
    const f = 0.9 + (n % 3 === 1 ? 0.06 : n % 3 === 2 ? -0.04 : 0);
    core.push(rz + (oz - rz) * f, ry + (oy - ry) * f);
  }
  for (let n = NC; n >= 0; n--) { const [rz, ry] = along(root, (n / NC) * reach); core.push(rz, ry); }
  k.slab(core, 1.15, red, at, [0, -Math.PI / 2, 0], { hull: 0.4 });
  // The hair: strands fanned from the root out to the edge, some longer, some shorter, a little apart side to side.
  const N = 22;
  const JIT = [0.06, -0.08, 0.12, -0.02, 0.09, -0.11, 0.03, 0.1, -0.06, 0.0, 0.13, -0.09, 0.05];
  for (let n = 0; n < N; n++) {
    const t = ((n + 0.5) / N) * reach;
    const [oz, oy] = along(outer, t), [rz, ry] = along(root, t);
    const j = JIT[n % JIT.length]!;
    const f = 0.97 + j * 0.9;
    const tip: V3 = [(n % 2 ? 0.5 : -0.5) + (n % 3 - 1) * 0.15, ry + (oy - ry) * f, at[2] + rz + (oz - rz) * f];
    const col = n % 4 === 0 ? deep : n % 4 === 2 ? lit : red;
    k.rod([(n % 2 ? 0.35 : -0.35), ry, at[2] + rz], tip, 0.5, col, { r1: 0.1, seg: 3, hull: 0.3 });
  }
  if (torn) {
    // The torn end: a few short broken strands sticking back.
    for (const [dz, dy, l] of [[-0.4, 4.0, 1.6], [0.2, 6.2, 1.2], [-0.2, 2.2, 1.4]] as const) {
      const [rz] = along(root, reach);
      k.rod([0, top + dy, at[2] + rz + 0.6 + dz], [0.1, top + dy + 0.3, at[2] + rz - l], 0.28, deep, { r1: 0.05, seg: 3, hull: 0 });
    }
  }
}

// ---- the body ----

/** The torso, from the crotch to the neck: [radius, height]. Depth is squashed by TORSO_SZ. */
const TORSO: readonly (readonly [number, number])[] = [
  [3.4, 21.6], [4.5, 23.4], [4.75, 25.4], [4.25, 27.8], [4.55, 30.4], [5.3, 32.8], [5.85, 35.0], [5.7, 36.6], [4.6, 38.0],
  [2.4, 39.0], [1.6, 39.5],
];
const TORSO_SZ = 0.58;
const PECS = [-1, 1].map((s) => ({ c: [s * 2.55, 34.9, 2.4] as V3, r: [2.85, 1.9, 1.05] as V3, rot: [-0.4, s * 0.22, s * -0.12] as V3 }));
const ABS: { c: V3; r: V3 }[] = [];
for (const y of [31.8, 30.1, 28.4]) for (const s of [-1, 1]) ABS.push({ c: [s * 1.02, y, y > 31 ? 2.4 : 2.26], r: [1.08, 0.86, 0.36] });

const torsoSurf: Surface = frontmost(
  [onLathe([0, 0, 0], TORSO, TORSO_SZ), ...PECS.map((m) => onBlob(m.c, m.r)), ...ABS.map((m) => onBlob(m.c, m.r))],
  (x, y) => ({ p: [x, y, 2.4], n: [0, 0, 1] }),
);

function torso(k: Kit): void {
  lathe(k, [0, 0, 0], TORSO, SKIN_DARK, { sz: TORSO_SZ, seg: 14, gloss: 0.12 });
  for (const m of PECS) blob(k, m.c, m.r, SKIN, { w: 9, h: 6, hull: 0, rot: m.rot, gloss: 0.12, cavity: [0, 0.35, 0.94] });
  for (const m of ABS) blob(k, m.c, m.r, SKIN, { w: 6, h: 4, hull: 0, gloss: 0.12, cavity: [0, 0, 1] });
  // The obliques over the hips, the slope of the shoulders and the shoulders themselves.
  for (const s of [-1, 1]) {
    blob(k, [s * 3.5, 26.6, 1.0], [1.3, 2.4, 1.6], SKIN, { w: 5, h: 4, hull: 0, cavity: [s * 0.5, 0, 0.87] });
    blob(k, [s * 2.9, 37.9, -0.6], [2.5, 1.0, 1.8], SKIN, { w: 8, h: 5, hull: 0, cavity: [0, 1, 0] });
    blob(k, [s * 5.75, 36.3, -0.05], [1.8, 2.3, 1.9], SKIN, { w: 8, h: 6, gloss: 0.12, cavity: [s * 0.8, 0.45, 0.4] });
  }
  // The neck, mostly inside the helmet.
  limb(k, [0, 38.4, -0.3], [0, 42.4, 0.05], 1.6, 1.35, SKIN, { seg: 8 });
}

/** A bulge along a bone (a biceps, a forearm): darker toward its ends and its sides, where it meets the limb. */
function endShade(g: SphereGeometry): void {
  const n = g.attributes.normal!, tint: number[] = [];
  for (let i = 0; i < n.count; i++) {
    const t = 0.45 + 0.55 * Math.pow(Math.max(0, 1 - Math.abs(n.getY(i))), 0.8);
    tint.push(t, t * 0.94, t * 0.9);
  }
  g.setAttribute('color', new Float32BufferAttribute(tint, 3));
}

/** An arm from the shoulder through the elbow to the hand, with its biceps and forearm. */
function arm(k: Kit, shoulder: V3, elbow: V3, hand: V3): void {
  const sv = new Vector3(...shoulder), ev = new Vector3(...elbow), hv = new Vector3(...hand);
  const up = sv.clone().lerp(ev, 0.08);
  limb(k, [up.x, up.y, up.z], elbow, 1.45, 1.05, SKIN_DARK);
  const bi = sv.clone().lerp(ev, 0.45);
  const dir = ev.clone().sub(sv).normalize();
  const g = new SphereGeometry(1, 8, 6);
  endShade(g);
  g.scale(1.3, ev.distanceTo(sv) * 0.3, 1.35);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir));
  g.translate(bi.x, bi.y, bi.z + 0.15);
  k.add(g, SKIN, sm({ gloss: 0.12 }));
  blob(k, elbow, [1.02, 1.02, 1.02], SKIN, { w: 6, h: 5, hull: 0 });
  limb(k, elbow, hand, 1.1, 0.78, SKIN_DARK);
  const fa = ev.clone().lerp(hv, 0.3);
  const fd = hv.clone().sub(ev).normalize();
  const f = new SphereGeometry(1, 7, 5);
  endShade(f);
  f.scale(1.18, ev.distanceTo(hv) * 0.3, 1.12);
  f.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), fd));
  f.translate(fa.x, fa.y, fa.z);
  k.add(f, SKIN, sm({ hull: 0, gloss: 0.12 }));
  blob(k, hand, [0.95, 1.1, 0.95], SKIN_DARK, { w: 6, h: 5 });
}

/** The leather kilt with its strips, and the belt above it. */
const KILT: readonly (readonly [number, number])[] = [[5.75, 19.4], [5.45, 21.6], [5.0, 23.8], [4.85, 25.4]];
const KILT_SZ = 0.64;
function kilt(k: Kit, w: Wear): void {
  lathe(k, [0, 0, 0], KILT, LEATHER, { sz: KILT_SZ, seg: 14, hull: 0.8 });
  lathe(k, [0, 0, 0], [[4.95, 25.0], [4.95, 26.3]], LEATHER_DARK, { sz: KILT_SZ + 0.03, seg: 14 });
  const s = onLathe([0, 0, 0], KILT, KILT_SZ);
  const surf: Surface = (x, y) => s(x, y) ?? { p: [x, y, 3.3], n: [0, 0, 1] };
  for (let x = -4.2; x <= 4.3; x += 1.4) k.line([x * 1.02, 25.0, x * 1.12, 19.6], 0.16, LEATHER_DARK, surf);
  if (worn(w, 1)) dirt(k, surf, 2.4, 20.6, 3.0, LEATHER);
  if (worn(w, 3)) {
    // A strip cut away at the front left.
    k.line([-1.5, 22.0, -1.6, 19.4], 0.9, LEATHER_DARK, surf);
  }
}

/** A leg: the thigh in the body (THIGHS), the shin and its bronze greave (LEGS), the sandalled foot (FEET). */
function legs(k: Kit, w: Wear): void {
  const hip = (s: number): V3 => [s * 2.45, HIP_Y, 0.1];
  const knee = (s: number): V3 => [s * 2.85, KNEE_Y, 0.55];
  const ankle = (s: number): V3 => [s * 3.15, ANKLE_Y, 0.1];
  k.pivot(THIGHS, [0, HIP_Y, 0.1], () => {
    for (const s of [-1, 1]) {
      limb(k, hip(s), knee(s), 2.45, 1.5, SKIN_DARK);
      // The front of the thigh, and the knee with its cap.
      blob(k, [s * 2.7, 18.0, 0.9], [2.1, 4.3, 1.9], SKIN, { w: 8, h: 6, hull: 0, gloss: 0.12, cavity: [s * 0.2, 0.1, 0.97] });
      blob(k, knee(s), [1.4, 1.45, 1.35], SKIN_DARK, { w: 7, h: 5 });
      blob(k, [knee(s)[0], KNEE_Y + 0.3, knee(s)[2] + 1.0], [0.85, 0.95, 0.6], SKIN, { w: 6, h: 5, hull: 0, gloss: 0.12, cavity: [0, 0, 1] });
    }
    if (bloody(w, 1)) runDown(k, onUpright(-2.7, 0.85, 1.9), -2.1, 21.0, 4.2, 0.45);
    if (heavy(w)) { runDown(k, onUpright(2.7, 0.85, 1.9), 2.2, 20.6, 5.2, 0.5); runDown(k, onUpright(-2.7, 0.85, 1.9), -3.1, 19.8, 3.0, 0.4); }
  }, { axis: [1, 0, 0] });
  k.pivot(LEGS, [0, ANKLE_Y + 0.2, 0], () => {
    for (const s of [-1, 1]) {
      const kn = knee(s), an = ankle(s);
      limb(k, an, kn, 0.95, 1.4, SKIN_DARK, { dusty: true });
      // The calf behind, full at the top and tapering to the ankle.
      blob(k, [s * 2.95, 8.6, -0.7], [1.45, 3.3, 1.55], SKIN, { w: 7, h: 5, hull: 0, gloss: 0.1, cavity: [0, 0, -1], dusty: true });
      // The greave: bronze shaped to the shin and the calf, from the ankle to just under the knee.
      const at: V3 = [an[0] + (kn[0] - an[0]) * 0.45, 0, 0.3];
      lathe(k, at, [[1.15, ANKLE_Y + 0.7], [1.3, 3.6], [1.75, 6.4], [2.0, 8.4], [1.85, 10.2], [1.6, 11.3], [1.45, 11.8]], BRONZE, { sz: 0.92, seg: 10, from: -2.2, arc: 4.4, gloss: 0.9 });
      // A turned-out lip along its top edge.
      lathe(k, at, [[1.5, 11.65], [1.62, 11.95]], BRONZE_LIT, { sz: 0.92, seg: 10, from: -2.2, arc: 4.4, gloss: 0.9, hull: 0 });
      const gs = onUpright(at[0], at[2], 1.8);
      if (worn(w, 1)) { scratches(k, gs, [[at[0] - 0.6, 10.4, at[0] + 0.3, 8.6]], WORN_BRONZE, 0.14); dirt(k, gs, at[0] + 0.2, 4.2, 2.0, BRONZE); }
      if (worn(w, 2) && s > 0) dent(k, gs, at[0] + 0.3, 7.2, 0.6, BRONZE);
      if (heavy(w) && s < 0) smear(k, gs, at[0] + 0.3, 11.5, 0.1, -1, 3.0, 0.7);
    }
  }, { axis: [1, 0, 0] });
  k.pivot(FEET, [0, 0, 0], () => {
    for (const s of [-1, 1]) {
      blob(k, [s * 3.25, 0.4, 1.3], [1.1, 0.42, 2.4], LEATHER_DARK, { w: 7, h: 4 });
      blob(k, [s * 3.2, 1.0, 1.15], [0.9, 0.75, 2.0], SKIN_DARK, { w: 7, h: 5, hull: 0 });
    }
  });
}

// ---- the cloak, hanging from the shoulders round the back ----

const CNU = 14, CNV = 8;
function cloakPoint(i: number, j: number, inset = 0): Vector3 {
  const u = i / CNU, v = j / CNV;
  const span = 1.42 + 0.06 * v;
  const a = Math.PI + (u - 0.5) * 2 * span;
  const rx = 8.0 + 1.5 * v, rz = 2.9 + 3.0 * Math.pow(v, 0.75);
  // Folds that deepen toward the hem.
  const fold = 0.55 * v * Math.sin((u - 0.5) * Math.PI * 2 * 3.2 + 0.6);
  const y = 38.9 - v * (38.9 - 5.4) + (v === 0 ? 0 : 0.25 * Math.cos(u * Math.PI * 7));
  const r = 1 - inset / 6;
  return new Vector3((rx + fold) * r * Math.sin(a), y, -0.4 - 0.9 * v + (rz + fold) * r * Math.cos(a));
}

function cloak(k: Kit, c: Look, w: Wear): void {
  // Torn from battered: a ragged hem; broken, deeper rags and a hole.
  const hem = (i: number): number => {
    if (!worn(w, 3)) return CNV;
    const bite = worn(w, 4) ? [0, 2, 1, 0, 2, 3, 1, 0, 1, 2, 0, 1, 3, 1] : [0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 0];
    return CNV - (bite[i % bite.length] ?? 0);
  };
  const hole = (i: number, j: number): boolean => worn(w, 4) && ((i === 4 && j === 4) || (i === 5 && (j === 4 || j === 5)));
  const dirtTo = worn(w, 1) ? 0.55 : 0.82;
  shell(k, {
    nu: CNU, nv: CNV,
    front: (i, j) => cloakPoint(i, j),
    back: (i, j) => cloakPoint(i, j, 0.3),
    keep: (i, j) => j < hem(i) && !hole(i, j),
    inside: new Vector3(0, 20, -0.4),
    tint: (_i, j) => {
      // Darker toward the hem: shade in the folds and, once worn, the dirt of the field.
      const t = Math.max(0, (j / CNV - 0.55) / 0.45);
      const k2 = 1 - (1 - dirtTo) * t * t;
      return [k2, k2 * (worn(w, 1) ? 0.92 : 1), k2 * (worn(w, 1) ? 0.84 : 1)];
    },
  }, vivid(c.main), mix(vivid(c.main), '#000000', 0.55), mix(vivid(c.main), '#000000', 0.35), { hull: 0.6 });
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

/** The realistic shield in its own frame (face toward +z), with its wear: also lent to the toon comparison Hoplite. */
export function realShield(k: Kit, c: Look, w: Wear): void {
  fineCount = 0;
  shield(k, c, w);
}

function shield(k: Kit, c: Look, w: Wear): void {
  const broken = worn(w, 4);
  const cuts: Cut[] = [];
  if (worn(w, 3) && !broken) cuts.push({ from: 285, to: 318, inner: SR * 0.62 });
  if (broken) cuts.push({ from: 300, to: 322, inner: SR * 0.8 });
  const JAG = [0.0, 0.6, 1.1, 0.4, -0.5, -0.2, 0.7, 1.3, 0.3, -0.6, -0.1, 0.5, 0.9, 0.2, -0.4, 0.1, 0.6];
  const at = (x: number, y: number, back: boolean, jag: number): Vector3 => {
    const [px, py] = chipped(x, y, cuts, jag);
    return new Vector3(px, py, shieldZ(Math.hypot(px, py)) - (back ? 0.75 : 0));
  };
  if (!broken) {
    // Whole (or chipped): a disc in rings, the outer ring at the rim's edge.
    const pt = (i: number, j: number, back: boolean): Vector3 => {
      const a = (i / SNU) * Math.PI * 2, r = SRINGS[j]! * SR;
      return at(Math.cos(a) * r, Math.sin(a) * r, back, (i % 2 ? 0.35 : -0.25) * (j / (SRINGS.length - 1)));
    };
    shell(k, { nu: SNU, nv: SRINGS.length - 1, wrapU: true, front: (i, j) => pt(i, j, false), back: (i, j) => pt(i, j, true), inside: new Vector3(0, 0, -6) },
      BRONZE, SHIELD_BACK, BRONZE_DARK, { gloss: 0.5 });
  } else {
    // Broken: about half is gone. What is left runs from a jagged break near the middle to the right rim, in rows.
    const NV = 16, ACROSS = [0, 0.18, 0.36, 0.52, 0.66, 0.78, 0.87, 0.93, 0.97, 1.0];
    const yMax = SR * 0.97;
    const pt = (i: number, j: number, back: boolean): Vector3 => {
      const y = -yMax + (2 * yMax * j) / NV;
      const xr = Math.sqrt(Math.max(0, SR * SR - y * y));
      const xb = Math.min(xr - 0.6, -SR * 0.1 + JAG[j % JAG.length]!);
      return at(xb + (xr - xb) * ACROSS[i]!, y, back, 0.25 * (j % 2 ? 1 : -1));
    };
    shell(k, { nu: ACROSS.length - 1, nv: NV, front: (i, j) => pt(i, j, false), back: (i, j) => pt(i, j, true), inside: new Vector3(0, 0, -6) },
      BRONZE, SHIELD_BACK, mix(BRONZE_DARK, BRONZE_LIT, 0.35), { gloss: 0.5 });
  }
  // The rim's darker band and the owner's mark, a chevron; broken, only its right stroke is left.
  const ring: number[] = [];
  for (let i = 0; i <= 28; i++) { const a = (i / 28) * Math.PI * 2; ring.push(Math.cos(a) * SR * 0.895, Math.sin(a) * SR * 0.895); }
  if (!worn(w, 3)) k.line(ring, 0.22, BRONZE_DARK, shieldSurf);
  const mark = vivid(c.main);
  const lam = broken ? [0.6, 5.0, 4.8, -5.6, 2.6, -5.6, 0.6, -0.8] : [0, 6.6, 5.2, -5.6, 2.7, -5.6, 0, 0.9, -2.7, -5.6, -5.2, -5.6];
  fineDecal(k, lam, mark, shieldSurf, 2.0, 0.08);
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

// ---- the spear: an ash shaft, a leaf blade of iron and a bronze butt spike ----

function spear(k: Kit, butt: V3, top: V3, w: Wear): void {
  const a = new Vector3(...butt), b = new Vector3(...top);
  const d = b.clone().sub(a).normalize();
  const along = (t: number): V3 => { const p = a.clone().lerp(b, t); return [p.x, p.y, p.z]; };
  const spike = a.clone().addScaledVector(d, 2.6);
  limb(k, butt, [spike.x, spike.y, spike.z], 0.12, 0.42, BRONZE_DARK, { seg: 6, gloss: 0.4 });
  if (worn(w, 4)) {
    // Snapped above the hand: splinters and no head.
    const end = along(0.56);
    limb(k, [spike.x, spike.y, spike.z], end, 0.4, 0.38, SHAFT, { seg: 6 });
    for (const [o, l] of [[-0.22, 1.5], [0.18, 1.0], [0.02, 2.0]] as const) {
      const base = new Vector3(end[0] + o, end[1], end[2]);
      const tip = base.clone().addScaledVector(d, l).add(new Vector3(o * 0.5, 0, 0));
      k.rod([base.x, base.y, base.z], [tip.x, tip.y, tip.z], 0.18, SHAFT, { r1: 0.03, seg: 4, hull: 0.4 });
    }
    return;
  }
  limb(k, [spike.x, spike.y, spike.z], top, 0.42, 0.36, SHAFT, { seg: 6 });
  // The socket and the blade, turned to show its flat to the viewer.
  limb(k, along(0.985), [b.x + d.x * 1.4, b.y + d.y * 1.4, b.z + d.z * 1.4], 0.42, 0.3, IRON_DARK, { seg: 6, gloss: 0.4 });
  const ang = Math.atan2(d.y, d.x) - Math.PI / 2;
  k.frame([b.x + d.x * 1.0, b.y + d.y * 1.0, b.z + d.z * 1.0], [0, -YAW * 0.6, ang], () => {
    const L = 7.2, hw = 1.05;
    const pts = worn(w, 2)
      ? [0, 0, hw * 0.7, 1.2, hw, 2.6, hw * 0.55, 3.5, hw * 0.95, 4.1, hw * 0.6, 5.6, 0, L, -hw * 0.6, 5.6, -hw, 2.6, -hw * 0.7, 1.2]
      : [0, 0, hw * 0.7, 1.2, hw, 2.6, hw * 0.6, 5.6, 0, L, -hw * 0.6, 5.6, -hw, 2.6, -hw * 0.7, 1.2];
    k.slab(pts, 0.28, IRON, [0, 0, 0], [0, 0, 0], { gloss: 0.6, hull: 0.6 });
    const face: Surface = (x, y) => ({ p: [x, y, 0.15], n: [0, 0, 1] });
    k.line([0, 0.3, 0, L - 0.8], 0.16, IRON_DARK, face);
    if (bloody(w, 1)) k.decal(smearPoly(0.1, L * 0.82, 0, -1, L * 0.55, 1.3), BLOOD, face);
    if (heavy(w)) k.decal(smearPoly(-0.15, L * 0.6, 0, -1, L * 0.6, 1.6), BLOOD_LIGHT, face);
  });
  if (heavy(w)) {
    // Blood run down the shaft from the blade.
    const s0 = along(0.93), s1 = along(0.86);
    limb(k, s0, s1, 0.45, 0.44, BLOOD, { seg: 6, hull: 0 });
  }
}

// ---- blood and scars on the body, the face under a broken helmet, and the ground ----

/** Blood on skin: a redder smear than on bronze or earth, so it reads on the tan (a dark core where it is thickest). */
const BLOOD_SKIN = '#7E1E17';
/** Darker, older blood where it runs thick. */
const BLOOD_DEEP = '#5A0E0B';
/** The face, out of the sun under the helmet: a shade lighter than the body's oiled tan so it reads in the gap. */
const FACE = '#A88262';
const BEARD = '#2B1E15';
function bleed(k: Kit, s: Surface, x: number, y: number, dx: number, dy: number, len: number, wd: number): void {
  k.decal(smearPoly(x, y, dx, dy, len, wd), BLOOD_SKIN, s);
  const l = Math.hypot(dx, dy);
  k.decal(ell(x + (dx / l) * len * 0.12, y + (dy / l) * len * 0.12, wd * 0.28, wd * 0.28, 6), BLOOD, s);
}
function runDown(k: Kit, s: Surface, x: number, y: number, len: number, wd: number): void {
  k.decal([x - wd / 2, y, x + wd / 2, y, x + wd * 0.25, y - len, x - wd * 0.25, y - len], BLOOD_SKIN, s);
  k.decal(ell(x, y - len, wd * 0.6, wd * 0.6, 6), BLOOD_SKIN, s);
}

function bodyWear(k: Kit, w: Wear): void {
  // Battered: a cut across the ribs; then blood from it and from under the helmet.
  if (worn(w, 3)) k.line([-3.9, 31.0, -2.6, 31.9, -1.5, 32.6], 0.22, '#4A1512', torsoSurf);
  if (bloody(w, 1)) {
    bleed(k, torsoSurf, -2.8, 31.6, 0.15, -1, 3.2, 0.9);
    runDown(k, torsoSurf, -2.4, 29.4, 2.6, 0.4);
    // From under the cheek plate down the neck onto the chest.
    bleed(k, torsoSurf, 1.2, 38.0, -0.3, -1, 2.2, 0.7);
  }
  if (heavy(w)) {
    bleed(k, torsoSurf, 1.7, 33.6, 0.35, -1, 3.4, 1.0);
    runDown(k, torsoSurf, 1.2, 30.2, 3.4, 0.45);
    bleed(k, torsoSurf, -1.4, 28.2, -0.2, -1, 2.6, 0.8);
    for (const [x, y, r] of [[2.6, 35.8, 0.25], [-0.6, 33.0, 0.2], [3.6, 29.6, 0.22]] as const) k.decal(ell(x, y, r, r, 6), BLOOD, torsoSurf);
  }
}

function face(k: Kit, w: Wear): void {
  if (!helmBroken(w)) return;
  // The face under the gap: a cheek and jaw, a little drawn in the dark of the helmet.
  // The face is in the helmet's shadow toward the top: a per-corner tint, so the gap reads as a hole with a face in it.
  const g = new SphereGeometry(1, 9, 7);
  const pos = g.attributes.position!;
  const tint: number[] = [];
  for (let i = 0; i < pos.count; i++) { const t = 0.62 + 0.38 * Math.min(1, Math.max(0, (0.35 - pos.getY(i)) / 1.1)); tint.push(t, t * 0.97, t * 0.95); }
  g.setAttribute('color', new Float32BufferAttribute(tint, 3));
  g.scale(...HEAD_R);
  g.translate(...HEAD_C);
  k.add(g, FACE, sm({ hull: 0, gloss: 0.1 }));
  // A dark beard over the jaw and chin, and a shadow under the cheekbone: what makes the gap read as a face.
  blob(k, [HEAD_C[0], HEAD_C[1] - 1.75, HEAD_C[2] + 0.05], [2.45, 1.6, 2.7], BEARD, { w: 7, h: 5, hull: 0 });
  const s = ellSurf(HEAD_C, HEAD_R);
  k.line([-2.35, -0.35, -1.6, -0.75, -0.9, -0.65], 0.28, mix(FACE, '#000000', 0.4), s);
  // The eye, deep under the brow, and the brow's shadow over it.
  k.decal(ell(-1.15, 0.75, 0.62, 0.34, 8), mix(FACE, '#000000', 0.55), s);
  k.decal(ell(-1.1, 0.68, 0.36, 0.22, 7), '#E4D8C4', s);
  k.decal(ell(-1.05, 0.68, 0.17, 0.17, 6), '#1C130D', s);
  if (w.scarred && !bloody(w, 1)) {
    // A long pale scar down the cheek, across where the blood ran, with the marks of its stitches.
    // It runs from the cheekbone down through the beard, which grows no hair along it.
    k.line([-2.25, -0.2, -1.95, -1.2, -1.55, -2.9], 0.55, SCAR_PALE, s);
    k.line([-2.2, -0.35, -1.95, -1.25, -1.62, -2.7], 0.16, SCAR_LINE, s);
    for (const t of [0.2, 0.45, 0.7, 0.92]) { const y = -0.2 - 2.7 * t, x = -2.25 + 0.7 * t; k.line([x - 0.45, y + 0.06, x + 0.45, y - 0.06], 0.13, SCAR_DARK, s); }
  }
  if (bloody(w, 1)) {
    // From the cut on the cheek down the jaw, the neck and onto the chest.
    bleed(k, s, -2.0, -0.6, 0.15, -1, 2.6, 0.85);
    runDown(k, s, -1.6, -2.2, 1.1, 0.4);
    const neck = onUpright(0, -0.15, 1.5);
    k.decal([-1.25, 41.6, -0.65, 41.6, -0.75, 38.6, -1.15, 38.6], BLOOD_DEEP, neck);
    bleed(k, torsoSurf, -1.2, 38.6, 0.08, -1, 3.4, 0.9);
  }
  if (heavy(w)) {
    bleed(k, s, -1.2, -1.0, 0.1, -1, 2.2, 0.65);
    runDown(k, s, -2.4, -1.8, 1.2, 0.3);
    k.decal(ell(-1.7, -1.4, 0.55, 0.4, 7), BLOOD, s);
    bleed(k, torsoSurf, -2.1, 37.4, -0.15, -1, 3.0, 0.7);
  }
}

function groundBlood(k: Kit, w: Wear): void {
  if (!bloody(w, 1)) return;
  const g = ground(0.06);
  // Drops and a spot by the feet; at level 2 a lobed pool with spatter round it.
  k.decal(ell(4.6, 6.4, 0.9, 0.6, 8), BLOOD, g);
  k.decal(ell(6.0, 7.4, 0.35, 0.25, 6), BLOOD, g);
  k.decal(ell(2.2, 7.8, 0.4, 0.3, 6), BLOOD, g);
  if (heavy(w)) {
    k.decal(ell(1.6, 5.4, 3.4, 1.9, 12, 0.2), BLOOD, g);
    k.decal(ell(4.0, 6.0, 2.0, 1.2, 10, -0.3), BLOOD, g);
    k.decal(ell(-0.8, 4.8, 1.4, 0.9, 9), BLOOD, g);
    k.decal(ell(1.2, 5.2, 1.4, 0.6, 8, 0.2), BLOOD_LIGHT, g);
    for (const [x, z, r] of [[-3.6, 6.8, 0.5], [6.8, 4.2, 0.45], [5.6, 9.0, 0.4], [-2.4, 8.6, 0.35], [7.6, 6.8, 0.3]] as const) k.decal(ell(x, z, r, r * 0.7, 6), BLOOD, g);
  }
}

// ---- the whole figure ----

export interface RealOpts { look: Look; wear: Wear }

/** The Gritty Hoplite. Returns its ground shadow's size (as the toon figures do). */
export function realHoplite(k: Kit, { look: c, wear: w }: RealOpts): { rx: number; rz: number; x: number } {
  setYaw(YAW);
  fineCount = 0; // each build lifts its marks the same way, so a figure built twice is the same to the last vertex
  k.frame([0, 0, 0], [0, YAW, 0], () => {
    cloak(k, c, w);
    legs(k, w);
    kilt(k, w);
    torso(k);
    bodyWear(k, w);
    // The spear arm, with the spear (the strike turns the spear about the hand).
    arm(k, SHOULDER, [8.4, 29.9, -0.3], SPEAR_HAND);
    k.pivot(WEAPON, SPEAR_HAND, () => {
      spear(k, [11.5, 0.4, 2.7], [10.85, 56.0, 3.5], w);
    }, { axis: TIP_FORWARD });
    face(k, w);
    helmet(k, c, w);
    // The shield arm and the shield: one piece, turning about the shoulder to block.
    const left: V3 = [-SHOULDER[0], SHOULDER[1], SHOULDER[2]];
    k.pivot(SHIELD, left, () => {
      arm(k, left, [-8.9, 30.4, 0.4], SHIELD_HAND);
      k.frame([-10.2, 25.8, 5.6], [-0.3, -0.12, 0], () => shield(k, c, w));
    }, { axis: TIP_FORWARD });
    groundBlood(k, w);
  });
  setYaw(0);
  return { rx: 10, rz: 6.4, x: 0 };
}
