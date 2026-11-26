// Gritty's Hoplite: a detailed toon figure (David: "I'm leaning towards toon, but lets try to give it more detail").
// Built only in Gritty (figures.ts); Bright keeps the toon Hoplite.
//
// Toon style (faceted parts, toon bands, the dark hull outline, bold colours, chunky friendly proportions, the toon
// Hoplite's own place on the board), with more shape: a closed helm of faceted bronze plates over a dome (below), on
// a neck clear of the body; a muscled cuirass of moulded red-brown leather, a belt
// and leather strips over a pleated tunic, greaves on shaped legs with knees, bare arms with wrist wraps and real
// hands (fingers and a thumb round the spear, a hand on the shield's grip), a cloak with folds, and the realistic
// Hoplite's shield. Same moving pieces as the toon Hoplite (WEAPON, SHIELD, LEGS, FEET).
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { flat, H, Kit, mix } from './kit';
import type { Surface, V3 } from './kit';
import {
  ANKLE, BLOOD, crack, dent, ell, FEET, groundDrops, helmBroken, LEGS, SCAR, SCRATCH, scratches, setYaw, SKIN, smear,
  spear, tearPolys, viewSphere, worn,
} from './parts';
import type { Look, Wear } from './parts';
import { bronzeShield, vivid } from './shield3d';

const WEAPON = 'weapon';
const SHIELD = 'shield';
const TIP_FORWARD: V3 = [1, 0, 0];
const YAW = 0.38;

const LEATHER = '#7A5232';
const LEATHER_DARK = '#4E331F';
const CUIRASS_LEATHER = '#7B4428';
const SANDAL = '#5E3E24';
const SKIN_SHADE = '#C99B72';
const GREAVE = '#B48236';

// ---- the helm: after a closed Greek helm, our own: faceted plates over a smooth dome ----
//
// A ridge down the middle of the brow runs into a long pointed nose guard; two wedge eye openings angle out and up;
// the cheek plates are flat blades sweeping down to points at the chin with a narrow gap between them, so the eyes,
// the channels beside the nose guard and that gap make one dark Y. Behind the plates a smooth dome, a flared neck
// guard, a tall square post with a full, soft plume, rivets at the temples; aged bronze, its edges and ridge in gold.

/** The helm's centre (its local origin); points below are local, x to the figure's left on screen being negative. */
const HELM: V3 = [0, 35.2, 0.4];
const AGED = '#86652F';
const AGED_DARK = '#5C4320';
const GOLD_EDGE = '#EBC46A';
const DARK_IN = '#20150C';

type P3 = readonly [number, number, number];
/** The front plates' corners, the figure's right half (x positive); the left half mirrors it. */
const PT = {
  R0: [0, 5.3, 3.4], R1: [0, 1.9, 5.4], N: [0, -3.2, 5.05], G1: [0.7, 1.35, 5.1], G2: [0.38, -1.8, 4.98],
  T: [4.7, 4.1, 0.9], B: [5.0, 2.1, 1.7], EO: [4.35, 1.85, 2.7], EI: [1.15, 0.95, 4.9], FI: [1.2, -1.05, 4.85],
  FO: [4.25, 0.05, 2.85], CO: [5.0, -0.15, 1.9], CB: [4.6, -3.4, 1.3], CP: [1.3, -5.7, 3.45], CI: [1.3, -1.35, 4.8],
} as const satisfies Record<string, P3>;
const at = (p: P3, side: number): V3 => [HELM[0] + p[0] * side, HELM[1] + p[1], HELM[2] + p[2]];

/** A flat-faced plate through `pts` (a ring of corners), faceted, its face turned away from the helm's centre. */
function plate(k: Kit, pts: readonly V3[], colour: string, o: { gloss?: number; hull?: number } = {}): void {
  const c = pts.reduce((m, p) => [m[0] + p[0] / pts.length, m[1] + p[1] / pts.length, m[2] + p[2] / pts.length], [0, 0, 0]);
  const out = new Vector3(c[0] - HELM[0], c[1] - HELM[1] + 1.0, c[2] - HELM[2] + 2.0);
  const pos: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = new Vector3(...pts[i]!), b = new Vector3(...pts[(i + 1) % pts.length]!), m = new Vector3(...c);
    const n = b.clone().sub(a).cross(m.clone().sub(a));
    const tri = n.dot(out) >= 0 ? [a, b, m] : [a, m, b];
    for (const v of tri) pos.push(v.x, v.y, v.z);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  k.add(g, colour, { gloss: o.gloss ?? 0.45, hull: o.hull ?? 0.8 });
}

