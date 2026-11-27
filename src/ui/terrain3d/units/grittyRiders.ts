// Gritty's mounted units, detailed toon figures in the Hoplite's style (toonHoplite.ts, the rules in grittyToon.ts):
// the horseman, the knight, the horse archer, the Khan's guard and the sky caller. Each sits the shared Gritty horse
// (grittyHorse.ts) as the shared Gritty rider (grittyRider.ts), dressed and armed as its unit, with the same moving
// pieces as its Bright figure in figures.ts (the horse's LEGS and NECK, the RIDER, and the WEAPON and ARROW where the
// Bright one has them), so the gait, idle, strike and crouch code drives it unchanged.
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { hairCap } from './grittyBody';
import { flat, H, Kit, mix } from './kit';
import type { Surface, V3 } from './kit';
import { BLOOD, crack, dent, dirt, discPoly, ell, groundDrops, scratches, smear, spear, tearPolys, worn } from './parts';
import type { Cut } from './parts';
import type { Look, Wear } from './parts';
import { bareFace, crestBrush, GT, helmBroken, metalEdge, plate, tornEdge, vivid } from './grittyToon';
import { drape, drapeSurf, flank, grittyHorse, HEAD_RINGS, loftPoint, loftSheet, NECK_RINGS, patch, section, tearLine } from './grittyHorse';
import type { Coat } from './grittyHorse';
import {
  ARROW, DRAW_BACK, fist, HEAD_C, HEAD_R, HUNCH, lapSkirt, MOUNT_YAW, neck, RIDER, RIDER_YAW, riderArm, riderLegs, SEAT,
  STEPPE_SKIN, steppeFace, TIP_RIGHT, torso, torsoFront, turned, WEAPON,
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
//
// A light rider of the open steppe, whoever's pay he takes: a quilted coat in the owner's colour, a sash, a felt cap
// with a turned-up fur brim and ear flaps (rounded, not the horse archer's tall cone), a small round hide shield on the
// left arm painted with the owner's colour, a curved sabre hung at the near side, a short spear with a pennon. Broken,
// the cap is gone: cropped dark hair with a tail tied at the nape.

const HAIR_H = '#2C1E15';
const FUR_H = '#76563A';

/** A felt cap with a fur brim turned up all round and ear flaps hanging; battered, the near flap is torn off. */
function riderCap(k: Kit, c: Look, w: Wear): void {
  const h = HEAD_C, felt = c.dark;
  // The crown: a rounded dome of felt, a little peaked, quilted down its front.
  k.dome([h[0], h[1] + 1.6, h[2] - 0.4], HEAD_R * 1.16, felt, { to: 1.3, seg: 10, s: [1, 1.22, 1] });
  const s = (x: number, y: number): { p: V3; n: V3 } => {
    const r = HEAD_R * 1.16 + 0.08, cx = h[0], cy = h[1] + 1.6;
    const dx = x - cx, dy = (y - cy) / 1.22, dz = Math.sqrt(Math.max(0.2, r * r - dx * dx - dy * dy));
    return { p: [x, y, h[2] - 0.4 + dz], n: [dx / r, dy / r, dz / r] };
  };
  for (const x of [-1.5, 0, 1.5]) k.line([h[0] + x * 1.25, h[1] + 3.6, h[0] + x * 0.45, h[1] + 6.0], 0.22, mix(felt, '#000000', 0.35), s);
  k.ball([h[0], h[1] + 6.3, h[2] - 0.4], 0.6, mix(felt, '#000000', 0.2), { detail: 0, hull: 0.4 });
  // The fur brim turned up round the head, tufted light and dark at the front.
  k.frustum([h[0], 0, h[2] - 0.6], h[1] + 2.0, h[1] + 3.9, HEAD_R * 1.2, HEAD_R * 1.32, FUR_H, { seg: 12 });
  const fs = (x: number, y: number): { p: V3; n: V3 } => {
    const r = HEAD_R * 1.28 + 0.1, dx = Math.max(-r * 0.95, Math.min(r * 0.95, x - h[0])), dz = Math.sqrt(r * r - dx * dx);
    return { p: [x, y, h[2] - 0.6 + dz], n: [dx / r, 0.15, dz / r] };
  };
  for (let i = 0; i < 7; i++) {
    const x = h[0] - 3.3 + i * 1.1;
    k.line([x, h[1] + 2.2, x + 0.25, h[1] + 3.6], 0.32, i % 2 ? '#9A7A58' : '#4A3220', fs);
  }
  // Ear flaps of fur-lined felt hanging over the ears (the near one, his left, torn off once battered).
  for (const sd of [-1, 1]) {
    if (sd < 0 && worn(w, 3)) continue;
    k.slab([-1.3, 0, 1.3, 0, 1.0, -3.4, 0, -4.2, -1.0, -3.4], 0.55, FUR_H, [h[0] + sd * HEAD_R * 1.1, h[1] + 2.0, h[2] - 1.5], [0, sd * Math.PI / 2, sd * 0.12], { hull: 0.5 });
  }
  if (worn(w, 2)) dirt(k, s, h[0] - 1.6, h[1] + 4.2, 2.2, felt);
}

/** A small round hide shield on the left forearm, facing out: the owner's colour in a ring round an iron boss. */
function buckler(k: Kit, c: Look, w: Wear, at: V3, rot: V3): void {
  k.frame(at, rot, () => {
    const R = 3.4, hide = '#8A6A44';
    const rim = worn(w, 3) ? [0.0, 0.62, 1.0, 1.0, 0.7, 1.0, 1.0, 0.86, 1.0, 1.0, 1.0, 1.0] : null;
    const ring: number[] = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r = R * (rim ? rim[i]! : 1); ring.push(Math.cos(a) * r, Math.sin(a) * r); }
    k.slab(ring, 0.6, hide, [0, 0, 0], [0, 0, 0], { gloss: 0.2 });
    const face: Surface = (x, y) => ({ p: [x, y, 0.31], n: [0, 0, 1] });
    k.decal(ell(0, 0, R * 0.8, R * 0.8, 12), c.main, face);
    k.decal(ell(0, 0, R * 0.5, R * 0.5, 10), hide, face);
    k.line([...ell(0, 0, R * 0.93, R * 0.93, 12), R * 0.93, 0], 0.3, GT.LEATHER_DARK, face);
    k.ball([0, 0, 0.4], 1.0, '#7E7A72', { detail: 0, gloss: 0.5, s: [1, 1, 0.6], hull: 0.5 });
    if (worn(w, 1)) scratches(k, face, [[1.0, 1.8, 2.4, 0.8]], '#D9CBAA', 0.22);
    if (worn(w, 2)) k.ball([-1.6, -1.2, 0.34], 0.35, '#2A1E14', { detail: 0, hull: 0 });
    if (w.blood >= 1) smear(k, face, -0.6, 1.8, 0.1, -1, 2.4, 0.9);
  });
}

