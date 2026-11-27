// Body parts for Gritty's detailed toon figures beyond the Hoplite (grittySpecials.ts): hands, arms with sleeves and
// wraps, a body turned from a profile, a pleated skirt, a cloak, legs with wraps, sandals or boots, a hood, a short
// blade, fletched arrows. They follow the kit's rules (grittyToon.ts): faceted, outlined, earthy colours, wear by
// stage. The Hoplite keeps its own copies in toonHoplite.ts (left as it is); these are the same shapes, opened up.
import { CylinderGeometry, Euler, Matrix4, Quaternion, TorusGeometry, Vector3 } from 'three';
import { Kit, mix } from './kit';
import type { Surface, V3 } from './kit';
import { ANKLE, BLOOD, FEET, LEGS, SKIN, smear, worn } from './parts';
import type { Wear } from './parts';
import { GT } from './grittyToon';

export type Profile = readonly (readonly [number, number])[];

const norm = (v: V3): Vector3 => new Vector3(...v).normalize();
const add = (a: V3, b: Vector3, s = 1): V3 => [a[0] + b.x * s, a[1] + b.y * s, a[2] + b.z * s];

/** A hand closed round a bar along `axis` at p: the fingers wrapping it, the back of the hand, the thumb over them. */
export function fist(k: Kit, p: V3, axis: V3, back: V3, r = 0.9, skin: string = SKIN): void {
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), norm(axis));
  const t = new TorusGeometry(r, 0.85, 4, 6, Math.PI * 1.6);
  t.applyQuaternion(q);
  t.translate(...p);
  k.add(t, skin, { hull: 0.7 });
  const b = norm(back), top = norm(axis).multiplyScalar(1.2);
  k.ball(add(p, b, r * 0.9), 1, mix(skin, '#6A3E22', 0.18), { detail: 0 });
  const a = add(add(p, b, 0.8), top), c = add(add(p, b, -0.4), top, 0.7);
  k.rod(a, [c[0], c[1], c[2] + 0.6], 0.42, skin, { r1: 0.36, seg: 5 });
}

export interface LimbOpts {
  /** A sleeve over the shoulder and down the upper arm, this colour (none: a bare arm). */
  sleeve?: string;
  /** How far down the upper arm the sleeve reaches (0 to 1, default 0.7). */
  sleeveTo?: number;
  /** Two wraps at the wrist (default leather); null for none. */
  wrap?: string | null;
  /** A long bracer over the forearm instead of the wraps. */
  bracer?: string;
  /** The arm's thickness (1 is the Hoplite's). */
  r?: number;
}

/** An arm from the shoulder through the elbow to the wrist: a shoulder cap, upper arm, elbow, forearm, wrist wraps. */
export function limb(k: Kit, shoulder: V3, elbow: V3, wrist: V3, o: LimbOpts = {}): void {
  const f = o.r ?? 1;
  k.ball(shoulder, 1, o.sleeve ?? SKIN, { s: [2.0 * f, 2.2 * f, 2.0 * f], detail: 0 });
  k.rod(shoulder, elbow, 1.6 * f, SKIN, { r1: 1.25 * f, seg: 6 });
  if (o.sleeve !== undefined) {
    const to = o.sleeveTo ?? 0.7;
    const end: V3 = [shoulder[0] + (elbow[0] - shoulder[0]) * to, shoulder[1] + (elbow[1] - shoulder[1]) * to, shoulder[2] + (elbow[2] - shoulder[2]) * to];
    k.rod(shoulder, end, 1.95 * f, o.sleeve, { r1: 1.7 * f, seg: 7 });
  }
  k.ball(elbow, 1.3 * f, GT.SKIN_SHADE, { detail: 0, hull: 0 });
  k.rod(elbow, wrist, 1.35 * f, SKIN, { r1: 1.0 * f, seg: 6 });
  const d = new Vector3(...wrist).sub(new Vector3(...elbow));
  const len = d.length();
  d.normalize();
  if (o.bracer !== undefined) {
    k.rod(add(wrist, d, -len * 0.62), add(wrist, d, -0.3), 1.5 * f, o.bracer, { r1: 1.22 * f, seg: 7 });
    for (const t of [0.22, 0.5]) { const p = add(wrist, d, -len * t); k.rod(add(p, d, -0.2), add(p, d, 0.2), 1.45 * f - t * 0.25, mix(o.bracer, '#000000', 0.35), { seg: 7, hull: 0 }); }
  } else if (o.wrap !== null) {
    const wrap = o.wrap ?? GT.LEATHER;
    for (const t of [0.6, 1.2]) {
      const p = add(wrist, d, -t);
      k.rod(add(p, d, -0.25), add(p, d, 0.25), 1.18 * f, t < 1 ? wrap : mix(wrap, '#000000', 0.3), { seg: 7, hull: 0 });
    }
  }
}

