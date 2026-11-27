// Gritty's rider: the shared body every Gritty horseman wears under his own gear (grittyRiders.ts dresses each type),
// in the Hoplite's detailed toon style (toonHoplite.ts, grittyToon.ts).
//
// The rider sits in the Bright rider's turn (RIDER_YAW) and moves as its RIDER piece, from the seat up: the torso,
// the arms, the head and what he holds. His legs are built in the mount's turn, straddling the horse with a foot in
// each stirrup, and stay with the horse when he hunches forward in a crouch.
//
// - The torso: a shaped body (hips, waist, chest, shoulders) a coat or armour is drawn on, with a skirt over the lap.
// - The arms: shoulder, upper arm, elbow, forearm, a cuff, and a hand closed round what it holds.
// - The face: bareFace, centred on the head and facing the rider's own front, so blood and the healed scar come from
//   the shared code. Steppe faces (steppeFace) get a drooping moustache, a chin tuft, braided loops behind the ears
//   and, once the cap is lost, a shaved crown with a forelock.
import { Quaternion, TorusGeometry, Vector3 } from 'three';
import { CylinderGeometry } from 'three';
import { H, Kit, mix } from './kit';
import type { Surface, V3 } from './kit';
import { bareFace, GT, headFront } from './grittyToon';
import type { FaceOpts } from './grittyToon';
import { setYaw } from './parts';
import type { Wear } from './parts';

// ---- the frames (the same turns and pieces as the Bright riders in figures.ts; a test checks they agree) ----

/** The mount's turn and the rider's (figures.ts MOUNT_YAW and RIDER_YAW). */
export const MOUNT_YAW = -0.42;
export const RIDER_YAW = 0.3;
/** The moving pieces: the rider from the seat up, his weapon (or drawing arm) and the arrow. */
export const RIDER = 'rider';
export const WEAPON = 'weapon';
export const ARROW = 'arrow';
/** The rider's pivot: the Bright rider's seat, in the rider's turn. */
export const SEAT: V3 = [0, H(-10), 0.6];
/** The axis about which a positive turn tips the rider toward the horse's head (as figures.ts). */
export const HUNCH: V3 = [-Math.sin(MOUNT_YAW - RIDER_YAW), 0, -Math.cos(MOUNT_YAW - RIDER_YAW)];
/** About the vertical: a drawing hand comes back toward the shoulder. */
export const DRAW_BACK: V3 = [0, 1, 0];
/** About the axis away from the viewer: the top tips toward +x (a spear or lance). */
export const TIP_RIGHT: V3 = [0, 0, -1];

export function turned(k: Kit, yaw: number, f: () => void): void {
  setYaw(yaw);
  k.frame([0, 0, 0], [0, yaw, 0], f);
}

/** A point given in the rider's turn, in the mount's turn (both frames share the origin). */
export function toMount(p: V3): V3 {
  const a = RIDER_YAW - MOUNT_YAW, c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}

// ---- the torso ----

/** The torso's profile: radius and height, from the seat to the base of the neck. */
export const TORSO: readonly (readonly [number, number])[] = [[4.3, 19.6], [4.2, 21.8], [3.95, 24.0], [4.6, 27.0], [5.0, 29.2], [4.5, 30.8], [2.6, 31.9]];
export const TORSO_SZ = 0.74;
/** The shoulders (rider's turn), the right (+x) and the left. */
export const SHOULDER_R: V3 = [4.4, 30.2, 0.1];
export const SHOULDER_L: V3 = [-4.4, 30.2, 0.1];
/** The head's centre and its size (bareFace's r). */
export const HEAD_C: V3 = [0, 37.9, 0.6];
export const HEAD_R = 3.7;

function torsoR(y: number, prof = TORSO): number {
  if (y <= prof[0]![1]) return prof[0]![0];
  for (let i = 0; i + 1 < prof.length; i++) {
    const a = prof[i]!, b = prof[i + 1]!;
    if (y <= b[1]) return a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
  }
  return prof[prof.length - 1]![0];
}