export function grittyHorseman(k: Kit, { look: c, wear: w }: RiderOpts): Shadow {
  turned(k, MOUNT_YAW, () => {
    grittyHorse(k, BAY, { cloth: c.dark, trim: c.accent }, w);
    riderLegs(k, { thigh: c.main, boot: BOOT, upturned: true }, w);
    // The sabre hung from the saddle on the near side, curving back, its hilt forward under his thigh.
    const sab = [[-0.6, 19.0, 5.2], [-2.0, 16.6, 5.6], [-3.0, 14.0, 5.7], [-3.4, 11.6, 5.6]] as const;
    for (let i = 0; i + 1 < sab.length; i++) k.rod([...sab[i]!], [...sab[i + 1]!], 0.62 - i * 0.06, GT.LEATHER_DARK, { seg: 5, caps: i === sab.length - 2 });
    k.rod([-3.4, 11.6, 5.6], [-3.4, 11.0, 5.55], 0.48, GT.AGED, { seg: 5, hull: 0.4, gloss: 0.5 });
    k.rod([-0.4, 19.4, 5.2], [0.6, 21.2, 5.1], 0.42, GT.LEATHER, { seg: 4 });
    k.rod([-1.3, 19.4, 5.25], [0.5, 18.6, 5.25], 0.3, GT.AGED, { seg: 4, gloss: 0.5 });
  });
  turned(k, RIDER_YAW, () => {
    k.pivot(RIDER, SEAT, () => {
      // A quilted coat in the owner's colour, a sash of the trim round the waist, over breeches.
      lapSkirt(k, c.main);
      torso(k, c.main);
      const front = torsoFront(0.12);
      const seam = mix(c.main, '#000000', 0.3);
      for (const x of [-2.4, -0.8, 0.8, 2.4]) k.line([x, 23.6, x * 1.08, 29.6], 0.2, seam, front);
      k.line([-0.4, 30.6, 1.4, 27.0, 1.2, 23.4], 0.35, mix(c.main, '#000000', 0.45), front);
      k.frustum([0, 0, 0], 21.6, 23.4, 4.2, 4.1, c.accent, { sz: 0.8, seg: 10, open: true, hull: 0.5 });
      k.slab([0, 0, 1.0, 0, 1.3, -3.6, 0.5, -3.2, -0.2, -4.0], 0.45, c.accent, [3.2, 22.0, 2.8], [0, 0.6, -0.15], { hull: 0.5 });
      // A leather baldric over the right shoulder.
      k.line([2.6, 31.0, 0.4, 27.4, -2.6, 23.6], 0.7, GT.LEATHER_DARK, torsoFront(0.2));
      k.frustum([0, 0, 0.1], 30.6, 31.8, 3.5, 2.5, FUR_H, { sz: 0.85, seg: 9 });
      coatWear(k, c.main, w);
      neck(k);
      // The left hand holds the reins over the pommel, the shield on its forearm.
      riderArm(k, [-4.4, 30.2, 0.1], [-5.6, 26.0, 1.6], [-2.6, 23.6, 4.0], { sleeve: c.main, cuff: GT.LEATHER });
      fist(k, [-1.6, 23.2, 4.6], [1, 0, 0], [-0.2, 0.3, 1], 0.9);
      k.rod([-1.0, 23.0, 4.6], [1.7, 21.4, 2.8], 0.26, GT.LEATHER_DARK, { seg: 4, hull: 0 });
      buckler(k, c, w, [-5.6, 24.6, 3.4], [0.1, -0.75, 0]);
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
      // The face, and the cap over it; broken, the cap is gone: cropped hair, a tail tied at the nape.
      const bare = helmBroken(w);
      bareFace(k, HEAD_C, w, { r: HEAD_R, beard: '#3A2616' });
      if (bare) {
        hairCap(k, HEAD_C, HEAD_R, HAIR_H);
        const h = HEAD_C;
        k.ball([h[0], h[1] + 0.4, h[2] - 4.1], 0.75, GT.LEATHER_DARK, { detail: 0, hull: 0.4 });
        k.rod([h[0], h[1] + 0.2, h[2] - 4.3], [h[0] + 0.3, h[1] - 4.2, h[2] - 4.9], 0.75, HAIR_H, { r1: 0.25, seg: 5 });
      } else riderCap(k, c, w);
    }, { axis: HUNCH });
  });
  hoofBlood(k, w);
  return WIDE;
}

// ---- the knight: heavy horse in steel, a lance and a caparison, either side's ----

const STEEL_G = '#A2A8AF';
const STEEL_G_DARK = '#666C74';
const MAIL = '#7C8188';
/** The chanfron's blackened steel. */
const CHANFRON = '#3F444B';
/** A grey. */
const GREY: Coat = { coat: '#A8A196', shade: '#88827A', mane: '#5E584F', hoof: '#3E352D' };