/** A gold edge along a chain of points. */
function edge(k: Kit, pts: readonly V3[], r = 0.2, colour = GOLD_EDGE): void {
  for (let i = 0; i + 1 < pts.length; i++) k.rod(pts[i]!, pts[i + 1]!, r, colour, { seg: 3, caps: false, hull: 0, gloss: 0.6 });
}

/** A surface on the plane through three points (x, y given; z solved), for marks on a plate. */
function onPlane(a: V3, b: V3, c: V3): Surface {
  const n = new Vector3(...b).sub(new Vector3(...a)).cross(new Vector3(...c).sub(new Vector3(...a))).normalize();
  if (n.z < 0) n.negate();
  return (x, y) => ({ p: [x, y, a[2] - (n.x * (x - a[0]) + n.y * (y - a[1])) / n.z], n: [n.x, n.y, n.z] });
}

function helm(k: Kit, c: Look, w: Wear): void {
  // Broken (and still, once healed: the engine's scarred), the whole face plate is gone: the nose guard, both cheek
  // blades and the faceted front round the eyes. The bowl, its crest and the back stay, torn along the brow, and the
  // man's face shows under it.
  const open = helmBroken(w);
  const faceC: V3 = [HELM[0], HELM[1] - 0.9, HELM[2] + 0.5];
  if (open) face(k, faceC, w);
  else {
    // Inside: the face in deep shadow, and the shadow in the gap between the cheek blades down to their points.
    k.ball(faceC, 4.0, DARK_IN, { detail: 0, hull: 0, s: [1.18, 1.18, 1.0] });
    plate(k, [at([1.4, -0.6, 3.6], 1), at([1.4, -5.6, 2.9], 1), at([1.4, -5.6, 2.9], -1), at([1.4, -0.6, 3.6], -1)], DARK_IN, { gloss: 0, hull: 0 });
  }
  // The bowl: a cap over the crown, and a band round the sides and back (open at the front, where the plates are).
  const cap = new SphereGeometry(5.2, 11, 3, 0, Math.PI * 2, 0, 1.0);
  const band = new SphereGeometry(5.2, 10, 3, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 1.0, 1.05);
  for (const g of [cap, band]) { g.translate(HELM[0], HELM[1] + 0.4, HELM[2] - 0.9); k.add(g, AGED, { gloss: 0.4, smooth: true }); }
  // The neck guard flaring at the back.
  k.frustum([HELM[0], 0, HELM[2] - 0.9], HELM[1] - 3.4, HELM[1] - 1.9, 5.6, 4.7, AGED_DARK, { arc: [Math.PI * 0.62, Math.PI * 0.76], seg: 10, sz: 1, gloss: 0.4 });
  // Rivets at the temples.
  for (const side of [1, -1]) k.ball(at([4.75, 2.6, 1.6], side), 0.36, GOLD_EDGE, { detail: 0, hull: 0, gloss: 0.6 });
  if (open) {
    // The torn edge of the bowl where the plate came away: jagged, bright fresh bronze, across the brow and down the
    // sides, with a ragged lip of the brow plate still hanging on.
    const rim = (x: number, y: number, z: number): V3 => at([x, y, z], 1);
    const tear: V3[] = [rim(-4.4, 0.4, 2.2), rim(-3.6, 2.4, 2.6), rim(-2.6, 2.0, 3.6), rim(-1.6, 3.0, 3.9), rim(-0.6, 2.5, 4.3), rim(0.4, 3.2, 4.2), rim(1.4, 2.3, 4.0), rim(2.4, 2.9, 3.6), rim(3.4, 2.1, 2.9), rim(4.4, 0.5, 2.2)];
    plate(k, [rim(-4.8, 3.6, 1.6), rim(4.8, 3.6, 1.6), ...[...tear].reverse()], AGED);
    edge(k, tear, 0.3, '#F7E2A6');
    edge(k, [rim(-4.4, 0.4, 2.2), rim(-4.6, -1.8, 1.5)], 0.3, '#F7E2A6');
    edge(k, [rim(4.4, 0.5, 2.2), rim(4.6, -1.8, 1.5)], 0.3, '#F7E2A6');
  } else {
    // The front plates, both sides: the brow, the nose guard, the temple and the cheek blade, gold on the edges.
    for (const side of [1, -1]) {
      const q = (n: keyof typeof PT): V3 => at(PT[n], side);
      plate(k, [q('R0'), q('R1'), q('G1'), q('EI'), q('EO'), q('B'), q('T')], AGED);
      plate(k, [q('R1'), q('N'), q('G2'), q('G1')], AGED);
      plate(k, [q('B'), q('EO'), q('FO'), q('CO')], AGED_DARK);
      plate(k, [q('CI'), q('FI'), q('FO'), q('CO'), q('CB'), q('CP')], AGED);
      edge(k, [q('T'), q('R0')]);
      edge(k, [q('G1'), q('EI'), q('EO')]);
      edge(k, [q('FI'), q('FO')], 0.16);
      edge(k, [q('CI'), q('CP'), q('CB')]);
    }
    edge(k, [at(PT.R0, 1), at(PT.R1, 1), at(PT.N, 1)], 0.26);
    // Wear on the right brow and blade: scratches, dents, a crack.
    const brow = onPlane(at(PT.R1, 1), at(PT.B, 1), at(PT.T, 1));
    const blade = onPlane(at(PT.CI, 1), at(PT.CO, 1), at(PT.CP, 1));
    if (worn(w, 1)) scratches(k, brow, [[HELM[0] + 1.4, HELM[1] + 3.6, HELM[0] + 3.0, HELM[1] + 2.6]], SCRATCH, 0.3);
    if (worn(w, 1)) scratches(k, blade, [[HELM[0] + 2.0, HELM[1] - 2.0, HELM[0] + 3.2, HELM[1] - 3.2]], SCRATCH, 0.3);
    if (worn(w, 2)) { dent(k, brow, HELM[0] + 3.0, HELM[1] + 3.3, 0.6, AGED); dent(k, blade, HELM[0] + 2.6, HELM[1] - 1.2, 0.55, AGED); }
    if (worn(w, 3)) crack(k, blade, [HELM[0] + 3.6, HELM[1] - 0.4, HELM[0] + 3.0, HELM[1] - 1.8, HELM[0] + 3.4, HELM[1] - 3.0], 0.3);
  }
  plume(k, c, w);
}

