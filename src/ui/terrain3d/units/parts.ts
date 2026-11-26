// Shared parts of the 3D figures (the standing body, heads, blades, spears, shields, horses and riders) and the
// battle wear they carry in Gritty mode. Every part takes the figure's `Wear` and draws its own marks, so a figure
// is one model with wear as parameters: geometry swaps (a chipped or split shield, a snapped blade, a torn crest, a
// missing cheek guard) and texture-free vertex colour marks (scratches, dents, cracks, dirt, tears, blood).
import { Vector3 } from 'three';
import { COS_E, flat, ground, H, Kit, mix, onFrustum, SQUASH } from './kit';
import type { Poly, Surface, V3 } from './kit';

// ---- palette: the SVG figures' colours (art/palette.ts, art/units.tsx, art/factionUnits.tsx) ----

export const SKIN = '#E8B88A';
export const EYE = '#3A2A1E';
export const HAIR = '#5B3A22';
export const BOOT = '#6B4A2B';
export const WOOD = '#9C6B3E';
export const WOOD_DARK = '#6B4A2B';
export const STEEL = '#D5DAE0';
export const STEEL_DARK = '#9AA2AC';
export const STONE = '#8F8A80';
export const HORSE = '#8B5A33';
export const HORSE_DARK = '#6B4226';
export const MANE = '#4A2E1A';
export const GREY_HORSE = '#D2CBBF';
export const GREY_HORSE_DARK = '#A9A194';
export const STRING = '#F2ECDD';
export const BRONZE_RIM = '#8A6420';
export const PIPE = '#EFE3C4';
export const LEAF = '#5DB866';
export const DUN = '#C3925A';
export const DUN_DARK = '#9C6F3F';
export const BLACK_HORSE = '#4A3B33';
export const BLACK_HORSE_DARK = '#33281F';
export const HORSE_HAIR = '#2A201B';
export const PALE_HORSE = '#EAE3D6';
export const PALE_HORSE_DARK = '#C7BDAC';
export const PIEBALD = '#6B4A35';
export const FELT = '#F2ECDD';
export const FELT_DARK = '#D8CDB6';
export const FUR = '#7A5230';
export const VISOR = '#2B2B2A';
export const GOLD = '#FFDA4D';

// Wear marks (art/wear.tsx in the gritty-mode branch).
export const BLOOD = '#561A16';
export const BLOOD_LIGHT = '#6E2A23';
export const DENT = '#1B1D21';
export const SCRATCH = '#E2DED3';
export const SCRATCH_DARK = '#5E636B';
export const SCAR = '#C98F72';
export const SCAR_DARK = '#A8735B';
export const CRACK = '#26231F';
export const DIRT = '#3D3A34';

export interface Look { main: string; dark: string; accent: string }

/**
 * How worn a figure looks (Gritty only): stage 0 clean, 1 scuffed, 2 dented, 3 battered, 4 broken; blood 0 none,
 * 1 slight, 2 more; scarred once broken and since healed (the headgear keeps its broken piece, the face a scar).
 */
export interface Wear { stage: 0 | 1 | 2 | 3 | 4; blood: 0 | 1 | 2; scarred?: boolean }
export const CLEAN: Wear = { stage: 0, blood: 0 };
export const worn = (w: Wear, n: 1 | 2 | 3 | 4): boolean => w.stage >= n;
/**
 * Blood (David, round 2): level 1 (battered) shows what used to be the heavier set (smears, a drip, drops); level 2
 * (broken) adds about three times that again. `bloody(w, 1)` and `bloody(w, 2)` both mean level 1 or more (the old
 * two tiers merged); `heavy(w)` is level 2.
 */
export const bloody = (w: Wear, _n: 1 | 2): boolean => w.blood >= 1;
export const heavy = (w: Wear): boolean => w.blood >= 2;
export const helmBroken = (w: Wear): boolean => w.stage >= 4 || w.scarred === true;

// ---- the view: decals on round parts are authored in screen offsets, like the SVG ----

/** The way to the camera in the figure's own frame (set per figure from its turn). */
let VIEW = new Vector3(0, 0.62, 0.785);
let SCREEN_UP = new Vector3(0, 0.785, -0.62);
let SCREEN_RIGHT = new Vector3(1, 0, 0);
/** Set the figure's turn about y (radians), so screen-space decals land where the camera sees them. */
export function setYaw(yaw: number): void {
  const c = Math.cos(-yaw), s = Math.sin(-yaw);
  const rot = (v: Vector3): Vector3 => new Vector3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
  VIEW = rot(new Vector3(0, 0.62, 0.785));
  SCREEN_UP = rot(new Vector3(0, 0.785, -0.62));
  SCREEN_RIGHT = rot(new Vector3(1, 0, 0));
}