/** A body turned from a profile of [radius, height] rings, squashed front to back by sz: faceted, like the cuirass. */
export function lathe(k: Kit, profile: Profile, colour: string, sz: number, o: { seg?: number; gloss?: number; x?: number; z?: number } = {}): void {
  const seg = o.seg ?? 12;
  const g = new CylinderGeometry(1, 1, 1, seg, profile.length - 1, true);
  // Turned half a facet first (a flat face to the front), then shaped and squashed, so it stays a true ellipse.
  g.rotateY(Math.PI / seg);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.round((pos.getY(i) + 0.5) * (profile.length - 1));
    const [r, y] = profile[ring]!;
    pos.setXYZ(i, pos.getX(i) * r + (o.x ?? 0), y, pos.getZ(i) * r * sz + (o.z ?? 0));
  }
  k.add(g, colour, { gloss: o.gloss ?? 0.2 });
}

/** The radius of a profile at height y. */
export function radiusAt(profile: Profile, y: number): number {
  if (y <= profile[0]![1]) return profile[0]![0];
  for (let i = 0; i + 1 < profile.length; i++) {
    const [r0, y0] = profile[i]!, [r1, y1] = profile[i + 1]!;
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return profile[profile.length - 1]![0];
}

/** The front of a lathed body: marks laid on it at (x, y), facing out. */
export function frontOf(profile: Profile, sz: number, lift = 0.25): Surface {
  return (x, y) => {
    const r = radiusAt(profile, y) * Math.cos(Math.PI / 12);
    const dx = Math.max(-r * 0.97, Math.min(r * 0.97, x));
    const z = sz * Math.sqrt(r * r - dx * dx) + lift;
    const n = new Vector3(dx / (r * r), 0, z / (sz * sz * r * r) || 1).normalize();
    return { p: [x, y, z], n: [n.x, n.y, n.z] };
  };
}

/** A pleated skirt from y0 (radius r0, the hem) up to y1 (r1), every other edge pushed out, and a hem band. */
export function skirt(k: Kit, y0: number, y1: number, r0: number, r1: number, colour: string, hem: string, sz = 0.72, seg = 16): void {
  const g = new CylinderGeometry(r1, r0, y1 - y0, seg, 1, true);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getX(i), pos.getZ(i));
    const k2 = Math.round((a / (Math.PI * 2)) * seg) % 2 === 0 ? 1.08 : 0.94;
    pos.setXYZ(i, pos.getX(i) * k2, pos.getY(i), pos.getZ(i) * k2 * sz);
  }
  g.translate(0, (y0 + y1) / 2, 0);
  k.add(g, colour);
  k.frustum([0, 0, 0], y0, y0 + 0.9, r0 * 1.06, r0 * 1.03, hem, { sz: sz + 0.02, seg, open: true });
}

/**
 * A cloak hanging behind: an outline (x, y pairs) in the plane z, leaning back by `lean`, with two darker folds down
 * it from `top` to `foot`.
 */
export function cloak(k: Kit, outline: readonly number[], z: number, colour: string, o: { lean?: number; folds?: readonly number[]; top?: number; foot?: number } = {}): void {
  const lean = o.lean ?? 0.1;
  k.slab(outline, 1.0, colour, [0, 0, z], [lean, 0, 0]);
  const top = o.top ?? 24, foot = o.foot ?? 3.2;
  for (const x of o.folds ?? []) k.slab([x - 1.2, top, x + 0.6, top, x + 1.6, foot, x - 2.0, foot], 1.2, mix(colour, '#000000', 0.25), [0, 0, z - 0.6], [lean, 0, 0], { hull: 0 });
}

export interface LegOpts {
  /** The knee's height (the Hoplite's is 7.4). */
  knee?: number;
  /** Cloth or leather wrapped round the shin (none: bare). */
  wrap?: string;
  /** Bronze greaves (with a gold rim if `gilded`). */
  greave?: string;
  gilded?: boolean;
  /** Footwear: sandals (default) or ankle boots. */
  boot?: string;
  sandal?: string;
  /** Spread of the feet from the middle (default 2.8). */
  spread?: number;
}

