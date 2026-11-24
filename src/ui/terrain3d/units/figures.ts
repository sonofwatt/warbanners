// The 17 unit figures in 3D, one builder each, from the SVG figures' own shapes and coordinates (art/units.tsx and
// art/factionUnits.tsx): x as on screen, heights through H(svgY) so every part lands where the SVG draws it.
// Every builder takes the owner's look and a Wear and returns one model. The game passes CLEAN: wear is for Gritty
// mode, which is not on main, so on main the wear branches are never taken (they stay so Gritty can switch them on).
import { Vector3 } from 'three';
import { flat, H, Kit, mix } from './kit';
import type { BuiltFigure, Surface, V3 } from './kit';
import {
  arm, BLACK_HORSE, BLACK_HORSE_DARK, BLOOD, bloody, BOOT, BRONZE_RIM, crack, dent, dirt, discPoly, discWear, DUN,
  DUN_DARK, ell, faceWear, FELT, FUR, GOLD, GREY_HORSE, GREY_HORSE_DARK, groundDrops, HAIR, head, helmBroken,
  horse, HORSE, HORSE_DARK, HORSE_HAIR, LEAF, MANE, onView, PALE_HORSE, PALE_HORSE_DARK, PIEBALD, PIPE, rider, roundShield,
  scratches, SCRATCH, splitPoly, SCRATCH_DARK, setYaw, shieldCuts, shieldFrame, SKIN, smear, spear, standingBody, STEEL,
  STEEL_DARK, STONE, STRING, sword, tearPolys, TUNIC, tunicSurf, tunicWear, viewSphere, VISOR, WOOD, WOOD_DARK, worn,
} from './parts';
import type { Cut, Look, Wear } from './parts';

export type UnitType =
  | 'warrior' | 'spearman' | 'swordsman' | 'defender' | 'archer' | 'horseman' | 'knight' | 'catapult' | 'sellsword'
  | 'hoplite' | 'kingsGuard' | 'piper' | 'scout' | 'horseArcher' | 'khansGuard' | 'skyCaller' | 'camp';

export interface FigureOpts { look: Look; wear: Wear; hero?: boolean }
/** A built figure plus the size of its ground shadow (an ellipse at the feet, in world units). */
export interface Figure extends BuiltFigure { shadow: { rx: number; rz: number; x: number } }

/** How far the figures turn toward the right of the screen: a three-quarter view, so they read as solid. */
export const STAND_YAW = 0.38;
/** Mounts turn their heads a little toward the viewer. */
export const MOUNT_YAW = -0.42;
/** Riders turn back toward the viewer from the mount. */
export const RIDER_YAW = 0.3;

const NARROW = { rx: 9.5, rz: 6, x: 0.5 };
const WIDE = { rx: 17, rz: 8.5, x: 0 };

function turned(k: Kit, yaw: number, f: () => void): void {
  setYaw(yaw);
  k.frame([0, 0, 0], [0, yaw, 0], f);
}

/** Blood on the ground at the feet, from battered: a spot and a drop; more at the second level. */
function feetBlood(k: Kit, w: Wear, x = 4.5, z = 6): void {
  if (bloody(w, 1)) groundDrops(k, x, z, true, w.blood >= 2);
}

// ---- helmets ----

/** A helmet dome over a head, with scratches and dents by stage and, once broken, a piece gone (a dark gap). */
function helmet(k: Kit, hd: { c: V3; r: number }, colour: string, w: Wear, o: { r?: number; to?: number; lift?: number; scratchDark?: boolean } = {}): Surface {
  const r = o.r ?? hd.r + 0.6;
  const c: V3 = [hd.c[0], hd.c[1] + (o.lift ?? 0.4), hd.c[2]];
  // The dome stops above the eyes (the camera looks down 38 degrees, so a dome to the equator would hide the face);
  // a ball behind fills the back and sides of the head in the same colour.
  k.dome(c, r, colour, { to: o.to ?? 0.9, seg: 12, gloss: 0.25 });
  k.ball([c[0], c[1] + 0.2, c[2] - 2.8], r - 0.9, colour, { detail: 1, gloss: 0.25 });
  const s = viewSphere(c, r + 0.05);
  const sc = o.scratchDark ? SCRATCH_DARK : SCRATCH;
  if (worn(w, 1)) scratches(k, s, [[-3.8, 3.6, -1.6, 5.0], [1.2, 5.6, 3.2, 4.4]], sc, 0.8);
  if (worn(w, 2)) { dent(k, s, 2.8, 3.4, 1.2, colour); dent(k, s, -1.6, 5.8, 0.9, colour); }
  if (helmBroken(w)) {
    // A jagged piece knocked out of the upper right, showing the dark lining.
    k.decal([2.6, 5.4, 4.6, 4.2, 5.4, 2.2, 3.8, 2.6, 3.4, 1.6, 2.2, 3.4], mix(colour, '#000000', 0.55), s);
    k.decal([3.0, 4.8, 4.4, 3.8, 4.8, 2.6, 3.8, 3.0, 3.4, 2.4, 2.6, 3.6], '#3A2A22', s);
  }
  return s;
}

/** A rim band round a helmet's lower edge (the dome stops at polar angle 0.98). */
function helmRim(k: Kit, hd: { c: V3; r: number }, r: number, lift: number, colour: string, arc?: [number, number]): void {
  const y = hd.c[1] + lift + r * Math.cos(0.9), rr = r * Math.sin(0.9) + 0.3;
  k.frustum([hd.c[0], 0, hd.c[2]], y - 0.5, y + 0.7, rr + 0.15, rr - 0.2, colour, { seg: 14, sz: 1, arc, gloss: 0.25 });
}

/** A cheek guard on one side of a head: a small plate hanging from the helmet's rim. */
function cheekGuard(k: Kit, hd: { c: V3; r: number }, side: number, colour: string): void {
  const p = onView(hd.c, hd.r, side * hd.r * 0.86, -hd.r * 0.05, 0.3);
  k.box([p[0], p[1] - 0.6, p[2] - 1.4], [2.2, 5.6, 3.4], colour, { rot: [0, side * 0.5, side * -0.08], gloss: 0.25 });
}

/** A crest of horsehair: an arc of cloth running front to back (`across` false) or side to side (true). */
function crest(k: Kit, base: V3, len: number, height: number, main: string, dark: string, w: Wear, across: boolean, thick = 1.6): void {
  // Torn short from battered: the back half gone with a ragged end.
  const torn = worn(w, 3);
  const pts: number[] = [];
  const n = 8;
  const end = torn ? 0.45 : 1;
  for (let i = 0; i <= n; i++) { const t = (i / n) * end; pts.push(-len / 2 + len * t, Math.sin(Math.PI * t) * height + (i === 0 ? 0 : 0)); }
  if (torn) pts.push(-len / 2 + len * end - 0.6, Math.sin(Math.PI * end) * height * 0.55, -len / 2 + len * end + 0.4, Math.sin(Math.PI * end) * height * 0.3);
  for (let i = n; i >= 0; i--) { const t = (i / n) * end; pts.push(-len / 2 + len * t, Math.sin(Math.PI * t) * height * 0.45 - 0.6); }
  k.slab(pts, thick, main, base, [0, across ? 0 : Math.PI / 2, 0]);
  // The darker inner band.
  const inner: number[] = [];
  for (let i = 1; i < n; i++) { const t = (i / n) * end; inner.push(-len / 2 + len * t, Math.sin(Math.PI * t) * height * 0.5 + 0.2); }
  for (let i = n - 1; i >= 1; i--) { const t = (i / n) * end; inner.push(-len / 2 + len * t, Math.sin(Math.PI * t) * height * 0.45 - 0.5); }
  k.slab(inner, thick + 0.3, dark, base, [0, across ? 0 : Math.PI / 2, 0], { hull: 0 });
}

// ---- the shared nine ----

