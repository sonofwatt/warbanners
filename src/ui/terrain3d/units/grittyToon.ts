// The Gritty toon kit: the shared pieces and rules of Gritty's own toon figures (the Hoplite in toonHoplite.ts is the
// first; the others follow it). Bright never builds these figures; figures.ts picks them only in Gritty.
//
// ---- The style ----
//
// - Toon, not realistic: faceted parts (the kit's flat normals), the toon light bands, the dark hull outline on every
//   solid part (hull 0 on marks, inner parts and anything that would outline itself), bold readable colours.
// - Chunky, friendly proportions, the toon figures' own place on a tile: feet on y 0, about 50 tall to the top of
//   the crest, about 20 wide with the shield, the same moving pieces as the toon figure of the type (WEAPON, SHIELD,
//   LEGS, FEET and the rest, see figures.ts) so the strike, block, crouch and idle code drives it unchanged.
// - More shape than the Bright figure: real equipment (plates, straps, rivets, a cuirass, greaves, hands that hold
//   things), and anatomy simplified, not smoothed away. Phone-cheap: about 2,600 triangles clean, at most 3,100 (the
//   test in gritty3d.test.ts enforces the Hoplite's).
// - Palette: earthy and aged (GT below): dark aged bronze with gold on its edges and ridges, leather, linen, iron. The
//   owner's colour is deepened with vivid() (crimson for the Spartans) and carried by the big readable parts: crest,
//   cloak or skirt, the shield's mark. Head and body must not merge: a bronze helm over a leather cuirass, not bronze
//   on bronze. The figure is drawn in the 'gritty' style (units3d.ts): toon light, every colour mildly muted.
//
// ---- How the wear reads (engine wearLook: stage 0 to 4, blood 0 to 2, scarred) ----
//
// - Scuffed (1): pale scratches on metal, dirt low on cloth and legs.
// - Dented (2): dents on the helm and the shield, a nick in a blade.
// - Battered (3): a crack, a chip out of the shield's rim, a torn hem, the crest shorn short at the back.
// - Broken (4): a piece of the headgear is gone for good (for a closed helm, the whole face plate), its edge a dark
//   torn line (tornEdge, never a bright zigzag); the bare face shows under it (bareFace). About half the shield is
//   gone, its mark clipped at the break (bronzeShield). The weapon is snapped.
// - Blood 1 and 2 (battered or worse and still bleeding): blood on the bare face and the body, drops on the ground;
//   at 2 more of it and a pool at the feet. Never on a figure with nothing bare to bleed (machines burn instead).
// - Scarred (once broken, now healed): the missing piece stays missing; the face is clean, with a healed scar
//   (faceScar) where the blood ran, and no blood unless the unit is bleeding again.
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { Kit, mix } from './kit';
import type { Surface, V3 } from './kit';
import { BLOOD, ell, SKIN, smear } from './parts';
import type { Wear } from './parts';

export { bronzeShield, fineDecal, vivid } from './shield3d';
export { bloody, heavy, helmBroken, worn } from './parts';

/** The Gritty toon palette. */
export const GT = {
  AGED: '#86652F', AGED_DARK: '#5C4320', GOLD_EDGE: '#EBC46A', DARK_IN: '#20150C',
  TORN: '#2E2112', TORN_LIT: '#7A6236',
  LEATHER: '#7A5232', LEATHER_DARK: '#4E331F', CUIRASS_LEATHER: '#7B4428', SANDAL: '#5E3E24',
  SKIN, SKIN_SHADE: '#C99B72', BROW_HAIR: '#2E1C12', BEARD: '#4A2E1C',
  SCAR: '#F0C2AE', SCAR_EDGE: '#93422F', MILKY: '#C9C6C0',
} as const;

// ---- plates and edges ----

/**
 * A flat-faced plate through `pts` (a ring of corners), faceted, its face turned away from `centre` (a helm's centre,
 * a shoulder's): the way the faceted helm plates and armour pieces are made.
 */
