// A detailed toon Hoplite, for comparison only (David, third pass: "I'm leaning towards toon, but lets try to give
// it more detail"). The game never builds it: figures.ts makes it only for the shot-only `toonClosedHelm` variant.
//
// Toon style (faceted parts, toon bands, the dark hull outline, bold colours, chunky friendly proportions, the toon
// Hoplite's own place on the board), with more shape: a closed bronze helm (a domed crown sweeping into flared cheek
// plates that nearly meet at the mouth, a nose guard, a T opening cut in with a bronze lip round it, a raised brow
// ridge, a neck guard flaring at the back) under a chunky fanned crest on its holder; a muscled bronze cuirass, a belt
// and leather strips over a pleated tunic, greaves on shaped legs with knees, bare arms with wrist wraps and real
// hands (fingers and a thumb round the spear, a hand on the shield's grip), a cloak with folds, and the realistic
// Hoplite's shield. Same moving pieces as the toon Hoplite (WEAPON, SHIELD, LEGS, FEET).
import { CylinderGeometry, Quaternion, TorusGeometry, Vector3 } from 'three';
import { flat, H, Kit, mix } from './kit';
import type { Surface, V3 } from './kit';
import {
  ANKLE, BLOOD, crack, dent, ell, FEET, groundDrops, helmBroken, LEGS, SCAR, SCRATCH, scratches, setYaw, SKIN, smear,
  spear, tearPolys, worn,
} from './parts';
import type { Look, Wear } from './parts';
import { realShield, shell } from './hoplite3d';

const WEAPON = 'weapon';
const SHIELD = 'shield';
const TIP_FORWARD: V3 = [1, 0, 0];
const YAW = 0.38;

const LEATHER = '#7A5232';
const LEATHER_DARK = '#4E331F';
const BRONZE_LIP = '#E8C77E';
const BRONZE_IN = '#2A1C10';
/** The cut faces inside the opening: deep in shadow, so the T reads dark. */
const BRONZE_DEEP = '#1E140B';
const SANDAL = '#5E3E24';
const SKIN_SHADE = '#C99B72';
const GREAVE = '#B48236';

// ---- the helm ----

const HC: V3 = [0, H(-22.4) + 1.4, 0.3];
const HA = 6.5, HB = 6.3, HD = 6.4;
const DROP_F = 6.2, DROP_B = 7.0;
const NU = 20, NV = 10;
/** Rows: four over the crown to the brow, six from the brow down the cheek plates. */
const VROW = (j: number): number => (j <= 4 ? j / 8 : 0.5 + ((j - 4) / 6) * 0.5);

/** A point of the helm at angle th (0 the front) and height v (0 crown, 0.5 the brow line, 1 the rim), pushed in by `inset`. */
function helmAt(th: number, v: number, inset = 0): Vector3 {
  const front = Math.max(0, Math.cos(th)), back = Math.max(0, -Math.cos(th));
  let rad: number, y: number;
  if (v <= 0.5) { const ph = v * Math.PI; rad = Math.sin(ph); y = HB * Math.cos(ph); } else {
    const t = (v - 0.5) * 2;
    // The cheek plates flare out under the brow, then close in toward the mouth; the neck guard flares at the back.
    rad = (1 + 0.08 * t - 0.12 * t * t) * (1 - 0.2 * t * t * front * front) * (1 + 0.16 * t * t * back);
    y = -(DROP_F + (DROP_B - DROP_F) * back) * t;
  }
  const p = new Vector3(HC[0] + HA * rad * Math.sin(th), HC[1] + y, HC[2] + HD * rad * Math.cos(th) * (1 + 0.06 * front));
  if (inset > 0) { const c = new Vector3(HC[0], Math.min(HC[1], p.y + 2), HC[2]); p.sub(p.clone().sub(c).normalize().multiplyScalar(inset)); }
  return p;
}
const thOf = (i: number): number => ((i + 0.5) / NU - 0.5) * Math.PI * 2;