/** A sphere's visible face: (x, y) are screen offsets from its centre in board units (y up). */
export const viewSphere = (c: V3, r: number): Surface => (x, y) => {
  const d = Math.sqrt(Math.max(0.01, r * r - x * x - y * y));
  const p = new Vector3(...c).addScaledVector(SCREEN_RIGHT, x).addScaledVector(SCREEN_UP, y).addScaledVector(VIEW, d);
  const n = p.clone().sub(new Vector3(...c)).normalize();
  return { p: [p.x, p.y, p.z], n: [n.x, n.y, n.z] };
};

/** A point on a sphere's visible face at screen offset (x, y). */
export function onView(c: V3, r: number, x: number, y: number, lift = 0): V3 {
  const s = viewSphere(c, r + lift)(x, y);
  return s.p;
}

// ---- small polygon helpers ----

export function ell(cx: number, cy: number, rx: number, ry: number, n = 10, rot = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push(cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot));
  }
  return out;
}

/** A tapered smear from (x, y) running len along (dx, dy), w wide at its start. */
export function smearPoly(x: number, y: number, dx: number, dy: number, len: number, w: number): number[] {
  const l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, nx = -uy, ny = ux, h = w / 2;
  return [
    x - ux * h * 0.8 + nx * h * 0.6, y - uy * h * 0.8 + ny * h * 0.6,
    x + nx * h, y + ny * h,
    x + ux * len * 0.55 + nx * h * 0.75, y + uy * len * 0.55 + ny * h * 0.75,
    x + ux * len, y + uy * len,
    x + ux * len * 0.5 - nx * h * 0.85, y + uy * len * 0.5 - ny * h * 0.85,
    x - nx * h, y - ny * h,
    x - ux * h * 0.8 - nx * h * 0.6, y - uy * h * 0.8 - ny * h * 0.6,
  ];
}

/** A falling drop at (x, y), point up. */
export function dropPoly(x: number, y: number, s: number): number[] {
  return [x, y + s * 2.2, x + s * 0.8, y + s * 0.7, x + s, y, x + s * 0.6, y - s * 0.8, x, y - s, x - s * 0.6, y - s * 0.8, x - s, y, x - s * 0.8, y + s * 0.7];
}

/** A jagged tear `w` by `h` at (x, y): the dark lip polygon and the gap inside it. */
export function tearPolys(x: number, y: number, w: number, h: number): [number[], number[]] {
  const hw = w / 2, hh = h / 2;
  const lip = [x - hw * 0.2, y + hh, x + hw * 0.5, y + hh * 0.3, x + hw, y - hh * 0.2, x + hw * 0.1, y - hh, x - hw, y - hh * 0.3, x - hw * 0.3, y + hh * 0.1];
  const gap = [x - hw * 0.05, y + hh * 0.7, x + hw * 0.45, y + hh * 0.15, x + hw * 0.7, y - hh * 0.2, x + hw * 0.05, y - hh * 0.7, x - hw * 0.6, y - hh * 0.25, x - hw * 0.1, y + hh * 0.05];
  return [lip, gap];
}

// ---- blood (small and dark: a smear, a few drops, a spot on the ground; never a pool, never gore) ----

export function smear(k: Kit, surf: Surface, x: number, y: number, dx: number, dy: number, len: number, w = 1.8): void {
  k.decal(smearPoly(x, y, dx, dy, len, w), BLOOD, surf);
  const l = Math.hypot(dx, dy);
  k.decal(ell(x + (dx / l) * len * 0.15, y + (dy / l) * len * 0.15, w * 0.22, w * 0.22, 6), BLOOD_LIGHT, surf);
}
export function drip(k: Kit, surf: Surface, x: number, y: number, len: number, w = 1): void {
  k.decal([x - w / 2, y, x + w / 2, y, x + w * 0.25, y - len, x - w * 0.25, y - len], BLOOD, surf);
  k.decal(ell(x, y - len, w * 0.6, w * 0.6, 6), BLOOD, surf);
}
/** Drops fallen on the ground around (x, z) in the figure's frame. */
export function groundDrops(k: Kit, x: number, z: number, more: boolean, lots = false): void {
  const g = ground(0.06);
  k.decal(ell(x, z, 1.4, 1.0, 8), BLOOD, g);
  k.decal(ell(x + 2.4, z + 0.6, 0.55, 0.4, 6), BLOOD, g);
  if (more) {
    k.decal(ell(x - 1.8, z - 1.6, 0.9, 0.65, 7), BLOOD, g);
    k.decal(ell(x + 1.0, z + 2.2, 0.45, 0.35, 6), BLOOD, g);
  }
  if (lots) {
    // Three times as much: a small flat splash under the first drops (no pool) and a trail of spots.
    k.decal(ell(x + 0.6, z + 0.4, 2.6, 1.5, 10, 0.3), BLOOD, g);
    k.decal(ell(x + 0.2, z + 0.2, 1.0, 0.5, 7), BLOOD_LIGHT, g);
    const spots: [number, number, number][] = [[-3.4, 0.8, 0.7], [-4.6, -0.8, 0.5], [3.8, -1.4, 0.65], [4.8, 1.6, 0.5], [-0.6, 3.4, 0.6], [2.6, 3.2, 0.45], [-2.8, 2.6, 0.4], [1.6, -2.6, 0.55]];
    for (const [dx, dz, r] of spots) k.decal(ell(x + dx, z + dz, r, r * 0.7, 6), BLOOD, g);
  }
}