export function plate(k: Kit, pts: readonly V3[], colour: string, centre: V3, o: { gloss?: number; hull?: number } = {}): void {
  const c = pts.reduce((m, p) => [m[0] + p[0] / pts.length, m[1] + p[1] / pts.length, m[2] + p[2] / pts.length], [0, 0, 0]);
  const out = new Vector3(c[0] - centre[0], c[1] - centre[1] + 1.0, c[2] - centre[2] + 2.0);
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

/** A thin rod along a chain of points: gold on a plate's edge or ridge (the default), or any trim. */
export function metalEdge(k: Kit, pts: readonly V3[], r = 0.2, colour: string = GT.GOLD_EDGE): void {
  for (let i = 0; i + 1 < pts.length; i++) k.rod(pts[i]!, pts[i + 1]!, r, colour, { seg: 3, caps: false, hull: 0, gloss: 0.6 });
}

/** Where metal has torn away: a dark, dull jagged edge with only a thin dim line of bare metal along its top. */
export function tornEdge(k: Kit, pts: readonly V3[], r = 0.3): void {
  metalEdge(k, pts, r, GT.TORN);
  metalEdge(k, pts.map((p) => [p[0], p[1] + r * 0.75, p[2] + 0.08] as V3), r * 0.3, GT.TORN_LIT);
}

/** A surface on the plane through three points (x, y given; z solved), for marks on a plate. */
export function onPlane(a: V3, b: V3, c: V3): Surface {
  const n = new Vector3(...b).sub(new Vector3(...a)).cross(new Vector3(...c).sub(new Vector3(...a))).normalize();
  if (n.z < 0) n.negate();
  return (x, y) => ({ p: [x, y, a[2] - (n.x * (x - a[0]) + n.y * (y - a[1])) / n.z], n: [n.x, n.y, n.z] });
}

/**
 * The front of an ellipsoid head centred on c with radii r, facing the figure's own front (+z of the frame it is built
 * in, so it turns with the figure and its helm, not with the camera): (x, y) are offsets from the centre.
 */
export function headFront(c: V3, r: V3): Surface {
  return (x, y) => {
    const dx = x / r[0], dy = y / r[1];
    const q = Math.max(0.02, 1 - dx * dx - dy * dy), dz = Math.sqrt(q);
    const n = new Vector3(dx / r[0], dy / r[1], dz / r[2]).normalize();
    return { p: [c[0] + x, c[1] + y, c[2] + r[2] * dz], n: [n.x, n.y, n.z] };
  };
}

// ---- the bare face ----

export interface FaceOpts {
  /** The skin (default the toon skin). */
  skin?: string;
  /** A short beard over the jaw (default dark brown); null for none. */
  beard?: string | null;
  /** The brows' hair colour (default near-black brown). */
  brow?: string;
  /** Hair on top of the head (no colour: none; for a figure whose headgear does not cover it). */
  hair?: string | null;
  /** The size of the head: radius about 3.9 for the Hoplite. */
  r?: number;
}

/**
 * A grim, battle-worn toon face centred on c and facing the figure's front: a heavy brow drawn low, narrowed eyes,
 * sunken shade under the eyes and cheekbones, a set square jaw (with a short beard unless `beard` is null) and a tight
 * closed mouth. Its wear: blood (faceBlood) while bleeding, the healed scar (faceScar) once scarred and not bleeding.
 * The near side is the figure's left (x negative), the side the three-quarter camera sees most.
 */
export function bareFace(k: Kit, c: V3, w: Wear, o: FaceOpts = {}): void {
  const skin = o.skin ?? GT.SKIN, r = o.r ?? 3.9, f = r / 3.9;
  const R: V3 = [r * 1.12, r * 1.18, r];
  k.ball(c, r, skin, { detail: 1, hull: 0, s: [1.12, 1.18, 1.0] });
  if (o.hair) k.dome([c[0], c[1] + 0.6 * f, c[2] - 0.2 * f], r * 1.12, o.hair, { to: 1.2, seg: 10 });
  const s = headFront(c, R);
  const on = (x: number, y: number, lift = 0): V3 => { const p = s(x * f, y * f); return [p.p[0] + p.n[0] * lift, p.p[1] + p.n[1] * lift, p.p[2] + p.n[2] * lift]; };
  const at = (pts: readonly number[]): number[] => pts.map((v) => v * f);
  const scarred = w.scarred === true && w.blood === 0;
  const hollow = mix(skin, '#2A1408', 0.42);
  // The square jaw: a boxy block over the lower face, the beard's colour or the skin's.
  const jaw = o.beard === null ? mix(skin, '#000000', 0.06) : (o.beard ?? GT.BEARD);
  k.box([c[0], c[1] - 2.3 * f, c[2] + 1.9 * f], [5.4 * f, 2.6 * f, 3.2 * f], jaw, { hull: 0 });
  // Sunken shade under the brow, under the eyes and under the cheekbones.
  for (const sd of [-1, 1]) {
    k.decal(ell(sd * 1.5 * f, 0.55 * f, 1.25 * f, 0.75 * f, 8), hollow, s);
    k.decal(ell(sd * 2.2 * f, -1.0 * f, 0.9 * f, 0.45 * f, 7, sd * -0.4), hollow, s);
  }
  // Narrowed eyes: a slit of white, a dark iris (milky on a scarred eye), the lid heavy over it.
  for (const sd of [-1, 1]) {
    const blind = scarred && sd < 0;
    k.decal(at(blind ? [sd * 0.9, 0.38, sd * 2.1, 0.52, sd * 2.0, 0.32, sd * 0.95, 0.26] : [sd * 0.85, 0.42, sd * 2.15, 0.62, sd * 2.05, 0.3, sd * 0.9, 0.2]), '#E6DDCF', s);
    k.decal(ell(sd * 1.45 * f, 0.4 * f, 0.2 * f, (blind ? 0.1 : 0.17) * f, 6), blind ? GT.MILKY : '#120A06', s);
  }
  // The brow: one heavy dark ridge drawn low and down toward the nose. A scar breaks it.
  const brow = o.brow ?? GT.BROW_HAIR;
  for (const sd of [-1, 1]) {
    if (scarred && sd < 0) {
      k.rod(on(-0.3, 0.85, 0.25), on(-1.85, 1.2, 0.22), 0.55 * f, brow, { seg: 4, hull: 0 });
      k.rod(on(-2.45, 1.33, 0.2), on(-2.6, 1.37, 0.2), 0.55 * f, brow, { seg: 4, hull: 0 });
    } else k.rod(on(sd * 0.3, 0.85, 0.25), on(sd * 2.5, 1.35, 0.2), 0.55 * f, brow, { seg: 4, hull: 0 });
  }
  // The nose, on the centre line, and the mouth: a tight closed line, turned down a little at the ends.
  k.ball(on(0, -0.5, 0.1), 1, mix(skin, '#000000', 0.12), { detail: 0, hull: 0, s: [0.55 * f, 0.95 * f, 0.75 * f] });
  k.line(at([-1.0, -1.85, -0.4, -1.72, 0.4, -1.72, 1.0, -1.85]), 0.28 * f, '#24100A', s);
  if (scarred) faceScar(k, s, f, [c[0], c[1] - 2.3 * f, c[2] + 3.52 * f]);
  faceBlood(k, s, w, f);
}

/** The jagged line of the healed scar on the face (x, y offsets): from the brow across the near eye, into the beard. */
const SCAR_LINE = [-2.55, 1.75, -2.15, 1.05, -1.75, 0.5, -1.55, -0.15, -1.2, -0.85, -1.05, -1.55] as const;

/**
 * A healed scar: a thin, slightly jagged line a little paler and pinker than the skin, its edges a darker red, with
 * tight stitch ticks across it; from the brow across the near eye down the cheek, running on into the jaw or beard
 * (`jawFront`: the front of the jaw block, where it breaks the beard line), so it reads even when small.
 */
export function faceScar(k: Kit, s: Surface, f = 1, jawFront?: V3): void {
  const pts = SCAR_LINE.map((v) => v * f);
  k.line(pts, 0.42 * f, GT.SCAR_EDGE, s);
  k.line(pts, 0.2 * f, GT.SCAR, s);
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x = (pts[i]! + pts[i + 2]!) / 2, y = (pts[i + 1]! + pts[i + 3]!) / 2;
    k.line([x - 0.32 * f, y - 0.08 * f, x + 0.32 * f, y + 0.08 * f], 0.1 * f, GT.SCAR_EDGE, s);
  }
  if (jawFront) {
    // Where it crosses the jaw, the beard does not grow: a bare line through it.
    const jaw: Surface = (x, y) => ({ p: [x, y, jawFront[2]], n: [0, 0, 1] });
    const x0 = jawFront[0] - 1.05 * f, y0 = jawFront[1] + 1.25 * f;
    k.line([x0, y0, x0 + 0.2 * f, y0 - 1.3 * f, x0 + 0.35 * f, y0 - 2.4 * f], 0.5 * f, GT.SCAR_EDGE, jaw);
    k.line([x0, y0, x0 + 0.2 * f, y0 - 1.3 * f, x0 + 0.35 * f, y0 - 2.4 * f], 0.26 * f, GT.SCAR, jaw);
  }
}