/** The helm's surface for marks: x across (about world units at the brow), y up from its centre. */
const helmSurf: Surface = (x, y) => {
  const th = x / HA;
  const v = y >= 0 ? Math.acos(Math.min(1, y / HB)) / Math.PI : 0.5 + Math.min(1, -y / DROP_F) / 2;
  const p = helmAt(th, v), e = 0.01;
  const n = helmAt(th + e, v).sub(helmAt(th - e, v)).cross(helmAt(th, Math.min(1, v + e)).sub(helmAt(th, Math.max(0, v - e)))).normalize();
  if (n.dot(p.clone().sub(new Vector3(...HC))) < 0) n.negate();
  return { p: [p.x, p.y, p.z], n: [n.x, n.y, n.z] };
};

/**
 * The cells cut away for the T: the column at the front is the nose guard down to its tip, the cells either side of
 * it at the brow are the eye slits, and below the nose the front column is the slot between the cheek plates.
 */
const MID = NU / 2; // the front column, centred on the face: the nose guard
function isOpening(i: number, j: number): boolean {
  const off = Math.abs(i - MID);
  if ((j === 4 || j === 5) && (off === 1 || off === 2)) return true; // the eye slits, two cells either side
  if (j >= 7 && off === 0) return true; // the slot under the nose guard, down to the rim
  return false;
}
/** Broken: the near cheek plate gone (the figure's left, toward the viewer). */
const GAP = new Set(['6,5', '7,5', '6,6', '6,7', '6,8', '6,9', '7,6', '7,7', '7,8', '7,9', '8,6', '8,7', '8,8', '8,9', '5,7', '5,8', '5,9', '9,8', '9,9']);

function helm(k: Kit, c: Look, w: Wear): void {
  const broken = helmBroken(w);
  // Inside: the face, in shadow (or, broken, the face in the gap with its wound).
  k.ball([HC[0], HC[1] - 1.2, HC[2] - 0.1], 5.3, broken ? SKIN : '#3A2416', { detail: 1, hull: 0, s: [1, 1.08, 1] });
  shell(k, {
    nu: NU, nv: NV, wrapU: true,
    front: (i, j) => helmAt(thOf(i - 1), VROW(j)),
    back: (i, j) => helmAt(thOf(i - 1), VROW(j), 0.7),
    keep: (i, j) => !isOpening(i, j) && !(broken && GAP.has(`${i},${j}`)),
    backKeep: (i, j) => j >= 4 && (j <= 6 || Math.abs(i - MID) <= 6),
    inside: new Vector3(...HC),
  }, c.accent, BRONZE_IN, BRONZE_DEEP, { gloss: 0.45 });
  openingLips(k, broken);
  // The brow ridge over the eyes, a bead along the rim, and the crest's holder.
  const brow = (x: number): V3 => { const s = helmSurf(x, 0.35); return [s.p[0] + s.n[0] * 0.3, s.p[1] + s.n[1] * 0.3, s.p[2] + s.n[2] * 0.3]; };
  for (const side of broken ? [1] : [-1, 1]) {
    let prev = brow(side * 0.9);
    for (const x of [2.0, 3.2, 4.4]) { const nx = brow(side * x); k.rod(prev, nx, 0.42, mix(c.accent, '#FFFFFF', 0.15), { seg: 5, gloss: 0.5 }); prev = nx; }
  }
  k.box([HC[0], HC[1] + HB - 0.1, HC[2] - 1.2], [1.6, 1.5, 9.4], mix(c.accent, '#000000', 0.3), { gloss: 0.3 });
  if (worn(w, 1)) scratches(k, helmSurf, [[-3.6, 4.4, -1.4, 5.8], [1.6, 5.4, 3.8, 4.2]], SCRATCH, 0.55);
  if (worn(w, 2)) { dent(k, helmSurf, 2.9, 3.0, 1.1, c.accent); dent(k, helmSurf, -1.6, 5.4, 0.8, c.accent); }
  if (worn(w, 3)) crack(k, helmSurf, [4.4, 2.6, 4.0, 1.4, 4.8, 0.4], 0.5);
  crest(k, c, w);
  if (broken) {
    // The face in the gap: its cheek, its eye, and blood (or, healed, a pale scar).
    const face = (x: number, y: number) => { const s = helmSurf(x, y); const d = 0.9; return { p: [s.p[0] - s.n[0] * d, s.p[1] - s.n[1] * d, s.p[2] - s.n[2] * d] as V3, n: s.n }; };
    if (w.scarred && w.blood === 0) {
      k.line([-5.6, -1.6, -4.4, -4.8], 0.8, SCAR, face);
      for (const t of [0.3, 0.65]) { const x = -5.6 + 1.2 * t, y = -1.6 - 3.2 * t; k.line([x - 0.6, y, x + 0.6, y], 0.3, '#A8735B', face); }
    }
    if (w.blood >= 1) smear(k, face, -5.2, -1.6, 0.1, -1, 3.6, 1.5);
    if (w.blood >= 2) { smear(k, face, -3.9, -2.4, -0.1, -1, 3.4, 1.2); k.decal(ell(-4.6, -5.0, 0.8, 0.6, 6), BLOOD, face); }
  }
}