/** The knight's caparison: cloth over the whole horse to the knees, scalloped, a band and the owner's mark. */
function caparison(k: Kit, c: Look, w: Wear): void {
  const NX = 12, X0 = -14.4, X1 = 10.4, OFF = 0.75;
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
  peytral(k, c.main, w);
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

/**
 * The peytral: the cloth round the front of the chest, curved over it from flank to flank (outside the caparison's
 * front edge and the chest, so no coat shows between them), hanging to a scalloped hem; battered, a scallop rips.
 */
function peytral(k: Kit, colour: string, w: Wear): void {
  const N = 8, CX = 8.4, RX = 3.6, RZ = 5.05, TOP = 18.6;
  const hem = (i: number): number => (worn(w, 3) && i === 3 ? 9.6 : i % 2 === 0 ? 6.8 : 7.8);
  const at = (i: number, y: number): Vector3 => {
    const a = -Math.PI / 2 + (Math.PI * i) / N;
    return new Vector3(CX + Math.cos(a) * RX, y, Math.sin(a) * RZ);
  };
  const pos: number[] = [];
  for (let i = 0; i < N; i++) {
    const mid = (hem(i) + hem(i + 1)) / 2 + 3.4;
    const quads = [[at(i, TOP), at(i + 1, TOP), at(i, mid), at(i + 1, mid)], [at(i, mid), at(i + 1, mid), at(i, hem(i)), at(i + 1, hem(i + 1))]];
    for (const [a, b, cc, d] of quads) {
      for (const tri of [[a!, cc!, d!], [a!, d!, b!]] as const) {
        const n = tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0]));
        const m = tri[0].clone().add(tri[1]).add(tri[2]).multiplyScalar(1 / 3);
        const vs = n.dot(new Vector3(m.x - CX, 0, m.z)) >= 0 ? tri : [tri[0], tri[2], tri[1]];
        for (const v of vs) pos.push(v.x, v.y, v.z);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  k.add(g, colour, { gloss: 0.1, hull: 0.7 });
}

/**
 * The knight's heater shield on his left forearm: the owner's colour with the owner's mark (the caparison's ring and
 * bar) in the trim, a dark steel rim. Scuffed, scratched; dented, dented; battered, a chip out of its edge; broken
 * (and since), its point split away along a dark torn edge.
 */
function heater(k: Kit, c: Look, w: Wear, at: V3, rot: V3): void {
  k.frame(at, rot, () => {
    const split = helmBroken(w), chip = worn(w, 3);
    const outline = split
      ? [-3.0, 3.6, 3.0, 3.6, 3.0, 0.6, 2.4, -0.9, 1.2, -0.3, 0.3, -1.4, -0.8, -0.6, -1.9, -1.6, -2.8, -0.2]
      : [-3.0, 3.6, chip ? 1.9 : 3.0, 3.6, ...(chip ? [2.3, 2.7, 3.0, 2.5] : []), 3.0, 0.6, 2.5, -1.7, 1.4, -3.3, 0, -4.4, -1.4, -3.3, -2.5, -1.7, -3.0, 0.6];
    const steel = '#4A4F57';
    k.slab(outline, 0.7, steel, [0, 0, 0], [0, 0, 0], { gloss: 0.45 });
    const inset = outline.map((v, i) => (i % 2 === 0 ? v * 0.84 : v * 0.86 + 0.06));
    const face: Surface = (x, y) => ({ p: [x, y, 0.36], n: [0, 0, 1] });
    k.decal(inset, c.main, face);
    const mark = mix(c.accent, '#8A4A12', 0.15);
    k.decal(ell(0, 0.8, 1.5, 1.5, 10), mark, face);
    k.decal(ell(0, 0.8, 0.95, 0.95, 10), mix(c.main, '#000000', 0.25), face);
    k.line([0, -0.5, 0, 2.1], 0.45, mark, face);
    if (split) tornEdge(k, [[2.4, -0.9, 0.4], [1.2, -0.3, 0.4], [0.3, -1.4, 0.4], [-0.8, -0.6, 0.4], [-1.9, -1.6, 0.4], [-2.8, -0.2, 0.4]], 0.22);
    if (worn(w, 1)) scratches(k, face, [[-2.0, 2.6, -0.6, 1.4], [1.2, -0.4, 2.2, -1.2]], mix(c.main, '#FFFFFF', 0.35), 0.2);
    if (worn(w, 2)) k.decal(ell(-1.6, 1.4, 0.5, 0.4, 6), mix(c.main, '#000000', 0.45), face);
    if (w.blood >= 1) smear(k, face, 1.4, 2.8, 0.1, -1, 2.6, 0.9);
  });
}

/** The crinet (cloth wrapped right round the neck, so no coat shows between it and the peytral) and the chanfron (a steel plate down the face). */
function knightNeck(k: Kit, c: Look, w: Wear): void {
  const torn = worn(w, 3);
  loftSheet(k, NECK_RINGS, {
    t0: 0.0, t1: 0.9, far: -3.1, cols: 4, rows: 8,
    near: (j) => (torn && j === 2 ? 1.5 : 3.1),
    lift: () => 0.8, colour: () => c.main,
  });
  if (!helmBroken(w)) {
    // Blackened steel, so it stands off the grey coat, wrapped well down the near cheek, gold along its edges and
    // down its ridge, a spike on the brow and the owner's colour in a disc on the cheek.
    const NEAR = 1.75, FAR = -1.2;
    loftSheet(k, HEAD_RINGS, { t0: 0.16, t1: 0.84, far: FAR, cols: 3, rows: 3, near: () => NEAR, lift: () => 0.3, colour: () => CHANFRON, gloss: 0.55, hull: 0.6 });
    metalEdge(k, [loftPoint(HEAD_RINGS, 0.16, 0, 0.48), loftPoint(HEAD_RINGS, 0.84, 0, 0.48)], 0.26, GT.GOLD_EDGE);
    metalEdge(k, [0.16, 0.39, 0.62, 0.84].map((t) => loftPoint(HEAD_RINGS, t, NEAR, 0.36)), 0.22, GT.GOLD_EDGE);
    metalEdge(k, [loftPoint(HEAD_RINGS, 0.17, FAR, 0.36), loftPoint(HEAD_RINGS, 0.17, 0.2, 0.42), loftPoint(HEAD_RINGS, 0.17, NEAR, 0.36)], 0.22, GT.GOLD_EDGE);
    k.rod(loftPoint(HEAD_RINGS, 0.2, 0, 0.3), loftPoint(HEAD_RINGS, 0.12, 0, 2.8), 0.6, STEEL_G, { r1: 0.06, seg: 5, gloss: 0.5 });
    const cheek = loftPoint(HEAD_RINGS, 0.36, 1.15, 0.5);
    k.decal(ell(0, 0, 0.75, 0.75, 8), c.main, (x, y) => ({ p: [cheek[0] + x, cheek[1] + y, cheek[2]], n: [0, 0.2, 1] }));
    if (worn(w, 1)) k.line([0, 0, 0.9, -0.5], 0.2, '#C9CCD0', (x, y) => { const q = loftPoint(HEAD_RINGS, 0.6, 0.9, 0.46); return { p: [q[0] + x, q[1] + y, q[2]], n: [0, 0.3, 1] }; });
    if (worn(w, 2)) k.decal(ell(0, 0, 0.5, 0.4, 6), mix(CHANFRON, '#000000', 0.4), (x, y) => ({ p: [loftPoint(HEAD_RINGS, 0.5, 0.5, 0.45)[0] + x, loftPoint(HEAD_RINGS, 0.5, 0.5, 0.45)[1] + y, loftPoint(HEAD_RINGS, 0.5, 0.5, 0.45)[2]], n: [0, 0.3, 1] }));
  }
}

/** How far the knight's crest is turned across the helm (about the vertical). */
const CREST_TURN = 0.6;

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
  // The crest, turned a little across the helm so the game's camera sees its face and not only its edge, and thick.
  k.frame([h[0], 0, h[2] - 0.6], [0, CREST_TURN, 0], () => {
    crestBrush(k, { root: [0, y1 + 0.9, 0], colour: vivid(c.main), shorn: worn(w, 3), length: 5.6, height: 5.2, thick: 1.7 });
  });
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
      heater(k, c, w, [-6.3, 25.0, 3.0], [0.12, -0.8, 0.05]);
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

// ---- the Mongols: a deel, steppe caps and helms, steppe faces ----

const FUR_G = '#6B4A2E';
const FELT_BOOT = '#3B2A1E';
const STRING_G = '#E6DFD0';
/** A dun: sandy, with black points and a dark stripe down the back. */
const DUN_G: Coat = { coat: '#B48A57', shade: '#8E6A40', mane: '#2A201B', hoof: '#3A2E24', points: '#2E241C', stripe: '#5A4128' };
/** A black. */
const BLACK_G: Coat = { coat: '#4A3C35', shade: '#30261F', mane: '#17110E', hoof: '#211A15' };
/** The Khan's guard's plumes: pale undyed horsehair, bright against the black horse and the dark lacquer. */
const GUARD_PLUME = '#E4DAC4';
/** A pale piebald. */
const PALE_G: Coat = { coat: '#D8CFBF', shade: '#B2A895', mane: '#4E3A2C', hoof: '#7A6652' };

/**
 * The deel: the steppe coat, its right flap crossing over the chest to close under the right arm, the edge and collar
 * trimmed, a broad sash round the waist with its ends hanging at the left hip.
 */
function deel(k: Kit, c: Look, w: Wear, o: { coat?: string; trim?: string; sash?: string; grow?: number } = {}): void {
  const coat = o.coat ?? c.main, trim = o.trim ?? c.accent, sash = o.sash ?? c.accent;
  lapSkirt(k, coat, { r0: 6.0, y0: 17.4 });
  torso(k, coat, { grow: o.grow ?? 1 });
  const front = torsoFront(0.18, o.grow ?? 1);
  k.line([-1.4, 31.4, 1.2, 29.6, 3.3, 27.6, 3.5, 23.6], 0.75, trim, front);
  k.frustum([0, 0, 0.1], 30.6, 32.0, 3.5, 2.6, trim, { sz: 0.85, seg: 9 });
  k.frustum([0, 0, 0], 21.6, 23.8, 4.25, 4.1, sash, { sz: 0.8, seg: 10, open: true, hull: 0.6 });
  k.slab([0, 0, 1.0, 0, 1.4, -4.2, 0.6, -3.8, -0.2, -4.6], 0.5, sash, [-3.4, 22.2, 2.6], [0, -0.6, 0.15], { hull: 0.5 });
  coatWear(k, coat, w);
}

/** A steppe cap: a tall felt crown, a turned-up fur brim, a metal finial; battered, the brim torn. */
function steppeCap(k: Kit, c: Look, w: Wear): void {
  const h = HEAD_C;
  k.frustum([h[0], 0, h[2] - 0.3], h[1] + 1.8, h[1] + 6.0, HEAD_R * 1.14, 1.9, c.dark, { seg: 10 });
  k.ball([h[0], h[1] + 6.0, h[2] - 0.3], 1.9, c.dark, { detail: 0, s: [1, 0.6, 1] });
  k.ball([h[0], h[1] + 7.0, h[2] - 0.3], 0.7, c.accent, { detail: 0, gloss: 0.5, hull: 0.5 });
  k.rod([h[0], h[1] + 7.4, h[2] - 0.3], [h[0], h[1] + 9.0, h[2] - 0.3], 0.35, c.accent, { r1: 0.05, seg: 4, hull: 0.4 });
  const torn = worn(w, 3);
  k.frustum([h[0], 0, h[2] - 0.3], h[1] + 1.3, h[1] + 3.3, 4.7, 5.15, FUR_G, { seg: 12, arc: torn ? [-2.6, Math.PI * 2 - 1.0] : undefined, open: false });
  // Fur: short tufts of light and dark across the brim's front.
  const fs = (x: number, y: number): { p: V3; n: V3 } => {
    const t = (y - (h[1] + 1.3)) / 2.0, r = 4.7 + 0.45 * Math.min(1, Math.max(0, t)) + 0.08;
    const dx = Math.max(-r * 0.95, Math.min(r * 0.95, x - h[0]));
    const z = Math.sqrt(r * r - dx * dx);
    return { p: [x, y, h[2] - 0.3 + z], n: [dx / r, 0.2, z / r] };
  };
  for (let i = 0; i < 7; i++) {
    const x = h[0] - 3.3 + i * 1.1;
    k.line([x, h[1] + 1.5, x + 0.3, h[1] + 3.0], 0.3, i % 2 ? '#8E6A48' : '#4A3220', fs);
  }
  if (worn(w, 2)) dirt(k, (x, y) => ({ p: [x, y, h[2] + 2.9], n: [0, 0, 1] }), h[0] - 1.2, h[1] + 4.0, 2.4, c.dark);
}

/** A composite bow from the top tip through the grip to the bottom, its tips recurved away from the archer (-x). */
function steppeBow(k: Kit, top: V3, grip: V3, bottom: V3, w: Wear): { top: V3; bottom: V3 } {
  const LIMB = '#3A2418', HORN = '#BFA67A', BONE = '#DCCFB2';
  const pts: V3[] = [];
  const n = 8;
  const ctrl = [2 * grip[0] - (top[0] + bottom[0]) / 2, 2 * grip[1] - (top[1] + bottom[1]) / 2, 2 * grip[2] - (top[2] + bottom[2]) / 2];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), cc = t * t;
    pts.push([a * top[0] + b * ctrl[0]! + cc * bottom[0], a * top[1] + b * ctrl[1]! + cc * bottom[1], a * top[2] + b * ctrl[2]! + cc * bottom[2]]);
  }
  const snapped = worn(w, 4);
  const from = snapped ? 2 : 0;
  for (let i = from; i < n; i++) {
    const r = i === 3 || i === 4 ? 1.05 : 0.8;
    k.rod(pts[i]!, pts[i + 1]!, r, LIMB, { seg: 5, r1: i === 3 ? 1.05 : r, caps: false });
  }
  for (let i = Math.max(from, 1); i < n; i++) k.ball(pts[i]!, i === 4 ? 1.05 : 0.8, LIMB, { detail: 0, hull: 0.6 });
  // The horn belly facing the archer, the leather grip, the bone tips (siyahs) bent back.
  const belly = (p: V3): V3 => [p[0] + 0.55, p[1], p[2] + 0.3];
  for (let i = Math.max(from, 1); i < n - 1; i++) if (i !== 4 && i !== 3) k.rod(belly(pts[i]!), belly(pts[i + 1]!), 0.32, HORN, { seg: 3, caps: false, hull: 0 });
  k.rod([grip[0], grip[1] - 1.4, grip[2]], [grip[0], grip[1] + 1.4, grip[2]], 1.25, GT.LEATHER, { seg: 6, hull: 0.5 });
  const tipB: V3 = [bottom[0] - 1.9, bottom[1] - 1.3, bottom[2]];
  k.rod(bottom, tipB, 0.55, BONE, { r1: 0.3, seg: 4 });
  if (worn(w, 2)) k.ball(pts[6]!, 0.5, '#1E140E', { detail: 0, hull: 0 });
  if (worn(w, 3)) k.rod(belly(pts[5]!), belly(pts[6]!), 0.36, '#1E140E', { seg: 3, hull: 0 });
  if (snapped) {
    // The upper limb snapped: a splintered stub, the loose piece hanging from the string.
    const p = pts[2]!;
    k.rod(p, [p[0] - 0.4, p[1] + 1.6, p[2]], 0.5, LIMB, { r1: 0.05, seg: 4, hull: 0.6 });
    k.rod([p[0] + 1.2, p[1] - 0.4, p[2] + 0.6], [p[0] + 0.2, p[1] - 6, p[2] + 0.6], 0.7, LIMB, { seg: 5 });
    return { top: [p[0] + 0.2, p[1] - 6, p[2] + 0.6], bottom: tipB };
  }
  const tipT: V3 = [top[0] - 1.9, top[1] + 1.3, top[2]];
  k.rod(top, tipT, 0.55, BONE, { r1: 0.3, seg: 4 });
  return { top: tipT, bottom: tipB };
}