// ---- scuffs, dents and cracks ----

export function scratches(k: Kit, surf: Surface, marks: readonly (readonly [number, number, number, number])[], colour = SCRATCH, w = 0.75): void {
  for (const m of marks) k.line(m, w, colour, surf);
}
export function dent(k: Kit, surf: Surface, x: number, y: number, r: number, under: string): void {
  k.decal(ell(x, y, r, r * 0.75, 9), mix(under, DENT, 0.45), surf);
  k.decal(ell(x + r * 0.15, y - r * 0.3, r * 0.55, r * 0.3, 7), mix(under, DENT, 0.62), surf);
}
export function crack(k: Kit, surf: Surface, pts: Poly, w = 0.8): void {
  k.line(pts, w, CRACK, surf);
}
export function dirt(k: Kit, surf: Surface, x: number, y: number, w: number, under: string): void {
  k.decal(ell(x, y, w * 0.5, w * 0.26, 9), mix(under, DIRT, 0.5), surf);
  k.decal(ell(x + w * 0.22, y + w * 0.12, w * 0.25, w * 0.17, 7), mix(under, DIRT, 0.6), surf);
}

// ---- the head ----

export interface Head { c: V3; r: number }

/** A big round head with two dot eyes, centred on SVG (x, y), radius r. `turn` looks a little aside (screen units). */
export function head(k: Kit, x: number, y: number, r = 6.4, z = 0, look = 0): Head {
  const c: V3 = [x, H(y), z];
  k.ball(c, r, SKIN, { detail: 2 });
  for (const s of [-1, 1]) k.ball(onView(c, r, s * r * 0.34 + look, -r * 0.3, -0.05), r * 0.16, EYE, { hull: 0, detail: 1 });
  return { c, r };
}

/** The face's wear: a cut and blood from battered, a drip when bloodier, a healed scar once broken and healed. */
export function faceWear(k: Kit, hd: Head, w: Wear, side = -1): void {
  const s = viewSphere(hd.c, hd.r);
  const x = side * hd.r * 0.62, y = hd.r * 0.2;
  if (w.scarred && !bloody(w, 1)) {
    k.line([x, y, x - side * 0.4, y - hd.r * 0.42], 1.0, SCAR, s);
    for (const t of [0.3, 0.65]) {
      const px = x - side * 0.4 * t, py = y - hd.r * 0.42 * t;
      k.line([px - 0.8, py, px + 0.8, py], 0.6, SCAR_DARK, s);
    }
  }
  if (worn(w, 4)) k.line([-hd.r * 0.15, hd.r * 0.55, hd.r * 0.2, hd.r * 0.45], 0.8, BLOOD, s);
  if (bloody(w, 1)) smear(k, s, x, y, -side * 0.3, -1, hd.r * 0.45, 1.4);
  if (bloody(w, 2)) drip(k, s, x - side * 0.5, y - hd.r * 0.45, hd.r * 0.35, 0.9);
  if (heavy(w)) {
    // Broken and bleeding: a cut across the brow running down both sides, the other cheek smeared, more drips.
    smear(k, s, x * 0.2, y + hd.r * 0.12, -side, -0.25, hd.r * 0.7, 1.3);
    smear(k, s, -x * 0.9, y - hd.r * 0.1, side * 0.2, -1, hd.r * 0.5, 1.5);
    drip(k, s, x + side * 0.3, y - hd.r * 0.5, hd.r * 0.45, 0.9);
    drip(k, s, -x * 0.85, y - hd.r * 0.55, hd.r * 0.3, 0.8);
    k.decal(ell(-x * 0.4, -hd.r * 0.62, 0.7, 0.55, 6), BLOOD, s);
  }
}

/** An arm from the shoulder to the hand, in the sleeve's colour, and the hand. */
export function arm(k: Kit, shoulder: V3, hand: V3, sleeve: string, r = 1.5): void {
  const elbow: V3 = [(shoulder[0] + hand[0]) / 2 + Math.sign(shoulder[0]) * 0.6, (shoulder[1] + hand[1]) / 2 - 1.2, (shoulder[2] + hand[2]) / 2];
  k.rod(shoulder, elbow, r, sleeve, { r1: r * 0.92 });
  k.rod(elbow, hand, r * 0.92, sleeve, { r1: r * 0.85 });
  k.ball(hand, 1.9, SKIN, { detail: 0 });
}

