// Gritty's mounted units, detailed toon figures in the Hoplite's style (toonHoplite.ts, the rules in grittyToon.ts):
// the horseman, the knight, the horse archer, the Khan's guard and the sky caller. Each sits the shared Gritty horse
// (grittyHorse.ts) as the shared Gritty rider (grittyRider.ts), dressed and armed as its unit, with the same moving
// pieces as its Bright figure in figures.ts (the horse's LEGS and NECK, the RIDER, and the WEAPON and ARROW where the
// Bright one has them), so the gait, idle, strike and crouch code drives it unchanged.
import { Vector3 } from 'three';
import { H, Kit, mix } from './kit';
import type { Surface, V3 } from './kit';
import { BLOOD, crack, dent, dirt, ell, groundDrops, scratches, smear, spear, tearPolys, worn } from './parts';
import type { Look, Wear } from './parts';
import { bareFace, crestBrush, GT, helmBroken, metalEdge, tornEdge, vivid } from './grittyToon';
import { drape, drapeSurf, flank, grittyHorse, HEAD_RINGS, loftPoint, loftSheet, NECK_RINGS, tearLine } from './grittyHorse';
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

// ---- the knight: heavy horse in steel, a lance and a caparison, either side's ----

const STEEL_G = '#A2A8AF';
const STEEL_G_DARK = '#666C74';
const MAIL = '#7C8188';
/** A grey. */
const GREY: Coat = { coat: '#A8A196', shade: '#88827A', mane: '#5E584F', hoof: '#3E352D' };

/** The knight's caparison: cloth over the whole horse to the knees, scalloped, a band and the owner's mark. */
function caparison(k: Kit, c: Look, w: Wear): void {
  const NX = 12, X0 = -14.4, X1 = 10.4, OFF = 0.4;
  const broken = helmBroken(w);
  // Broken (and scarred), a great piece is torn out of the near side, up to the flank; battered, one scallop rips.
  const tornCol = (i: number): boolean => broken && i >= 4 && i <= 6;
  const near = (t: number): number => {
    const j = Math.round(t * NX);
    if (broken && j >= 4 && j <= 7) return j === 4 || j === 7 ? 1.9 : 1.3;
    if (worn(w, 3) && j === 9) return 2.1;
    return j % 2 === 0 ? 2.85 : 2.6;
  };
  drape(k, c.main, { x0: X0, x1: X1, far: -2.0, near, nx: NX, nu: 6, off: OFF, hull: 0.7 });
  // The peytral: the cloth hanging across the front of the chest, scalloped like the rest.
  k.slab([-3.7, 16.6, 3.7, 16.6, 3.8, 7.0, 2.5, 7.8, 1.2, 6.6, 0, 7.8, -1.2, 6.6, -2.5, 7.8, -3.8, 7.0], 0.5, c.main, [10.5, 0, 0], [0, Math.PI / 2, 0], { hull: 0.7 });
  const ds = drapeSurf(OFF + 0.02);
  const colX = (i: number): number => X0 + ((X1 - X0) * i) / NX;
  // The band above the hem, broken where the cloth is torn away.
  for (let i = 0; i < NX; i++) if (!tornCol(i) && !(i === 3 && broken) && !(i === 7 && broken)) k.line([colX(i), 9.4, colX(i + 1), 9.4], 0.7, c.accent, ds);
  if (broken) {
    tearLine(k, ds, [colX(3), 9.2, colX(4) + 0.4, 12.6, colX(5), 13.8, colX(6), 13.2, colX(7) - 0.4, 12.4, colX(7) + 0.2, 9.4], c.main);
  }
  // The owner's mark on the flank: a ring and a bar in the trim colour.
  k.decal(ell(-9.6, 13.0, 2.3, 2.3, 12), c.accent, ds);
  k.decal(ell(-9.6, 13.0, 1.5, 1.5, 10), mix(c.main, '#000000', 0.25), ds);
  k.line([-9.6, 11.2, -9.6, 14.8], 0.6, c.accent, ds);
  // Wear on the cloth.
  if (worn(w, 1)) { dirt(k, ds, -5.0, 8.4, 4.6, c.main); dirt(k, ds, 6.0, 8.0, 3.6, c.main); }
  if (worn(w, 2)) scratches(k, ds, [[2.6, 15.0, 4.6, 13.0], [-12.0, 12.2, -10.4, 10.6]], mix(c.main, '#FFFFFF', 0.3), 0.3);
  if (worn(w, 3)) { const [lip, gap] = tearPolys(3.6, 12.0, 2.6, 2.4); k.decal(lip, mix(c.main, '#000000', 0.5), ds); k.decal(gap, GREY.coat, ds); }
  if (w.blood >= 1) { smear(k, ds, 6.4, 15.4, 0.2, -1, 4.4, 1.5); smear(k, ds, -12.6, 15.2, 0.2, -1, 3.2, 1.2); }
  if (w.blood >= 2) { smear(k, ds, 1.2, 13.4, -0.2, -1, 4.0, 1.4); k.decal(ell(-3.0, 8.4, 0.8, 0.6, 6), BLOOD, ds); }
  if (w.scarred === true && w.blood === 0) k.line([-10.4, 16.2, -8.6, 14.2], 0.45, mix(GREY.coat, '#F2E8DA', 0.55), flank(0.06));
}