/** The torso: a faceted shaped body in `colour` (scaled out by `grow` for a coat or armour over it). */
export function torso(k: Kit, colour: string, o: { grow?: number; gloss?: number; seg?: number } = {}): void {
  const grow = o.grow ?? 1;
  const g = new CylinderGeometry(1, 1, 1, o.seg ?? 10, TORSO.length - 1, true);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.round((pos.getY(i) + 0.5) * (TORSO.length - 1));
    const [r, y] = TORSO[ring]!;
    pos.setXYZ(i, pos.getX(i) * r * grow, y, pos.getZ(i) * r * TORSO_SZ * grow);
  }
  g.rotateY(Math.PI / 10);
  k.add(g, colour, { gloss: o.gloss ?? 0.15 });
}

/** The front of the torso as a surface for marks (x, y in the rider's turn), `lift` off it. */
export function torsoFront(lift = 0.15, grow = 1): Surface {
  return (x, y) => {
    const r = torsoR(y) * grow;
    const dx = Math.max(-r * 0.97, Math.min(r * 0.97, x));
    const z = TORSO_SZ * Math.sqrt(r * r - dx * dx) * Math.cos(Math.PI / 10) + lift;
    const n = new Vector3(dx / (r * r), 0, z / (TORSO_SZ * TORSO_SZ * r * r)).normalize();
    return { p: [x, y, z], n: [n.x, n.y, n.z] };
  };
}

/** A skirt over the lap and the saddle: an open flared band in the coat's colour. */
export function lapSkirt(k: Kit, colour: string, o: { y0?: number; y1?: number; r0?: number; r1?: number } = {}): void {
  k.frustum([0, 0, 0], o.y0 ?? 18.0, o.y1 ?? 21.8, o.r0 ?? 5.6, o.r1 ?? 4.5, colour, { sz: 0.86, seg: 10, open: true, hull: 0.6 });
}

// ---- the legs (built in the mount's turn: they stay on the horse) ----

export interface LegOpts {
  /** The thigh (breeches or the coat's skirt), the shin's boot and the boot's toe. */
  thigh: string;
  boot: string;
  /** A turned-up toe (steppe boots). */
  upturned?: boolean;
  /** A panel of the coat (or mail) hanging over the near thigh. */
  skirt?: string;
  /** Armour on the shin (greaves): its colour. */
  greave?: string;
  /** The stirrup's leather and iron. */
  leather?: string;
  iron?: string;
}