// ---- the standing body: legs, boots and a tunic in the owner's colour with a darker hem ----

export const TUNIC = { y0: H(-2), y1: H(-16.6), r0: 7.0, r1: 5.4, sz: 0.68 };
export const tunicSurf = (z = 0): Surface => onFrustum([0, 0, z], TUNIC.y0, TUNIC.y1, TUNIC.r0, TUNIC.r1, TUNIC.sz);

/**
 * The moving pieces of a crouch (units/crouch.ts): the legs (shins turning forward about the ankles, so the knees
 * come out in front when the body sinks), the feet (which stay on the ground), a horse's neck and head (lowered about
 * the withers) and a horse's legs (which stay on the ground while the body settles).
 */
export const LEGS = 'legs';
export const FEET = 'feet';
export const NECK = 'neck';
/** Where the shins turn: the ankles, above the boots. */
export const ANKLE: V3 = [0, 2.2, 0];
/** Where a horse's neck turns: its base, at the withers (in the mount's own frame). */
export const NECK_AT: V3 = [6.4, H(-10.5), 0];

/** Legs and boots as the crouch's pieces: the shins (about the ankles, tipping forward) and the boots. */
export function legsAndBoots(k: Kit, legs: () => void, boots: () => void): void {
  k.pivot(LEGS, ANKLE, legs, { axis: [1, 0, 0] });
  k.pivot(FEET, [0, 0, 0], boots);
}

export function standingBody(k: Kit, c: Look, w: Wear, o: { tunic?: string; hem?: string; legs?: boolean } = {}): void {
  if (o.legs !== false) {
    legsAndBoots(k, () => {
      for (const s of [-1, 1]) k.rod([s * 2.8, 2.2, 0], [s * 2.8, TUNIC.y0 + 1.5, 0], 1.75, SKIN, { seg: 6 });
      if (heavy(w)) {
        // Blood run down the legs from the wounds above.
        const leg = flat(1.85);
        drip(k, leg, -2.6, TUNIC.y0 + 0.8, 5.0, 1.1);
        drip(k, leg, 3.2, TUNIC.y0 + 0.6, 3.6, 0.9);
      }
    }, () => {
      for (const s of [-1, 1]) k.box([s * 3, 1.3, 0.6], [3.9, 2.6, 4.8], BOOT);
    });
  }
  const tunic = o.tunic ?? c.main;
  k.frustum([0, 0, 0], TUNIC.y0, TUNIC.y1, TUNIC.r0, TUNIC.r1, tunic, { sz: TUNIC.sz });
  k.frustum([0, 0, 0], TUNIC.y0 - 0.01, TUNIC.y0 + 2.6, TUNIC.r0 + 0.25, TUNIC.r0 - 0.1, o.hem ?? c.dark, { sz: TUNIC.sz + 0.02 });
  tunicWear(k, c, w, tunic);
}

/** The tunic's wear: dirt on the hem, a frayed hem, a tear across the chest, a second tear low down. */
export function tunicWear(k: Kit, c: Look, w: Wear, tunic: string): void {
  const s = tunicSurf(0.25);
  if (worn(w, 1)) dirt(k, s, 3.2, TUNIC.y0 + 1.2, 4.2, c.dark);
  if (worn(w, 2)) {
    // Tatters hang below the hem at the front right.
    const n = worn(w, 4) ? 4 : 3, drop = worn(w, 4) ? 2.6 : 1.8;
    const pts: number[] = [0.4, TUNIC.y0 + 0.6];
    for (let i = 0; i < n; i++) pts.push(0.4 + (i + 0.5) * 1.6, TUNIC.y0 - (i % 2 ? drop * 0.6 : drop), 0.4 + (i + 1) * 1.6, TUNIC.y0 + 0.1);
    pts.push(0.4 + n * 1.6, TUNIC.y0 + 0.6);
    const z = TUNIC.sz * TUNIC.r0 * 0.88;
    k.slab(pts, 0.5, c.dark, [0, 0, z], [0, 0.25, 0]);
  }
  if (worn(w, 3)) {
    const [lip, gap] = tearPolys(1.8, H(-13), 4.4, 4.0);
    k.decal(lip, mix(tunic, '#000000', 0.45), s);
    k.decal(gap, SKIN, s);
  }
  if (worn(w, 4)) {
    const [lip, gap] = tearPolys(-2.6, H(-6.4), 3.4, 3.0);
    k.decal(lip, mix(tunic, '#000000', 0.45), s);
    k.decal(gap, SKIN, s);
  }
}

// ---- weapons ----