const BROW_HAIR = '#3A2418';
const BEARD = '#4A2E1C';
const SCAR_PALE = '#FFF1E2';
const SCAR_EDGE = '#7A3A2A';

/**
 * The man's face, bare once the face plate has gone: heavy brows drawn down, eyes, a nose, a short dark beard over the
 * jaw and a grimace of teeth. Bleeding, blood from a cut over the near eye runs down the cheek and jaw; healed, a bold
 * pale scar with its stitches runs where the blood ran, and no blood.
 */
function face(k: Kit, c: V3, w: Wear): void {
  k.ball(c, 3.9, SKIN, { detail: 1, hull: 0, s: [1.12, 1.18, 1.0] });
  const s = viewSphere(c, 4.0);
  const on = (x: number, y: number, lift = 0): V3 => { const p = s(x, y); return [p.p[0] + p.n[0] * lift, p.p[1] + p.n[1] * lift, p.p[2] + p.n[2] * lift]; };
  // The beard over the jaw and chin, under the face's lower half.
  k.ball([c[0], c[1] - 2.4, c[2] + 0.7], 1, BEARD, { detail: 1, hull: 0, s: [3.6, 2.2, 3.3] });
  // Brows drawn down toward the nose: a scowl.
  for (const sd of [-1, 1]) k.rod(on(sd * 0.6, 1.15, 0.2), on(sd * 2.4, 1.75, 0.2), 0.42, BROW_HAIR, { seg: 4, hull: 0 });
  // The eyes: whites and dark pupils, set under the brows.
  for (const sd of [-1, 1]) {
    k.decal(ell(sd * 1.5, 0.45, 0.72, 0.42, 8), '#F3ECE0', s);
    k.decal(ell(sd * 1.42, 0.42, 0.32, 0.32, 6), '#1C130D', s);
  }
  // The nose, and the grimace: a dark mouth with a bar of teeth.
  k.ball(on(0, -0.55, -0.2), 1, mix(SKIN, '#000000', 0.12), { detail: 0, hull: 0, s: [0.55, 0.95, 0.7] });
  k.decal([-1.3, -1.7, 1.3, -1.7, 1.0, -2.45, -1.0, -2.45], '#2A1510', s);
  k.decal([-1.0, -1.82, 1.0, -1.82, 0.85, -2.1, -0.85, -2.1], '#EFE6D6', s);
  if (w.scarred && w.blood === 0) {
    // Healed: a bold pale scar from the brow through the near eye down the cheek, outlined, with its stitches.
    k.line([-2.8, 2.3, -2.0, 0.2, -1.3, -2.2], 1.35, SCAR_EDGE, s);
    k.line([-2.8, 2.3, -2.0, 0.2, -1.3, -2.2], 0.8, SCAR_PALE, s);
    for (const t of [0.15, 0.42, 0.7, 0.92]) { const x = -2.8 + 1.5 * t, y = 2.3 - 4.5 * t; k.line([x - 0.75, y - 0.12, x + 0.75, y + 0.12], 0.26, SCAR_EDGE, s); }
  }
  if (w.blood >= 1) {
    // A cut over the near eye, the blood running down the cheek into the beard and off the jaw onto the neck.
    smear(k, s, -2.0, 1.5, 0.12, -1, 3.6, 1.2);
    smear(k, s, -1.2, 0.0, 0.05, -1, 2.6, 0.8);
  }
  if (w.blood >= 2) {
    smear(k, s, 1.2, 1.2, -0.1, -1, 2.8, 0.9);
    k.decal(ell(-1.6, -2.9, 0.7, 0.5, 6), BLOOD, s);
    k.decal(ell(0.6, -0.4, 0.35, 0.35, 6), BLOOD, s);
  }
}