export function grittyHorseArcher(k: Kit, { look: c, wear: w }: RiderOpts): Shadow {
  turned(k, MOUNT_YAW, () => {
    grittyHorse(k, DUN_G, { cloth: c.main, trim: c.accent }, w);
    riderLegs(k, { thigh: c.main, boot: FELT_BOOT, upturned: true }, w);
  });
  turned(k, RIDER_YAW, () => {
    k.pivot(RIDER, SEAT, () => {
      deel(k, c, w);
      neck(k, STEPPE_SKIN);
      // The quiver on the right hip, arrows fletched in the owner's trim.
      k.rod([4.6, 19.8, -1.8], [6.2, 27.4, -3.6], 1.35, GT.LEATHER_DARK, { r1: 1.6, seg: 7 });
      k.rod([6.1, 27.0, -3.5], [6.3, 27.9, -3.7], 1.75, c.accent, { seg: 7, hull: 0.4 });
      for (const [dx, dz] of [[-0.6, 0.4], [0.5, -0.2], [0.0, -0.8]] as const) {
        k.rod([6.2 + dx, 27.6, -3.6 + dz], [6.5 + dx, 30.0, -3.9 + dz], 0.22, '#A07C4E', { seg: 3, hull: 0 });
        k.slab([0, 0, 0.9, 0.3, 0.9, 1.8, 0, 1.4], 0.25, STRING_G, [6.4 + dx, 29.2, -3.8 + dz], [0, 0.6, 0], { hull: 0.3 });
      }
      // The bow arm out to the left, the bow in the fist; the string drawn to the cheek.
      const grip: V3 = [-16.4, H(-17.4), 3.6];
      riderArm(k, [-4.4, 30.2, 0.1], [-9.6, 29.0, 1.8], [-15.0, 27.7, 3.4], { sleeve: c.main, cuff: c.accent });
      const b = steppeBow(k, [-8.4, H(-30.8), 3.2], grip, [-8.4, H(-4), 3.2], w);
      fist(k, grip, [0, 1, 0], [-1, 0, 0.2], 1.0, STEPPE_SKIN);
      const nock: V3 = [1.8, H(-17.4), 4.4], loose: V3 = [-4, H(-14), 5];
      const end = worn(w, 4) ? loose : nock;
      k.rod(b.top, end, 0.22, STRING_G, { seg: 3, hull: 0.4 });
      k.rod(end, b.bottom, 0.22, STRING_G, { seg: 3, hull: 0.4 });
      k.pivot(WEAPON, [4.4, H(-19.4), 0.8], () => {
        riderArm(k, [4.4, 30.2, 0.1], [7.0, 28.6, 2.2], [2.9, 27.7, 4.3], { sleeve: c.main, cuff: c.accent });
        fist(k, [2.0, 27.6, 4.5], [0, 1, 0], [0.6, 0, 0.8], 0.9, STEPPE_SKIN);
      }, { axis: DRAW_BACK, fwd: [-1, 0, 0] });
      if (!worn(w, 4)) {
        k.pivot(ARROW, [4.4, H(-19.4), 0.8], () => {
          k.rod([2.4, H(-17.4), 4.4], [-17.2, H(-17.4), 4.4], 0.3, '#A07C4E', { seg: 4 });
          k.rod([-17.2, H(-17.4), 4.4], [-20.2, H(-17.4), 4.4], 0.85, STEEL_G, { r1: 0.05, seg: 4, gloss: 0.5 });
          for (const r of [0, Math.PI / 2]) k.slab([0, 0, 2.6, 0.9, 2.6, -0.9], 0.2, STRING_G, [-0.4, H(-17.4), 4.4], [r, 0, 0], { hull: 0.3 });
        }, { fwd: [-1, 0, 0] });
      }
      const bare = helmBroken(w);
      steppeFace(k, w, { bare });
      if (!bare) steppeCap(k, c, w);
    }, { axis: HUNCH });
  });
  hoofBlood(k, w);
  return WIDE;
}