export interface BladeWear { notch?: number; snap?: number; blood?: number }

/** A blade from hilt to tip (both in the figure frame), half-width `hw`, with a crossguard. */
export function sword(k: Kit, hilt: V3, tip: V3, guard: string, bw: BladeWear = {}, hw = 1.35): void {
  const dx = tip[0] - hilt[0], dy = tip[1] - hilt[1], dz = tip[2] - hilt[2];
  const L = Math.hypot(dx, dy, dz);
  const ang = Math.atan2(dy, dx) - Math.PI / 2;
  const tilt = -Math.asin(dz / L);
  k.frame(hilt, [tilt, 0, ang], () => {
    const pts: number[] = [-hw, 0, hw, 0];
    const snapAt = bw.snap !== undefined ? bw.snap * L : undefined;
    if (bw.notch !== undefined && (snapAt === undefined || bw.notch * L < snapAt - 1.5)) {
      const t = bw.notch * L;
      pts.push(hw, t - 1.0, hw - 1.3, t, hw, t + 1.0);
    }
    if (snapAt !== undefined) {
      pts.push(hw, snapAt - 0.5, hw * 0.35, snapAt + 0.9, -hw * 0.1, snapAt + 0.1, -hw * 0.55, snapAt + 1.3, -hw, snapAt + 0.3);
    } else {
      pts.push(hw, L - hw * 1.8, 0, L, -hw, L - hw * 1.8);
    }
    k.slab(pts, 0.7, STEEL, [0, 0, 0], [0, 0, 0], { gloss: 0.6 });
    const end = (snapAt ?? L - hw * 2) - 0.6;
    k.line([0, 0.8, 0, end], 0.7, STEEL_DARK, flat(0.36));
    if (bw.blood) k.decal(smearPoly(0.3, end * 0.55, 0, 1, end * 0.4, hw * 1.5), BLOOD, flat(0.36));
    if ((bw.blood ?? 0) >= 2) {
      // The blade bloodied most of its length, running down toward the guard.
      k.decal(smearPoly(-0.2, end * 0.15, 0, 1, end * 0.5, hw * 1.7), BLOOD, flat(0.36));
      k.decal(smearPoly(0.4, end * 0.9, 0, -1, end * 0.3, hw * 1.2), BLOOD_LIGHT, flat(0.36));
      for (const t of [0.2, 0.5, 0.75]) k.ball([hw * 0.9, end * t, 0.2], 0.45, BLOOD, { detail: 0, hull: 0 });
    }
    k.box([0, -0.2, 0], [5.6, 1.3, 1.3], guard);
    k.rod([0, -3.4, 0], [0, -0.4, 0], 0.75, WOOD_DARK, { seg: 5 });
  });
}

export interface SpearWear { nick?: boolean; snap?: number; blood?: number }

/** A spear from butt to the base of its head, with a leaf-shaped steel head `head` long. */
export function spear(k: Kit, butt: V3, top: V3, head: number, sw: SpearWear = {}, r = 0.8, shaft = WOOD_DARK): void {
  const a = new Vector3(...butt), b = new Vector3(...top);
  if (sw.snap !== undefined) {
    // Snapped: the shaft ends in splinters part way up and the head is gone.
    const end = a.clone().lerp(b, sw.snap);
    k.rod(butt, [end.x, end.y, end.z], r, shaft);
    const d = b.clone().sub(a).normalize();
    for (const [o, l] of [[-0.45, 1.8], [0.35, 1.2], [0.0, 2.4]] as const) {
      const base = end.clone().add(new Vector3(o, 0, 0));
      const t = base.clone().addScaledVector(d, l).add(new Vector3(o * 0.6, 0, 0));
      k.rod([base.x, base.y, base.z], [t.x, t.y, t.z], r * 0.45, shaft, { r1: 0.05, seg: 4, hull: 0.6 });
    }
    return;
  }
  k.rod(butt, top, r, shaft);
  const d = b.clone().sub(a);
  const ang = Math.atan2(d.y, d.x) - Math.PI / 2;
  k.frame(top, [0, 0, ang], () => {
    const w = 1.25;
    const pts = sw.nick ? [0, -0.6, w, head * 0.3, w * 0.4, head * 0.45, w * 0.9, head * 0.55, 0, head, -w, head * 0.3] : [0, -0.6, w, head * 0.3, 0, head, -w, head * 0.3];
    k.slab(pts, 0.8, STEEL, [0, 0, 0], [0, 0, 0], { gloss: 0.6 });
    k.line([0, 0, 0, head * 0.8], 0.55, STEEL_DARK, flat(0.41));
    if (sw.blood) k.decal(smearPoly(0.2, head * 0.75, 0, -1, head * 0.6, 1.4), BLOOD, flat(0.41));
    if ((sw.blood ?? 0) >= 2) {
      k.decal(smearPoly(-0.2, head * 0.95, 0, -1, head * 0.9, 1.9), BLOOD, flat(0.41));
      // Blood run down onto the shaft.
      k.rod([0, -0.4, 0], [0, -head * 0.9, 0], 0.95, BLOOD, { seg: 5, hull: 0, r1: 0.85 });
      k.ball([0.4, -head * 1.1, 0.5], 0.5, BLOOD, { detail: 0, hull: 0 });
    }
  });
}