/** The rider's legs over the horse, a foot in each stirrup: call in the mount's turn. */
export function riderLegs(k: Kit, o: LegOpts, w: Wear): void {
  const leather = o.leather ?? GT.LEATHER_DARK, iron = o.iron ?? '#8E9096';
  for (const s of [1, -1]) {
    const hip: V3 = [-0.3, 20.8, s * 2.3], knee: V3 = [3.4, 16.9, s * 5.5], ankle: V3 = [2.0, 11.6, s * 5.9];
    if (s < 0) {
      // The far leg: mostly hidden behind the horse; just enough to show past its back.
      k.rod(hip, knee, 1.9, o.thigh, { r1: 1.55, seg: 6, caps: false });
      k.rod(knee, ankle, 1.45, o.boot, { r1: 1.2, seg: 6, caps: false });
      continue;
    }
    // The stirrup's leather, behind the leg, and its iron under the boot.
    k.rod([-0.9, 19.4, 5.1], [1.6, 10.6, 6.1], 0.32, leather, { seg: 4, caps: false, hull: 0.4 });
    const t = new TorusGeometry(1.1, 0.22, 3, 7);
    t.translate(2.2, 9.9, 6.1);
    k.add(t, iron, { gloss: 0.5, hull: 0.4 });
    k.rod(hip, knee, 2.0, o.thigh, { r1: 1.6, seg: 7, caps: false });
    k.ball(knee, 1.6, o.greave ?? o.thigh, { detail: 0 });
    k.rod(knee, ankle, 1.5, o.greave ?? o.boot, { r1: 1.25, seg: 7, caps: false });
    // The boot's cuff and foot, the toe forward along the horse.
    k.rod([knee[0] - 0.25, knee[1] - 1.4, knee[2] + 0.05], [knee[0] - 0.4, knee[1] - 2.2, knee[2] + 0.1], 1.7, mix(o.boot, '#000000', 0.2), { seg: 7, hull: 0.5 });
    k.box([ankle[0] + 0.8, ankle[1] - 1.05, ankle[2]], [4.0, 1.9, 2.3], o.boot, { rot: [0, 0, 0.06] });
    if (o.upturned) k.rod([ankle[0] + 2.5, ankle[1] - 1.4, ankle[2]], [ankle[0] + 3.7, ankle[1] - 0.2, ankle[2]], 0.75, o.boot, { r1: 0.25, seg: 4 });
    k.box([ankle[0] + 0.6, ankle[1] - 2.05, ankle[2]], [4.2, 0.45, 2.4], mix(o.boot, '#000000', 0.35), { hull: 0 });
    if (o.skirt) {
      const sk: V3[] = [[-1.2, 22.0, 3.6], [2.6, 20.6, 6.3], [4.2, 16.4, 7.0], [2.2, 14.6, 6.8], [-1.4, 15.4, 5.8], [-2.2, 18.6, 5.0]];
      k.slab(sk.flatMap((p) => [p[0], p[1]]), 0.6, o.skirt, [0, 0, 6.2], [0, 0.0, 0], { hull: 0.6 });
    }
    if (w.stage >= 1) k.decal([0.4, 10.6, 3.6, 10.6, 3.4, 12.0, 0.8, 12.6], mix(o.boot, '#3D3A34', 0.55), (x, y) => ({ p: [x, y, ankle[2] + 1.3], n: [0, 0, 1] }));
  }
}

// ---- arms and hands (rider's turn) ----

/** A hand closed round a bar along `axis` at p: the fingers wrapping it, the thumb over them, the back of the hand. */
export function fist(k: Kit, p: V3, axis: V3, back: V3, r = 0.9, skin: string = GT.SKIN, shade: string = GT.SKIN_SHADE): void {
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...axis).normalize());
  const t = new TorusGeometry(r, 0.8, 4, 6, Math.PI * 1.6);
  t.applyQuaternion(q);
  t.translate(p[0], p[1], p[2]);
  k.add(t, skin, { hull: 0.7 });
  const b = new Vector3(...back).normalize();
  k.ball([p[0] + b.x * r * 0.9, p[1] + b.y * r * 0.9, p[2] + b.z * r * 0.9], 1, shade, { detail: 0 });
  const top = new Vector3(...axis).normalize().multiplyScalar(1.1);
  k.rod([p[0] + b.x * 0.8 + top.x, p[1] + b.y * 0.8 + top.y, p[2] + b.z * 0.8 + top.z], [p[0] - b.x * 0.4 + top.x * 0.7, p[1] - b.y * 0.4 + top.y * 0.7, p[2] - b.z * 0.4 + top.z * 0.7 + 0.5], 0.4, skin, { r1: 0.34, seg: 5 });
}

/** An open hand (resting on a thigh or the reins): a flat palm and a thumb. */
export function openHand(k: Kit, p: V3, skin: string = GT.SKIN): void {
  k.ball(p, 1, skin, { detail: 0, s: [1.3, 0.9, 1.25] });
  k.rod([p[0] + 0.6, p[1] + 0.2, p[2] + 0.6], [p[0] + 1.2, p[1] + 0.6, p[2] + 1.2], 0.38, skin, { seg: 4 });
}

