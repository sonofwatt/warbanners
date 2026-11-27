// Gritty's mounted units, detailed toon figures in the Hoplite's style (toonHoplite.ts, the rules in grittyToon.ts):
// the horseman, the knight, the horse archer, the Khan's guard and the sky caller. Each sits the shared Gritty horse
// (grittyHorse.ts) as the shared Gritty rider (grittyRider.ts), dressed and armed as its unit, with the same moving
// pieces as its Bright figure in figures.ts (the horse's LEGS and NECK, the RIDER, and the WEAPON and ARROW where the
// Bright one has them), so the gait, idle, strike and crouch code drives it unchanged.
import { Vector3 } from 'three';
import { H, Kit, mix } from './kit';
import type { V3 } from './kit';
import { dirt, groundDrops, scratches, smear, spear, tearPolys, worn } from './parts';
import type { Look, Wear } from './parts';
import { bareFace, GT, helmBroken } from './grittyToon';
import { grittyHorse } from './grittyHorse';
import type { Coat } from './grittyHorse';
import {
  fist, HEAD_C, HEAD_R, HUNCH, lapSkirt, MOUNT_YAW, neck, RIDER, RIDER_YAW, riderArm, riderLegs, SEAT, TIP_RIGHT,
  torso, torsoFront, turned, WEAPON,
} from './grittyRider';

export interface RiderOpts { look: Look; wear: Wear }
type Shadow = { rx: number; rz: number; x: number };
const WIDE: Shadow = { rx: 17, rz: 8.5, x: 0 };

const BOOT = '#4E3520';
/** A bay: brown with black points. */
const BAY: Coat = { coat: '#7B4A2B', shade: '#5E3820', mane: '#231A15', hoof: '#3A2E24', points: '#2A201B' };

/** Blood fallen under the horse. */
function hoofBlood(k: Kit, w: Wear): void {
  if (w.blood >= 1) groundDrops(k, 6, 9, true, w.blood >= 2);
}

/** Wear on a cloth coat's front: dirt, scuffs, a tear showing the shirt, blood. */
function coatWear(k: Kit, colour: string, w: Wear, under: string = '#CDBF9F'): void {
  const s = torsoFront(0.2, 1.04);
  if (worn(w, 1)) dirt(k, s, 1.8, 21.4, 3.2, colour);
  if (worn(w, 2)) scratches(k, s, [[-2.6, 26.6, -1.2, 25.4]], mix(colour, '#FFFFFF', 0.35), 0.3);
  if (worn(w, 3)) { const [lip, gap] = tearPolys(2.0, 25.2, 2.8, 2.6); k.decal(lip, mix(colour, '#000000', 0.5), s); k.decal(gap, under, s); }
  if (w.blood >= 1) smear(k, s, -1.8, 27.6, 0.15, -1, 3.6, 1.3);
  if (w.blood >= 2) smear(k, s, 1.0, 25.4, -0.2, -1, 3.4, 1.2);
}

// ---- the horseman: light cavalry, either side's ----

/** A soft padded cap, its crown falling back into a tail; battered, the tail torn short. */
function paddedCap(k: Kit, c: Look, w: Wear): void {
  const h = HEAD_C, cap = c.dark;
  k.dome([h[0], h[1] + 1.3, h[2] - 0.4], HEAD_R * 1.22, cap, { to: 1.25, seg: 10 });
  k.frustum([h[0], 0, h[2] - 0.4], h[1] + 2.0, h[1] + 3.0, HEAD_R * 1.25, HEAD_R * 1.2, mix(cap, '#000000', 0.25), { seg: 10, sz: 1 });
  const tailEnd: V3 = worn(w, 3) ? [h[0] + 3.0, h[1] + 3.0, h[2] - 3.6] : [h[0] + 4.6, h[1] + 0.2, h[2] - 4.6];
  k.rod([h[0] + 1.0, h[1] + 4.6, h[2] - 1.2], tailEnd, 1.7, cap, { r1: worn(w, 3) ? 1.1 : 0.45, seg: 6 });
  // Quilted seams over the crown.
  const s = (x: number, y: number): { p: V3; n: V3 } => {
    const r = HEAD_R * 1.22 + 0.08, cx = h[0], cy = h[1] + 1.3;
    const dx = x - cx, dy = y - cy, dz = Math.sqrt(Math.max(0.2, r * r - dx * dx - dy * dy));
    return { p: [x, y, h[2] - 0.4 + dz], n: [dx / r, dy / r, dz / r] };
  };
  for (const x of [-1.6, 0, 1.6]) k.line([h[0] + x * 1.2, h[1] + 3.2, h[0] + x * 0.6, h[1] + 5.2], 0.22, mix(cap, '#000000', 0.35), s);
  if (worn(w, 2)) dirt(k, s, h[0] - 2.0, h[1] + 3.6, 2.4, cap);
}