// ---- the Khan's guard: the champion, in lacquered lamellar on a barded black horse ----

/** Rows of lamellae on a surface: lacing lines across and the plates' edges, staggered row to row. */
function lamellae(k: Kit, s: Surface, x0: number, x1: number, rows: readonly number[], lace: string, step = 1.6, skip?: (x: number, y: number) => boolean, edge: string = lace): void {
  for (let r = 0; r < rows.length; r++) {
    const y = rows[r]!;
    k.line([x0, y, x1, y], 0.32, lace, s);
    if (r + 1 < rows.length) {
      const y2 = rows[r + 1]!;
      for (let x = x0 + (r % 2 ? step / 2 : step); x < x1 - 0.3; x += step) if (!skip?.(x, (y + y2) / 2)) k.line([x, y - 0.2, x, y2 + 0.2], 0.16, edge, s);
    }
  }
}

/**
 * The Khan's guard's lacquer: the plates in the owner's deep colour, laced across in gold cord, each plate's edge
 * caught by a pale gleam of lacquer, so the dark armour on the black horse still reads at board size.
 */
function guardLacquer(c: Look): { plates: string; lace: string; gleam: string } {
  const plates = vivid(c.main);
  return { plates, lace: mix(GT.GOLD_EDGE, plates, 0.15), gleam: mix(plates, '#FFFFFF', 0.38) };
}

function guardBarding(k: Kit, c: Look, w: Wear): void {
  const { plates, lace, gleam } = guardLacquer(c);
  const NX = 10, X0 = -13.4, X1 = 9.8, OFF = 0.45;
  const broken = helmBroken(w);
  // Broken (and scarred), a run of the lower plates is gone from the near flank for good; battered, a few hang loose.
  const near = (t: number): number => {
    const j = Math.round(t * NX);
    if (broken && j >= 3 && j <= 6) return j === 3 || j === 6 ? 1.75 : 1.35;
    return 2.3;
  };
  drape(k, plates, { x0: X0, x1: X1, far: -1.9, near, nx: NX, nu: 6, off: OFF, gloss: 0.4, hull: 0.7 });
  k.slab([-3.5, 16.4, 3.5, 16.4, 3.4, 10.6, -3.4, 10.6], 0.5, plates, [10.0, 0, 0], [0, Math.PI / 2, 0], { hull: 0.7, gloss: 0.4 });
  const ds = drapeSurf(OFF + 0.02);
  const colX = (i: number): number => X0 + ((X1 - X0) * i) / NX;
  const gone = (x: number, y: number): boolean => broken && x > colX(3) && x < colX(6) && y < 13.4;
  lamellae(k, ds, X0 + 0.4, X1 - 0.4, [18.6, 16.6, 14.6, 12.6, 10.8], lace, 2.1, gone, gleam);
  for (let i = 0; i < NX; i++) if (!(broken && i >= 2 && i <= 6)) k.line([colX(i), 10.0, colX(i + 1), 10.0], 0.55, GT.GOLD_EDGE, ds);
  if (broken) tearLine(k, ds, [colX(3), 10.2, colX(3) + 1.0, 12.8, colX(4) + 0.5, 13.6, colX(5) + 0.4, 13.2, colX(6) - 1.0, 12.6, colX(6), 10.2], plates);
  if (worn(w, 3)) for (const [x, y, a] of [[4.4, 11.2, 0.4], [-10.6, 11.6, -0.3]] as const) k.box([x, y, (section(x).w + OFF + 0.4)], [1.5, 2.0, 0.3], plates, { rot: [0, 0, a], hull: 0.4 });
  if (worn(w, 1)) dirt(k, ds, -6.0, 11.4, 4.0, plates);
  if (worn(w, 2)) { scratches(k, ds, [[1.0, 17.0, 3.2, 15.2], [-9.4, 15.8, -7.6, 14.4]], '#E2D2C0', 0.3); dent(k, ds, -2.4, 15.6, 0.8, plates); }
  if (w.blood >= 1) { smear(k, ds, 6.0, 16.4, 0.2, -1, 4.4, 1.5); smear(k, ds, -11.0, 16.0, 0.2, -1, 3.0, 1.2); }
  if (w.blood >= 2) { smear(k, ds, 0.4, 15.0, -0.2, -1, 3.8, 1.3); k.decal(ell(-3.0, 11.6, 0.7, 0.5, 6), BLOOD, ds); }
}

function guardHorseNeck(k: Kit, c: Look, w: Wear): void {
  const { plates, lace } = guardLacquer(c);
  loftSheet(k, NECK_RINGS, {
    t0: 0.0, t1: 0.82, far: -1.9, cols: 3, rows: 4,
    near: (j) => (worn(w, 3) && j === 2 ? 1.1 : 1.9),
    lift: () => 0.4, colour: (i) => (i % 2 ? plates : mix(plates, '#000000', 0.12)), gloss: 0.4,
  });
  for (const t of [0.22, 0.48, 0.74]) k.rod(loftPoint(NECK_RINGS, t, -0.2, 0.5), loftPoint(NECK_RINGS, t, 1.8, 0.5), 0.22, lace, { seg: 3, hull: 0 });
  // A plume of pale horsehair on the brow, in a gold cup, and a tassel under the jaw.
  if (!helmBroken(w)) {
    const p = loftPoint(HEAD_RINGS, 0.16, 0, 0.3);
    k.ball(p, 0.7, GT.GOLD_EDGE, { detail: 0, hull: 0.4, gloss: 0.6 });
    const top: V3 = [p[0] - 0.6, p[1] + 2.6, p[2]];
    k.rod(p, top, 0.5, GUARD_PLUME, { r1: 1.15, seg: 5, hull: 0.6, caps: false });
    k.rod(top, [p[0] - 4.6, p[1] + 1.2, p[2] + 0.2], 1.25, GUARD_PLUME, { r1: 0.3, seg: 5, hull: 0.6 });
  }
  const j = loftPoint(HEAD_RINGS, 0.5, Math.PI, 0.1);
  k.rod(j, [j[0] - 0.4, j[1] - 3.0, j[2]], 0.25, plates, { r1: 0.9, seg: 6, hull: 0.5 });
}