/** The crinet (cloth over the neck) and the chanfron (a steel plate down the face). */
function knightNeck(k: Kit, c: Look, w: Wear): void {
  const torn = worn(w, 3);
  loftSheet(k, NECK_RINGS, {
    t0: 0.0, t1: 0.9, far: -2.3, cols: 4, rows: 5,
    near: (j) => (torn && j === 2 ? 1.5 : 2.5),
    lift: () => 0.35, colour: () => c.main,
  });
  if (!helmBroken(w)) {
    loftSheet(k, HEAD_RINGS, { t0: 0.16, t1: 0.8, far: -0.95, cols: 3, rows: 2, near: () => 0.95, lift: () => 0.28, colour: () => STEEL_G, gloss: 0.5, hull: 0.5 });
    metalEdge(k, [loftPoint(HEAD_RINGS, 0.16, 0, 0.45), loftPoint(HEAD_RINGS, 0.8, 0, 0.45)], 0.24, GT.GOLD_EDGE);
    k.rod(loftPoint(HEAD_RINGS, 0.2, 0, 0.3), loftPoint(HEAD_RINGS, 0.12, 0, 2.6), 0.55, STEEL_G, { r1: 0.06, seg: 5, gloss: 0.5 });
    if (worn(w, 2)) k.decal(ell(0, 0, 0.5, 0.4, 6), STEEL_G_DARK, (x, y) => ({ p: [loftPoint(HEAD_RINGS, 0.5, 0.5, 0.42)[0] + x, loftPoint(HEAD_RINGS, 0.5, 0.5, 0.42)[1] + y, loftPoint(HEAD_RINGS, 0.5, 0.5, 0.42)[2]], n: [0, 0.3, 1] }));
  }
}