/** Standing legs as the crouch's pieces: the shins with knees (LEGS, about the ankles) and the feet (FEET). */
export function standLegs(k: Kit, w: Wear, o: LegOpts = {}): void {
  const knee = o.knee ?? 7.4, sx = o.spread ?? 2.8;
  const shinH = knee - 3.0;
  k.pivot(LEGS, ANKLE, () => {
    for (const s of [-1, 1]) {
      const x = s * sx;
      if (o.greave !== undefined) {
        const g = new CylinderGeometry(1.75, 1.3, shinH, 8, 2, true);
        const pos = g.attributes.position!;
        for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i)) < 0.1) pos.setXYZ(i, pos.getX(i) * 1.22, pos.getY(i), pos.getZ(i) * 1.22);
        g.translate(x, 2.4 + shinH / 2, 0.2);
        k.add(g, o.greave, { gloss: 0.5 });
        if (o.gilded === true) {
          k.frustum([x, 0, 0.2], 2.3 + shinH - 0.4, 2.4 + shinH, 1.4, 1.35, GT.GOLD_EDGE, { seg: 8, open: true, hull: 0, gloss: 0.6 });
        }
        k.rod([x, 2.2, 0.2], [x, 2.6, 0.2], 1.3, SKIN, { seg: 6, hull: 0, caps: false });
      } else {
        // A shaped calf: wider below the knee, narrow at the ankle; wrapped in bands if `wrap`.
        k.rod([x, 2.2, 0.1], [x, 2.2 + shinH * 0.55, 0.0], 1.15, o.wrap ?? SKIN, { r1: 1.6, seg: 7 });
        k.rod([x, 2.2 + shinH * 0.55, 0.0], [x, knee - 0.4, 0.3], 1.6, o.wrap ?? SKIN, { r1: 1.45, seg: 7 });
        if (o.wrap !== undefined) {
          const band = mix(o.wrap, '#000000', 0.3);
          for (let i = 0; i < 4; i++) {
            const y = 2.8 + (i * (shinH - 1.2)) / 3;
            k.rod([x, y - 0.2, 0.1], [x, y + 0.3, 0.15], 1.25 + (i / 3) * 0.4, band, { seg: 7, hull: 0 });
          }
        }
      }
      k.ball([x, knee, 0.4], 1.55, SKIN, { detail: 0 });
      if (o.greave === undefined) k.ball([x, knee - 0.2, 1.5], 0.75, GT.SKIN_SHADE, { detail: 0, hull: 0 });
    }
  }, { axis: [1, 0, 0] });
  k.pivot(FEET, [0, 0, 0], () => {
    for (const s of [-1, 1]) {
      const x = s * (sx + 0.2);
      if (o.boot !== undefined) {
        k.box([x, 0.7, 1.0], [3.5, 1.4, 5.0], o.boot);
        k.frustum([x, 0, 0.3], 0.4, 3.0, 1.85, 1.6, o.boot, { seg: 7 });
        k.frustum([x, 0, 0.3], 2.4, 3.1, 1.75, 1.7, mix(o.boot, '#000000', 0.3), { seg: 7, hull: 0 });
      } else {
        const sandal = o.sandal ?? GT.SANDAL;
        k.box([x, 0.5, 1.0], [3.4, 1.0, 5.0], sandal);
        k.ball([x, 1.4, 1.2], 1, SKIN, { s: [1.5, 0.8, 2.0], detail: 0 });
        for (const z of [0.4, 2.0]) k.box([x, 1.6, z], [3.2, 0.35, 0.5], sandal, { hull: 0 });
      }
    }
  });
  void w;
}

/**
 * A hood round a bare face centred on `face` (radius r as given to bareFace): the back of it, a deep cowl over the
 * brow, a rim round the opening and a collar falling to the shoulders. `point`: the tail of the hood (from the crown,
 * toward that offset), short when `torn`. `rim`: the rim's colour (default a shade darker than the hood).
 */
