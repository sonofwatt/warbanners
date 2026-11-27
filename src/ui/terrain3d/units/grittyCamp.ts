// Gritty's camp: the Mongols' felt tent (a ger) on its wagon, a detailed toon figure after the kit's rules
// (grittyToon.ts). Bright keeps its toon camp (figures.ts); the camp has no moving pieces.
//
// The ger: walls of aged cream felt in overlapping sheets, a darker skirting, two horsehair ropes round it and the
// owner's band at the top of the wall; a faceted roof of felt over its poles, tied down with ropes to a wooden crown
// ring with its felt flap; a carved door painted in the owner's colour; the owner's pennant over the crown with a
// tassel of horsehair. The wagon: a plank bed on two big spoked wheels with iron tyres, a draught pole and its bar, a
// rolled felt at the back.
//
// The wear of a tent, never blood: mud thrown up on the felt and the wheels; stains, a lifted skirting, a rope gone
// slack; a tear in the wall with the lattice showing through, soot on the roof, the pennant tattered; broken, a great
// rent in the wall, a hole burnt through the roof with a snapped pole sticking out of it, the pennant's pole snapped,
// a wheel smashed. Healed (scarred): the tears and the hole are patched with felt of another tone, stitched round, the
// soot faded; the pennant's pole stays snapped. The blood levels are fire instead: flames and smoke on the roof, then
// more of them.
import { TorusGeometry, Vector3 } from 'three';
import { Kit, mix } from './kit';
import type { Surface, V3 } from './kit';
import { dirt, ell, heavy, scratches, setYaw, worn } from './parts';
import type { Look, Wear } from './parts';
import { GT } from './grittyToon';
import { lathe, radiusAt } from './grittyBody';
import type { Profile } from './grittyBody';

export interface CampOpts { look: Look; wear: Wear }

const YAW = 0.38 * 0.6;
const FELT = '#D8CCAE';
const FELT_SHADE = '#C2B593';
const FELT_DARK = '#9E8F70';
const FELT_PATCH = '#B49A6C';
const ROPE = '#4A3626';
const WOOD = '#8A6440';
const WOOD_DARK = '#5A3D26';
const IRON = '#3E3B38';
const SOOT = '#2A2522';
const SOOT_EDGE = '#4E4540';
const GAP = '#241A13';
const LATTICE = '#7A5A36';
const STITCH = '#3A2A1C';
/** Fire, from the deep red outside of a flame to its yellow heart, and the smoke. */
const FIRE = ['#C2380F', '#F06A1C', '#FBB43A', '#FFEDB0'] as const;
const SMOKE = ['#3C3936', '#504C48', '#64605B'] as const;

/** The tent's squash front to back (it sits on a narrow wagon). */
const SZ = 0.56;
const WALL: Profile = [[12.4, 15.3], [12.6, 21.2], [12.4, 27.4]];
const ROOF: Profile = [[13.1, 26.9], [11.4, 29.6], [8.6, 32.6], [5.6, 35.2], [3.7, 36.5]];

/** The front of the wall (x, y): on its true ellipse, facing out. */
const wall: Surface = (x, y) => {
  const r = radiusAt(WALL, y), dx = Math.max(-r * 0.98, Math.min(r * 0.98, x));
  const z = SZ * Math.sqrt(r * r - dx * dx);
  const n = new Vector3(dx / (r * r), 0, z / (SZ * SZ * r * r)).normalize();
  return { p: [x, y, z], n: [n.x, n.y, n.z] };
};
/** The front of the roof (x, y), facing out and up. */
const roof: Surface = (x, y) => {
  const r = radiusAt(ROOF, y), dx = Math.max(-r * 0.97, Math.min(r * 0.97, x));
  const z = SZ * Math.sqrt(r * r - dx * dx) + 0.1;
  const n = new Vector3(dx / (r * r), 0.9 / r, z / (SZ * SZ * r * r)).normalize();
  return { p: [x, y, z], n: [n.x, n.y, n.z] };
};