/** A bright bronze lip round the T, along the front edge of each opening cell. */
function openingLips(k: Kit, broken: boolean): void {
  const P = (i: number, j: number): V3 => { const p = helmAt(thOf(i - 1), VROW(j), -0.12); return [p.x, p.y, p.z]; };
  // Broken, the edge of the gap is a lip too: bright torn bronze, a little thicker.
  const open = (i: number, j: number): boolean => isOpening(i, j) || (broken && GAP.has(`${i},${j}`));
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    if (!open(i, j)) continue;
    const torn = !isOpening(i, j);
    const edges: [number, number, number, number][] = [];
    if (!open(i, j - 1)) edges.push([i, j, i + 1, j]);
    if (j + 1 < NV && !open(i, j + 1)) edges.push([i, j + 1, i + 1, j + 1]);
    if (!open(i - 1, j)) edges.push([i, j, i, j + 1]);
    if (!open(i + 1, j)) edges.push([i + 1, j, i + 1, j + 1]);
    for (const [a, b, c2, d] of edges) k.rod(P(a, b), P(c2, d), torn ? 0.32 : 0.2, torn ? '#F6DFA0' : BRONZE_LIP, { seg: 3, hull: 0, gloss: 0.6, caps: false });
  }
}

/** The crest: a chunky fan of horsehair on the holder, front to back; torn short from battered. */
function crest(k: Kit, c: Look, w: Wear): void {
  const top = HC[1] + HB + 0.6;
  const torn = worn(w, 3);
  const dark = mix(c.main, '#000000', 0.3);
  const root = (t: number): V3 => [0, top, HC[2] + 3.4 - t * 9.6];
  const N = 9;
  // The core, a fan slab, then the tufts over it.
  const core: number[] = [];
  const edge = (t: number): [number, number] => { const a = Math.PI * (0.08 + 0.86 * t); return [HC[2] - 1.6 + Math.cos(a) * 7.2, top - 1.2 + Math.sin(a) * 9.6 + (t > 0.5 ? -3.6 * (t - 0.5) : 0)]; };
  const reach = torn ? 0.5 : 1;
  for (let n = 0; n <= 12; n++) { const [z, y] = edge((n / 12) * reach); core.push(z, y); }
  for (let n = 12; n >= 0; n--) { const r = root((n / 12) * reach); core.push(r[2], r[1]); }
  k.slab(core, 1.5, dark, [0, 0, 0], [0, -Math.PI / 2, 0], { hull: 0.6 });
  for (let n = 0; n < N; n++) {
    const t = ((n + 0.5) / N) * reach;
    const [z, y] = edge(t);
    const jag = [0.4, -0.5, 0.7, -0.2, 0.5, -0.6, 0.3, -0.3, 0.6][n]!;
    k.rod(root(t), [n % 2 ? 0.45 : -0.45, y + jag, z + jag * 0.5], 1.15, n % 3 === 1 ? dark : c.main, { r1: 0.45, seg: 4 });
  }
}

// ---- the body ----

const CUIRASS: readonly (readonly [number, number])[] = [[6.0, 12.6], [5.7, 14.6], [6.3, 19.0], [6.8, 22.4], [6.5, 24.8], [5.0, 26.4]];
const CUIRASS_SZ = 0.72;