export interface ArmOpts { sleeve: string; cuff?: string; shoulder?: string; r?: number }

/**
 * An arm: the shoulder's cap, the upper arm, the elbow, the forearm and a cuff at the wrist, in the sleeve's colour
 * (a shoulder guard over the cap in `shoulder`).
 */
export function riderArm(k: Kit, shoulder: V3, elbow: V3, wrist: V3, o: ArmOpts): void {
  const r = o.r ?? 1;
  k.ball(shoulder, 1, o.sleeve, { s: [1.9 * r, 2.0 * r, 1.9 * r], detail: 0 });
  k.rod(shoulder, elbow, 1.45 * r, o.sleeve, { r1: 1.2 * r, seg: 6, caps: false });
  k.ball(elbow, 1.22 * r, mix(o.sleeve, '#000000', 0.12), { detail: 0 });
  k.rod(elbow, wrist, 1.25 * r, o.sleeve, { r1: 1.02 * r, seg: 6, caps: false });
  const d = new Vector3(...wrist).sub(new Vector3(...elbow)).normalize();
  const c0 = new Vector3(...wrist).addScaledVector(d, -1.4), c1 = new Vector3(...wrist).addScaledVector(d, -0.1);
  k.rod([c0.x, c0.y, c0.z], [c1.x, c1.y, c1.z], 1.2 * r, o.cuff ?? GT.LEATHER, { seg: 7, hull: 0.5 });
  if (o.shoulder) k.ball([shoulder[0], shoulder[1] + 0.5, shoulder[2]], 1, o.shoulder, { s: [2.4 * r, 1.5 * r, 2.3 * r], detail: 1, gloss: 0.35 });
}

/** The neck, from the collar to under the jaw. */
export function neck(k: Kit, skin: string = GT.SKIN): void {
  k.rod([0, 30.6, 0.1], [0, 35.2, 0.5], 1.6, skin, { seg: 7 });
}

// ---- faces ----

/** The head's front (the surface bareFace draws on), for marks added over the face. */
export function faceSurf(c: V3 = HEAD_C, r = HEAD_R): Surface {
  return headFront(c, [r * 1.12, r * 1.18, r]);
}

export interface SteppeFaceOpts {
  skin?: string;
  hair?: string;
  /** Grey in the moustache and the beard (an older man). */
  grey?: boolean;
  /** The cap is gone (broken): the shaved crown and the forelock show. */
  bare?: boolean;
  /** A thin beard on the chin, longer than the tuft. */
  beard?: boolean;
  /** Bare-headed, long loose hair of this colour instead of the shaved crown (a shaman). */
  long?: string;
}

export const STEPPE_SKIN = '#D9A273';
export const STEPPE_HAIR = '#1E1612';

/**
 * A steppe rider's grim face: bareFace with no beard over a weathered skin, a drooping moustache, a tuft on the chin,
 * braided loops behind the ears; bare-headed, a shaved crown with a forelock.
 */