function warrior(k: Kit, { look: c, wear: w }: FigureOpts): typeof NARROW {
  turned(k, STAND_YAW, () => {
    standingBody(k, c, w);
    arm(k, [-5.4, H(-15.6), 0], [-6.2, H(-10.5), 3.6], c.main);
    arm(k, [5.4, H(-15.6), 0], [8, H(-9), 3.2], c.main);
    sword(k, [8.2, H(-9.5), 3.4], [13.5, H(-19), 3.4], WOOD_DARK, { notch: worn(w, 2) ? 0.5 : undefined, snap: worn(w, 4) ? 0.55 : undefined, blood: w.blood });
    const hd = head(k, 0, -23);
    // Shaggy hair over the top and back, a headband in the owner's dark colour.
    k.dome([0, hd.c[1] + 0.6, -0.3], 6.75, HAIR, { to: 0.95, seg: 10 });
    k.ball([0, hd.c[1] + 0.6, -2.6], 5.9, HAIR, { detail: 1 });
    for (const x of [-4.4, -1.6, 1.4, 4.2]) k.ball(onView([0, hd.c[1] + 0.6, -0.3], 6.75, x, 1.4, -0.6), 1.5, HAIR, { detail: 0, hull: 0 });
    if (helmBroken(w)) {
      // Cut through: the band ends on the right and one end hangs loose by the cheek.
      k.frustum([0, 0, 0], hd.c[1] + 3.6, hd.c[1] + 5.0, 6.2, 5.6, c.dark, { arc: [-2.2, 3.4], seg: 14, sz: 1 });
      k.slab([0, 0, 1.6, 0, 2.0, -5.4, 0.6, -5.8], 0.7, c.dark, onView(hd.c, hd.r, 4.4, 1.6, 0.4), [0, 0.6, -0.15]);
    } else k.frustum([0, 0, 0], hd.c[1] + 3.6, hd.c[1] + 5.0, 6.2, 5.6, c.dark, { seg: 14, sz: 1 });
    faceWear(k, hd, w);
    roundShield(k, shieldFrame(-7.2, -9.2, 5.2), 6, WOOD_DARK, WOOD, w, (s) => {
      if (!worn(w, 4)) k.line([0, -4.4, 0, 4.4], 0.7, WOOD_DARK, s);
      k.ball([0, 0, 1.0], 1.7, c.accent, { detail: 0, gloss: 0.4 });
    });
    feetBlood(k, w);
  });
  return NARROW;
}

function spearman(k: Kit, { look: c, wear: w }: FigureOpts): typeof NARROW {
  turned(k, STAND_YAW, () => {
    spear(k, [10, 0.6, 2.4], [10, H(-29.6), 2.4], (36 - 29.6) / 0.785 + 0.6, { nick: worn(w, 2), snap: worn(w, 4) ? 0.62 : undefined, blood: w.blood });
    standingBody(k, c, w);
    arm(k, [5.4, H(-15.6), 0], [10, H(-11), 3.0], c.main);
    arm(k, [-5.4, H(-15.6), 0], [-5.4, H(-10.5), 3.6], c.main);
    const hd = head(k, 0, -23);
    helmet(k, hd, c.accent, w, { r: 7.1, lift: 0.8 });
    helmRim(k, hd, 7.1, 0.8, c.accent, helmBroken(w) ? [-2.6, 4.2] : undefined);
    faceWear(k, hd, w);
    // A tall oval shield: metal rim, the owner's dark colour, a bar of metal down the middle.
    const f = shieldFrame(-6, -9, 5.4);
    const cuts = shieldCuts(w, 5.8);
    const sy = 8.6 / 5.8 / 0.95;
    const oval = (r: number, cu: Cut[], inset = 0): number[] => { const p = discPoly(r, cu, inset).map((v, i) => (i % 2 ? v * sy : v)); return worn(w, 4) ? splitPoly(p, -0.6 + inset) : p; };
    k.frame(f.at, f.rot, () => {
      k.slab(oval(5.8, cuts), 1.4, c.accent, [0, 0, 0], [0, 0, 0], { gloss: 0.3 });
      k.slab(oval(4.5, cuts, 0.9), 1.0, c.dark, [0, 0, 0.45]);
      const s = flat(0.95);
      if (!worn(w, 4)) k.line([0, -7.6 * 0.95, 0, 7.6 * 0.95], 1.6, c.accent, s);
      else k.line([0, -1.2, 0, 7.4], 1.6, c.accent, s);
      // Wear on the oval face, stretched with it.
      discWear(k, (x, y) => s(x, y * 1.4), 5.8, c.dark, w);
    });
    feetBlood(k, w);
  });
  return NARROW;
}

function swordsman(k: Kit, { look: c, wear: w }: FigureOpts): typeof NARROW {
  turned(k, STAND_YAW, () => {
    standingBody(k, c, w);
    arm(k, [-5.4, H(-15.8), 0], [-9.2, H(-12.2), 2.0], c.main);
    arm(k, [5.4, H(-15.8), 0], [9.2, H(-12.2), 2.0], c.main);
    sword(k, [-9.4, H(-12.6), 2.2], [-15.5, H(-25), 2.2], c.accent, { notch: worn(w, 2) ? 0.55 : undefined, blood: w.blood });
    sword(k, [9.4, H(-12.6), 2.2], [15.5, H(-25), 2.2], c.accent, { notch: worn(w, 3) ? 0.4 : undefined, snap: worn(w, 4) ? 0.5 : undefined });
    const hd = head(k, 0, -22.4);
    helmet(k, hd, STEEL, w, { r: 7.1, lift: 0.5, scratchDark: true });
    cheekGuard(k, hd, -1, STEEL);
    if (!worn(w, 4) && !w.scarred) cheekGuard(k, hd, 1, STEEL);
    helmRim(k, hd, 7.1, 0.5, STEEL_DARK);
    // The tall plume in the metal colour, front to back.
    crest(k, [0, hd.c[1] + 6.6, -0.5], 13, 7.5, c.accent, mix(c.accent, '#000000', 0.25), w, false, 1.8);
    faceWear(k, hd, w);
    feetBlood(k, w);
  });
  return NARROW;
}

function defender(k: Kit, { look: c, wear: w }: FigureOpts): typeof NARROW {
  turned(k, STAND_YAW, () => {
    standingBody(k, c, w);
    arm(k, [5.4, H(-15.6), 0], [7.4, H(-10), 3.0], c.main);
    const hd = head(k, 1, -23.4);
    helmet(k, hd, STEEL, w, { r: 7.2, lift: 0.3, scratchDark: true });
    if (!helmBroken(w)) k.rod(onView(hd.c, hd.r, 0, 2.8, 0.5), onView(hd.c, hd.r, 0, -0.9, 0.5), 0.75, STEEL_DARK, { seg: 4 });
    faceWear(k, hd, w, 1);
    // The tower shield covers him from chin to ankle.
    const hw = 16.5 / 2, hh = 22 / 0.954 / 2;
    const rect = (x0: number, y0: number, x1: number, y1: number): number[] => [x0, y0, x1, y0, x1, y1, x0, y1];
    let outer = rect(-hw, -hh, hw, hh);
    let inner = rect(-hw + 1.4, -hh + 1.4, hw - 1.4, hh - 1.4);
    if (worn(w, 3)) {
      // A chip out of the top right corner.
      outer = [-hw, -hh, hw, -hh, hw, hh - 4.2, hw - 1.6, hh - 2.6, hw - 2.2, hh - 3.4, hw - 4.0, hh, -hw, hh];
      inner = [-hw + 1.4, -hh + 1.4, hw - 1.4, -hh + 1.4, hw - 1.4, hh - 5.2, hw - 2.4, hh - 3.8, hw - 3.0, hh - 4.4, hw - 4.6, hh - 1.4, -hw + 1.4, hh - 1.4];
    }
    if (worn(w, 4)) {
      // Split down the left: the lower left piece is gone.
      outer = [-hw + 5.4, -hh, hw, -hh, hw, hh - 4.2, hw - 1.6, hh - 2.6, hw - 2.2, hh - 3.4, hw - 4.0, hh, -hw, hh, -hw, 0.6, -hw + 2.4, -0.6, -hw + 3.2, -3.4, -hw + 4.4, -4.6];
      inner = [-hw + 6.4, -hh + 1.4, hw - 1.4, -hh + 1.4, hw - 1.4, hh - 5.2, hw - 2.4, hh - 3.8, hw - 3.0, hh - 4.4, hw - 4.6, hh - 1.4, -hw + 1.4, hh - 1.4, -hw + 1.4, -0.4, -hw + 3.0, -1.6, -hw + 4.0, -4.2, -hw + 5.4, -5.6];
    }
    k.frame([-2.75, H(-8.7), 6.0], [-0.36, 0, 0], () => {
      k.slab(outer, 1.6, c.dark);
      k.slab(inner, 1.0, c.main, [0, 0, 0.5]);
      const s = flat(1.05);
      k.line([-hw + 1.4, 0.4, hw - 1.4, 0.4], 2.4, c.accent, s);
      k.line([-1.2, worn(w, 4) ? -3 : -hh + 1.4, -1.2, hh - 1.4], 2.4, c.accent, s);
      k.decal(ell(-1.2, 0.4, 2.7, 2.7, 10), c.accent, s);
      k.ball([-1.2, 0.4, 1.4], 1.4, c.accent, { detail: 0, gloss: 0.4 });
      if (worn(w, 1)) scratches(k, s, [[-6.4, 6.6, -3.8, 8.2], [3.0, -4.0, 5.6, -2.6], [2.4, 7.4, 4.4, 6.0]]);
      if (worn(w, 2)) { dent(k, s, 4.0, 4.2, 1.3, c.main); dent(k, s, -5.0, -6.2, 1.2, c.main); }
      if (worn(w, 3)) crack(k, s, [5.2, 10.6, 4.2, 8.0, 5.0, 6.2, 3.8, 3.6]);
      if (worn(w, 4)) crack(k, s, [-4.6, 2.6, -3.0, 0.2, -3.6, -3.0]);
    });
    feetBlood(k, w, 6.5, 8);
  });
  return NARROW;
}