/** The guard's helm: a steel bowl with a gold brim, a brow plate, a tall spike with a horsehair plume, a lamellar aventail. */
function guardHelm(k: Kit, c: Look, w: Wear): void {
  const h = HEAD_C, plates = vivid(c.main);
  const broken = helmBroken(w);
  const bowl = '#8C9299', L = 0.9;
  k.dome([h[0], h[1] + 1.2 + L, h[2] - 0.4], HEAD_R * 1.18, bowl, { to: 1.2, seg: 11, gloss: 0.45, s: [1, 1.35, 1] });
  k.frustum([h[0], 0, h[2] - 0.4], h[1] + 2.0 + L, h[1] + 3.0 + L, HEAD_R * 1.25, HEAD_R * 1.19, GT.GOLD_EDGE, { seg: 11, gloss: 0.6, hull: 0.6 });
  // The brow plate over the eyes.
  k.slab([-2.4, 0, 2.4, 0, 1.6, 0.9, -1.6, 0.9], 0.35, GT.GOLD_EDGE, [h[0], h[1] + 1.9 + L, h[2] + 4.0], [0.5, 0, 0], { gloss: 0.6, hull: 0.5 });
  // The aventail: lamellae hanging round the sides and the back from the brim. Broken, the near side is torn away.
  const arc: [number, number] = broken ? [Math.PI * 0.75, Math.PI * 0.9] : [Math.PI * 0.42, Math.PI * 1.16];
  k.frustum([h[0], 0, h[2] - 0.6], h[1] - 4.4, h[1] + 2.2 + L, HEAD_R * 1.48, HEAD_R * 1.22, plates, { seg: 12, arc, gloss: 0.35, hull: 0.6 });
  if (broken) {
    // The spike and plume torn off: a jagged stub; the bowl torn above the near temple.
    k.rod([h[0], h[1] + 7.0, h[2] - 0.4], [h[0] + 0.3, h[1] + 8.0, h[2] - 0.4], 0.7, bowl, { r1: 0.35, seg: 5 });
    tornEdge(k, [[h[0] - 4.3, h[1] + 3.4, h[2] + 0.4], [h[0] - 3.8, h[1] + 4.6, h[2] + 0.6], [h[0] - 3.2, h[1] + 3.9, h[2] + 1.6], [h[0] - 2.5, h[1] + 5.0, h[2] + 1.9]], 0.24);
  } else {
    k.ball([h[0], h[1] + 7.3, h[2] - 0.4], 0.8, GT.GOLD_EDGE, { detail: 0, gloss: 0.6 });
    k.rod([h[0], h[1] + 7.5, h[2] - 0.4], [h[0], h[1] + 12.6, h[2] - 0.4], 0.55, bowl, { r1: 0.08, seg: 5, gloss: 0.5 });
    // The plume: dyed horsehair falling from a ring on the spike, back and to his right.
    k.frustum([h[0], 0, h[2] - 0.4], h[1] + 9.4, h[1] + 10.0, 0.75, 0.6, GT.GOLD_EDGE, { seg: 6, hull: 0.4 });
    const tuft = worn(w, 3) ? 0.55 : 1;
    // It swells out from the ring and falls away to his right in a tapering tail.
    const ring: V3 = [h[0], h[1] + 9.6, h[2] - 0.6], swell: V3 = [h[0] + 3.2 * tuft, h[1] + 9.4, h[2] - 0.4 * tuft];
    const tail: V3 = [h[0] + 7.0 * tuft, h[1] + 9.6 - 6.6 * tuft, h[2] - 0.6 * tuft];
    k.rod(ring, swell, 0.8, GUARD_PLUME, { r1: 1.7, seg: 6, caps: false });
    k.rod(swell, tail, 1.7, GUARD_PLUME, { r1: worn(w, 3) ? 1.1 : 0.35, seg: 6 });
  }
  const sv = (x: number, y: number): { p: V3; n: V3 } => {
    const r = HEAD_R * 1.18 + 0.06, dx = x - h[0], dy = (y - h[1] - 1.2 - L) / 1.35;
    const dz = Math.sqrt(Math.max(0.3, r * r - dx * dx - dy * dy));
    return { p: [x, y, h[2] - 0.4 + dz], n: [dx / r, dy / r, dz / r] };
  };
  if (worn(w, 1)) scratches(k, sv, [[h[0] + 1.0, h[1] + 6.0, h[0] + 2.6, h[1] + 5.0]], '#D6D8DA', 0.25);
  if (worn(w, 2)) dent(k, sv, h[0] + 2.0, h[1] + 5.4, 0.6, bowl);
}