/** Blood on a bare face (x, y offsets): a cut over the near eye running down the cheek into the beard; more at level 2. */
export function faceBlood(k: Kit, s: Surface, w: Wear, f = 1): void {
  if (w.blood >= 1) {
    smear(k, s, -2.0 * f, 1.5 * f, 0.12, -1, 3.6 * f, 1.2 * f);
    smear(k, s, -1.2 * f, 0.0, 0.05, -1, 2.6 * f, 0.8 * f);
  }
  if (w.blood >= 2) {
    smear(k, s, 1.2 * f, 1.2 * f, -0.1, -1, 2.8 * f, 0.9 * f);
    k.decal(ell(-1.6 * f, -2.9 * f, 0.7 * f, 0.5 * f, 6), BLOOD, s);
    k.decal(ell(0.6 * f, -0.4 * f, 0.35 * f, 0.35 * f, 6), BLOOD, s);
  }
}

// ---- the crest ----

export interface CrestOpts {
  /** The root of the brush, on top of its post: x across, y its base, z its middle front to back. */
  root: V3;
  /** Its colour (vivid of the owner's main colour, usually). */
  colour: string;
  /** Battered or worse: the back of it shorn away, square and ragged. */
  shorn: boolean;
  /** How long front to back and how tall (defaults: the Hoplite's, 7.8 and 7.6), how thick side to side. */
  length?: number;
  height?: number;
  thick?: number;
}