function cuirass(k: Kit, c: Look, w: Wear): void {
  const bronze = mix(c.accent, '#5A3A14', 0.18);
  const g = new CylinderGeometry(1, 1, 1, 12, CUIRASS.length - 1, true);
  // Shape the cylinder's rings to the profile (faceted, like the toon figures).
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.round((pos.getY(i) + 0.5) * (CUIRASS.length - 1));
    const [r, y] = CUIRASS[ring]!;
    pos.setXYZ(i, pos.getX(i) * r, y, pos.getZ(i) * r * CUIRASS_SZ);
  }
  g.rotateY(Math.PI / 12);
  k.add(g, bronze, { gloss: 0.4 });
  // The neck opening's rim, the flared lower lip, the pectoral plates and the muscle lines.
  k.frustum([0, 0, 0], 26.2, 27.0, 5.1, 4.2, mix(bronze, '#000000', 0.2), { sz: CUIRASS_SZ + 0.04, seg: 12, gloss: 0.4 });
  k.frustum([0, 0, 0], 12.2, 13.2, 6.5, 6.0, mix(bronze, '#000000', 0.2), { sz: CUIRASS_SZ + 0.04, seg: 12, gloss: 0.4 });
  for (const s of [-1, 1]) k.ball([s * 2.6, 22.4, 4.0], 1, bronze, { s: [2.7, 1.8, 1.0], detail: 0, gloss: 0.5, hull: 0 });
  const front: Surface = (x, y) => ({ p: [x, y, CUIRASS_SZ * Math.sqrt(Math.max(1, 6.4 * 6.4 - x * x)) + 0.25], n: [x / 12, 0, 1] });
  const line = mix(bronze, '#000000', 0.45);
  k.line([0, 23.6, 0, 14.4], 0.45, line, front);
  for (const y of [19.2, 16.8]) k.line([-2.6, y + 0.4, -1.2, y, 1.2, y, 2.6, y + 0.4], 0.4, line, front);
  k.line([-3.6, 15.0, -1.6, 13.8], 0.4, line, front);
  k.line([3.6, 15.0, 1.6, 13.8], 0.4, line, front);
  if (worn(w, 1)) scratches(k, front, [[-4.0, 21.0, -2.2, 22.4], [1.6, 15.4, 3.6, 16.6]], SCRATCH, 0.55);
  if (worn(w, 2)) dent(k, front, 2.8, 18.0, 1.0, bronze);
  if (worn(w, 3)) crack(k, front, [-3.2, 24.6, -2.4, 22.6, -3.2, 21.0], 0.5);
  if (w.blood >= 1) smear(k, front, -1.6, 24.0, 0.1, -1, 4.0, 1.4);
  if (w.blood >= 2) smear(k, front, 2.4, 21.0, -0.2, -1, 4.4, 1.2);
}

/** The pleated tunic under the cuirass, its hem, the belt and the leather strips. */
function waist(k: Kit, c: Look, w: Wear): void {
  const g = new CylinderGeometry(5.8, 7.0, 5.0, 16, 1, true);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    // Every other edge pushed out: the pleats.
    const a = Math.atan2(pos.getX(i), pos.getZ(i));
    const k2 = Math.round((a / (Math.PI * 2)) * 16) % 2 === 0 ? 1.08 : 0.94;
    pos.setXYZ(i, pos.getX(i) * k2, pos.getY(i), pos.getZ(i) * k2 * 0.72);
  }
  g.translate(0, 9.9, 0);
  k.add(g, c.main);
  k.frustum([0, 0, 0], 7.4, 8.3, 7.4, 7.2, c.dark, { sz: 0.74, seg: 16 });
  if (worn(w, 3)) { const [lip, gap] = tearPolys(-2.6, 9.6, 2.6, 2.4); const s = flat(5.3); k.decal(lip, mix(c.main, '#000000', 0.45), s); k.decal(gap, SKIN, s); }
  // The belt, with a bronze buckle.
  k.frustum([0, 0, 0], 12.0, 13.2, 6.2, 6.1, LEATHER_DARK, { sz: CUIRASS_SZ + 0.06, seg: 12 });
  k.box([0, 12.6, 4.6], [1.8, 1.4, 0.6], c.accent, { gloss: 0.5 });
  // The pteruges: leather strips hanging from under the cuirass round the front and sides.
  for (let i = 0; i < 7; i++) {
    const a = -1.6 + (i / 6) * 3.2;
    const x = Math.sin(a) * 6.3, z = Math.cos(a) * 6.3 * 0.76;
    k.box([x, 10.4, z], [1.7, 3.8, 0.45], i % 2 ? LEATHER : mix(LEATHER, '#000000', 0.15), { rot: [0, a, 0] });
  }
}