export function hood(k: Kit, face: V3, r: number, colour: string, o: { point?: V3; torn?: boolean; collar?: number; rim?: string } = {}): void {
  const f = r / 3.9;
  const dark = mix(colour, '#000000', 0.3);
  k.ball([face[0], face[1] + 0.5 * f, face[2] - 1.6 * f], r * 1.4, colour, { detail: 1, s: [1, 1.04, 1] });
  k.dome([face[0], face[1] + 0.7 * f, face[2] - 0.1 * f], r * 1.42, colour, { to: 1.0, seg: 12 });
  const t = new TorusGeometry(r * 1.2, 0.75 * f, 4, 12);
  t.scale(1, 1.14, 0.7);
  t.translate(face[0], face[1] + 0.25 * f, face[2] + r * 0.6);
  k.add(t, o.rim ?? dark, { hull: 0.6 });
  // The collar over the neck and shoulders.
  const cy = face[1] - r * 1.05;
  k.frustum([face[0], 0, face[2] - 0.6 * f], cy - (o.collar ?? 3.4) * f, cy, r * 1.85, r * 1.25, colour, { seg: 12, sz: 0.85 });
  if (o.point !== undefined) {
    const base: V3 = [face[0], face[1] + 4.6 * f, face[2] - 2.0 * f];
    const p = o.point, s = o.torn === true ? 0.4 : 1;
    k.rod(base, [base[0] + p[0] * s, base[1] + p[1] * s, base[2] + p[2] * s], 2.3 * f, colour, { r1: o.torn === true ? 1.2 * f : 0.15, seg: 6 });
  }
}

/**
 * What is left of a hood torn away: a ragged collar round the neck, the rest of it gone. Hair shows on the head.
 */
export function hoodCollar(k: Kit, face: V3, r: number, colour: string, collar = 3.4): void {
  const f = r / 3.9;
  const cy = face[1] - r * 1.05;
  k.frustum([face[0], 0, face[2] - 0.6 * f], cy - collar * f, cy, r * (1.3 + 0.16 * collar), r * 1.3, colour, { seg: 12, sz: 0.85 });
  // Rags of the cowl hanging off the collar at the back and one side.
  for (const [dx, dz, h] of [[-3.2, -1.8, 2.6], [2.4, -2.6, 1.8], [0.2, -3.6, 2.2]] as const) {
    k.slab([-1.0, 0, 1.0, 0, 0.6, h * f, 0.0, h * 0.6 * f, -0.6, h * f], 0.4, colour, [face[0] + dx * f, cy - 0.2, face[2] + dz * f], [0.25, Math.atan2(dx, dz), 0], { hull: 0.4 });
  }
}

/**
 * Hair on a bare head (face centred on `face`, radius r as given to bareFace): over the crown and down the back, ragged
 * at the brow in a few locks, and `long` falls to the shoulders behind.
 */
export function hairCap(k: Kit, face: V3, r: number, colour: string, o: { long?: boolean } = {}): void {
  const f = r / 3.9;
  k.dome([face[0], face[1] + 0.9 * f, face[2] - 0.6 * f], r * 1.13, colour, { to: 1.05, seg: 10 });
  k.ball([face[0], face[1] + 0.2 * f, face[2] - 2.0 * f], r * 1.05, colour, { detail: 1, s: [1.05, 1.08, 0.95] });
  for (const [x, y, rot] of [[-2.6, 3.4, 0.5], [-0.9, 3.9, 0.15], [0.9, 3.9, -0.15], [2.6, 3.4, -0.5]] as const) {
    k.slab([-0.9, 0.6, 0.9, 0.6, 0.3, -1.4, -0.2, -0.6], 0.8, colour, [face[0] + x * f, face[1] + y * f, face[2] + 2.6 * f - Math.abs(x) * 0.35 * f], [-0.5, x * 0.12, rot], { hull: 0.4 });
  }
  if (o.long === true) {
    k.slab([-3.8, 0, 3.8, 0, 3.4, -5.6, 1.6, -6.4, 0, -5.4, -1.6, -6.6, -3.4, -5.6], 1.6, colour, [face[0], face[1] - 0.4 * f, face[2] - 2.6 * f], [0.15, 0, 0], { hull: 0.6 });
  }
}

export interface BladeWear { nick?: boolean; snap?: boolean; blood?: number }

/**
 * A short blade held in a fist: its grip from `hilt`, a bronze guard, a leaf-shaped iron blade to `tip`. Nicked,
 * snapped half way, bloody. The blade lies flat to the viewer (in the plane of the hilt-tip line and `flat`).
 */