// ---- shields ----

/** A piece cut from a disc between `from` and `to` degrees (SVG angles: clockwise from screen right), down to `inner`. */
export interface Cut { from: number; to: number; inner: number; jag?: number }

/** A disc of radius r with cuts, as a polygon in a frame whose y is up. */
export function discPoly(r: number, cuts: readonly Cut[] = [], inset = 0, steps = 16): number[] {
  const norm = (v: number): number => ((v % 360) + 360) % 360;
  const inCut = (a: number, c: Cut): boolean => {
    const s = norm(c.from), e = norm(c.to), x = norm(a);
    return s <= e ? x >= s && x <= e : x >= s || x <= e;
  };
  const angles = new Set<number>();
  for (let i = 0; i < steps; i++) angles.add((360 / steps) * i);
  for (const c of cuts) {
    angles.add(norm(c.from)); angles.add(norm(c.to));
    // Extra points along a broken edge, so it can be jagged.
    const span = norm(c.to - c.from);
    for (let t = 1; t < 6; t++) angles.add(norm(c.from + (span * t) / 6));
  }
  const sorted = [...angles].sort((a, b) => a - b);
  const pts: number[] = [];
  // SVG angles turn clockwise on screen with y down; this frame has y up, so y = -sin.
  const push = (a: number, rr: number): void => { const t = (a * Math.PI) / 180; pts.push(Math.cos(t) * rr, -Math.sin(t) * rr); };
  sorted.forEach((a, i) => {
    const c = cuts.find((cc) => inCut(a, cc));
    if (!c) { push(a, r); return; }
    const inner = Math.min(r, Math.max(0.3, c.inner - inset)) + (c.jag ?? 0) * (i % 2 ? 1 : -1);
    if (Math.abs(a - norm(c.from)) < 1e-6) push(a, r);
    push(a, inner);
    if (Math.abs(a - norm(c.to)) < 1e-6) push(a, r);
  });
  // Clockwise in SVG becomes counter-clockwise here: reverse so the polygon winds the usual way.
  const out: number[] = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i]!, pts[i + 1]!);
  return out;
}

/** The usual cuts for a round shield: a chip when battered, about half split away when broken. */
export function shieldCuts(w: Wear, r: number): Cut[] {
  const cuts: Cut[] = [];
  // Battered: a chip from the upper right rim. Broken: the left half split away (splitPoly), the chip with it.
  if (worn(w, 3) && !worn(w, 4)) cuts.push({ from: 285, to: 318, inner: r * 0.62, jag: 0.4 });
  if (worn(w, 4)) cuts.push({ from: 300, to: 322, inner: r * 0.8, jag: 0.3 });
  return cuts;
}

/**
 * Split a polygon along the vertical line x = x0, keeping the right part, with a jagged break along the line
 * (a broken shield: about half of it gone).
 */
export function splitPoly(poly: number[], x0: number, jag = 0.7): number[] {
  const out: number[] = [];
  const n = poly.length / 2;
  let entry = -1;
  for (let i = 0; i < n; i++) {
    const ax = poly[i * 2]!, ay = poly[i * 2 + 1]!, bx = poly[((i + 1) % n) * 2]!, by = poly[((i + 1) % n) * 2 + 1]!;
    const ain = ax >= x0, bin = bx >= x0;
    if (ain) out.push(ax, ay);
    if (ain !== bin) {
      const t = (x0 - ax) / (bx - ax);
      out.push(x0, ay + (by - ay) * t);
      if (ain) entry = out.length - 2; // leaving the kept side: the break runs from here to where it comes back
    }
  }
  if (entry < 0) return out;
  // Jag the break: insert zigzag points between the exit point and the next point (the re-entry).
  const y0 = out[entry + 1]!, y1 = out[(entry + 2) % out.length + 1]!;
  const steps = 5, zig: number[] = [];
  for (let k = 1; k < steps; k++) zig.push(x0 + (k % 2 ? jag : -jag * 0.4) + (k === 2 ? jag * 0.8 : 0), y0 + ((y1 - y0) * k) / steps);
  out.splice(entry + 2, 0, ...zig);
  return out;
}