/** A bow from the top tip through the grip to the bottom tip (a smooth bend of short rods). */
function bow(k: Kit, top: V3, grip: V3, bottom: V3, snapped: boolean, colour = WOOD_DARK): { top: V3; bottom: V3 } {
  const pts: V3[] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // A quadratic through grip at t = 0.5.
    const ctrl = [2 * grip[0] - (top[0] + bottom[0]) / 2, 2 * grip[1] - (top[1] + bottom[1]) / 2, 2 * grip[2] - (top[2] + bottom[2]) / 2];
    const a = (1 - t) * (1 - t), b = 2 * t * (1 - t), cc = t * t;
    pts.push([a * top[0] + b * ctrl[0]! + cc * bottom[0], a * top[1] + b * ctrl[1]! + cc * bottom[1], a * top[2] + b * ctrl[2]! + cc * bottom[2]]);
  }
  const from = snapped ? 2 : 0;
  for (let i = from; i < n; i++) k.rod(pts[i]!, pts[i + 1]!, i === 4 || i === 3 ? 1.1 : 0.85, colour, { seg: 5 });
  if (snapped) {
    // The upper limb broken: a stub with splinters, the loose piece hanging from the string.
    const p = pts[2]!;
    k.rod(p, [p[0] - 0.4, p[1] + 1.6, p[2]], 0.5, colour, { r1: 0.05, seg: 4, hull: 0.6 });
    k.rod([p[0] + 1.2, p[1] - 0.4, p[2] + 0.6], [p[0] + 0.2, p[1] - 6, p[2] + 0.6], 0.75, colour, { seg: 5 });
    return { top: [p[0] + 0.2, p[1] - 6, p[2] + 0.6], bottom: pts[n]! };
  }
  return { top: pts[0]!, bottom: pts[n]! };
}

function archer(k: Kit, { look: c, wear: w }: FigureOpts): typeof NARROW {
  turned(k, STAND_YAW, () => {
    // The quiver on his back, arrows over the right shoulder.
    k.box([6.2, H(-20), -4.2], [4.0, 15, 3.4], WOOD_DARK, { rot: [0.15, 0, -0.32] });
    k.box([4.6, H(-26.4), -4.0], [4.4, 2.0, 3.8], c.accent, { rot: [0.15, 0, -0.32] });
    for (const [x, z] of [[3.6, -3.6], [5.6, -4.4]] as const) {
      k.rod([x, H(-26), z], [x - 1.2, H(-31.8), z - 0.4], 0.35, WOOD, { seg: 4, hull: 0.5 });
      k.slab([0, 0, 1.2, 1.4, 0, 3.2, -1.2, 1.4], 0.5, STRING, [x - 1.3, H(-32.2), z - 0.4], [0, 0, 0.2]);
    }
    if (worn(w, 2)) scratches(k, flat(-2.4), [[5.0, H(-17), 7.0, H(-15.4)]]);
    standingBody(k, c, w);
    const hd = head(k, -0.4, -22.2, 5.8);
    // A pointed hood in the owner's dark colour, open at the face.
    k.ball([hd.c[0], hd.c[1] + 0.3, hd.c[2] - 2.4], 6.6, c.dark, { detail: 1 });
    k.dome([hd.c[0], hd.c[1] + 0.6, hd.c[2] - 0.2], 6.9, c.dark, { to: 0.9, seg: 12 });
    if (!worn(w, 3)) k.rod([0, hd.c[1] + 5.4, -1.6], [0.6, hd.c[1] + 10.4, -2.4], 2.4, c.dark, { r1: 0.1, seg: 6 });
    else k.rod([0, hd.c[1] + 5.4, -1.6], [1.2, hd.c[1] + 7.4, -2.4], 2.4, c.dark, { r1: 1.0, seg: 6 });
    if (worn(w, 3)) { const s = viewSphere([hd.c[0], hd.c[1] + 0.6, hd.c[2] - 0.2], 6.95); const [lip, gap] = tearPolys(-4.6, 3.2, 2.6, 2.4); k.decal(lip, '#120F0D', s); k.decal(gap, HAIR, s); }
    faceWear(k, hd, w, 1);
    // The bow, drawn: bow arm out to the left, the arrow nocked at the chest.
    const grip: V3 = [-15.6, H(-14), 4.0];
    const b = bow(k, [-10.6, H(-27.5), 3.6], grip, [-10.6, H(-0.5), 3.6], worn(w, 4));
    const nock: V3 = [1.4, H(-14), 4.6];
    k.rod(b.top, worn(w, 4) ? [-3, H(-12), 5.2] : nock, 0.3, STRING, { seg: 3, hull: 0.5 });
    k.rod(worn(w, 4) ? [-3, H(-12), 5.2] : nock, b.bottom, 0.3, STRING, { seg: 3, hull: 0.5 });
    arm(k, [-5.2, H(-15.6), 0.6], [-14.8, H(-14), 4.0], c.main);
    arm(k, [5.2, H(-15.6), 0.6], [1.8, H(-14), 5.0], c.main);
    if (!worn(w, 4)) {
      k.rod([2.4, H(-14), 4.6], [-17, H(-14), 4.6], 0.42, WOOD, { seg: 4 });
      k.rod([-17, H(-14), 4.6], [-20, H(-14), 4.6], 1.0, STEEL_DARK, { r1: 0.05, seg: 4 });
      k.slab([0, 0, 2.4, 1.4, 2.4, -1.4], 0.4, c.accent, [2.0, H(-14), 4.6], [0, 0, 0]);
    }
    if (bloody(w, 1)) smear(k, viewSphere([-14.8, H(-14), 4.0], 1.9), -0.6, 0.4, 1, -0.4, 1.6, 1.2);
    feetBlood(k, w);
  });
  return WIDE;
}

function horseman(k: Kit, { look: c, wear: w }: FigureOpts): typeof WIDE {
  turned(k, MOUNT_YAW, () => { horse(k, { coat: HORSE, shade: HORSE_DARK, mane: MANE }, w); });
  turned(k, RIDER_YAW, () => {
    rider(k, [0, H(-10), 0.6], c, c.main, w);
    arm(k, [4.0, H(-19.4), 0.6], [5, H(-14.8), 4.2], c.main);
    arm(k, [-4.0, H(-19.4), 0.6], [-5.0, H(-13.6), 3.4], c.main);
    const hd = head(k, 0, -25.6, 5.4);
    // A soft cloth cap with a falling tail, no armour.
    k.dome([0, hd.c[1] + 0.6, 0], 5.9, c.dark, { to: 1.0, seg: 10 });
    k.ball([0, hd.c[1] - 0.2, -1.8], 5.4, c.dark, { detail: 1 });
    if (!worn(w, 3)) k.rod([2.6, hd.c[1] + 2.8, -2.6], [6.8, hd.c[1] - 0.4, -4.6], 1.6, c.dark, { r1: 0.5, seg: 5 });
    else k.rod([2.6, hd.c[1] + 2.8, -2.6], [4.4, hd.c[1] + 1.6, -3.4], 1.6, c.dark, { r1: 1.0, seg: 5 });
    if (worn(w, 2)) dirt(k, viewSphere([0, hd.c[1] + 0.6, 0], 5.95), 2.0, 4.0, 2.8, c.dark);
    faceWear(k, hd, w);
    // A short spear held high in front of him, pointing forward.
    spear(k, [2, H(-8), 4.4], [12.4, H(-31.6), 4.4], 5.6, { nick: worn(w, 2), snap: worn(w, 4) ? 0.6 : undefined, blood: w.blood }, 0.75);
  });
  feetBlood(k, w, 6, 9);
  return WIDE;
}