export function shortBlade(k: Kit, hilt: V3, tip: V3, bw: BladeWear = {}, o: { flatTo?: V3; width?: number; iron?: string } = {}): void {
  const a = new Vector3(...hilt), d = new Vector3(...tip).sub(a);
  const len = d.length();
  d.normalize();
  const iron = o.iron ?? '#A9A69C', edge = mix(iron, '#FFFFFF', 0.35), fuller = mix(iron, '#000000', 0.4);
  // Grip and pommel behind the hand, the guard in front of it.
  k.rod(add(hilt, d, -2.2), add(hilt, d, 0.8), 0.55, GT.LEATHER_DARK, { seg: 5 });
  k.ball(add(hilt, d, -2.5), 0.7, GT.AGED, { detail: 0, gloss: 0.5 });
  const side = new Vector3(...(o.flatTo ?? [0, 0, 1])).cross(d).normalize();
  const g0 = add(hilt, d, 1.0);
  k.rod(add(g0, side, -1.5), add(g0, side, 1.5), 0.42, GT.AGED, { seg: 4, gloss: 0.5 });
  // The blade, in its own frame: x along it, y across it.
  const bl = (len - 1.2) * (bw.snap === true ? 0.48 : 1);
  const W = o.width ?? 1.05;
  const pts = bw.snap === true
    ? [0, -W * 0.8, bl * 0.6, -W * 1.05, bl, -W * 0.7, bl - 0.5, -0.1, bl + 0.3, 0.3, bl - 0.2, W * 0.9, bl * 0.6, W * 1.05, 0, W * 0.8]
    : [0, -W * 0.8, bl * 0.55, -W * 1.1, bl * 0.82, -W * 0.8, bl, 0, bl * 0.82, W * 0.8, ...(bw.nick === true ? [bl * 0.66, W, bl * 0.6, W * 0.45, bl * 0.53, W * 1.08] : [bl * 0.55, W * 1.1]), 0, W * 0.8];
  const rot = along(d, side);
  k.frame(g0, rot, () => {
    k.slab(pts, 0.4, iron, [0.2, 0, 0], [0, 0, 0], { gloss: 0.55 });
    const s: Surface = (x, y) => ({ p: [x + 0.2, y, 0.21], n: [0, 0, 1] });
    k.line([0.4, 0, bl * (bw.snap === true ? 0.9 : 0.7), 0], 0.28, fuller, s);
    k.line([0.6, W * 0.75, bl * 0.5, W * 0.95], 0.14, edge, s);
    if ((bw.blood ?? 0) >= 1) smear(k, s, bl * 0.75, 0.1, -1, 0.05, bl * 0.4, 0.9);
    if ((bw.blood ?? 0) >= 2) k.decal([bl * 0.3, -0.5, bl * 0.42, -0.4, bl * 0.4, 0.5, bl * 0.28, 0.4], BLOOD, s);
  });
}

/** Fletching: two vanes crossed on a shaft end at p, the shaft running along `dir` (toward the head). */
export function fletch(k: Kit, p: V3, dir: V3, colour: string, len = 2.2, h = 0.8): void {
  const d = norm(dir);
  const any = Math.abs(d.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const s1 = new Vector3().crossVectors(any, d).normalize(), s2 = new Vector3().crossVectors(d, s1).normalize();
  for (const sd of [s1, s2]) {
    k.frame(p, along(d, sd), () => {
      k.slab([-len, 0, 0, 0, -0.3, h, -len - 0.2, h * 1.1], 0.12, colour, [0, 0, 0], [0, 0, 0], { hull: 0.35 });
      k.slab([-len, 0, 0, 0, -0.3, -h, -len - 0.2, -h * 1.1], 0.12, colour, [0, 0, 0], [0, 0, 0], { hull: 0.35 });
    });
  }
}

/** The turn (Euler YXZ, as Kit.frame takes it) of a frame whose x runs along `x` and whose y lies toward `y`. */
export function along(x: Vector3, y: Vector3): V3 {
  const X = x.clone().normalize();
  const Z = new Vector3().crossVectors(X, y).normalize();
  const Y = new Vector3().crossVectors(Z, X).normalize();
  const e = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(X, Y, Z), 'YXZ');
  return [e.x, e.y, e.z];
}

/** Wear on a stage: true from that stage on. Re-exported for the figures here. */
export { worn };