export interface ShieldFrame { at: V3; rot: V3 }
/** A shield held in front, its face toward the viewer, leaning back so a round face reads round. */
export const shieldFrame = (x: number, svgY: number, z: number, lean = -0.36, yaw = 0): ShieldFrame => ({ at: [x, H(svgY), z], rot: [lean, yaw, 0] });

/**
 * A round shield: a rim disc and a face disc in front of it, cut the same way (the face inset so the rim shows along
 * every break), with scratches, dents and cracks by stage. `emblem` paints on the face (it gets the face's surface).
 */
export function roundShield(k: Kit, f: ShieldFrame, r: number, rim: string, face: string, w: Wear, emblem?: (s: Surface, cuts: Cut[]) => void, rimW = 1.1): void {
  const cuts = shieldCuts(w, r);
  const split = (p: number[], x: number): number[] => (worn(w, 4) ? splitPoly(p, x) : p);
  // Keep the leaning disc clear of the body: its top edge leans back by r sin(lean). Moving it forward lowers it on
  // screen, so it is raised by the same amount to stay where the SVG draws it.
  const need = TUNIC.sz * TUNIC.r0 + 0.9 + r * Math.sin(Math.abs(f.rot[0]));
  const dz = Math.max(0, need - f.at[2]);
  const at: V3 = [f.at[0], f.at[1] + (dz * SQUASH) / COS_E, f.at[2] + dz];
  k.frame(at, f.rot, () => {
    k.slab(split(discPoly(r, cuts), -r * 0.1), 1.4, rim);
    k.slab(split(discPoly(r - rimW, cuts, 0.9), -r * 0.1 + 0.8), 1.0, face, [0, 0, 0.45]);
    const s = flat(0.95);
    emblem?.(s, cuts);
    discWear(k, s, r, face, w);
  });
}

/** Scratches, dents and cracks on a disc's face (shared by every round shield and boss). */
export function discWear(k: Kit, s: Surface, r: number, face: string, w: Wear): void {
  const f = r / 6;
  if (worn(w, 1)) scratches(k, s, worn(w, 4) ? [[1.6 * f, -2.6 * f, 3.2 * f, -1.4 * f]] : [[-3.2 * f, 2.4 * f, -1.6 * f, 3.4 * f], [1.6 * f, -2.6 * f, 3.2 * f, -1.4 * f], [-0.6 * f, -3.6 * f, 0.8 * f, -2.6 * f]], SCRATCH, 0.7 * Math.max(1, f * 0.8));
  if (worn(w, 2)) {
    dent(k, s, 2.6 * f, 2.2 * f, 1.25 * f, face);
    if (!worn(w, 4)) dent(k, s, -2.4 * f, -0.8 * f, 1.1 * f, face);
  }
  if (worn(w, 3)) crack(k, s, [2.4 * f, 4.2 * f, 1.6 * f, 2.6 * f, 2.4 * f, 1.2 * f, 1.4 * f, -0.4 * f], 0.75 * Math.max(1, f * 0.8));
  if (worn(w, 4)) crack(k, s, [0.8 * f, -1.6 * f, 2.4 * f, -2.4 * f, 2.8 * f, -4.0 * f], 0.75 * Math.max(1, f * 0.8));
  if (heavy(w)) {
    // Spattered: two smears and a scatter of drops on the face that is left.
    smear(k, s, 3.4 * f, 3.2 * f, -0.3, -1, 3.2 * f, 1.4 * f);
    smear(k, s, 1.2 * f, -0.6 * f, 1, -0.6, 2.6 * f, 1.2 * f);
    for (const [dx, dy, rr] of [[4.6, 0.6, 0.5], [2.0, 4.6, 0.4], [0.8, 2.0, 0.35], [3.8, -2.8, 0.45]] as const) k.decal(ell(dx * f, dy * f, rr * f, rr * f, 6), BLOOD, s);
  }
}

// ---- mounts ----

export interface HorseColours { coat: string; shade: string; mane: string; hoof?: string }

/**
 * A horse facing +x in its own frame, its body centred near SVG (-2, -6.5), a near side toward +z. Returns the
 * saddle point (where a rider's seat goes).
 */