function knight(k: Kit, { look: c, wear: w }: FigureOpts): typeof WIDE {
  turned(k, MOUNT_YAW, () => {
    horse(k, { coat: GREY_HORSE, shade: GREY_HORSE_DARK, mane: GREY_HORSE_DARK }, w);
    const by = H(-6.5);
    // A cloth in the owner's colour over the horse, a metal band, and a scalloped hem (torn from battered).
    k.frustum([-2, 0, 0], by - 4.6, by + 3.2, 13.6, 12.6, c.main, { sz: 0.45, seg: 14 });
    k.frustum([-2, 0, 0], by - 2.2, by - 0.8, 13.5, 13.3, c.accent, { sz: 0.455, seg: 14 });
    const hemZ = 13.6 * 0.45;
    const teeth: number[] = [-13, 0.6];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const x0 = -13 + (i * 24) / n;
      const torn = worn(w, 3) && (i === 2 || i === 5);
      teeth.push(x0 + 12 / n, torn ? -3.6 : -1.6, x0 + 24 / n, 0);
    }
    teeth.push(11, 0.6);
    k.slab(teeth, 0.5, c.main, [-2 + 0.8, by - 4.6, hemZ - 0.5], [0, 0, 0]);
    const cloth = (x: number, y: number): { p: V3; n: V3 } => ({ p: [x, y, hemZ + 0.15], n: [0, 0.1, 1] });
    if (worn(w, 1)) dirt(k, cloth, -6, by - 3, 5, c.main);
    if (worn(w, 3)) { const [lip, gap] = tearPolys(4, by - 1.6, 3.8, 3.2); k.decal(lip, mix(c.main, '#000000', 0.5), cloth); k.decal(gap, GREY_HORSE, cloth); }
    // The cloth over the neck.
    k.rod([6.6, H(-10.5), 0], [10.8, H(-19), 0], 3.95, c.main, { r1: 2.95, seg: 7 });
  });
  turned(k, RIDER_YAW, () => {
    // The rider in steel under a tabard, with a closed helm.
    const top = rider(k, [0, H(-10.4), 0.6], c, STEEL_DARK, w);
    k.frustum([0, 0, 0.9], H(-11), H(-18.6), 5.7, 4.9, c.dark, { sz: 0.72 });
    const ts = tunicSurf(1.1);
    if (worn(w, 2)) dent(k, ts, -1.4, H(-16), 1.2, c.dark);
    arm(k, [4.2, top - 1.6, 0.6], [-1, H(-17.2), 5.2], STEEL_DARK);
    arm(k, [-4.2, top - 1.6, 0.6], [-6.4, H(-12.6), 3.8], STEEL_DARK);
    if (!(worn(w, 4) || w.scarred)) k.ball([-4.8, top - 1.0, 0.4], 2.6, STEEL, { s: [1.2, 0.8, 1.1], detail: 1, gloss: 0.3 });
    const hc: V3 = [0, H(-27.2), 0.4];
    k.ball(hc, 1, STEEL, { s: [5.4, 6.8, 5.4], detail: 1, gloss: 0.3 });
    const hs = viewSphere(hc, 5.6);
    k.line([-4.6, 0.8, 4.6, 0.8], 1.5, VISOR, hs);
    k.line([0, -0.8, 0, -4.2], 1.0, STEEL_DARK, hs);
    if (worn(w, 1)) scratches(k, hs, [[-3.4, 3.6, -1.6, 4.4], [2.0, -2.2, 3.6, -1.0]], SCRATCH_DARK, 0.8);
    if (worn(w, 2)) dent(k, hs, 2.6, 3.0, 1.2, STEEL);
    if (helmBroken(w)) {
      k.decal([1.8, -0.6, 4.4, -1.2, 4.8, -3.6, 3.2, -4.6, 2.4, -3.0], '#2A1E19', hs);
      if (bloody(w, 1)) smear(k, hs, 3.2, -2.6, 0, -1, 2.6, 1.3);
    } else if (bloody(w, 1)) smear(k, hs, -3.6, -1.6, 0.2, -1, 2.6, 1.3);
    if (w.scarred && !bloody(w, 1)) k.line([2.6, -1.8, 3.8, -3.8], 0.9, mix(SKIN, '#8C5A44', 0.5), hs);
    // A plume in the metal colour on the helm.
    crest(k, [0, hc[1] + 6.4, 0], 7, 4.6, c.accent, mix(c.accent, '#000000', 0.25), w, false, 1.6);
    // A long lance couched under the arm and raised, passing above the horse's head.
    const butt: V3 = [-12, H(-8), 5.6], tip: V3 = [16.2, H(-32.4), 5.6];
    if (worn(w, 4)) spear(k, butt, tip, 6, { snap: 0.55, blood: w.blood }, 1.05, WOOD);
    else {
      k.rod(butt, tip, 1.05, WOOD, { r1: 0.85 });
      k.rod(tip, [19.6, H(-35.4), 5.6], 1.5, STEEL_DARK, { r1: 0.05, seg: 6, gloss: 0.5 });
      if (bloody(w, 1)) k.ball([17.0, H(-33), 6.4], 0.9, BLOOD, { detail: 0, hull: 0 });
    }
    k.slab([0, 0, 4.6, 1.8, 0.6, 4.4], 0.6, c.accent, [-1.6, H(-12.6), 6.4], [0, 0, 0.55]);
  });
  feetBlood(k, w, 6, 9);
  return WIDE;
}

function catapult(k: Kit, { look: c, wear: w }: FigureOpts): typeof WIDE {
  turned(k, STAND_YAW * 0.6, () => {
    const wheel = (x: number, z: number, near: boolean, broken: boolean): void => {
      const r = near ? 4.6 : 4.4;
      const cuts: Cut[] = broken ? [{ from: 20, to: 120, inner: 1.6, jag: 0.6 }] : [];
      k.frame([x, r, z], [0, 0, 0], () => {
        k.slab(discPoly(r, cuts, 0, 12), 1.6, WOOD_DARK);
        if (near) {
          k.slab(discPoly(3.0, cuts, 1.2, 10), 1.8, WOOD, [0, 0, 0.1]);
          k.ball([0, 0, 1.2], 1.2, c.accent, { detail: 0, gloss: 0.4 });
        }
      });
    };
    wheel(11, -5, false, false);
    k.box([-0.5, H(-6.5), -4.2], [27, 3, 2.4], WOOD_DARK);
    // The A-frame.
    for (const z of [-3.4, 3.4]) {
      k.rod([-3.6, H(-7), z], [1.6, H(-20.6), z * 0.25], 1.0, WOOD_DARK);
      k.rod([7.2, H(-7), z], [1.8, H(-20.6), z * 0.25], 1.0, WOOD_DARK);
    }
    k.ball([1.7, H(-18.8), 1.6], 1.4, c.accent, { detail: 0, gloss: 0.4 });
    // The throwing arm, raised back, with a stone in its cup: cracked when battered, snapped when broken.
    const a0: V3 = [9, H(-9), 0], a1: V3 = [-11, H(-25), 0];
    if (worn(w, 4)) {
      spear(k, a0, a1, 0, { snap: 0.55 }, 1.35, WOOD);
      k.ball([-13, 1.8, 6], 2.6, STONE, { detail: 0 });
    } else {
      k.rod(a0, a1, 1.35, WOOD);
      k.dome([-12, H(-26.8), 0], 3.2, WOOD_DARK, { to: 1.6, seg: 8, s: [1, -0.7, 1] });
      k.ball([-12, H(-27.6), 0], 2.9, STONE, { detail: 0 });
      if (worn(w, 3)) {
        const s = (x: number, y: number): { p: V3; n: V3 } => ({ p: [x, y, 1.4], n: [0, 0.3, 1] });
        crack(k, s, [-1, H(-17) - 1, -3, H(-18.6) - 0.6, -4.6, H(-19.6)]);
      }
    }
    k.box([-1.5, H(-4.3), 4.2], [27, 3.4, 2.6], WOOD);
    const beam = (x: number, y: number): { p: V3; n: V3 } => ({ p: [x, y, 5.6], n: [0, 0, 1] });
    if (worn(w, 1)) scratches(k, beam, [[-9, H(-4.8), -6.4, H(-3.6)], [4, H(-3.6), 6.8, H(-4.8)]]);
    if (worn(w, 2)) dent(k, beam, -2, H(-4.3), 1.2, WOOD);
    wheel(-8.6, 6.2, true, false);
    wheel(7.4, 6.2, true, worn(w, 3));
    // The owner's pennant on a pole at the back, torn when broken.
    k.rod([13.6, H(-5), -3], [13.6, H(-30.4), -3], 0.6, WOOD_DARK);
    const pen = worn(w, 4) ? [0, 0, 4.0, -1.6, 2.6, -2.8, 3.8, -4.6, 0, -7.2] : [0, 0, 6, -3.8, 0, -7.6];
    k.slab(pen, 0.5, c.main, [14.0, H(-30.6), -3], [0, 0, 0]);
  });
  return WIDE;
}