/** A hand closed round a bar along `axis` at p: the fingers wrapping it, the thumb over them, the back of the hand. */
function fist(k: Kit, p: V3, axis: V3, back: V3, r = 0.9): void {
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...axis).normalize());
  // Four fingers as two rings round the bar, a gap where the palm closes over the back.
  // The fingers as one band round the bar, ridged where they part (two rings, close together).
  for (const o of [-0.45, 0.45]) {
    const t = new TorusGeometry(r, 0.55, 4, 6, Math.PI * 1.6);
    t.applyQuaternion(q);
    const off = new Vector3(...axis).normalize().multiplyScalar(o);
    t.translate(p[0] + off.x, p[1] + off.y, p[2] + off.z);
    k.add(t, SKIN, { hull: 0.7 });
  }
  const b = new Vector3(...back).normalize();
  k.ball([p[0] + b.x * r * 0.9, p[1] + b.y * r * 0.9, p[2] + b.z * r * 0.9], 1, SKIN_SHADE, { detail: 0 });
  const top = new Vector3(...axis).normalize().multiplyScalar(1.2);
  k.rod([p[0] + b.x * 0.8 + top.x, p[1] + b.y * 0.8 + top.y, p[2] + b.z * 0.8 + top.z], [p[0] - b.x * 0.4 + top.x * 0.7, p[1] - b.y * 0.4 + top.y * 0.7, p[2] - b.z * 0.4 + top.z * 0.7 + 0.6], 0.42, SKIN, { r1: 0.36, seg: 5 });
}

/** A bare arm: the shoulder's cap, the upper arm, the forearm with its wrist wrap, ending at the wrist. */
function arm(k: Kit, shoulder: V3, elbow: V3, wrist: V3): void {
  k.ball(shoulder, 1, SKIN, { s: [2.0, 2.2, 2.0], detail: 0 });
  k.rod(shoulder, elbow, 1.6, SKIN, { r1: 1.25, seg: 7 });
  k.ball(elbow, 1.3, SKIN_SHADE, { detail: 0, hull: 0 });
  k.rod(elbow, wrist, 1.35, SKIN, { r1: 1.0, seg: 7 });
  const d = new Vector3(...wrist).sub(new Vector3(...elbow)).normalize();
  for (const t of [0.6, 1.2]) {
    const at = new Vector3(...wrist).addScaledVector(d, -t);
    k.rod([at.x - d.x * 0.25, at.y - d.y * 0.25, at.z - d.z * 0.25], [at.x + d.x * 0.25, at.y + d.y * 0.25, at.z + d.z * 0.25], 1.18, t < 1 ? LEATHER : LEATHER_DARK, { seg: 7, hull: 0 });
  }
}

/** The cloak, from the shoulders to the calves, with two folds; torn at the hem from battered, more when broken. */
function cloak(k: Kit, c: Look, w: Wear): void {
  const hem = worn(w, 4) ? [10.6, 3.0, 7.6, 0.4, 4.6, 3.2, 1.6, 0.6, -2.0, 3.4, -5.0, 0.8, -8.0, 3.2, -10.8, 1.4]
    : worn(w, 3) ? [10.8, 2.4, 6.2, 1.4, 2.0, 2.6, -2.4, 1.2, -6.4, 2.6, -10.8, 2.0] : [11.0, 2.2, -11.0, 2.2];
  const outline = [-6.6, 26.4, 6.6, 26.4, 10.2, 18.0, ...hem, -10.4, 18.0];
  k.slab(outline, 1.0, c.main, [0, 0, -4.6], [0.1, 0, 0]);
  for (const x of [-4.4, 4.0]) k.slab([x - 1.2, 24.0, x + 0.6, 24.0, x + 1.6, 3.2, x - 2.0, 3.2], 1.2, mix(c.main, '#000000', 0.25), [0, 0, -5.2], [0.1, 0, 0], { hull: 0 });
}