/** A point on the roof's slope at angle a (0 toward the viewer, turning toward +x) and height y. */
function onRoof(a: number, y: number, lift = 0.15): V3 {
  const r = radiusAt(ROOF, y) + lift;
  return [Math.sin(a) * r, y, Math.cos(a) * r * SZ];
}

/**
 * A spoked wheel at c facing the viewer: an iron tyre, a wooden felloe, six spokes, a hub with an iron cap. Smashed:
 * a piece of the rim gone, two spokes broken.
 */
function wheel(k: Kit, c: V3, r: number, smashed: boolean, muddy: boolean): void {
  const arc = smashed ? Math.PI * 2 - 1.5 : Math.PI * 2;
  const start = smashed ? -0.45 : 0;
  k.frame(c, [0, 0, start], () => {
    const tyre = new TorusGeometry(r, 0.42, 3, 16, arc);
    k.add(tyre, IRON, { gloss: 0.3, hull: 0.6 });
    const fel = new TorusGeometry(r - 0.75, 0.62, 4, 16, arc);
    fel.scale(1, 1, 1.4);
    k.add(fel, WOOD, { hull: 0.5 });
  });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    const broken = smashed && (i === 0 || i === 5);
    const len = broken ? (r - 0.8) * 0.45 : r - 0.8;
    k.rod([c[0] + Math.cos(a) * 1.0, c[1] + Math.sin(a) * 1.0, c[2]], [c[0] + Math.cos(a) * len, c[1] + Math.sin(a) * len, c[2]], 0.42, WOOD_DARK, { seg: 4, hull: 0.5, r1: broken ? 0.15 : 0.36 });
  }
  k.rod([c[0], c[1], c[2] - 0.9], [c[0], c[1], c[2] + 1.0], 1.35, WOOD_DARK, { seg: 8 });
  k.rod([c[0], c[1], c[2] + 1.0], [c[0], c[1], c[2] + 1.4], 0.85, IRON, { seg: 8, hull: 0, gloss: 0.4 });
  if (muddy) {
    // Mud caked on the lower spokes and the hub.
    const s: Surface = (x, y) => ({ p: [x, y, c[2] + 0.5], n: [0, 0, 1] });
    k.decal(ell(c[0] - 0.6, c[1] - 2.2, 1.2, 0.8, 7), mix(WOOD_DARK, '#3D3A34', 0.6), s);
    k.decal(ell(c[0] + 1.6, c[1] - 1.4, 0.8, 0.6, 6), mix(WOOD_DARK, '#3D3A34', 0.6), s);
  }
}

/** A flame at p facing the viewer: three nested tongues, red, orange and gold round a pale heart, with embers. */
function flame(k: Kit, p: V3, size: number, seed: number): void {
  const shape = (w: number, h: number, sd: number): number[] => {
    const j = (n: number): number => 0.85 + 0.3 * Math.abs(Math.sin(sd * 12.99 + n * 78.23));
    return [-w / 2, 0, -w * 0.46, h * 0.3, -w * 0.3, h * 0.62 * j(1), -w * 0.12, h * 0.42, 0, h * j(2), w * 0.14, h * 0.48, w * 0.3, h * 0.74 * j(3), w * 0.44, h * 0.34, w / 2, 0];
  };
  k.frame(p, [0, -YAW, 0], () => {
    FIRE.forEach((col, i) => {
      const f = [1, 0.78, 0.55, 0.32][i]!;
      k.slab(shape(2.8 * size * f, 4.6 * size * f, seed + i), 0.2, col, [0, 0, 0.12 * i], [0, 0, 0], { hull: i === 0 ? 0.35 : 0 });
    });
  });
  for (const [dx, dz] of [[-0.9, 0.4], [0.8, 0.7], [0.1, -0.5]] as const) k.ball([p[0] + dx * size, p[1] + 0.1, p[2] + dz * size], 0.24 * size, FIRE[2], { detail: 0, hull: 0 });
}