function sellsword(k: Kit, { look: c, wear: w }: FigureOpts): typeof NARROW {
  turned(k, STAND_YAW, () => {
    // The cloak hangs from his shoulders and flares back to the left, its hem ragged (more torn when broken).
    const hem = worn(w, 4) ? [-13.6, 1.6, -11.0, -3.2, -9.0, 1.0, -6.6, -1.6, -4.4, 2.2, -2.0, -2.4, 0.4, 0.4, 3.0, -1.2, 7.6, 0.4] : [-13.2, 1.6, -8.4, 0.2, -4.4, 1.8, -0.4, 0, 3, 1.4, 7.4, 0.4];
    const cloak = [-5.6, -18.4, 5.6, -18.4, ...[...hem].reverse().reduce<number[]>((a, v, i, arr) => (i % 2 ? a : [...a, arr[i + 1]!, arr[i]!]), []), -11.6, -6];
    k.slab(cloak.map((v, i) => (i % 2 ? H(v) : v)), 1.0, c.dark, [0, 0, -4.0], [0.1, 0, 0]);
    k.slab([-1.6, -1.5, 1.6, -1.5, 1.6, 1.5, -1.6, 1.5], 0.6, c.main, [-10.0, H(-3.2), -3.3], [0.1, 0, 0]);
    standingBody(k, c, w);
    const ts = tunicSurf(0.3);
    k.decal([-5, H(-14.2), -0.8, H(-14.2), -0.8, H(-10.2), -5, H(-10.2)], WOOD, ts);
    k.frustum([0, 0, 0], H(-5.6), H(-7.6), 6.95, 6.8, BOOT, { sz: TUNIC.sz + 0.03 });
    k.box([0.2, H(-6.6), 5.0], [2.4, 2.4, 1.0], c.accent, { gloss: 0.4 });
    // The cloak's collar, then two shoulders that do not match: steel on the left (lost when broken), leather on the right.
    k.frustum([0, 0, 0], H(-16.4), H(-19.4), 6.0, 5.2, c.dark, { sz: 0.8 });
    if (!(worn(w, 4))) {
      k.ball([-6.4, H(-16.4), 0.4], 1, STEEL, { s: [4.0, 3.0, 3.6], detail: 1, gloss: 0.3 });
      if (worn(w, 2)) dent(k, viewSphere([-6.4, H(-16.4), 0.4], 3.6), -0.6, 1.0, 1.0, STEEL);
    } else k.decal(tearPolys(-5.0, H(-16), 3, 2.6)[0], mix(c.main, '#000000', 0.4), tunicSurf(0.35));
    k.ball([6.4, H(-16.4), 0.4], 1, WOOD, { s: [3.4, 2.4, 3.2], detail: 1 });
    // The long blade, held low and forward in both hands, its point near the ground.
    arm(k, [-5.2, H(-15.6), 0.4], [5.2, H(-12.6), 4.6], c.main);
    arm(k, [5.4, H(-15.6), 0.4], [7.4, H(-10.4), 4.6], c.main);
    sword(k, [6.6, H(-11.2), 4.8], [18.6, H(1.8), 4.8], c.accent, { notch: worn(w, 2) ? 0.45 : undefined, snap: worn(w, 4) ? 0.52 : undefined, blood: w.blood });
    const hd = head(k, 0, -23);
    // A short beard and a dented, broad-brimmed iron hat.
    k.ball(onView(hd.c, hd.r, 0, -3.2, -2.4), 4.6, HAIR, { s: [1.1, 0.8, 0.8], detail: 1 });
    const hc: V3 = [0, H(-27.4), 0];
    k.dome(hc, 5.8, STEEL_DARK, { to: 1.57, seg: 10, gloss: 0.2 });
    const brim = worn(w, 4) || w.scarred ? discPoly(8.8, [{ from: 330, to: 30, inner: 6.0, jag: 0.6 }], 0, 16) : discPoly(8.8, [], 0, 16);
    k.slab(brim, 0.9, mix(STEEL, STEEL_DARK, 0.5), [0, hc[1] + 0.4, 0], [Math.PI / 2, 0, 0], { gloss: 0.25 });
    const hs = viewSphere(hc, 5.85);
    k.decal([1.4, 5.6, 3.4, 4.8, 2.4, 3.2], STEEL, hs);
    if (worn(w, 1)) scratches(k, hs, [[-3.2, 3.2, -1.2, 4.6]], SCRATCH, 0.8);
    if (worn(w, 2)) dent(k, hs, -1.0, 2.0, 1.2, STEEL_DARK);
    faceWear(k, hd, w);
    feetBlood(k, w, 2.5, 7);
  });
  return NARROW;
}

// ---- the Spartans ----

function hoplite(k: Kit, { look: c, wear: w }: FigureOpts): typeof NARROW {
  turned(k, STAND_YAW, () => {
    spear(k, [12, 0.6, 2.4], [14.4, H(-30), 2.4], (36 - 30) / 0.785 + 0.8, { nick: worn(w, 2), snap: worn(w, 4) ? 0.6 : undefined, blood: w.blood });
    standingBody(k, c, w);
    arm(k, [5.4, H(-15.6), 0], [13, H(-11), 2.8], c.main);
    const hd = head(k, 0, -22.4);
    helmet(k, hd, c.accent, w, { r: 7.1, lift: 0.4 });
    if (!worn(w, 4) && !w.scarred) cheekGuard(k, hd, 1, c.accent);
    cheekGuard(k, hd, -1, c.accent);
    helmRim(k, hd, 7.1, 0.4, BRONZE_RIM);
    // The horsehair crest, arching front to back.
    crest(k, [0, hd.c[1] + 6.2, -0.6], 17, 8.2, c.main, c.dark, w, false, 2.2);
    faceWear(k, hd, w);
    // The great round shield with a lambda chevron in the owner's dark colour.
    roundShield(k, shieldFrame(-5.6, -9.6, 6.4), 9.8, BRONZE_RIM, c.accent, w, (s) => {
      const lam = [0, 7.6, 6.0, -6.0, 3.0, -6.0, 0, 1.4, -3.0, -6.0, -6.0, -6.0];
      if (!worn(w, 4)) k.decal(lam, c.dark, s);
      else k.decal([1.4, 4.6, 6.0, -6.0, 3.0, -6.0, 1.4, -2.4], c.dark, s);
    });
    feetBlood(k, w, 3, 9);
  });
  return NARROW;
}

function kingsGuard(k: Kit, { look: c, wear: w }: FigureOpts): typeof NARROW {
  turned(k, STAND_YAW, () => {
    spear(k, [13, 0.6, 1.6], [13, H(-33.6), 1.6], (40 - 33.6) / 0.785 + 0.8, { nick: worn(w, 2), snap: worn(w, 4) ? 0.6 : undefined, blood: w.blood }, 0.85);
    // A long cape falls behind him to his heels (torn when broken).
    const capeHem = worn(w, 4) ? [12.6, 2.6, 8.6, -1.6, 5.0, 2.6, 1.4, -2.4, -2.6, 2.6, -6.4, -0.6, -12.8, 2.6] : [13, 2.6, -13, 2.6];
    const cape = [-7, -21, 7, -21, 11.6, -13, ...capeHem, -14, -3, -12, -12];
    k.slab(cape.map((v, i) => (i % 2 ? H(v) : v)), 1.0, c.main, [0, 0, -4.2], [0.08, 0, 0]);
    // Legs, boots, a kilt and a bronze breastplate.
    for (const s of [-1, 1]) { k.rod([s * 2.8, 2.2, 0], [s * 2.8, H(-6), 0], 1.75, SKIN); k.box([s * 3, 1.3, 0.6], [3.9, 2.6, 4.8], BOOT); }
    k.frustum([0, 0, 0], H(-4), H(-10.6), 7.2, 6.4, c.main, { sz: 0.68 });
    k.frustum([0, 0, 0], H(-4) - 0.01, H(-5.6), 7.35, 7.2, c.dark, { sz: 0.7 });
    tunicWear(k, c, { ...w, stage: Math.min(w.stage, 2) as Wear['stage'] }, c.main);
    k.frustum([0, 0, 0], H(-10), H(-21.6), 6.8, 6.6, c.accent, { sz: 0.7, gloss: 0.3 });
    k.frustum([0, 0, 0], H(-9.6), H(-11.2), 7.0, 6.9, BRONZE_RIM, { sz: 0.72 });
    const bs = (x: number, y: number): { p: V3; n: V3 } => ({ p: [x, y, 0.7 * 6.7 * 0.93 + 0.2], n: [0, 0.1, 1] });
    k.line([-3.6, H(-17), -1.8, H(-15.4), 0, H(-17), 1.8, H(-15.4), 3.6, H(-17)], 0.7, BRONZE_RIM, bs);
    if (worn(w, 1)) scratches(k, bs, [[-4.0, H(-19.6), -1.8, H(-18.4)], [1.4, H(-13), 3.6, H(-12)]]);
    if (worn(w, 2)) dent(k, bs, 2.4, H(-19), 1.2, c.accent);
    if (worn(w, 3)) crack(k, bs, [-2.6, H(-21), -1.6, H(-18.6), -2.6, H(-16.4)]);
    if (bloody(w, 2)) smear(k, bs, 1.2, H(-13.4), 0.2, -1, 3.2, 1.6);
    arm(k, [5.6, H(-19.6), 0], [13, H(-12.6), 2.4], c.main);
    const hd = head(k, 0, -26.6);
    helmet(k, hd, c.accent, w, { r: 7.1, lift: 0.4 });
    if (!worn(w, 4) && !w.scarred) cheekGuard(k, hd, 1, c.accent);
    cheekGuard(k, hd, -1, c.accent);
    helmRim(k, hd, 7.1, 0.4, BRONZE_RIM);
    // A crest worn side to side, the mark of a leader.
    crest(k, [0, hd.c[1] + 5.2, -0.4], 23, 8.4, c.main, c.dark, w, true, 2.2);
    faceWear(k, hd, w);
    // A bronze shield on his left arm, with a boss in the owner's colour.
    roundShield(k, shieldFrame(-11.0, -11.6, 4.6, -0.36, -0.25), 7.6, BRONZE_RIM, c.accent, w, (s, cuts) => {
      // The inner ring and boss; once split, only the half that is left keeps its ring.
      const half = (pts: number[]): number[] => (cuts.length < 2 ? pts : pts.map((v, i) => (i % 2 === 0 ? Math.max(v, 0.2) : v)));
      k.decal(half(ell(0, 0, 4.4, 4.4, 12)), BRONZE_RIM, s);
      k.decal(half(ell(0, 0, 3.4, 3.4, 12)), c.accent, s);
      if (cuts.length < 2) k.decal(ell(0, 0, 1.8, 1.8, 8), c.main, s);
    });
    feetBlood(k, w, 3, 9);
  });
  return NARROW;
}