function legs(k: Kit, w: Wear): void {
  k.pivot(LEGS, ANKLE, () => {
    for (const s of [-1, 1]) {
      // The shin in its greave, shaped to the calf, and the knee above it.
      const g = new CylinderGeometry(1.75, 1.3, 4.4, 8, 2, true);
      const pos = g.attributes.position!;
      for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i)) < 0.1) pos.setXYZ(i, pos.getX(i) * 1.22, pos.getY(i), pos.getZ(i) * 1.22);
      g.translate(s * 2.8, 4.6, 0.2);
      k.add(g, GREAVE, { gloss: 0.5 });
      k.ball([s * 2.8, 7.4, 0.4], 1.55, SKIN, { detail: 0 });
      k.ball([s * 2.8, 7.2, 1.5], 0.75, SKIN_SHADE, { detail: 0, hull: 0 });
      k.rod([s * 2.8, 2.2, 0.2], [s * 2.8, 2.6, 0.2], 1.3, SKIN, { seg: 7, hull: 0 });
    }
    if (worn(w, 1)) for (const s of [-1, 1]) k.decal(ell(s * 2.8, 3.8, 0.9, 0.6, 7), mix(GREAVE, '#3D3A34', 0.6), flat(2.4));
  }, { axis: [1, 0, 0] });
  k.pivot(FEET, [0, 0, 0], () => {
    for (const s of [-1, 1]) {
      k.box([s * 3.0, 0.5, 1.0], [3.4, 1.0, 5.0], SANDAL);
      k.ball([s * 3.0, 1.4, 1.2], 1, SKIN, { s: [1.5, 0.8, 2.0], detail: 0 });
      for (const z of [0.4, 2.0]) k.box([s * 3.0, 1.6, z], [3.2, 0.35, 0.5], SANDAL, { hull: 0 });
    }
  });
}

export interface ToonOpts { look: Look; wear: Wear }

/** The detailed toon Hoplite (comparison only). Returns its ground shadow's size. */
export function detailedToonHoplite(k: Kit, { look: c, wear: w }: ToonOpts): { rx: number; rz: number; x: number } {
  setYaw(YAW);
  k.frame([0, 0, 0], [0, YAW, 0], () => {
    cloak(k, c, w);
    legs(k, w);
    waist(k, c, w);
    cuirass(k, c, w);
    k.rod([0, 26.0, -0.2], [0, 28.8, 0], 2.1, SKIN, { seg: 7 });
    // The spear arm; the hand round the shaft goes with the spear when it strikes.
    arm(k, [5.8, 24.8, 0], [9.6, 19.6, 0.4], [12.0, 19.2, 2.4]);
    const butt: V3 = [12, 0.6, 2.4], top: V3 = [14.4, H(-30), 2.4];
    const grip: V3 = [13.05, H(-11), 2.4];
    k.pivot(WEAPON, grip, () => {
      spear(k, butt, top, (36 - 30) / 0.785 + 0.8, { nick: worn(w, 2), snap: worn(w, 4) ? 0.6 : undefined, blood: w.blood });
      const ax = new Vector3(...top).sub(new Vector3(...butt)).normalize();
      fist(k, grip, [ax.x, ax.y, ax.z], [-0.8, 0, -0.6], 1.3);
    }, { axis: TIP_FORWARD });
    helm(k, c, w);
    // The shield arm and the shield, the hand closed on the grip behind it.
    k.pivot(SHIELD, [-5.8, 24.8, 0], () => {
      arm(k, [-5.8, 24.8, 0], [-9.6, 20.2, 1.2], [-10.2, 17.6, 4.4]);
      fist(k, [-10.2, 17.2, 5.0], [1, 0, 0], [0, 0, -1], 1.1);
      k.box([-10.2, 17.2, 5.0], [4.6, 0.5, 0.5], LEATHER_DARK, { hull: 0 });
      k.frame([-10.2, H(-9.6) + 1.6, 7.0], [-0.34, -0.18, 0], () => realShield(k, c, w, 16));
    }, { axis: TIP_FORWARD });
    if (w.blood >= 1) groundDrops(k, 3, 9, true, w.blood >= 2);
  });
  setYaw(0);
  return { rx: 9.5, rz: 6, x: 0.5 };
}