export function grittyKhansGuard(k: Kit, { look: c, wear: w }: RiderOpts): Shadow {
  const { plates, lace, gleam } = guardLacquer(c);
  const broken = helmBroken(w);
  turned(k, MOUNT_YAW, () => {
    grittyHorse(k, BLACK_G, { cloth: c.main, trim: GT.GOLD_EDGE, noCloth: true, metal: GT.GOLD_EDGE }, w, { covered: true, neck: () => guardHorseNeck(k, c, w) });
    guardBarding(k, c, w);
    riderLegs(k, { thigh: c.dark, boot: FELT_BOOT, upturned: true, iron: GT.GOLD_EDGE }, w);
  });
  turned(k, RIDER_YAW, () => {
    k.pivot(RIDER, SEAT, () => {
      // The standard in his left hand: a tall spear, a gold ring and a great tuft of black horsehair below it.
      const pole: V3 = [-9, 14.0, -1], top: V3 = [-9, H(-34), -1];
      spear(k, pole, top, (40 - 34) / 0.785 + 0.6, { nick: worn(w, 2), snap: worn(w, 4) ? 0.8 : undefined }, 0.75, GT.LEATHER_DARK);
      if (!worn(w, 4)) {
        const ry = H(-31.4);
        k.frustum([-9, 0, -1], ry, ry + 1.2, 1.4, 1.4, GT.GOLD_EDGE, { seg: 8, gloss: 0.6, hull: 0.5 });
        const len = worn(w, 3) ? 5.5 : 9.5;
        k.frustum([-9, 0, -1], ry - len, ry, 2.6, 0.9, '#1B1411', { seg: 9, hull: 0.8 });
        const ts = (x: number, y: number): { p: V3; n: V3 } => { const t = (ry - y) / len; const r = 0.9 + 1.7 * t + 0.05; return { p: [x, y, -1 + Math.sqrt(Math.max(0.1, r * r - (x + 9) ** 2))], n: [0, 0, 1] }; };
        for (const dx of [-1.0, 0, 1.0]) k.line([-9 + dx * 0.4, ry - 0.4, -9 + dx * 1.6, ry - len + 0.6], 0.2, '#4A3C34', ts);
        // Loose strands below the hem, so it reads as hair.
        for (const [dx, dz, l] of [[-2.0, 0.6, 2.4], [-0.6, 1.9, 3.2], [0.9, 1.6, 2.2], [2.1, 0.4, 2.8]] as const) k.rod([-9 + dx, ry - len + 0.4, -1 + dz], [-9 + dx * 1.15, ry - len - l, -1 + dz * 1.1], 0.4, '#1B1411', { r1: 0.08, seg: 3, hull: 0.4 });
      }
      // A deel under lamellar armour lacquered in the owner's colour, gold at the edges, a fur collar.
      lapSkirt(k, plates, { r0: 6.1, y0: 17.4 });
      torso(k, plates, { grow: 1.06, gloss: 0.4 });
      const ls = torsoFront(0.26, 1.06);
      lamellae(k, ls, -4.6, 4.6, [29.2, 27.4, 25.6, 23.8, 22.0], lace, 1.5, undefined, gleam);
      k.frustum([0, 0, 0], 21.0, 22.0, 4.5, 4.4, GT.GOLD_EDGE, { sz: 0.8, seg: 10, open: true, hull: 0.5, gloss: 0.6 });
      k.frustum([0, 0, 0], 19.0, 21.0, 4.7, 4.5, GT.LEATHER_DARK, { sz: 0.8, seg: 10, open: true, hull: 0.5 });
      k.box([0, 20.0, 3.7], [1.6, 1.4, 0.5], GT.GOLD_EDGE, { gloss: 0.6, hull: 0.4 });
      k.frustum([0, 0, 0.1], 30.4, 32.2, 4.0, 3.0, FUR_G, { sz: 0.9, seg: 10 });
      const fs = torsoFront(0.4, 1.06);
      if (worn(w, 1)) dirt(k, fs, 2.0, 23.0, 3.0, plates);
      if (worn(w, 2)) dent(k, fs, -2.2, 26.4, 0.8, plates);
      if (worn(w, 3)) crack(k, fs, [2.2, 28.6, 1.4, 26.8, 2.0, 25.4], 0.28);
      if (w.blood >= 1) smear(k, fs, -1.6, 28.8, 0.15, -1, 3.6, 1.3);
      if (w.blood >= 2) smear(k, fs, 1.4, 25.6, -0.2, -1, 3.4, 1.2);
      // Lamellar shoulder guards with gold edges; broken, the left one is gone.
      for (const sd of [1, -1]) {
        if (sd < 0 && broken) continue;
        const pts: V3[] = [[sd * 3.0, 31.0, 1.6], [sd * 6.2, 30.6, 1.2], [sd * 7.2, 26.2, 1.4], [sd * 4.4, 26.6, 2.6]];
        plate(k, pts, plates, [sd * 4.6, 28.8, -1.4], { gloss: 0.4, hull: 0.6 });
        metalEdge(k, [pts[2]!, pts[3]!], 0.24);
        metalEdge(k, [[sd * 3.4, 29.4, 2.4], [sd * 6.6, 28.8, 1.6]], 0.14, gleam);
      }
      // The left hand grips the standard; the right holds the reins.
      riderArm(k, [-4.4, 30.2, 0.1], [-8.0, 27.4, 1.6], [-8.6, 25.4, 0.2], { sleeve: c.dark, cuff: GT.GOLD_EDGE });
      fist(k, [-9, 25.0, -1], [0, 1, 0], [-0.3, 0, 1], 0.95, STEPPE_SKIN);
      riderArm(k, [4.4, 30.2, 0.1], [6.4, 26.4, 2.0], [3.4, 24.2, 4.2], { sleeve: c.dark, cuff: GT.GOLD_EDGE });
      fist(k, [2.6, 23.8, 4.7], [1, 0, 0], [0.2, 0.3, 1], 0.9, STEPPE_SKIN);
      k.rod([2.0, 23.6, 4.7], [1.7, 21.4, 2.8], 0.26, GT.LEATHER_DARK, { seg: 4, hull: 0 });
      neck(k, STEPPE_SKIN);
      steppeFace(k, w, { grey: true, beard: true });
      guardHelm(k, c, w);
    }, { axis: HUNCH });
  });
  hoofBlood(k, w);
  return WIDE;
}

// ---- the sky caller: the shaman on a pale horse, a mirror staff and a drum ----

/** The broad felt hat: a wide brim, a low crown, a band, a fringe of cords over the brow and two feathers. */
function callerHat(k: Kit, c: Look, w: Wear): void {
  const h = HEAD_C, felt = c.dark;
  const torn = worn(w, 3);
  const cuts: Cut[] = torn ? [{ from: 300, to: 345, inner: 6.6, jag: 0.6 }] : [];
  k.slab(discPoly(9.6, cuts, 0, 16).map((v, i) => (i % 2 ? v * 0.62 : v)), 0.7, felt, [h[0], h[1] + 2.3, h[2] - 0.3], [Math.PI / 2, 0, 0], { hull: 0.7 });
  k.dome([h[0], h[1] + 2.0, h[2] - 0.3], HEAD_R * 1.12, felt, { to: 1.57, seg: 10, s: [1, 1.05, 1] });
  k.frustum([h[0], 0, h[2] - 0.3], h[1] + 2.5, h[1] + 3.5, HEAD_R * 1.13, HEAD_R * 1.08, c.accent, { seg: 10, hull: 0.5 });
  // The fringe: cords hanging from the brim over the brow and the eyes, so the face is half seen.
  for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) k.rod([h[0] + x, h[1] + 2.0, h[2] + 4.1], [h[0] + x * 1.05, h[1] + 0.4 - Math.abs(x) * 0.25, h[2] + 4.3], 0.22, x === 0 ? c.accent : '#1E1612', { seg: 3, hull: 0 });
  // A bronze bell on the crown.
  k.ball([h[0], h[1] + 2.0 + HEAD_R * 1.1, h[2] - 0.3], 0.75, '#9C7A3A', { detail: 0, gloss: 0.5, hull: 0.5 });
  if (worn(w, 2)) dirt(k, (x, y) => ({ p: [x, y, h[2] + 3.95], n: [0, 0, 1] }), h[0] + 1.2, h[1] + 3.0, 2.0, felt);
}

/** The shaman's frame drum: a wooden hoop, a hide face with a painted mark; broken, the hide is torn through. */
function frameDrum(k: Kit, c: Look, w: Wear): void {
  // Tied to the saddle behind his leg (built in the mount's turn), its face to the near side.
  const at: V3 = [-6.2, 14.8, 6.4];
  k.frame(at, [1.45, 0, 0.2], () => {
    k.frustum([0, 0, 0], -0.8, 0.8, 4.2, 4.2, '#7A5232', { seg: 12, open: true, hull: 0.7 });
    k.slab(discPoly(4.15, [], 0, 12), 0.3, '#CDB68A', [0, 0.65, 0], [Math.PI / 2, 0, 0], { hull: 0 });
    const face: Surface = (x, y) => ({ p: [x, 0.85, -y], n: [0, 1, 0] });
    k.decal(ell(0, 0, 1.4, 1.4, 10), c.accent, face);
    k.line([-3.4, 0, -1.6, 0], 0.35, '#5E3B22', face);
    k.line([1.6, 0, 3.4, 0], 0.35, '#5E3B22', face);
    k.line([0, -3.4, 0, -1.6], 0.35, '#5E3B22', face);
    if (worn(w, 2)) dirt(k, face, 1.6, -2.0, 2.2, '#D8C6A0');
    if (worn(w, 4)) { const [lip, gap] = tearPolys(-1.6, 1.4, 2.6, 2.4); k.decal(lip, '#5E3B22', face); k.decal(gap, '#1A120C', face); }
    if (w.blood >= 1) smear(k, face, 2.2, 1.6, 0.3, -1, 2.4, 0.9);
  });
}