/**
 * The crest: a tall square post on the crown holding a long brush of horsehair, fanned front to back in layers of
 * tapered, curving fins (crimson, darker at the roots and lighter at the tips), its trailing edge ragged and hanging
 * down at the back. Battered, the back of it is shorn away, the cut ends blunt.
 */
function plume(k: Kit, c: Look, w: Wear): void {
  const top = HELM[1] + 5.6;
  k.box([HELM[0], top + 1.6, HELM[2] - 0.8], [1.5, 3.6, 1.5], AGED, { gloss: 0.45 });
  k.box([HELM[0], top + 3.5, HELM[2] - 0.8], [1.8, 0.4, 1.8], GOLD_EDGE, { hull: 0, gloss: 0.6 });
  const red = vivid(c.main), deep = mix(red, '#000000', 0.3), light = mix(red, '#FFFFFF', 0.16);
  const shorn = worn(w, 3);
  const root: V3 = [HELM[0], top + 3.6, HELM[2] - 0.8];
  // The fins: (fan angle from straight ahead, up over the top to hanging behind; length; layer side to side; tone).
  const FINS: readonly [number, number, number, number][] = [
    [0.35, 4.8, 1, 1], [0.55, 6.4, -1, 0], [0.75, 7.6, 1, 2], [0.95, 8.4, -1, 0], [1.15, 8.8, 1, 1], [1.35, 9.0, -1, 2],
    [1.55, 9.1, 1, 0], [1.75, 8.8, -1, 2], [1.95, 8.5, 1, 1], [2.15, 8.2, -1, 0], [2.35, 8.0, 1, 2], [2.55, 8.1, -1, 0],
    [2.75, 7.8, 1, 1], [2.95, 7.2, -1, 2], [3.15, 6.6, 1, 0], [3.4, 5.6, -1, 1], [3.6, 4.8, 1, 2],
  ];
  // A dark core under the fins: it holds the silhouette (and its outline) together as one bold crest.
  const corePts: number[] = [];
  const along = (a: number, l: number): [number, number] => [Math.cos(a) * l, Math.sin(a) * l];
  for (const [a, l] of FINS) { if (shorn && a > 1.7) continue; const [dz, dy] = along(a, (shorn ? Math.min(l, 5.2) : l) * 0.86); corePts.push(root[2] + dz, root[1] + dy); }
  corePts.push(root[2] - 0.4, root[1] - 0.4, root[2] + 0.5, root[1] - 0.3);
  k.slab(corePts, 2.2, red, [0, 0, 0], [0, -Math.PI / 2, 0], { hull: 0.6 });
  FINS.forEach(([a, len, x, tone], i) => {
    if (shorn && a > 1.7) return;
    const l = shorn ? Math.min(len, 5.2) : len * (1 + (i % 3 === 1 ? 0.06 : i % 3 === 2 ? -0.05 : 0));
    fin(k, [root[0] + x * 0.75, root[1], root[2] + 0.25 - (a / 3.6) * 0.9], a, l, x, tone === 0 ? red : tone === 1 ? deep : light, !shorn);
  });
}

/**
 * One fin of horsehair: a flat tapered blade from `r`, leaving at angle `a` in the figure's front-to-back plane
 * (0 ahead, pi/2 up, pi behind) and bending down under its own weight toward the tip, splayed a little to `splay`
 * side; darker at the root, lighter at the tip. Both faces are drawn.
 */