export function horse(k: Kit, hc: HorseColours, w: Wear): V3 {
  const bodyY = H(-6.5);
  // Legs: far pair a shade darker, near pair in the coat.
  const legs: [number, number, string][] = [[-7.5, -3.2, hc.shade], [7.2, -3.2, hc.shade], [-10.2, 3.2, hc.coat], [4.4, 3.2, hc.coat]];
  // The legs stand on the ground while the body settles (a crouch lowers the body over them).
  k.pivot(LEGS, [0, 0, 0], () => {
    for (const [x, z, col] of legs) {
      const kx = x > 0 ? 0.9 : -0.5;
      k.rod([x, bodyY - 2, z], [x + kx, 5.2, z], 1.5, col, { r1: 1.2 });
      k.rod([x + kx, 5.2, z], [x + kx * 0.7, 1.6, z], 1.2, col, { r1: 1.05 });
      k.box([x + kx * 0.7, 0.8, z], [2.6, 1.6, 2.6], hc.hoof ?? MANE);
    }
  });
  // Body, chest and rump.
  k.ball([-2, bodyY, 0], 1, hc.coat, { s: [12.6, 6.8, 5.2], detail: 1 });
  // Neck and head, with the mane down the neck: one piece, so the head can be lowered about the withers.
  k.pivot(NECK, NECK_AT, () => {
    const neck0: V3 = NECK_AT, neck1: V3 = [11.2, H(-19.5), 0];
    k.rod(neck0, neck1, 3.7, hc.coat, { r1: 2.7, seg: 7 });
    const head0: V3 = [11.2, H(-20.5), 0], head1: V3 = [18.4, H(-16.4), 0];
    k.rod(head0, head1, 2.7, hc.coat, { r1: 1.9, seg: 7 });
    k.ball(head0, 2.8, hc.coat, { detail: 0 });
    for (const s of [-1, 1]) k.rod([12.0, H(-22.4), s * 1.2], [12.4, H(-25.8), s * 1.4], 0.9, hc.coat, { r1: 0.15, seg: 4 });
    for (const s of [-1, 1]) k.ball([15.0, H(-19.8), s * 2.0], 0.55, EYE, { hull: 0, detail: 0 });
    k.slab([0, 0, 2.2, 0.4, 1.4, 11.6, -0.4, 11], 1.2, hc.mane, [5.2, H(-11.5), 0], [0, 0, -0.55]);
  });
  // The tail.
  k.rod([-13.6, H(-8), 0], [-16.8, H(-0.6), 0], 1.5, hc.mane, { r1: 0.7 });
  // Wear on the near flank: dirt, then scratches and a cut.
  const flank = (x: number, y: number): { p: V3; n: V3 } => {
    const dx = (x + 2) / 12.6, dy = (y - bodyY) / 6.8;
    const dz = Math.sqrt(Math.max(0.02, 1 - dx * dx - dy * dy));
    const n = new Vector3(dx / 12.6, dy / 6.8, dz / 5.2).normalize();
    return { p: [x, y, dz * 5.2 * 0.96], n: [n.x, n.y, n.z] };
  };
  if (worn(w, 1)) dirt(k, flank, -6, bodyY - 3.6, 5, hc.coat);
  if (worn(w, 2)) scratches(k, flank, [[2, bodyY + 1.2, 4.4, bodyY - 0.6], [2.8, bodyY + 2.2, 5.2, bodyY + 0.6]], mix(hc.coat, '#FFFFFF', 0.45), 0.7);
  if (bloody(w, 1)) smear(k, flank, 3.4, bodyY + 1.0, 0.2, -1, 3.2, 1.4);
  if (heavy(w)) {
    smear(k, flank, -5.0, bodyY + 2.6, 0.1, -1, 4.0, 1.7);
    smear(k, flank, 0.4, bodyY - 0.4, -0.3, -1, 3.0, 1.3);
    drip(k, flank, 3.6, bodyY - 2.2, 2.6, 0.9);
  }
  return [-1.5, bodyY + 5.6, 0];
}

/** A rider's seat: a leg down the near flank and a torso, in its own frame facing +z. Returns the shoulders' height. */
export function rider(k: Kit, seat: V3, c: Look, torso: string, w: Wear, o: { torsoTop?: number } = {}): number {
  const [x, y, z] = seat;
  // The near leg over the flank, the far leg hidden.
  k.rod([x + 0.6, y + 1, z + 3.2], [x + 1.6, y - 6.0, z + 5.6], 1.7, c.dark);
  k.box([x + 1.9, y - 7.0, z + 5.9], [3.6, 2.2, 3.2], BOOT);
  k.rod([x + 0.2, y + 1, z - 3.0], [x + 1.0, y - 4.0, z - 5.2], 1.6, c.dark);
  const top = o.torsoTop ?? H(-21);
  k.frustum([x, 0, z], y - 0.5, top, 5.6, 4.6, torso, { sz: 0.72 });
  const s = onFrustum([x, 0, z + 0.25], y - 0.5, top, 5.6, 4.6, 0.72);
  if (worn(w, 1)) dirt(k, s, x + 1.8, y + 1.2, 3.4, torso);
  if (worn(w, 3)) { const [lip, gap] = tearPolys(x + 1.4, y + (top - y) * 0.62, 3.6, 3.4); k.decal(lip, mix(torso, '#000000', 0.45), s); k.decal(gap, SKIN, s); }
  return top;
}

/** The soft blob under a figure is drawn by the page (one transparent mesh for every unit); this is its size. */
export interface Footprint { rx: number; rz: number; x: number }