function piper(k: Kit, { look: c, wear: w }: FigureOpts): typeof NARROW {
  turned(k, STAND_YAW, () => {
    // A short cloak hangs from his shoulders behind him, to the waist.
    const hem = worn(w, 4) ? [10, -6.8, 7, -4.6, 4.2, -7.4, 0.8, -4.8, -2.4, -7, -6.4, -5.2, -10, -6.8] : [10, -6.8, -10, -6.8];
    k.slab([-7.4, -17.4, 7.4, -17.4, 10.4, -14, ...hem, -10.4, -14].map((v, i) => (i % 2 ? H(v) : v)), 1.0, c.dark, [0, 0, -3.8], [0.08, 0, 0]);
    standingBody(k, c, w);
    for (const s of [-1, 1]) k.ball([s * 4.6, H(-15.6), 3.6], 1.2, c.accent, { detail: 0, gloss: 0.4, hull: 0 });
    const hd = head(k, 0, -23);
    // Short hair with a wreath of leaves (fewer leaves once battered).
    k.dome([0, hd.c[1] + 0.6, -0.4], 6.75, HAIR, { to: 0.95, seg: 10 });
    k.ball([0, hd.c[1] + 0.6, -2.6], 5.9, HAIR, { detail: 1 });
    const leaves = worn(w, 3) ? [-5.4, -2.8, 2.8] : [-5.6, -3, 0, 3, 5.6];
    for (const x of leaves) k.ball(onView([0, hd.c[1] + 0.6, -0.4], 6.75, x, 4.6 - Math.abs(x) * 0.35, 0.2), 1.0, LEAF, { s: [1.6, 0.9, 1.2], detail: 0, hull: 0.6 });
    faceWear(k, hd, w);
    // The double pipe: two reeds spreading from the lips, one in each hand, flared at the ends.
    const lips = onView(hd.c, hd.r, 0, -3.6, 0.2);
    for (const s of [-1, 1]) {
      const end: V3 = [s * 4.8, H(-6.8), 6.4];
      if (worn(w, 4) && s > 0) {
        const mid: V3 = [(lips[0] + end[0]) / 2, (lips[1] + end[1]) / 2, (lips[2] + end[2]) / 2];
        k.rod(lips, mid, 0.65, PIPE, { seg: 5 });
      } else {
        k.rod(lips, end, 0.65, PIPE, { seg: 5 });
        k.rod(end, [end[0] + s * 0.8, end[1] - 2.6, end[2] + 0.4], 0.7, PIPE, { r1: 1.6, seg: 6 });
      }
      arm(k, [s * 5.4, H(-15.6), 0], [s * 3.2, H(-11.4), 5.4], s < 0 ? c.main : c.dark);
    }
    // Two notes rise from the music.
    const note = (x: number, y: number, s: number): void => {
      k.ball([x, H(y), 2], 1.4 * s, c.accent, { s: [1.1, 0.85, 0.7], detail: 0, gloss: 0.3 });
      k.rod([x + 1.3 * s, H(y), 2], [x + 1.3 * s, H(y - 6.4 * s), 2], 0.45, c.accent, { seg: 4 });
      k.slab([0, 0, 2.8 * s, -2 * s, 0, -2 * s], 0.5, c.accent, [x + 1.3 * s, H(y - 6.6 * s), 2], [0, 0, 0]);
    };
    note(10.6, -24.6, 1);
    note(14.8, -17.4, 0.85);
    feetBlood(k, w);
  });
  return NARROW;
}

function scout(k: Kit, { look: c, wear: w }: FigureOpts): typeof NARROW {
  turned(k, STAND_YAW, () => {
    // Crouched low: the back knee down, the front leg bent, ready to spring.
    k.rod([-4.4, H(-3.6), -0.6], [-7.2, 1.6, -0.6], 1.8, SKIN);
    k.box([-8, 1.2, -0.2], [4.4, 2.4, 4.6], BOOT);
    k.rod([3.8, H(-4.4), 0.6], [7.2, H(-3.4), 2.2], 1.8, SKIN);
    k.rod([7.2, H(-3.4), 2.2], [6.8, 1.6, 2.2], 1.7, SKIN);
    k.box([7, 1.2, 2.6], [4.4, 2.4, 4.6], BOOT);
    k.frustum([0, 0, 0], H(-2.4), H(-12.6), 6.8, 5.6, c.main, { sz: 0.7 });
    k.frustum([0, 0, 0], H(-2.4) - 0.01, H(-4.8), 7.0, 6.8, c.dark, { sz: 0.72 });
    const ts = (x: number, y: number) => tunicSurf(0.3)(x, y);
    if (worn(w, 1)) dirt(k, ts, 2.6, H(-3.4), 3.6, c.dark);
    if (worn(w, 3)) { const [lip, gap] = tearPolys(1.6, H(-9.4), 3.4, 3.0); k.decal(lip, mix(c.main, '#000000', 0.45), ts); k.decal(gap, SKIN, ts); }
    // The hooded cloak in the owner's dark colour, sweeping down his back (in rags when broken).
    const hem = worn(w, 4) ? [-6.6, 0.6, -8.4, -1.6, -9.8, 2.8, -11.4, -0.8, -13.4, 2] : [-6.6, 0.6, -13.4, 2];
    k.slab([-1, -22.6, -1, -12.6, -5.6, -10, ...hem, -12.6, -10, -9, -21].map((v, i) => (i % 2 ? H(v) : v)), 1.4, c.dark, [0, 0, -2.4], [0, 0.3, 0]);
    const hd = head(k, 2.2, -14.8, 5.4, 1.2, 0.6);
    k.ball([hd.c[0] - 0.4, hd.c[1] + 0.3, hd.c[2] - 1.6], 6.4, c.dark, { detail: 1 });
    k.dome([hd.c[0], hd.c[1] + 0.6, hd.c[2] - 0.2], 5.95, c.dark, { to: 0.9, seg: 12 });
    k.rod([hd.c[0] - 4, hd.c[1] + 2.6, hd.c[2] - 3], [hd.c[0] - 9.4, hd.c[1] + 6.8, hd.c[2] - 4.6], 2.6, c.dark, { r1: 0.2, seg: 6 });
    faceWear(k, hd, w, 1);
    // A short dagger held low and forward.
    arm(k, [4.2, H(-11), 1.4], [8.8, H(-8.2), 5.0], c.main);
    sword(k, [9.6, H(-8.4), 5.2], [16.0, H(-11.6), 5.2], WOOD_DARK, { notch: worn(w, 2) ? 0.5 : undefined, snap: worn(w, 4) ? 0.45 : undefined, blood: w.blood }, 1.0);
    feetBlood(k, w, 4, 8);
  });
  return NARROW;
}

// ---- the Mongols ----

/** A cap with a turned-up fur brim and a point of metal on top (lost once broken). */
function steppeCap(k: Kit, hd: { c: V3; r: number }, c: Look, w: Wear): void {
  k.dome([hd.c[0], hd.c[1] + 0.8, hd.c[2]], 5.9, c.dark, { to: 0.95, seg: 10 });
  k.ball([hd.c[0], hd.c[1], hd.c[2] - 1.8], 5.4, c.dark, { detail: 1 });
  if (!helmBroken(w)) k.rod([hd.c[0], hd.c[1] + 6.4, hd.c[2]], [hd.c[0], hd.c[1] + 10.4, hd.c[2]], 1.3, c.accent, { r1: 0.1, seg: 5, gloss: 0.4 });
  else k.rod([hd.c[0], hd.c[1] + 6.4, hd.c[2]], [hd.c[0] + 0.3, hd.c[1] + 7.6, hd.c[2]], 1.3, c.accent, { r1: 0.9, seg: 5, gloss: 0.4 });
  const fur: [number, number] | undefined = worn(w, 3) ? [-1.0, 5.4] : undefined;
  k.frustum([hd.c[0], 0, hd.c[2]], hd.c[1] + 3.4, hd.c[1] + 5.2, 5.7, 5.0, FUR, { seg: 12, sz: 1, arc: fur, open: false });
  if (worn(w, 2)) dirt(k, viewSphere([hd.c[0], hd.c[1] + 0.8, hd.c[2]], 5.95), -2.2, 4.4, 2.6, c.dark);
}