export function steppeFace(k: Kit, w: Wear, o: SteppeFaceOpts = {}, c: V3 = HEAD_C, r = HEAD_R): void {
  const skin = o.skin ?? STEPPE_SKIN, hair = o.hair ?? STEPPE_HAIR;
  const f = r / 3.9;
  const fo: FaceOpts = { skin, beard: null, brow: hair, r };
  bareFace(k, c, w, fo);
  const s = faceSurf(c, r);
  const tache = o.grey ? mix(hair, '#BDB6AA', 0.55) : hair;
  // The moustache: from under the nose out past the mouth's corners and down.
  for (const sd of [-1, 1]) k.line([sd * 0.15 * f, -1.3 * f, sd * 1.05 * f, -1.5 * f, sd * 1.45 * f, -2.3 * f, sd * 1.5 * f, -2.9 * f], 0.42 * f, tache, s);
  // The chin: a tuft, or a thin beard.
  const jawZ = c[2] + 3.52 * f + 0.05;
  const jaw: Surface = (x, y) => ({ p: [x, y, jawZ], n: [0, 0, 1] });
  const cy = c[1] - 2.3 * f;
  if (o.beard) k.decal([c[0] - 0.75 * f, cy - 0.6 * f, c[0] + 0.75 * f, cy - 0.6 * f, c[0] + 0.45 * f, cy - 2.6 * f, c[0], cy - 3.3 * f, c[0] - 0.45 * f, cy - 2.6 * f], tache, jaw);
  else k.decal([c[0] - 0.45 * f, cy - 0.7 * f, c[0] + 0.45 * f, cy - 0.7 * f, c[0], cy - 1.9 * f], tache, jaw);
  if (o.beard) k.box([c[0], cy - 2.2 * f, jawZ - 0.6], [1.0 * f, 1.8 * f, 1.0], tache, { hull: 0.5 });
  // Braided loops behind the ears.
  for (const sd of [-1, 1]) {
    const top: V3 = [c[0] + sd * 4.0 * f, c[1] - 0.2 * f, c[2] - 0.9 * f];
    const low: V3 = [c[0] + sd * 4.3 * f, c[1] - 3.5 * f, c[2] - 0.4 * f];
    const back: V3 = [c[0] + sd * 4.0 * f, c[1] - 1.6 * f, c[2] - 1.9 * f];
    k.rod(top, low, 0.6 * f, hair, { seg: 4, r1: 0.5 * f });
    k.rod(low, back, 0.5 * f, hair, { seg: 4 });
    k.ball(low, 0.6 * f, GT.LEATHER_DARK, { detail: 0, hull: 0 });
  }
  if (o.bare && o.long) {
    // Long loose hair over the crown and down the back.
    k.dome([c[0], c[1] + 0.6 * f, c[2] - 0.4 * f], r * 1.16, o.long, { to: 1.1, seg: 10, hull: 0.8 });
    // Combed back from the brow in strands, a parting down the middle.
    const R = r * 1.16 + 0.06, cy = c[1] + 0.6 * f, cz = c[2] - 0.4 * f;
    const hs: Surface = (x, y) => {
      const dx = x - c[0], dy = y - cy, dz = Math.sqrt(Math.max(0.3, R * R - dx * dx - dy * dy));
      return { p: [x, y, cz + dz], n: [dx / R, dy / R, dz / R] };
    };
    const strand = mix(o.long, '#000000', 0.3);
    for (const x of [-2.6, -1.3, 0, 1.3, 2.6]) k.line([c[0] + x * 0.3, cy + R * 0.98, c[0] + x * 0.75, cy + R * 0.75, c[0] + x * 1.15, cy + R * 0.42], x === 0 ? 0.3 : 0.2, strand, hs);
    k.slab([-3.6, 0, 3.6, 0, 4.0, -6.6, 2.0, -5.6, 0.4, -7.4, -1.6, -5.8, -3.8, -6.8], 1.0, o.long, [c[0], c[1] + 1.0 * f, c[2] - 3.0 * f], [0.15, 0, 0], { hull: 0.6 });
  } else if (o.bare) {
    // The shaved crown, dark with stubble, and the forelock left long over the brow.
    k.dome([c[0], c[1] + 0.5 * f, c[2] - 0.3 * f], r * 1.14, mix(skin, hair, 0.42), { to: 1.05, seg: 10, hull: 0.8 });
    k.slab([-0.7, 0.3, 0.7, 0.3, 0.5, -1.3, 0, -1.8, -0.5, -1.2], 0.55, hair, [c[0] + 0.2, c[1] + 4.3 * f, c[2] + 2.0 * f], [-0.35, 0, 0.1], { hull: 0.5 });
  }
}

export const FACE_DEFAULTS = { skin: GT.SKIN, beard: GT.BEARD, brow: GT.BROW_HAIR };