/** The great helm: a flat-topped steel pot, eye slits, a cross of reinforcing bands, breaths, a combed crest. */
function greatHelm(k: Kit, c: Look, w: Wear): void {
  const h = HEAD_C, R = 4.55;
  const open = helmBroken(w);
  const y0 = h[1] - 3.9, y1 = h[1] + 3.0;
  if (open) {
    // The face plate is torn away: the back of the pot stays, a dark torn edge down each side, his face beneath.
    bareFace(k, h, w, { r: HEAD_R });
    const a0 = Math.PI / 2 + 0.35, len = Math.PI - 0.7;
    k.frustum([h[0], 0, h[2] - 0.2], y0 + 0.6, y1, R, R - 0.1, STEEL_G, { seg: 10, arc: [a0, len], gloss: 0.45 });
    // The brow of the pot still hangs on across the front, torn along its lower edge.
    const yb = h[1] + 2.0;
    k.frustum([h[0], 0, h[2] - 0.2], yb, y1, R, R - 0.1, STEEL_G, { seg: 10, arc: [a0 + len - Math.PI * 2, Math.PI * 2 - len], gloss: 0.45 });
    const rim = (a: number, y: number): V3 => [h[0] + Math.sin(a) * (R + 0.06), y, h[2] - 0.2 + Math.cos(a) * (R + 0.06)];
    const tear: V3[] = [];
    const jag = [0.2, 0.9, 0.1, 0.7, -0.1, 0.8, 0.0, 0.6, 0.2];
    for (let i = 0; i <= 8; i++) tear.push(rim(-(Math.PI / 2 + 0.35) + (i / 8) * (Math.PI + 0.7), yb + jag[i]! * 0.6));
    tornEdge(k, tear, 0.28);
    for (const a of [a0, a0 + len]) tornEdge(k, [rim(a, yb), rim(a + 0.05, h[1] + 0.4), rim(a - 0.04, h[1] - 1.6), rim(a, y0 + 0.8)], 0.26);
  } else {
    k.ball(h, 1, GT.DARK_IN, { detail: 0, hull: 0, s: [4.0, 4.0, 3.6] });
    k.frustum([h[0], 0, h[2] - 0.2], y0, y1, R, R - 0.1, STEEL_G, { seg: 10, gloss: 0.45 });
    const fz = h[2] - 0.2 + (R - 0.05) * Math.cos(Math.PI / 10);
    const front: Surface = (x, y) => ({ p: [x, y, fz + 0.02], n: [0, 0, 1] });
    for (const sd of [-1, 1]) k.box([h[0] + sd * 1.75, h[1] + 0.9, fz], [2.5, 0.75, 0.5], '#0E0B09', { hull: 0 });
    k.box([h[0], h[1] - 0.9, fz + 0.15], [0.9, 5.4, 0.45], GT.GOLD_EDGE, { hull: 0, gloss: 0.6 });
    k.line([h[0] - 3.6, h[1] + 1.65, h[0] + 3.6, h[1] + 1.65], 0.5, GT.GOLD_EDGE, front);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) k.decal(ell(h[0] - 1.7 - i * 0.75, h[1] - 1.6 - j * 0.9, 0.2, 0.2, 5), '#0E0B09', front);
    if (worn(w, 1)) scratches(k, front, [[h[0] + 1.6, h[1] + 2.6, h[0] + 3.0, h[1] + 1.9], [h[0] - 3.2, h[1] - 2.4, h[0] - 2.0, h[1] - 3.2]], '#D6D8DA', 0.25);
    if (worn(w, 2)) dent(k, front, h[0] + 2.3, h[1] - 1.4, 0.75, STEEL_G);
    if (worn(w, 3)) crack(k, front, [h[0] + 3.4, h[1] + 0.2, h[0] + 2.6, h[1] - 1.2, h[0] + 3.2, h[1] - 2.6], 0.25);
    if (w.blood >= 1) smear(k, front, h[0] - 2.4, h[1] + 0.4, 0, -1, 2.6, 0.9);
  }
  k.frustum([h[0], 0, h[2] - 0.2], y1, y1 + 1.0, R - 0.1, R - 1.3, STEEL_G, { seg: 10, gloss: 0.45 });
  k.frustum([h[0], 0, h[2] - 0.2], y1 - 0.25, y1 + 0.25, R + 0.05, R + 0.05, GT.GOLD_EDGE, { seg: 10, hull: 0, gloss: 0.6 });
  crestBrush(k, { root: [h[0], y1 + 0.9, h[2] - 0.6], colour: vivid(c.main), shorn: worn(w, 3), length: 5.2, height: 4.6, thick: 1.05 });
}