function horseArcher(k: Kit, { look: c, wear: w }: FigureOpts): typeof WIDE {
  turned(k, MOUNT_YAW, () => { horse(k, { coat: DUN, shade: DUN_DARK, mane: MANE }, w); });
  turned(k, RIDER_YAW, () => {
    rider(k, [0, H(-10), 0.6], c, c.main, w);
    k.frustum([0, 0, 0.6], H(-11.8), H(-13.6), 5.5, 5.3, c.accent, { sz: 0.74 });
    const hd = head(k, 0, -25.6, 5.4);
    steppeCap(k, hd, c, w);
    faceWear(k, hd, w);
    // Turned in the saddle, he draws the bow back over the horse's rump.
    const b = bow(k, [-8.4, H(-30.8), 3.2], [-16.4, H(-17.4), 3.6], [-8.4, H(-4), 3.2], worn(w, 4));
    const nock: V3 = [1.8, H(-17.4), 4.4];
    const loose: V3 = [-4, H(-14), 5];
    k.rod(b.top, worn(w, 4) ? loose : nock, 0.3, STRING, { seg: 3, hull: 0.5 });
    k.rod(worn(w, 4) ? loose : nock, b.bottom, 0.3, STRING, { seg: 3, hull: 0.5 });
    arm(k, [-4.4, H(-19.4), 0.8], [-13.4, H(-17.4), 3.6], c.main);
    arm(k, [4.4, H(-19.4), 0.8], [1.8, H(-17.4), 4.8], c.main);
    if (!worn(w, 4)) {
      k.rod([2.4, H(-17.4), 4.4], [-17.2, H(-17.4), 4.4], 0.42, WOOD, { seg: 4 });
      k.rod([-17.2, H(-17.4), 4.4], [-20.2, H(-17.4), 4.4], 1.0, STEEL_DARK, { r1: 0.05, seg: 4 });
      k.slab([0, 0, 2.4, 1.4, 2.4, -1.4], 0.4, c.accent, [2.0, H(-17.4), 4.4], [0, 0, 0]);
    }
    if (bloody(w, 1)) smear(k, viewSphere([-13.4, H(-17.4), 3.6], 1.9), -0.4, 0.4, 1, -0.6, 1.6, 1.2);
  });
  feetBlood(k, w, 6, 9);
  return WIDE;
}

function khansGuard(k: Kit, { look: c, wear: w }: FigureOpts): typeof WIDE {
  turned(k, MOUNT_YAW, () => {
    horse(k, { coat: BLACK_HORSE, shade: BLACK_HORSE_DARK, mane: HORSE_HAIR, hoof: '#211A15' }, w);
    const by = H(-6.5);
    // Lamellar armour on the horse: rows of plates in the owner's colour.
    k.frustum([-2, 0, 0], by - 4.4, by + 2.8, 13.4, 12.6, c.main, { sz: 0.45, seg: 14 });
    k.frustum([-2, 0, 0], by - 4.4, by - 3.2, 13.5, 13.4, c.accent, { sz: 0.455, seg: 14 });
    const hemZ = 13.4 * 0.45 + 0.1;
    const cloth = (x: number, y: number): { p: V3; n: V3 } => ({ p: [x, y, hemZ], n: [0, 0.1, 1] });
    for (const y of [by + 1.4, by - 1.0]) k.line([-12, y, 9, y], 0.9, c.dark, cloth);
    if (worn(w, 1)) scratches(k, cloth, [[-8, by + 0.2, -5.6, by - 0.6], [2, by + 0.6, 4.4, by + 0.0]]);
    if (worn(w, 3)) for (const [x, y] of [[-4, by - 2.3], [3.4, by + 0.2], [-9, by + 0.2]] as const) k.decal([x - 1, y + 0.9, x + 1, y + 0.9, x + 1, y - 0.9, x - 1, y - 0.9], BLACK_HORSE, cloth);
    k.rod([6.6, H(-10.5), 0], [10.8, H(-19), 0], 3.95, c.main, { r1: 2.95, seg: 7 });
  });
  turned(k, RIDER_YAW, () => {
    // The standard: a tall lance with a tuft of horsehair below a gold ring, held upright behind the saddle.
    const snap = worn(w, 4);
    spear(k, [-9, 0.8, -1], [-9, H(-34), -1], (40 - 34) / 0.785 + 0.6, { nick: worn(w, 2), snap: snap ? 0.84 : undefined }, 0.8);
    k.frustum([-9, 0, -1], H(-31.4), H(-32.8), 1.6, 1.6, c.accent, { seg: 8, gloss: 0.4 });
    const tuftLen = worn(w, 3) ? 6 : 11;
    k.rod([-9.2, H(-31.4), -1], [-10.4, H(-31.4) - tuftLen, -1.4], 2.2, HORSE_HAIR, { r1: 1.4, seg: 6 });
    // The rider sits tall in lamellar armour under a steel helmet with a spike.
    rider(k, [0, H(-10), 0.6], c, c.main, w, { torsoTop: H(-23.6) });
    const ls = tunicSurf(0.9);
    for (const y of [-20.4, -17.4, -14.4]) k.line([-5.6, H(y), 5.6, H(y)], 0.8, c.dark, ls);
    k.frustum([0, 0, 0.6], H(-11.4), H(-13.2), 5.7, 5.5, c.accent, { sz: 0.74 });
    if (worn(w, 2)) dent(k, ls, 1.6, H(-19), 1.1, c.main);
    arm(k, [-4.4, H(-21), 0.6], [-8.6, H(-15.4), 0.0], c.main);
    arm(k, [4.4, H(-21), 0.6], [4.6, H(-14.6), 4.4], c.main);
    const hd = head(k, 0, -27.6, 5.4);
    // Neck flaps of dark steel each side, a spiked helmet with a gold band.
    for (const s of [-1, 1]) if (!(s > 0 && helmBroken(w))) k.box(onView(hd.c, hd.r, s * 4.8, -2.4, -1.8), [2.2, 6, 4], STEEL_DARK, { rot: [0, s * 0.4, 0] });
    const hs = helmet(k, hd, STEEL, w, { r: 6.1, lift: 0.9, scratchDark: true });
    k.rod([0, hd.c[1] + 5.4, 0], [0, hd.c[1] + 12.8, 0], 2.4, STEEL, { r1: 0.1, seg: 6, gloss: 0.4 });
    helmRim(k, hd, 6.1, 0.9, c.accent);
    void hs;
    faceWear(k, hd, w);
  });
  feetBlood(k, w, 6, 9);
  return WIDE;
}

function skyCaller(k: Kit, { look: c, wear: w }: FigureOpts): typeof WIDE {
  turned(k, MOUNT_YAW, () => {
    horse(k, { coat: PALE_HORSE, shade: PALE_HORSE_DARK, mane: PIEBALD }, w);
    // Big dark patches, so it never reads as the Knight's grey.
    const by = H(-6.5);
    const flank = (x: number, y: number): { p: V3; n: V3 } => {
      const dx = (x + 2) / 12.6, dy = (y - by) / 6.8;
      const dz = Math.sqrt(Math.max(0.02, 1 - dx * dx - dy * dy));
      const n = new Vector3(dx / 12.6, dy / 6.8, dz / 5.2).normalize();
      return { p: [x, y, dz * 5.2 * 0.95], n: [n.x, n.y, n.z] };
    };
    k.decal(ell(-9, by + 0.4, 3.8, 3.4, 10), PIEBALD, flank);
    k.decal(ell(3.2, by - 1.8, 3.0, 2.2, 9), PIEBALD, flank);
    k.ball([-2, by + 5.0, 0], 1, PIEBALD, { s: [5, 2.2, 4.6], detail: 1, hull: 0 });
  });
  turned(k, RIDER_YAW, () => {
    // The staff, topped with a bronze mirror, flies three broad streamers back over the horse's rump.
    k.rod([-3.6, H(-9), -2], [-11.6, H(-31.4), -2], 0.8, WOOD_DARK);
    const torn = worn(w, 3);
    const streamer = (y: number, col: string, len: number): void => {
      const l = torn ? len * 0.55 : len;
      const pts = torn ? [0, 1.4, -l * 0.55, 0.6, -l, 0.9, -l * 0.8, -0.2, -l, -1.0, -l * 0.5, -1.0, 0, -1.4] : [0, 1.4, -l * 0.55, 0.4, -l, -1.0, -l * 0.5, -1.6, 0, -1.4];
      k.slab(pts, 0.5, col, [-11.2 + (y + 31) * 0.36, H(y), -2], [0.1, 0, 0.35]);
    };
    streamer(-30, c.accent, 9);
    streamer(-26.6, STRING, 9);
    streamer(-23.2, c.main, 8);
    const mc: V3 = [-12, H(-32.6), -1.4];
    const cuts: Cut[] = worn(w, 4) ? [{ from: 290, to: 40, inner: 1.2, jag: 0.4 }] : [];
    k.frame(mc, [-0.3, 0, 0], () => {
      k.slab(discPoly(3.4, cuts, 0, 12), 1.0, c.accent, [0, 0, 0], [0, 0, 0], { gloss: 0.4 });
      k.slab(discPoly(2.1, cuts, 0.6, 10), 1.0, STRING, [0, 0, 0.3], [0, 0, 0], { gloss: 0.9, hull: 0 });
      if (worn(w, 3)) crack(k, flat(0.85), [-1.4, -0.8, 0.2, 0.2, -0.4, 1.4], 0.5);
    });
    rider(k, [0, H(-10), 0.6], c, c.main, w);
    k.frustum([0, 0, 0.6], H(-11.8), H(-13.6), 5.5, 5.3, c.dark, { sz: 0.74 });
    arm(k, [-4.4, H(-19.4), 0.6], [-7.2, H(-18.8), 0.6], c.main);
    arm(k, [4.4, H(-19.4), 0.6], [4.8, H(-14.6), 4.2], c.main);
    const hd = head(k, 0, -25.4, 5.4);
    // A wide felt hat with a low crown and a short fringe over the brow (its brim torn once broken).
    const brimCuts: Cut[] = helmBroken(w) ? [{ from: 320, to: 20, inner: 6.6, jag: 0.6 }] : [];
    k.slab(discPoly(10.6, brimCuts, 0, 18).map((v, i) => (i % 2 ? v * 0.55 : v)), 1.0, c.dark, [0, H(-29.6), 0], [Math.PI / 2, 0, 0]);
    k.dome([0, H(-30.2), 0], 5.2, c.dark, { to: 1.57, seg: 10, s: [1, 1.15, 1] });
    k.frustum([0, 0, 0], H(-30.4), H(-31.8), 5.25, 5.2, c.accent, { seg: 10, sz: 1 });
    for (const x of [-3.6, -1.2, 1.2, 3.6]) k.rod(onView(hd.c, hd.r, x, 3.6, 0.1), onView(hd.c, hd.r, x, 2.4, 0.2), 0.5, c.dark, { seg: 3, hull: 0 });
    if (worn(w, 2)) dirt(k, viewSphere([0, H(-30.2), 0], 5.3), 1.4, 2.8, 2.6, c.dark);
    faceWear(k, hd, w);
  });
  feetBlood(k, w, 6, 9);
  return WIDE;
}