function fin(k: Kit, r: V3, a: number, len: number, splay: number, colour: string, pointed: boolean): void {
  const N = 4;
  const pts: Vector3[] = [], sides: Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // The angle droops toward the back as it goes out, the more so for fins that already lean back.
    const ang = a + t * 0.35 * Math.max(0, a - 0.9);
    const l = len * t;
    pts.push(new Vector3(r[0] + splay * 0.7 * t, r[1] + Math.sin(ang) * l, r[2] + Math.cos(ang) * l));
    const wdt = (pointed ? 1.25 * (1 - t) + 0.1 : 1.1 * (1 - 0.6 * t)) * (i === 0 ? 0.6 : 1);
    // The blade turns its flat partly toward the side it splays to, so the brush has body seen from the front too.
    sides.push(new Vector3(0.8 * Math.sign(splay || 1), Math.cos(ang) * 0.6, -Math.sin(ang) * 0.6).normalize().multiplyScalar(wdt));
  }
  const pos: number[] = [], col: number[] = [];
  const shade = (t: number): number => 0.62 + 0.5 * t;
  for (let i = 0; i < N; i++) {
    const a0 = pts[i]!.clone().add(sides[i]!), a1 = pts[i]!.clone().sub(sides[i]!);
    const b0 = pts[i + 1]!.clone().add(sides[i + 1]!), b1 = pts[i + 1]!.clone().sub(sides[i + 1]!);
    const t0 = shade(i / N), t1 = shade((i + 1) / N);
    for (const [v, t] of [[a0, t0], [b0, t1], [b1, t1], [a0, t0], [b1, t1], [a1, t0], [a0, t0], [b1, t1], [b0, t1], [a0, t0], [a1, t0], [b1, t1]] as const) {
      pos.push(v.x, v.y, v.z);
      col.push(t, t * 0.96, t * 0.96);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  k.add(g, colour, { hull: 0 });
}

// ---- the body ----

const CUIRASS: readonly (readonly [number, number])[] = [[6.0, 12.6], [5.7, 14.6], [6.3, 19.0], [6.8, 22.4], [6.5, 24.8], [5.0, 26.4]];
const CUIRASS_SZ = 0.72;

function cuirass(k: Kit, c: Look, w: Wear): void {
  // Moulded leather, a deep red-brown: clearly not the bronze of the helm, so head and body never merge.
  const bronze = CUIRASS_LEATHER;
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
  k.frustum([0, 0, 0], 26.2, 27.0, 5.1, 4.2, mix(bronze, '#000000', 0.2), { sz: CUIRASS_SZ + 0.04, seg: 12, gloss: 0.4, open: true });
  k.frustum([0, 0, 0], 12.2, 13.2, 6.5, 6.0, mix(bronze, '#000000', 0.2), { sz: CUIRASS_SZ + 0.04, seg: 12, gloss: 0.4, open: true });
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
  k.frustum([0, 0, 0], 7.4, 8.3, 7.4, 7.2, c.dark, { sz: 0.74, seg: 16, open: true });
  if (worn(w, 3)) { const [lip, gap] = tearPolys(-2.6, 9.6, 2.6, 2.4); const s = flat(5.3); k.decal(lip, mix(c.main, '#000000', 0.45), s); k.decal(gap, SKIN, s); }
  // The belt, with a bronze buckle.
  k.frustum([0, 0, 0], 12.0, 13.2, 6.2, 6.1, LEATHER_DARK, { sz: CUIRASS_SZ + 0.06, seg: 12, open: true });
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
  // The fingers as one thick band round the bar.
  for (const o of [0]) {
    const t = new TorusGeometry(r, 0.85, 4, 6, Math.PI * 1.6);
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
  k.rod(shoulder, elbow, 1.6, SKIN, { r1: 1.25, seg: 6 });
  k.ball(elbow, 1.3, SKIN_SHADE, { detail: 0, hull: 0 });
  k.rod(elbow, wrist, 1.35, SKIN, { r1: 1.0, seg: 6 });
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
    // The neck, clear between the cuirass and the cheek blades.
    k.rod([0, 26.0, -0.2], [0, 31.5, 0.4], 1.9, SKIN, { seg: 7 });
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
      k.frame([-10.2, H(-9.6) + 1.6, 7.0], [-0.34, -0.18, 0], () => bronzeShield(k, c, w, 14));
    }, { axis: TIP_FORWARD });
    if (w.blood >= 1) groundDrops(k, 3, 9, true, w.blood >= 2);
  });
  setYaw(0);
  return { rx: 9.5, rz: 6, x: 0.5 };
}