/** Smoke rising from p in soft puffs, drifting to the right and paling as it climbs. */
function smoke(k: Kit, p: V3, size: number, phase: number): void {
  for (let n = 0; n < 4; n++) {
    const t = n / 3;
    const c: V3 = [p[0] + t * 3.0 * size + Math.sin(phase + n * 1.7) * 0.5 * size, p[1] + t * 7.5 * size, p[2] - t * 0.8];
    k.ball(c, (0.9 + 0.55 * t) * size, SMOKE[Math.min(2, n)]!, { detail: 1, hull: 0, s: [1.15, 0.85, 1] });
  }
}

/** A ragged outline round (x, y), w by h: an uneven ring of points, `jag` deep. */
function ragged(x: number, y: number, w: number, h: number, jag: number, seed: number): number[] {
  const pts: number[] = [];
  const N = 11;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = 1 - jag * (i % 2) - 0.12 * Math.abs(Math.sin(seed * 7.3 + i * 2.1));
    pts.push(x + Math.cos(a) * (w / 2) * r, y + Math.sin(a) * (h / 2) * r);
  }
  return pts;
}

/** A tear in the felt: a ragged dark gap with the wall's lattice behind it and a torn lip; a patch once healed. */
function feltTear(k: Kit, s: Surface, x: number, y: number, w: number, h: number, mended: boolean, seed = 1): void {
  if (mended) { patch(k, s, x, y, w * 1.15, h * 1.1); return; }
  k.decal(ragged(x, y, w * 1.18, h * 1.15, 0.22, seed), FELT_DARK, s);
  k.decal(ragged(x, y, w, h, 0.3, seed + 1), GAP, s);
  // The lattice of the wall behind it: crossed laths.
  const hw = w * 0.3, hh = h * 0.3;
  for (const o of [-0.5, 0.5]) {
    k.line([x - hw + o * hw, y - hh, x + hw + o * hw, y + hh], 0.26, LATTICE, s);
    k.line([x - hw + o * hw, y + hh, x + hw + o * hw, y - hh], 0.26, LATTICE, s);
  }
}

/** A patch of felt in another tone, stitched round its edge. */
function patch(k: Kit, s: Surface, x: number, y: number, w: number, h: number): void {
  const pts = [x - w / 2, y - h / 2, x + w / 2 + 0.2, y - h / 2 + 0.2, x + w / 2, y + h / 2, x - w / 2 - 0.1, y + h / 2 - 0.15];
  k.decal(pts, FELT_PATCH, s);
  for (let i = 0; i < 4; i++) {
    const ax = pts[i * 2]!, ay = pts[i * 2 + 1]!, bx = pts[((i + 1) % 4) * 2]!, by = pts[((i + 1) % 4) * 2 + 1]!;
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 0.9));
    const ox = -(by - ay), oy = bx - ax, ol = Math.hypot(ox, oy) || 1;
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n, px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
      k.line([px - (ox / ol) * 0.25, py - (oy / ol) * 0.25, px + (ox / ol) * 0.25, py + (oy / ol) * 0.25], 0.12, STITCH, s);
    }
  }
}

/** Soot where fire has licked the felt: black at the heart, a brown edge; faded once the camp has healed. */
function scorch(k: Kit, s: Surface, x: number, y: number, rx: number, ry: number, faded: boolean): void {
  k.decal(ell(x, y, rx, ry, 10, 0.3), faded ? mix(SOOT_EDGE, FELT, 0.45) : SOOT_EDGE, s);
  k.decal(ell(x + rx * 0.1, y - ry * 0.1, rx * 0.65, ry * 0.6, 9, 0.5), faded ? mix(SOOT, FELT, 0.4) : SOOT, s);
}