export function grittySkyCaller(k: Kit, { look: c, wear: w }: RiderOpts): Shadow {
  const broken = helmBroken(w);
  turned(k, MOUNT_YAW, () => {
    grittyHorse(k, PALE_G, { cloth: c.main, trim: c.accent }, w, { neck: () => callerHorseNeck(k, c, w) });
    // The piebald's big dark patches.
    const fl = flank(0.05);
    const PIE = '#5E4532';
    patch(k, [-13.2, 15.4, -11.4, 18.8, -8.0, 19.4, -6.0, 16.8, -6.8, 13.2, -9.4, 11.6, -12.2, 12.4], PIE, fl, 2.2, 0.08);
    patch(k, [3.4, 13.8, 5.8, 15.2, 8.0, 13.0, 7.2, 10.2, 4.6, 10.4], PIE, fl, 2.2, 0.08);
    patch(k, [-5.8, 9.6, -3.4, 10.4, -1.4, 9.2, -3.2, 8.2], PIE, fl, 2.2, 0.08);
    riderLegs(k, { thigh: c.main, boot: FELT_BOOT, upturned: true }, w);
    frameDrum(k, c, w);
  });
  turned(k, RIDER_YAW, () => {
    k.pivot(RIDER, SEAT, () => {
      // The staff behind him, topped with a bronze mirror, three streamers flying back over the rump.
      k.rod([-3.6, H(-9), -2], [-11.6, H(-31.4), -2], 0.7, '#5A3D26', { seg: 6 });
      const torn = worn(w, 3);
      const streamer = (y: number, col: string, len: number): void => {
        const l = torn ? len * 0.55 : len;
        const pts = torn ? [0, 1.4, -l * 0.55, 0.6, -l, 0.9, -l * 0.8, -0.2, -l, -1.0, -l * 0.5, -1.0, 0, -1.4] : [0, 1.4, -l * 0.35, 0.9, -l * 0.7, 0.2, -l, -0.6, -l * 0.75, -1.2, -l * 0.4, -1.4, 0, -1.4];
        k.slab(pts, 0.4, col, [-11.2 + (y + 31) * 0.36, H(y), -2], [0.1, 0, 0.35], { hull: 0.5 });
      };
      streamer(-30, c.accent, 9);
      streamer(-26.6, STRING_G, 9);
      streamer(-23.2, c.main, 8);
      const mc: V3 = [-12, H(-32.6), -1.4];
      const cuts: Cut[] = worn(w, 4) ? [{ from: 290, to: 40, inner: 1.2, jag: 0.4 }] : [];
      k.frame(mc, [-0.3, 0, 0], () => {
        k.slab(discPoly(3.4, cuts, 0, 12), 0.9, '#9C7A3A', [0, 0, 0], [0, 0, 0], { gloss: 0.5 });
        k.slab(discPoly(2.5, cuts, 0.5, 10), 0.9, '#E2D8B8', [0, 0, 0.3], [0, 0, 0], { gloss: 0.9, hull: 0 });
        k.ball([0, -3.6, 0.3], 0.45, GT.GOLD_EDGE, { detail: 0, hull: 0.3 });
        if (worn(w, 3)) crack(k, flat(0.85), [-1.4, -0.8, 0.2, 0.2, -0.4, 1.4], 0.3);
        if (worn(w, 2)) k.decal(ell(0.9, -0.9, 0.6, 0.5, 6), '#7A6436', flat(0.82));
      });
      // The deel, hung with cords and strips at the hem and sleeves; a small mirror on the chest.
      deel(k, c, w, { sash: c.dark });
      const cord = [c.accent, STRING_G, c.dark, STRING_G, c.accent];
      const hem = worn(w, 3) ? 2.2 : 3.4;
      for (let i = 0; i < 5; i++) {
        const a = -1.0 + i * 0.5, x = Math.sin(a) * 5.6, z = Math.cos(a) * 5.6 * 0.86;
        k.box([x, 17.6 - hem / 2 + 0.2, z], [0.6, hem, 0.25], cord[i]!, { rot: [0, a, 0], hull: 0.3 });
      }
      const chest = torsoFront(0.3);
      k.decal(ell(-1.8, 27.0, 1.3, 1.3, 10), '#9C7A3A', chest);
      k.decal(ell(-1.8, 27.0, 0.85, 0.85, 8), '#E2D8B8', chest);
      if (broken) k.line([-2.6, 27.8, -1.6, 26.8, -2.0, 26.0], 0.2, '#2A2018', chest);
      // The left hand on the staff; the right holds the drum.
      riderArm(k, [-4.4, 30.2, 0.1], [-6.6, 26.8, 0.6], [-6.4, 28.0, -1.2], { sleeve: c.main, cuff: c.accent });
      fist(k, [-6.95, 28.6, -2], [-0.33, 0.94, 0], [-0.4, 0, 1], 0.95, STEPPE_SKIN);
      riderArm(k, [4.4, 30.2, 0.1], [6.6, 26.4, 1.4], [5.4, 24.6, 3.6], { sleeve: c.main, cuff: c.accent });
      fist(k, [5.2, 24.2, 4.2], [0, 1, 0], [0.6, 0, 0.6], 0.9, STEPPE_SKIN);
      // The beater in his right hand, its head wrapped in felt.
      k.rod([5.2, 23.4, 4.2], [7.2, 28.4, 5.4], 0.3, '#5A3D26', { seg: 4 });
      k.ball([7.3, 28.7, 5.5], 0.85, STRING_G, { detail: 0 });
      // Strips hanging from the sleeves.
      for (const sd of [-1, 1]) for (const dz of [0, 0.9]) k.box([sd * 6.5, 25.2, 1.2 + dz], [0.45, 3.0, 0.2], dz ? STRING_G : c.accent, { rot: [0, 0, sd * 0.2], hull: 0.3 });
      neck(k, STEPPE_SKIN);
      // An old man's face; broken, the hat is lost and his long grey hair falls loose.
      steppeFace(k, w, { grey: true, beard: true, bare: broken, long: '#8E877C', hair: '#3A322C' });
      if (!broken) callerHat(k, c, w);
    }, { axis: HUNCH });
  });
  hoofBlood(k, w);
  return WIDE;
}

/** Prayer ribbons tied in the pale horse's mane, and a patch over one eye. */
function callerHorseNeck(k: Kit, c: Look, w: Wear): void {
  const PIE = '#5E4532';
  const s: Surface = (x, y) => {
    const t = Math.min(1, Math.max(0, (y - 15.4) / (29.8 - 15.4)));
    const p = loftPoint(NECK_RINGS, t, Math.PI / 2, 0.06);
    return { p: [x, y, p[2]], n: [0.3, 0.1, 1] };
  };
  k.decal(ell(8.2, 22.6, 2.0, 3.2, 9, -0.5), PIE, s);
  const ribbons = worn(w, 3) ? [0.6] : [0.4, 0.75];
  for (const t of ribbons) {
    const p = loftPoint(NECK_RINGS, t, 0.5, 1.0);
    k.slab([0, 0, 0.7, 0, 0.9, -3.6, 0.3, -3.0, -0.1, -3.8], 0.25, t < 0.5 ? c.main : STRING_G, p, [0, 0, -0.3], { hull: 0.4 });
  }
}