function camp(k: Kit, { look: c, wear: w }: FigureOpts): typeof WIDE {
  turned(k, STAND_YAW * 0.6, () => {
    // The draught pole and the cart bed.
    k.rod([10, H(-5), 2], [19, H(-1.4), 4], 0.8, WOOD_DARK);
    k.box([-1, H(-6.7), 0], [28, 3.4, 13], WOOD_DARK);
    k.box([-2.5, H(-7.2), 0.2], [25, 2.4, 13.2], WOOD);
    // The round felt tent: walls, a domed roof, roof bands, a painted door.
    const tc: V3 = [0, 0, 0];
    k.frustum(tc, H(-8), H(-20.4), 12.4, 12.4, FELT, { sz: 0.55, seg: 14 });
    k.dome([0, H(-20.2), 0], 12.9, FELT, { to: 1.2, seg: 14, s: [1, 0.72, 0.56] });
    k.frustum(tc, H(-19.2), H(-21.2), 12.9, 12.7, c.dark, { sz: 0.58, seg: 14 });
    k.frustum(tc, H(-11.8), H(-13.0), 12.6, 12.6, c.dark, { sz: 0.57, seg: 14 });
    k.frustum([0, 0, 0], H(-27.6), H(-28.6), 3.4, 3.0, WOOD_DARK, { seg: 8, sz: 1 });
    const wall = (x: number, y: number): { p: V3; n: V3 } => {
      const dx = Math.max(-12, Math.min(12, x));
      const z = 0.55 * Math.sqrt(12.4 * 12.4 - dx * dx);
      return { p: [x, y, z], n: new Vector3(dx / 12.4, 0, z / (0.55 * 12.4)).normalize().toArray() as unknown as V3 };
    };
    k.slab([-3.2, 0, 3.2, 0, 3.2, H(-17.6) - H(-8), -3.2, H(-17.6) - H(-8)], 0.8, WOOD_DARK, [0, H(-8), 0.55 * 12.4 + 0.1]);
    k.slab([-2.2, 0, 2.2, 0, 2.2, H(-16.8) - H(-8) - 0.8, -2.2, H(-16.8) - H(-8) - 0.8], 0.8, c.main, [0, H(-8), 0.55 * 12.4 + 0.5], [0, 0, 0], { hull: 0 });
    k.line([0, H(-8), 0, H(-16.6)], 0.6, c.accent, (x, y) => ({ p: [x, y, 0.55 * 12.4 + 0.95], n: [0, 0, 1] }));
    if (worn(w, 1)) { dirt(k, wall, -7, H(-9.4), 5, FELT); dirt(k, wall, 7.4, H(-9), 4, FELT); }
    if (worn(w, 2)) scratches(k, wall, [[-8.6, H(-16), -6.4, H(-14.6)]], '#9C907A');
    if (worn(w, 3)) { const [lip, gap] = tearPolys(-7, H(-15.6), 3.6, 3.6); k.decal(lip, '#6E6250', wall); k.decal(gap, '#2E2620', wall); }
    if (worn(w, 4)) { const [lip, gap] = tearPolys(7.2, H(-16.8), 3.2, 4.0); k.decal(lip, '#6E6250', wall); k.decal(gap, '#2E2620', wall); }
    // The owner's pennant above the smoke hole (torn once broken).
    k.rod([0, H(-28.6), 0], [0, H(-35.4), 0], 0.55, WOOD_DARK);
    k.slab(worn(w, 4) ? [0, 0, 3.6, -0.8, 2.4, -2.0, 3.0, -3.0, 0, -4] : [0, 0, 5.6, -2, 0, -4], 0.5, c.main, [0.4, H(-35.6), 0]);
    // Two big spoked wheels on one axle (the near right one broken once broken).
    for (const x of [-9.4, 8.6]) {
      const broken = worn(w, 4) && x > 0;
      const cuts: Cut[] = broken ? [{ from: 200, to: 300, inner: 2.0, jag: 0.6 }] : [];
      k.frame([x, 5.4, 7.0], [0, 0, 0], () => {
        k.slab(discPoly(5.4, cuts, 0, 14), 1.6, WOOD_DARK);
        k.slab(discPoly(4.0, cuts, 0.9, 12), 1.8, WOOD, [0, 0, 0.1], [0, 0, 0], { hull: 0 });
        const s = flat(1.05);
        k.line([-3.6, 0, 3.6, 0], 0.8, WOOD_DARK, s);
        if (!broken) k.line([0, -3.6, 0, 3.6], 0.8, WOOD_DARK, s);
        k.ball([0, 0, 1.2], 1.3, c.accent, { detail: 0, gloss: 0.4 });
      });
    }
  });
  return WIDE;
}

/** The hero's pennant: a swallowtail on a short staff rising from behind the left shoulder. */
export function heroMark(k: Kit, accent: string): void {
  turned(k, STAND_YAW, () => {
    k.rod([-4, H(-4.6), -3.6], [-11.6, H(-34.6), -3.6], 0.8, WOOD_DARK);
    const at: V3 = [-11.8, H(-35.2), -3.6];
    const poly = (pts: number[]): number[] => pts.map((v, i) => (i % 2 ? H(v) - H(-35.2) : v + 11.8));
    k.slab(poly([-11.8, -35.2, -20, -33.8, -16, -30, -20, -25.6, -10.8, -25.2]), 0.6, accent, at);
    // The lower tail: a darker tone of the accent (round 2: lighter than the plate colour the SVG uses).
    k.slab(poly([-16, -30, -20, -25.6, -10.8, -25.2, -11, -28]), 0.7, mix(accent, '#2B2B2A', 0.35), at, [0, 0, 0], { hull: 0 });
    k.slab(poly([-11.8, -35.2, -20, -33.8, -17.4, -31.4, -11.4, -30.4]), 0.7, GOLD, at, [0, 0, 0], { hull: 0 });
    k.ball(at, 1.3, GOLD, { detail: 0, gloss: 0.5 });
  });
}

export const FIGURES: Record<UnitType, (k: Kit, o: FigureOpts) => { rx: number; rz: number; x: number }> = {
  warrior, spearman, swordsman, defender, archer, horseman, knight, catapult, sellsword,
  hoplite, kingsGuard, piper, scout, horseArcher, khansGuard, skyCaller, camp,
};

/** Build one figure: the fill and hull geometry (feet on y 0 at the origin) and its shadow's size. */
export function buildFigure(type: UnitType, o: FigureOpts): Figure {
  const k = new Kit();
  if (o.hero) heroMark(k, o.look.accent);
  const shadow = FIGURES[type](k, o);
  setYaw(0);
  return { ...k.build(), shadow };
}

export const ALL_TYPES: readonly UnitType[] = Object.keys(FIGURES) as UnitType[];