export function grittyCamp(k: Kit, { look: c, wear: w }: CampOpts): { rx: number; rz: number; x: number } {
  const broken = worn(w, 4), mended = w.scarred === true;
  const fire = w.blood >= 1, fierce = heavy(w);
  setYaw(YAW);
  k.frame([0, 0, 0], [0, YAW, 0], () => {
    // ---- the wagon ----
    // The draught pole and its bar.
    k.rod([10.6, 11.6, 2.0], [20.0, 6.6, 3.6], 0.8, WOOD_DARK, { r1: 0.65, seg: 6 });
    k.rod([19.6, 6.9, -1.2], [20.4, 6.5, 8.0], 0.55, WOOD, { seg: 5 });
    k.rod([19.4, 7.0, 3.5], [20.4, 6.4, 3.7], 0.85, IRON, { seg: 6, hull: 0 });
    // The bed: heavy side beams, the deck, iron straps at the corners.
    k.box([-1, 13.0, 0], [27.6, 3.2, 13.6], WOOD_DARK);
    k.box([-1, 14.9, 0], [27.0, 0.7, 13.0], WOOD);
    k.box([-1, 10.9, 0], [22, 1.4, 4.4], WOOD_DARK);
    const side: Surface = (x, y) => ({ p: [x, y, 6.82], n: [0, 0, 1] });
    k.line([-14.6, 13.0, 12.6, 13.0], 0.18, mix(WOOD_DARK, '#000000', 0.4), side);
    for (const x of [-13.6, 11.6]) k.decal([x - 0.6, 11.5, x + 0.6, 11.5, x + 0.6, 14.5, x - 0.6, 14.5], IRON, side);
    for (const x of [-13.6, -4.2, 3.4, 11.6]) for (const y of [12.1, 13.9]) k.ball([x, y, 6.95], 0.28, IRON, { detail: 0, hull: 0 });
    if (worn(w, 1)) { dirt(k, side, -6.0, 12.0, 5.0, WOOD_DARK); dirt(k, side, 5.4, 12.2, 3.6, WOOD_DARK); }
    if (worn(w, 2)) scratches(k, side, [[-10.4, 14.2, -8.0, 13.2], [1.0, 12.4, 3.4, 13.6]], '#A88A62', 0.22);
    if (worn(w, 3)) k.line([-3.0, 14.6, -1.6, 13.4, -2.2, 12.0, -0.6, 11.6], 0.3, '#1E1510', side);
    // A chest at the front of the bed beside the door, iron bound.
    k.box([10.2, 16.6, 3.4], [3.0, 2.6, 3.8], WOOD, { rot: [0, 0.15, 0] });
    k.box([10.2, 18.05, 3.4], [3.2, 0.5, 4.0], c.dark, { rot: [0, 0.15, 0] });
    for (const dzz of [-1.0, 1.0]) k.box([10.2, 16.8, 3.4 + dzz], [3.1, 2.7, 0.3], IRON, { rot: [0, 0.15, 0], hull: 0 });
    // The rolled felt at the back, tied with rope.
    k.rod([-13.8, 16.6, -4.6], [-13.8, 16.6, 5.0], 1.45, FELT_DARK, { seg: 7 });
    for (const z of [-2.0, 2.6]) k.rod([-13.8, 16.6, z], [-13.8, 16.6, z + 0.5], 1.6, ROPE, { seg: 7, hull: 0 });
    // Two big spoked wheels on the near side, the axles under the bed.
    for (const x of [-9.4, 8.6]) k.rod([x, 5.86, -6.4], [x, 5.86, 6.6], 0.6, WOOD_DARK, { seg: 5, hull: 0 });
    // The far wheels, mostly hidden under the bed.
    for (const x of [-9.4, 8.6]) {
      const far = new TorusGeometry(5.0, 0.6, 3, 14);
      far.translate(x, 5.86, -7.0);
      k.add(far, WOOD_DARK, { hull: 0.5 });
    }
    wheel(k, [-9.4, 5.86, 7.3], 5.4, false, worn(w, 1));
    wheel(k, [8.6, 5.86, 7.3], 5.4, broken, worn(w, 1));

    // ---- the ger ----
    // The felt walls in overlapping sheets, the darker skirting, the ropes and the owner's band.
    lathe(k, WALL, FELT, SZ, { seg: 16, gloss: 0.05 });
    k.frustum([0, 0, 0], 15.3, 17.0, 12.72, 12.68, FELT_DARK, { sz: SZ + 0.015, seg: 16, open: true });
    for (const x of [-8.4, -3.0, 4.6, 9.6]) k.line([x, 17.2, x + 0.2, 26.2], 0.24, FELT_SHADE, wall);
    for (const y of [19.6, 24.8]) k.frustum([0, 0, 0], y - 0.3, y + 0.3, 12.72, 12.72, ROPE, { sz: SZ + 0.012, seg: 16, open: true, hull: 0.5 });
    k.frustum([0, 0, 0], 25.9, 27.5, 12.62, 12.56, c.dark, { sz: SZ + 0.015, seg: 16, open: true });
    // A running pattern in the owner's accent along the band.
    const pat: number[] = [];
    for (let x = -11.0, i = 0; x <= 11.01; x += 1.1, i++) pat.push(x, i % 2 ? 27.05 : 26.35);
    k.line(pat, 0.2, c.accent, (x, y) => { const p = wall(x, y); return { p: [p.p[0] + p.n[0] * 0.3, p.p[1], p.p[2] + p.n[2] * 0.3], n: p.n }; });
    // The roof of felt over its poles: faceted, tied down with ropes to the crown.
    lathe(k, ROOF, FELT, SZ, { seg: 16, gloss: 0.05 });
    for (const a of [-1.7, -0.95, -0.3, 0.35, 1.0, 1.7]) {
      const p0 = onRoof(a, 27.2), p1 = onRoof(a, 31.6), p2 = onRoof(a, 36.2, 0.2);
      k.rod(p0, p1, 0.24, ROPE, { seg: 3, hull: 0 });
      k.rod(p1, p2, 0.24, ROPE, { seg: 3, hull: 0 });
    }
    // The crown ring and its felt flap, folded back.
    k.frustum([0, 0, 0], 36.2, 37.4, 3.8, 3.4, WOOD_DARK, { seg: 10, sz: SZ + 0.1 });
    k.box([-1.8, 37.7, -0.4], [3.4, 0.35, 3.2], FELT_DARK, { rot: [0, 0, 0.35] });
    // The carved door, painted in the owner's colour, with its pattern and frame.
    const dz = SZ * 12.4;
    k.box([0, 20.6, dz + 0.05], [7.2, 10.6, 0.9], WOOD_DARK);
    k.box([0, 26.3, dz + 0.2], [8.4, 1.0, 1.2], WOOD_DARK);
    const door: Surface = (x, y) => ({ p: [x, y, dz + 0.55], n: [0, 0, 1] });
    for (const sd of [-1, 1]) {
      k.decal([sd * 0.15, 15.9, sd * 2.75, 15.9, sd * 2.75, 25.1, sd * 0.15, 25.1], c.main, door);
      k.line([sd * 0.6, 16.6, sd * 2.3, 16.6, sd * 2.3, 24.4, sd * 0.6, 24.4, sd * 0.6, 16.6], 0.26, c.accent, door);
    }
    k.line([-1.2, 20.6, 0, 22.0, 1.2, 20.6, 0, 19.2, -1.2, 20.6], 0.3, c.accent, door);
    if (worn(w, 2)) scratches(k, door, [[-2.2, 23.4, -0.8, 22.2]], '#9C8A70', 0.2);
    // The owner's pennant on a pole over the crown, a tassel of horsehair under its gilded tip; snapped once broken.
    if (broken || mended) {
      k.rod([0, 37.2, 0], [0, 44.0, 0], 0.5, WOOD_DARK, { seg: 5 });
      k.rod([0, 44.0, 0], [0.4, 45.4, 0], 0.4, WOOD, { r1: 0.05, seg: 4, hull: 0.5 });
      k.rod([0, 44.0, 0], [-0.4, 45.0, 0.2], 0.3, WOOD, { r1: 0.05, seg: 3, hull: 0.4 });
      // The pennant, tattered, hanging off the stub.
      k.slab([0, 0, 2.2, -0.6, 1.6, -2.6, 2.4, -4.0, 0.8, -4.8, 0.2, -3.0], 0.4, c.main, [0.4, 43.8, 0.1], [0, 0.4, 0]);
    } else {
      k.rod([0, 37.2, 0], [0, 50.4, 0], 0.5, WOOD_DARK, { seg: 5 });
      k.rod([0, 50.4, 0], [0, 52.0, 0], 0.55, GT.GOLD_EDGE, { r1: 0.05, seg: 4, gloss: 0.6 });
      k.rod([0, 49.6, 0], [0.5, 46.0, -0.4], 0.9, '#2A201B', { r1: 0.5, seg: 5 });
      const pen = worn(w, 3) ? [0, 0, 3.2, -0.5, 2.2, -1.4, 4.2, -2.0, 2.4, -2.8, 0, -4.0] : [0, 0, 6.2, -2.0, 0, -4.0];
      k.slab(pen, 0.45, c.main, [0.4, 49.6, 0], [0, 0, 0]);
    }

    // ---- the wear ----
    if (worn(w, 1)) { dirt(k, wall, -7.4, 16.2, 5.6, FELT); dirt(k, wall, 6.8, 16.0, 4.6, FELT); dirt(k, wall, -0.6, 15.9, 3.0, FELT); }
    if (worn(w, 2)) {
      dirt(k, wall, 7.6, 22.4, 3.4, FELT);
      // The skirting lifted and frayed at one corner, and a rope gone slack.
      k.slab([0, 0, 2.6, 0, 2.2, -1.4, 1.2, -0.8, 0.4, -1.6], 0.35, FELT_DARK, [-10.6, 15.6, 4.2], [-0.5, -0.9, 0]);
      k.line([-11.6, 19.6, -9.0, 18.6, -6.4, 19.2], 0.45, ROPE, wall);
    }
    if (worn(w, 3)) {
      feltTear(k, wall, -6.6, 21.8, 3.6, 4.0, mended);
      scorch(k, roof, 5.4, 30.6, 2.8, 1.8, mended);
    }
    if (broken || mended) {
      // A great rent in the wall, soot over the wall's top, a hole burnt through the roof.
      feltTear(k, wall, 6.8, 21.0, 4.2, 5.4, mended, 4);
      scorch(k, wall, 4.0, 26.0, 3.6, 1.6, mended);
      scorch(k, roof, -5.0, 32.0, 3.8, 2.4, mended);
      if (mended) patch(k, roof, -4.6, 31.9, 3.6, 2.0);
      else {
        k.decal([-6.6, 31.4, -4.8, 33.4, -2.6, 32.8, -3.0, 30.8, -4.8, 30.4], GAP, roof);
        // A roof pole snapped and sticking up out of the hole.
        k.rod([-3.4, 31.4, 4.4], [-6.2, 37.0, 6.8], 0.42, WOOD, { seg: 4, hull: 0.5 });
        k.rod([-6.2, 37.0, 6.8], [-6.7, 38.2, 7.0], 0.42, WOOD, { r1: 0.05, seg: 3, hull: 0.4 });
      }
    }
    // Fire for blood: flames on the roof, then more of them on the wall's top and the wagon, and smoke.
    if (fire) { flame(k, onRoof(0.62, 30.0, 0.2), 1.6, 1); smoke(k, onRoof(0.62, 36.0, 0.3), 1.2, 0.4); }
    if (fierce) {
      flame(k, onRoof(-0.7, 29.4, 0.2), 1.9, 2);
      flame(k, [-9.8, 15.3, 5.2], 1.2, 3);
      smoke(k, onRoof(-0.7, 36.2, 0.3), 1.4, 2.1);
    }
  });
  setYaw(0);
  return { rx: 17, rz: 8.5, x: 0 };
}