export function grittyHorseman(k: Kit, { look: c, wear: w }: RiderOpts): Shadow {
  turned(k, MOUNT_YAW, () => {
    grittyHorse(k, BAY, { cloth: c.dark, trim: c.accent }, w);
    riderLegs(k, { thigh: c.main, boot: BOOT }, w);
  });
  turned(k, RIDER_YAW, () => {
    k.pivot(RIDER, SEAT, () => {
      // A quilted coat in the owner's colour, belted, over breeches.
      lapSkirt(k, c.main);
      torso(k, c.main);
      const front = torsoFront(0.12);
      const seam = mix(c.main, '#000000', 0.3);
      for (const x of [-2.4, -0.8, 0.8, 2.4]) k.line([x, 23.0, x * 1.08, 29.6], 0.2, seam, front);
      k.line([-0.4, 30.6, 1.4, 27.0, 1.2, 22.6], 0.35, mix(c.main, '#000000', 0.45), front);
      k.frustum([0, 0, 0], 21.8, 23.0, 4.15, 4.05, GT.LEATHER_DARK, { sz: 0.8, seg: 10, open: true });
      k.box([0, 22.4, 3.3], [1.4, 1.2, 0.5], c.accent, { gloss: 0.5 });
      k.frustum([0, 0, 0.1], 30.6, 31.8, 3.5, 2.5, c.dark, { sz: 0.85, seg: 9 });
      coatWear(k, c.main, w);
      neck(k);
      // The left hand holds the reins over the pommel.
      riderArm(k, [-4.4, 30.2, 0.1], [-5.6, 26.0, 1.6], [-2.6, 23.6, 4.0], { sleeve: c.main, cuff: GT.LEATHER });
      fist(k, [-1.6, 23.2, 4.6], [1, 0, 0], [-0.2, 0.3, 1], 0.9);
      k.rod([-1.0, 23.0, 4.6], [1.7, 21.4, 2.8], 0.26, GT.LEATHER_DARK, { seg: 4, hull: 0 });
      // The right arm and the short spear, held high and pointing forward; the hand goes with the spear.
      riderArm(k, [4.4, 30.2, 0.1], [6.8, 26.4, 1.6], [5.6, 24.6, 3.6], { sleeve: c.main, cuff: GT.LEATHER });
      const butt: V3 = [2, H(-8), 4.4], top: V3 = [12.4, H(-31.6), 4.4];
      k.pivot(WEAPON, [5, H(-14.8), 4.4], () => {
        spear(k, butt, top, 5.6, { nick: worn(w, 2), snap: worn(w, 4) ? 0.6 : undefined, blood: w.blood }, 0.72);
        const ax = new Vector3(...top).sub(new Vector3(...butt)).normalize();
        fist(k, [5, H(-14.8), 4.4], [ax.x, ax.y, ax.z], [0.9, -0.3, 0.2], 1.0);
        // A pennon in the owner's colour under the head (torn short once battered).
        if (!worn(w, 4)) {
          const at = new Vector3(...butt).lerp(new Vector3(...top), 0.84);
          const tail = worn(w, 3) ? [0, 0, -2.8, -0.4, -2.0, -1.2, -3.2, -1.8, 0, -2.6] : [0, 0, -5.4, -0.9, -3.6, -1.5, -5.6, -2.3, 0, -2.6];
          k.slab(tail, 0.35, c.main, [at.x - 0.3, at.y + 0.6, at.z], [0, 0, 0.12], { hull: 0.5 });
        }
      }, { axis: TIP_RIGHT, fwd: [1, 0, 0] });
      // The face, and the cap over it; broken, the cap is gone and his hair shows.
      const bare = helmBroken(w);
      bareFace(k, HEAD_C, w, { r: HEAD_R, hair: bare ? '#3A2616' : null });
      if (!bare) paddedCap(k, c, w);
    }, { axis: HUNCH });
  });
  hoofBlood(k, w);
  return WIDE;
}