export function grittyKnight(k: Kit, { look: c, wear: w }: RiderOpts): Shadow {
  turned(k, MOUNT_YAW, () => {
    grittyHorse(k, GREY, { cloth: c.main, trim: c.accent, noCloth: true }, w, { covered: true, noMane: true, neck: () => knightNeck(k, c, w) });
    caparison(k, c, w);
    riderLegs(k, { thigh: MAIL, boot: STEEL_G_DARK, greave: STEEL_G, iron: STEEL_G_DARK }, w);
  });
  turned(k, RIDER_YAW, () => {
    k.pivot(RIDER, SEAT, () => {
      // Mail under a surcoat in the owner's colour, belted; steel on the shoulders.
      lapSkirt(k, c.main, { r0: 5.8 });
      torso(k, MAIL);
      torso(k, c.main, { grow: 1.04 });
      const front = torsoFront(0.22, 1.04);
      k.line([0, 22.8, 0, 30.4], 1.2, c.accent, front);
      k.line([-2.6, 28.2, 2.6, 28.2], 1.0, c.accent, front);
      k.frustum([0, 0, 0], 22.0, 23.2, 4.25, 4.15, GT.LEATHER_DARK, { sz: 0.8, seg: 10, open: true });
      k.frustum([0, 0, 0.1], 30.6, 33.6, 3.3, 2.3, MAIL, { sz: 0.9, seg: 9 });
      coatWear(k, c.main, w, MAIL);
      // The pauldrons; broken (and since), the left one is gone.
      const lost = helmBroken(w);
      for (const sd of [1, -1]) {
        if (sd < 0 && lost) continue;
        k.ball([sd * 4.5, 30.9, 0.1], 1, STEEL_G, { s: [2.6, 1.7, 2.5], detail: 1, gloss: 0.45 });
        metalEdge(k, [[sd * 2.6, 30.0, 2.3], [sd * 5.2, 29.4, 2.4], [sd * 6.6, 29.2, 0.6]], 0.22);
      }
      // The left hand on the reins, the right arm couching the lance under it.
      riderArm(k, [-4.4, 30.2, 0.1], [-5.8, 26.2, 1.8], [-2.8, 23.8, 4.4], { sleeve: MAIL, cuff: STEEL_G });
      fist(k, [-1.9, 23.6, 4.9], [1, 0, 0], [-0.2, 0.3, 1], 0.95, STEEL_G, STEEL_G_DARK);
      k.rod([-1.3, 23.4, 4.9], [1.7, 21.4, 2.8], 0.26, GT.LEATHER_DARK, { seg: 4, hull: 0 });
      riderArm(k, [4.4, 30.2, 0.1], [5.6, 26.4, 3.0], [0.8, 27.0, 5.4], { sleeve: MAIL, cuff: STEEL_G });
      const butt: V3 = [-12, H(-8), 5.6], tip: V3 = [16.2, H(-32.4), 5.6], grip: V3 = [-1, H(-17.4), 5.6];
      k.pivot(WEAPON, grip, () => {
        const ax = new Vector3(...tip).sub(new Vector3(...butt)).normalize();
        fist(k, grip, [ax.x, ax.y, ax.z], [0.2, 0.6, 0.8], 1.05, STEEL_G, STEEL_G_DARK);
        if (worn(w, 4)) spear(k, butt, tip, 6, { snap: 0.55, blood: w.blood }, 1.0, GT.LEATHER);
        else {
          k.rod(butt, tip, 1.0, GT.LEATHER, { r1: 0.8, seg: 7 });
          // Painted bands of the owner's colour down the shaft.
          for (const t of [0.5, 0.62, 0.74]) {
            const a = new Vector3(...butt).lerp(new Vector3(...tip), t), b = new Vector3(...butt).lerp(new Vector3(...tip), t + 0.05);
            k.rod([a.x, a.y, a.z], [b.x, b.y, b.z], 0.98 - t * 0.2, c.main, { seg: 7, hull: 0, caps: false });
          }
          const head = new Vector3(...tip).addScaledVector(ax, 4.2);
          k.rod(tip, [head.x, head.y, head.z], 1.3, STEEL_G, { r1: 0.05, seg: 6, gloss: 0.6 });
          if (worn(w, 2)) k.ball([tip[0] + 1.2, tip[1] + 1.4, tip[2] + 0.6], 0.35, STEEL_G_DARK, { detail: 0, hull: 0 });
          if (w.blood >= 1) k.rod(tip, [head.x - ax.x * 1.2, head.y - ax.y * 1.2, head.z - ax.z * 1.2], 1.38, BLOOD, { r1: 0.4, seg: 6, hull: 0 });
          // The pennon below the head: a swallowtail in the owner's colour (torn once battered).
          const at = new Vector3(...butt).lerp(new Vector3(...tip), 0.9);
          const tail = worn(w, 3) ? [0, 0, -3.2, -0.6, -2.4, -1.4, -3.6, -2.2, 0, -2.8] : [0, 0, -6.4, -0.8, -4.4, -1.6, -6.6, -2.6, 0, -3.0];
          k.slab(tail, 0.35, c.main, [at.x - 0.4, at.y + 0.4, at.z], [0, 0, 0.16], { hull: 0.5 });
        }
        // The vamplate: a steel cone guarding the hand.
        const v0 = new Vector3(...grip).addScaledVector(ax, 1.3), v1 = new Vector3(...grip).addScaledVector(ax, 3.2);
        k.rod([v0.x, v0.y, v0.z], [v1.x, v1.y, v1.z], 2.3, STEEL_G, { r1: 1.0, seg: 8, gloss: 0.5 });
      }, { axis: TIP_RIGHT, fwd: [1, 0, 0] });
      greatHelm(k, c, w);
    }, { axis: HUNCH });
  });
  hoofBlood(k, w);
  return WIDE;
}