/**
 * A crest of horsehair: a long, thin brush running front to back, its top a soft rounded arc, combed with fine strands
 * of lighter and darker tones of its colour down both faces, and a fringe falling at the back. No spikes, no blobs:
 * it reads as one bold crest at phone size.
 */
export function crestBrush(k: Kit, o: CrestOpts): void {
  const red = o.colour, deep = mix(red, '#000000', 0.35), light = mix(red, '#FFFFFF', 0.2);
  const L = o.length ?? 7.8, Ht = o.height ?? 7.6, THICK = o.thick ?? 1.25;
  const base = o.root[1], z0 = o.root[2], x0 = o.root[0];
  const reach = o.shorn ? 0.5 : 1;
  const arc = (t: number): [number, number] => {
    const a = Math.PI * (0.06 + 0.9 * t);
    return [z0 + 1.2 + Math.cos(a) * L, base - 0.6 + Math.sin(a) * Ht - (t > 0.75 ? (t - 0.75) * 9 * (Ht / 7.6) : 0)];
  };
  const N = 18;
  const outline: number[] = [];
  for (let n = 0; n <= N; n++) { const [z, y] = arc((n / N) * reach); outline.push(z, y); }
  if (o.shorn) { const [z, y] = arc(reach); outline.push(z - 0.3, y - 1.6, z + 0.2, y - 3.0, z - 0.2, base + 0.6); }
  outline.push(z0 - 1.0, base - 0.4, z0 + 0.8, base - 0.4);
  k.slab(outline, THICK, red, [x0, 0, 0], [0, -Math.PI / 2, 0], { hull: 0.55 });
  for (const sd of [-1, 1]) {
    const faceS: Surface = (x, y) => ({ p: [x0 + sd * (THICK / 2), y, x], n: [sd, 0, 0] });
    // Combed front to back: strands following the arc at several depths, broken into lengths like hair.
    for (const [f, t0, t1, tone] of [[0.92, 0.04, 0.96, 1], [0.84, 0.1, 0.62, 0], [0.84, 0.66, 0.98, 0], [0.75, 0.06, 0.48, 1], [0.75, 0.52, 0.94, 1],
      [0.66, 0.14, 0.86, 0], [0.56, 0.08, 0.5, 1], [0.56, 0.56, 0.92, 0], [0.46, 0.18, 0.8, 1]] as const) {
      const pts: number[] = [];
      for (let n = 0; n <= 6; n++) {
        const t = (t0 + ((t1 - t0) * n) / 6) * reach;
        const [ez, ey] = arc(t);
        pts.push(z0 + 1.2 + (ez - z0 - 1.2) * f, base - 0.6 + (ey - base + 0.6) * f);
      }
      k.line(pts, 0.2, tone ? light : deep, faceS);
    }
  }
  if (!o.shorn) {
    // The fringe hanging down at the back: a curtain of hair under the arc's tail.
    const [tz, ty] = arc(1);
    k.slab([tz + 1.4, ty + 2.2, tz - 0.4, ty + 1.6, tz - 0.9, ty - 1.0, tz - 0.4, ty - 3.2, tz + 0.2, ty - 2.4, tz + 0.6, ty - 3.6, tz + 1.2, ty - 2.2, tz + 1.8, ty - 2.9, tz + 2.2, ty - 0.6],
      THICK * 0.8, deep, [x0, 0, 0], [0, -Math.PI / 2, 0], { hull: 0.45 });
  }
}
