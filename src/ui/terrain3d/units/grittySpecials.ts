// Gritty's detailed toon figures for the archer (shared), the Spartans' King's Guard, piper and scout, after the
// Hoplite (toonHoplite.ts) and the kit's rules (grittyToon.ts): faceted, outlined, earthy and aged, grim faces, more
// equipment and anatomy than the Bright toon figures. Each keeps the Bright figure's moving pieces and pivots
// (figures.ts), so the strike, block, crouch, idle and facing code drives it unchanged. The camp is in grittyCamp.ts.
import { SphereGeometry, Vector3 } from 'three';
import { H, Kit, mix } from './kit';
import type { Surface, V3 } from './kit';
import { ANKLE as ANKLE_AT, crack, FEET as FEET_PIECE, LEGS as LEGS_PIECE, dent, dirt, drip, ell, groundDrops, heavy, helmBroken, scratches, SCRATCH, setYaw, SKIN, smear, spear, tearPolys, worn } from './parts';
import type { Look, Wear } from './parts';
import { bareFace, bronzeShield, GT, metalEdge, onPlane, plate, tornEdge, vivid } from './grittyToon';
import { cloak, fist, fletch, frontOf, hairCap, hood, hoodCollar, lathe, limb, shortBlade, skirt, standLegs } from './grittyBody';
import type { Profile } from './grittyBody';

export interface SpecialOpts { look: Look; wear: Wear }
type Shadow = { rx: number; rz: number; x: number };

const YAW = 0.38;
const NARROW: Shadow = { rx: 9.5, rz: 6, x: 0.5 };
const WIDE: Shadow = { rx: 17, rz: 8.5, x: 0 };

/** The pieces the strike and crouch drive (figures.ts names them the same). */
const WEAPON = 'weapon';
const SHIELD = 'shield';
const ARROW = 'arrow';
const BOW = 'bow';
const TIP_FORWARD: V3 = [1, 0, 0];
const TIP_RIGHT: V3 = [0, 0, -1];
const DRAW_BACK: V3 = [0, 1, 0];

const { LEATHER, LEATHER_DARK, AGED, AGED_DARK, GOLD_EDGE, DARK_IN } = GT;
/** Hair on bare heads: near black brown. */
const HAIR = '#33231A';
/** Grey goose feathers and a dark one. */
const FEATHER = '#C9C0AE';
const FEATHER_DARK = '#6E665A';
const SHAFT = '#8A6440';
const IRON = '#8F8C84';

function turned(k: Kit, f: () => void, yaw = YAW): void {
  setYaw(yaw);
  k.frame([0, 0, 0], [0, yaw, 0], f);
  setYaw(0);
}

/** The front of a skirt flaring from r0 at y0 to r1 at y1, for marks on it. */
function skirtFront(y0: number, y1: number, r0: number, r1: number, sz = 0.72): Surface {
  return frontOf([[r0, y0], [r1, y1]], sz, 0.35);
}

/** Tatters below a hem at y on the front right (frayed from dented, longer when broken). */
function tatters(k: Kit, w: Wear, y: number, z: number, colour: string, x0 = 0.4): void {
  if (!worn(w, 2)) return;
  const n = worn(w, 4) ? 4 : 3, drop = worn(w, 4) ? 2.4 : 1.6;
  const pts: number[] = [x0, y + 0.6];
  for (let i = 0; i < n; i++) pts.push(x0 + (i + 0.5) * 1.5, y - (i % 2 ? drop * 0.6 : drop), x0 + (i + 1) * 1.5, y + 0.1);
  pts.push(x0 + n * 1.5, y + 0.6);
  k.slab(pts, 0.45, colour, [0, 0, z], [0, 0.3, 0]);
}

/** A tear in cloth on surface s at (x, y): a dark ragged lip round the skin showing through. */
function tear(k: Kit, s: Surface, x: number, y: number, wd: number, ht: number, cloth: string, under: string = SKIN): void {
  const [lip, gap] = tearPolys(x, y, wd, ht);
  k.decal(lip, mix(cloth, '#000000', 0.5), s);
  k.decal(gap, under, s);
}

// ---- the archer ----
//
// A hooded bowman of either army: a short cape and a deep hood in the owner's dark colour round a grim bearded face,
// a quilted jerkin over a tunic in the owner's colour, leg wraps and ankle boots, a leather quiver on his back with
// grey fletchings over his right shoulder, a bracer on the bow arm, and a tall recurved bow drawn to the chest.
// Its wear: dirt, a frayed hem, the hood's tail torn and a cut in the jerkin, then the hood ripped away (his hair
// shows), the bow snapped and no arrow on the string.

const JERKIN: Profile = [[6.0, 12.2], [5.6, 14.4], [6.1, 18.8], [6.5, 22.2], [6.2, 24.6], [4.4, 26.2]];
const JERKIN_COL = '#8C7653';

function bowPoints(top: V3, grip: V3, bottom: V3, n: number): V3[] {
  const ctrl: V3 = [2 * grip[0] - (top[0] + bottom[0]) / 2, 2 * grip[1] - (top[1] + bottom[1]) / 2, 2 * grip[2] - (top[2] + bottom[2]) / 2];
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
    pts.push([a * top[0] + b * ctrl[0] + c * bottom[0], a * top[1] + b * ctrl[1] + c * bottom[1], a * top[2] + b * ctrl[2] + c * bottom[2]]);
  }
  return pts;
}

/**
 * The recurved bow from its top tip through the grip to the bottom tip: limbs thick at the grip and fine at the tips,
 * a leather grip, horn tips curling forward. Snapped: the upper limb broken off, hanging from the string. Returns the
 * ends the string runs to.
 */
function bow(k: Kit, top: V3, grip: V3, bottom: V3, snapped: boolean): { top: V3; bottom: V3 } {
  const N = 10;
  const pts = bowPoints(top, grip, bottom, N);
  const wood = '#5A3A22', belly = '#7A5532';
  const from = snapped ? 3 : 0;
  for (let i = from; i < N; i++) {
    const t = (i + 0.5) / N, thick = 0.5 + 0.55 * (1 - Math.abs(2 * t - 1));
    k.rod(pts[i]!, pts[i + 1]!, thick, wood, { r1: 0.5 + 0.55 * (1 - Math.abs(2 * ((i + 1) / N) - 1)), seg: 5, caps: i === from || i === N - 1 });
  }
  // The grip wrapped in leather.
  k.rod(pts[4]!, pts[6]!, 1.2, LEATHER_DARK, { seg: 6 });
  k.rod(pts[5]!, [pts[5]![0], pts[5]![1] + 0.05, pts[5]![2]], 1.25, LEATHER, { seg: 6, hull: 0 });
  // Horn tips curling forward (away from the archer, -x).
  const horn = '#D2C3A2';
  const tipOf = (p: V3, s: number): V3 => [p[0] - 1.3, p[1] + s * 0.4, p[2]];
  if (!snapped) k.rod(pts[0]!, tipOf(pts[0]!, 1), 0.45, horn, { r1: 0.15, seg: 4 });
  k.rod(pts[N]!, tipOf(pts[N]!, -1), 0.45, horn, { r1: 0.15, seg: 4 });
  if (snapped) {
    // The splintered stub, and the loose limb hanging from the string.
    const p = pts[3]!;
    k.rod(p, [p[0] - 0.5, p[1] + 1.8, p[2]], 0.6, belly, { r1: 0.05, seg: 4, hull: 0.6 });
    k.rod(p, [p[0] + 0.4, p[1] + 1.2, p[2] + 0.3], 0.4, wood, { r1: 0.05, seg: 4, hull: 0.6 });
    const hang: V3 = [p[0] + 1.0, p[1] - 0.6, p[2] + 0.8], end: V3 = [p[0] + 0.4, p[1] - 7.6, p[2] + 0.9];
    k.rod(hang, end, 0.65, wood, { r1: 0.4, seg: 5 });
    k.rod(hang, [hang[0] + 0.2, hang[1] + 1.2, hang[2]], 0.6, belly, { r1: 0.05, seg: 4 });
    return { top: end, bottom: pts[N]! };
  }
  return { top: tipOf(pts[0]!, 1), bottom: tipOf(pts[N]!, -1) };
}

export function grittyArcher(k: Kit, { look: c, wear: w }: SpecialOpts): Shadow {
  turned(k, () => {
    const own = c.main, ownDark = c.dark;
    // Legs in wraps, ankle boots.
    standLegs(k, w, { wrap: '#8A7A60', boot: '#5A3C24', knee: 7.2 });
    // The tunic's skirt, the jerkin, the belt with a knife.
    skirt(k, 6.8, 12.6, 6.8, 5.8, own, ownDark);
    const sf = skirtFront(6.8, 12.6, 6.8, 5.8);
    if (worn(w, 1)) { dirt(k, sf, 2.6, 7.6, 4.2, own); dirt(k, sf, -3.6, 7.4, 3.0, own); }
    tatters(k, w, 6.9, 4.8, ownDark);
    if (worn(w, 3)) tear(k, sf, -2.4, 10.0, 2.8, 2.4, own);
    lathe(k, JERKIN, JERKIN_COL, 0.72);
    const jf = frontOf(JERKIN, 0.72);
    const quilt = mix(JERKIN_COL, '#000000', 0.32);
    for (const x of [-3.4, -1.2, 1.2, 3.4]) k.line([x, 13.6, x * 1.04, 22.6], 0.26, quilt, jf);
    k.line([-5.2, 18.2, 5.2, 18.2], 0.26, quilt, jf);
    // The quiver's strap across the chest, from the right shoulder to the left hip.
    k.line([4.6, 25.0, 1.0, 20.4, -3.0, 15.4, -5.4, 13.0], 0.9, LEATHER_DARK, frontOf(JERKIN, 0.72, 0.32));
    k.frustum([0, 0, 0], 12.0, 13.2, 6.15, 6.05, LEATHER_DARK, { sz: 0.76, seg: 12, open: true });
    k.box([0.2, 12.6, 4.65], [1.6, 1.3, 0.5], AGED, { gloss: 0.5 });
    k.rod([4.2, 12.4, 3.6], [5.2, 8.6, 4.2], 0.7, LEATHER_DARK, { r1: 0.4, seg: 5 });
    if (worn(w, 2)) dirt(k, jf, 3.0, 15.6, 3.2, JERKIN_COL);
    if (worn(w, 3)) { k.line([-4.2, 21.4, -2.0, 19.6, -0.8, 19.8], 0.5, '#2A1E14', jf); k.line([-4.0, 21.0, -2.0, 19.3], 0.18, '#D9CBAA', jf); }
    if (worn(w, 4)) tear(k, jf, 2.6, 21.0, 3.0, 2.6, JERKIN_COL, '#D9CBAA');
    if (w.blood >= 1) smear(k, jf, -2.4, 23.0, 0.1, -1, 3.8, 1.3);
    if (heavy(w)) { smear(k, jf, 2.2, 20.4, -0.2, -1, 4.2, 1.2); smear(k, sf, -1.4, 11.6, 0.1, -1, 3.0, 1.0); }
    if (heavy(w)) for (const s of [-1, 1]) drip(k, (x, y) => ({ p: [x, y, 1.75], n: [0, 0, 1] }), s * 2.8 - 0.3, 6.6, 3.4, 0.8);
    // The quiver on his back: leather, a dark mouth, the fletchings over his right shoulder.
    const qb: V3 = [7.4, 16.8, -4.8], qt: V3 = [3.6, 35.0, -4.2];
    k.rod(qb, qt, 1.9, LEATHER, { r1: 2.1, seg: 8 });
    k.rod([qt[0] + 0.2, qt[1] - 1.4, qt[2]], qt, 2.35, ownDark, { seg: 8 });
    k.rod([qb[0] - 0.1, qb[1] + 2.2, qb[2]], [qb[0] - 0.2, qb[1] + 3.0, qb[2]], 2.1, LEATHER_DARK, { seg: 8, hull: 0 });
    const qd = new Vector3(qt[0] - qb[0], qt[1] - qb[1], qt[2] - qb[2]).normalize();
    const qs: Surface = (x, y) => ({ p: [x + 0.4, y, -2.6], n: [0, 0, 1] });
    if (worn(w, 1)) scratches(k, qs, [[5.4, 24.4, 6.6, 23.0]], '#B79B74', 0.3);
    const arrows: [number, number, string][] = worn(w, 4) ? [[-0.6, 0.2, FEATHER], [0.8, -0.4, FEATHER_DARK]] : [[-0.9, 0.3, FEATHER], [0.2, -0.6, FEATHER_DARK], [1.0, 0.5, FEATHER], [-0.2, 0.9, FEATHER]];
    arrows.forEach(([dx, dz, col], i) => {
      const base: V3 = [qt[0] + dx, qt[1] - 0.6, qt[2] + dz];
      const broken = worn(w, 3) && i === 1;
      const len = broken ? 2.6 : 6.2;
      const end: V3 = [base[0] + qd.x * len - dx * 0.25, base[1] + qd.y * len, base[2] + qd.z * len];
      k.rod(base, end, 0.24, SHAFT, { seg: 4, hull: 0.5 });
      if (broken) k.rod(end, [end[0] + 0.5, end[1] + 0.6, end[2]], 0.24, SHAFT, { r1: 0.05, seg: 3, hull: 0 });
      else fletch(k, end, [-qd.x, -qd.y, -qd.z], col, 2.0, 0.65);
    });
    // The neck and the head: a grim bearded face in a deep hood.
    k.rod([0, 25.6, -0.1], [0, 29.2, 0.3], 1.75, SKIN, { seg: 7 });
    const face: V3 = [-0.2, 31.9, 0.7];
    bareFace(k, face, w, { beard: '#4A2E1C' });
    if (helmBroken(w)) {
      // Torn away: only a ragged collar of the hood is left, his hair shaggy and loose.
      hoodCollar(k, face, 3.9, ownDark);
      hairCap(k, face, 3.9, HAIR);
    } else {
      hood(k, face, 3.9, ownDark, { point: [1.2, 2.6, -4.2], torn: worn(w, 3) });
      if (worn(w, 2)) dirt(k, (x, y) => ({ p: [x, y, face[2] + 1.6], n: [0, 0.4, 1] }), face[0] + 3.0, face[1] + 4.6, 2.4, ownDark);
    }
    // The short cape over the shoulders, under the hood's collar.
    k.frustum([0, 0, -0.3], 22.0, 26.4, 7.4, 5.0, ownDark, { sz: 0.82, seg: 12 });
    if (worn(w, 3)) k.decal([-3.6, 22.1, -1.6, 20.8, -0.4, 22.1], ownDark, (x, y) => ({ p: [x, y, 0.82 * Math.sqrt(Math.max(1, 7.4 * 7.4 - x * x)) - 0.1], n: [0, -0.3, 1] }));

    // The bow, drawn: the bow arm out to the left, the arrow nocked at the chest. All one piece about the bow arm's
    // shoulder, so a crouch can bring it down and in.
    k.pivot(BOW, [-5.2, H(-15.6), 0.6], () => {
      const grip: V3 = [-15.6, H(-14), 4.0];
      const snapped = worn(w, 4);
      const b = bow(k, [-10.4, H(-27.5), 3.6], grip, [-10.4, H(-0.5), 3.6], snapped);
      const nock: V3 = [1.6, H(-14), 4.6];
      const loose: V3 = [-3.4, H(-12), 5.0];
      const string = '#E2D8BE';
      k.rod(b.top, snapped ? loose : nock, 0.17, string, { seg: 3, hull: 0.4 });
      k.rod(snapped ? loose : nock, b.bottom, 0.17, string, { seg: 3, hull: 0.4 });
      limb(k, [-5.4, 24.8, 0.4], [-10.2, 23.4, 2.6], [-14.4, 23.0, 3.8], { sleeve: own, sleeveTo: 0.8, bracer: LEATHER });
      fist(k, grip, [0, 1, 0], [-0.5, 0, 0.85], 1.0);
      if (w.blood >= 1) smear(k, (x, y) => ({ p: [x, y, grip[2] + 1.5], n: [0, 0, 1] }), -14.6, 24.2, 0.6, -1, 2.0, 0.9);
      // The drawing arm and hand: drawn back and loosed along the arrow (-x).
      k.pivot(WEAPON, [5.2, H(-15.6), 0.6], () => {
        limb(k, [5.4, 24.8, 0.4], [8.4, 23.0, 3.4], [3.0, 23.0, 5.0], { sleeve: own, sleeveTo: 0.8 });
        fist(k, [2.0, H(-14) + 0.1, 5.0], [0, 1, 0], [0.7, 0.2, 0.7], 0.95);
      }, { axis: DRAW_BACK, fwd: [-1, 0, 0] });
      if (!snapped) {
        k.pivot(ARROW, [5.2, H(-15.6), 0.6], () => {
          const y = H(-14), z = 4.6;
          k.rod([2.6, y, z], [-17.0, y, z], 0.27, SHAFT, { seg: 4 });
          k.rod([-17.0, y, z], [-20.2, y, z], 0.8, IRON, { r1: 0.05, seg: 4, gloss: 0.5 });
          k.rod([-16.6, y, z], [-17.2, y, z], 0.55, IRON, { seg: 4, hull: 0 });
          fletch(k, [-1.0, y, z], [-1, 0, 0], mix(c.accent, '#4A3A28', 0.25), 2.2, 0.75);
        }, { fwd: [-1, 0, 0] });
      }
    });
    if (w.blood >= 1) groundDrops(k, 4.5, 6, true, heavy(w));
  });
  return WIDE;
}


// ---- the King's Guard ----
//
// The Spartan champion: the Hoplite's army, a step grander. Taller, in a gilded closed helm with gold brow scrolls
// and a crest worn side to side (the leader's mark), a corselet of white linen with a belt of bronze scales and crimson
// borders, linen shoulder flaps with gold studs, gilded greaves, a long crimson cape to the heels, a sword at the hip,
// a long spear with a bronze butt spike and the same lambda shield, a little smaller. Broken, the helm's face plate
// is gone (his bearded face shows), the right shoulder flap is torn away, the crest shorn to one side.

/** The helm's centre: higher than the Hoplite's (35.2), he stands taller. */
const KG_HELM: V3 = [0, 37.6, 0.4];
const KG_BRONZE = '#977236';
const LINEN = '#D3C5A2';
const LINEN_DARK = '#A99A78';

type P3 = readonly [number, number, number];
/** The front plates' corners (the Hoplite's helm shape), the figure's right half; the left mirrors it. */
const PT = {
  R0: [0, 5.3, 3.4], R1: [0, 1.9, 5.4], N: [0, -3.2, 5.05], G1: [0.7, 1.35, 5.1], G2: [0.38, -1.8, 4.98],
  T: [4.7, 4.1, 0.9], B: [5.0, 2.1, 1.7], EO: [4.35, 1.85, 2.7], EI: [1.15, 0.95, 4.9], FI: [1.2, -1.05, 4.85],
  FO: [4.25, 0.05, 2.85], CO: [5.0, -0.15, 1.9], CB: [4.6, -3.4, 1.3], CP: [1.3, -5.7, 3.45], CI: [1.3, -1.35, 4.8],
} as const satisfies Record<string, P3>;

/**
 * A crest of horsehair worn side to side over the helm: a broad arch of combed hair, its root on the post at `root`
 * (y its base), `span` from the middle to each end and `height` tall. Shorn (battered or worse): the right half cut
 * away, ragged.
 */
function fanCrest(k: Kit, root: V3, colour: string, shorn: boolean, span = 8.6, height = 7.2, thick = 1.3): void {
  const deep = mix(colour, '#000000', 0.35), light = mix(colour, '#FFFFFF', 0.2);
  const base = root[1], z0 = root[2], x0 = root[0];
  const reach = shorn ? 0.56 : 1;
  // From the left end (t 0) over the top to the right end (t 1); the ends droop a little, as hair does.
  const arc = (t: number, f = 1): [number, number] => {
    const a = Math.PI * (0.97 - 0.94 * t);
    return [x0 + Math.cos(a) * span * f, base - 0.4 + Math.sin(a) * height * f];
  };
  const N = 18;
  const out: number[] = [];
  for (let n = 0; n <= N; n++) { const [x, y] = arc((n / N) * reach); out.push(x, y); }
  if (shorn) { const [x, y] = arc(reach); out.push(x + 0.4, y - 1.4, x - 0.2, y - 2.6, x + 0.3, y - 3.8, x0 + 0.9, base + 0.4); }
  else out.push(x0 + span * 0.55, base - 0.4);
  out.push(x0 - span * 0.55, base - 0.4);
  k.slab(out, thick, colour, [0, 0, z0], [0, 0, 0], { hull: 0.55 });
  for (const sd of [-1, 1]) {
    const face: Surface = (x, y) => ({ p: [x, y, z0 + sd * (thick / 2)], n: [0, 0, sd] });
    for (const [f, t0, t1, tone] of [[0.9, 0.03, 0.97, 1], [0.78, 0.08, 0.55, 0], [0.78, 0.6, 0.94, 0], [0.64, 0.1, 0.9, 1], [0.5, 0.14, 0.86, 0]] as const) {
      const pts: number[] = [];
      const t1r = Math.min(t1, reach - 0.02);
      if (t1r <= t0) continue;
      for (let n = 0; n <= 5; n++) {
        const [x, y] = arc(t0 + ((t1r - t0) * n) / 5, 1);
        pts.push(x0 + (x - x0) * f, base - 0.4 + (y - base + 0.4) * f);
      }
      k.line(pts, 0.2, tone ? light : deep, face);
    }
  }
}

/**
 * The King's Guard's closed helm (the Hoplite's shape, gilded): faceted bronze plates over a dome, gold on every edge,
 * gold scrolls over the eyes, the fan crest on a gilded post. Broken (and scarred), the face plate is gone and his
 * bearded face shows under a torn brow.
 */
function guardHelm(k: Kit, c: Look, w: Wear, HELM: V3): void {
  const at = (p: P3, side: number): V3 => [HELM[0] + p[0] * side, HELM[1] + p[1], HELM[2] + p[2]];
  const open = helmBroken(w);
  const faceC: V3 = [HELM[0], HELM[1] - 0.9, HELM[2] + 0.5];
  if (open) bareFace(k, faceC, w, { beard: '#3E2616' });
  else {
    k.ball(faceC, 4.0, DARK_IN, { detail: 0, hull: 0, s: [1.18, 1.18, 1.0] });
    plate(k, [at([1.4, -0.6, 3.6], 1), at([1.4, -5.6, 2.9], 1), at([1.4, -5.6, 2.9], -1), at([1.4, -0.6, 3.6], -1)], DARK_IN, HELM, { gloss: 0, hull: 0 });
  }
  const cap = new SphereGeometry(5.2, 11, 3, 0, Math.PI * 2, 0, 1.0);
  const band = new SphereGeometry(5.2, 10, 3, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 1.0, 1.05);
  for (const g of [cap, band]) { g.translate(HELM[0], HELM[1] + 0.4, HELM[2] - 0.9); k.add(g, KG_BRONZE, { gloss: 0.5, smooth: true }); }
  k.frustum([HELM[0], 0, HELM[2] - 0.9], HELM[1] - 3.4, HELM[1] - 1.9, 5.6, 4.7, AGED, { arc: [Math.PI * 0.62, Math.PI * 0.76], seg: 10, sz: 1, gloss: 0.45 });
  // A gold band round the bowl's foot at the back, and gold rivets at the temples.
  k.frustum([HELM[0], 0, HELM[2] - 0.9], HELM[1] - 0.2, HELM[1] + 0.5, 5.3, 5.25, GOLD_EDGE, { arc: [Math.PI * 0.6, Math.PI * 0.8], seg: 10, sz: 1, hull: 0, gloss: 0.6 });
  for (const side of [1, -1]) k.ball(at([4.75, 2.6, 1.6], side), 0.42, GOLD_EDGE, { detail: 0, hull: 0, gloss: 0.6 });
  if (open) {
    const rim = (x: number, y: number, z: number): V3 => at([x, y, z], 1);
    const tear: V3[] = [rim(-4.4, 0.4, 2.2), rim(-3.4, 2.5, 2.7), rim(-2.4, 1.9, 3.6), rim(-1.4, 3.1, 3.9), rim(-0.4, 2.4, 4.3), rim(0.6, 3.3, 4.2), rim(1.6, 2.2, 4.0), rim(2.6, 3.0, 3.6), rim(3.5, 2.0, 2.9), rim(4.4, 0.5, 2.2)];
    plate(k, [rim(-4.8, 3.6, 1.6), rim(4.8, 3.6, 1.6), ...[...tear].reverse()], KG_BRONZE, HELM);
    tornEdge(k, tear);
    tornEdge(k, [rim(-4.4, 0.4, 2.2), rim(-4.6, -1.8, 1.5)]);
    tornEdge(k, [rim(4.4, 0.5, 2.2), rim(4.6, -1.8, 1.5)]);
  } else {
    for (const side of [1, -1]) {
      const q = (n: keyof typeof PT): V3 => at(PT[n], side);
      plate(k, [q('R0'), q('R1'), q('G1'), q('EI'), q('EO'), q('B'), q('T')], KG_BRONZE, HELM, { gloss: 0.55 });
      plate(k, [q('R1'), q('N'), q('G2'), q('G1')], KG_BRONZE, HELM, { gloss: 0.55 });
      plate(k, [q('B'), q('EO'), q('FO'), q('CO')], AGED, HELM);
      plate(k, [q('CI'), q('FI'), q('FO'), q('CO'), q('CB'), q('CP')], KG_BRONZE, HELM, { gloss: 0.55 });
      metalEdge(k, [q('T'), q('R0')], 0.26);
      metalEdge(k, [q('G1'), q('EI'), q('EO')], 0.24);
      metalEdge(k, [q('FI'), q('FO')], 0.18);
      metalEdge(k, [q('CI'), q('CP'), q('CB'), q('CO')], 0.26);
      // A gold scroll over the eye, curling at the temple.
      const brow = onPlane(q('R1'), q('B'), q('T'));
      const sc = [[0.7, 2.6], [1.8, 3.25], [3.0, 3.3], [3.8, 2.85], [3.6, 2.35], [3.1, 2.5]].map(([x, y]) => {
        const sp = brow(HELM[0] + x! * side, HELM[1] + y!);
        return [sp.p[0] + sp.n[0] * 0.15, sp.p[1] + sp.n[1] * 0.15, sp.p[2] + sp.n[2] * 0.15] as V3;
      });
      metalEdge(k, sc, 0.2);
    }
    metalEdge(k, [at(PT.R0, 1), at(PT.R1, 1), at(PT.N, 1)], 0.3);
    const brow = onPlane(at(PT.R1, 1), at(PT.B, 1), at(PT.T, 1));
    const blade = onPlane(at(PT.CI, 1), at(PT.CO, 1), at(PT.CP, 1));
    if (worn(w, 1)) scratches(k, blade, [[HELM[0] + 2.0, HELM[1] - 2.0, HELM[0] + 3.2, HELM[1] - 3.2]], SCRATCH, 0.3);
    if (worn(w, 2)) { dent(k, brow, HELM[0] + 3.2, HELM[1] + 3.6, 0.55, KG_BRONZE); dent(k, blade, HELM[0] + 2.6, HELM[1] - 1.2, 0.55, KG_BRONZE); }
    if (worn(w, 3)) crack(k, blade, [HELM[0] + 3.6, HELM[1] - 0.4, HELM[0] + 3.0, HELM[1] - 1.8, HELM[0] + 3.4, HELM[1] - 3.0], 0.3);
  }
  // The crest on a gilded post, side to side.
  const top = HELM[1] + 5.4;
  k.box([HELM[0], top + 1.2, HELM[2] - 0.6], [1.6, 2.8, 1.6], KG_BRONZE, { gloss: 0.5 });
  k.box([HELM[0], top + 2.7, HELM[2] - 0.6], [5.2, 0.5, 1.9], GOLD_EDGE, { hull: 0.4, gloss: 0.6 });
  fanCrest(k, [HELM[0], top + 2.9, HELM[2] - 0.6], vivid(c.main), worn(w, 3));
}

const LINO: Profile = [[6.3, 13.4], [6.0, 15.6], [6.6, 20.2], [7.1, 23.8], [6.8, 26.4], [5.2, 28.2]];

export function grittyKingsGuard(k: Kit, { look: c, wear: w }: SpecialOpts): Shadow {
  turned(k, () => {
    const red = vivid(c.main);
    // The long cape to his heels, torn from battered.
    const hem = worn(w, 4) ? [12.8, 1.6, 9.2, 0.5, 6.0, 2.8, 2.6, 0.6, -1.2, 3.2, -4.6, 0.7, -8.4, 3.0, -12.8, 1.0]
      : worn(w, 3) ? [12.9, 1.2, 7.6, 2.4, 3.2, 0.8, -1.6, 2.6, -6.2, 0.9, -12.9, 1.4] : [12.9, 1.0, -12.9, 1.0];
    cloak(k, [-7.6, 28.2, 7.6, 28.2, 12.2, 17.6, ...hem, -12.6, 17.6], -5.2, c.main, { lean: 0.07, folds: [-5.6, -0.8, 4.6], top: 26, foot: 2.4 });
    standLegs(k, w, { knee: 8.0, greave: '#B48236', gilded: true, spread: 2.9 });
    if (worn(w, 1)) for (const s of [-1, 1]) k.decal(ell(s * 2.9, 4.2, 0.9, 0.7, 7), mix('#B48236', '#3D3A34', 0.6), (x, y) => ({ p: [x, y, 2.45], n: [0, 0, 1] }));
    // The chiton's skirt, and two rows of linen strips hanging from the corselet.
    skirt(k, 7.6, 13.4, 7.4, 6.2, c.main, c.dark);
    for (let i = 0; i < 9; i++) {
      const a = -1.75 + (i / 8) * 3.5;
      const x = Math.sin(a) * 6.8, z = Math.cos(a) * 6.8 * 0.76;
      const torn = worn(w, 3) && (i === 5 || i === 6);
      const h = torn ? 2.6 : 4.4;
      k.box([x, 11.1 + (4.4 - h) / 2, z], [1.65, h, 0.45], i % 2 ? LINEN : LINEN_DARK, { rot: [0, a, 0] });
      if (!torn && Math.abs(a) < 1.2) {
        const st: Surface = (u, v) => ({ p: [x + Math.cos(a) * u + Math.sin(a) * 0.24, v, z - Math.sin(a) * u + Math.cos(a) * 0.24], n: [Math.sin(a), 0, Math.cos(a)] });
        k.decal([-0.8, 9.0, 0.8, 9.0, 0.8, 9.6, -0.8, 9.6], red, st);
      }
    }
    // The linen corselet, the belt of bronze scales, crimson borders.
    lathe(k, LINO, LINEN, 0.72);
    const lf = frontOf(LINO, 0.72);
    k.frustum([0, 0, 0], 13.2, 18.8, 6.5, 6.75, AGED, { sz: 0.76, seg: 12, open: true, gloss: 0.5 });
    const sf = frontOf([[6.5, 13.2], [6.75, 18.8]], 0.76, 0.22);
    for (const y of [14.6, 16.3, 18.0]) {
      const pts: number[] = [];
      for (let x = -5.6, i = 0; x <= 5.61; x += 1.4, i++) pts.push(x, y - (i % 2 ? 0.6 : 0));
      k.line(pts, 0.22, AGED_DARK, sf);
    }
    k.line([-6.4, 19.0, 6.4, 19.0], 0.7, red, lf);
    k.line([-6.4, 13.4, 6.4, 13.4], 0.5, GOLD_EDGE, sf);
    k.frustum([0, 0, 0], 27.6, 28.5, 5.4, 4.6, red, { sz: 0.78, seg: 12, open: true });
    // Shoulder flaps, tied down to the chest with gold studs (the right one torn away once broken).
    for (const sd of [-1, 1]) {
      if (sd > 0 && helmBroken(w)) {
        k.decal(tearPolys(4.2, 25.4, 3.2, 2.2)[0], LINEN_DARK, lf);
        continue;
      }
      k.box([sd * 4.2, 28.0, 0.2], [4.0, 1.0, 6.4], LINEN, { rot: [0, 0, sd * -0.32] });
      k.line([sd * 2.4, 28.6, sd * 6.0, 27.4], 0.4, red, (x, y) => ({ p: [x, y, 3.45], n: [0, 0, 1] }));
      k.ball([sd * 4.0, 26.6, 3.6], 0.6, GOLD_EDGE, { detail: 0, hull: 0.4, gloss: 0.6 });
    }
    if (worn(w, 1)) { dirt(k, lf, 3.4, 22.0, 2.6, LINEN); dirt(k, sf, -3.0, 14.4, 3.0, AGED); }
    if (worn(w, 2)) dent(k, sf, 2.6, 16.2, 1.0, AGED);
    if (worn(w, 3)) { k.line([-4.4, 25.0, -2.6, 22.6, -3.2, 20.8], 0.5, '#2E2418', lf); }
    if (w.blood >= 1) smear(k, lf, -2.0, 25.6, 0.1, -1, 4.2, 1.4);
    if (heavy(w)) { smear(k, lf, 2.6, 23.0, -0.2, -1, 4.4, 1.2); smear(k, sf, 1.0, 17.0, 0, -1, 3.0, 1.0); }
    // The sword at the right hip.
    k.rod([6.4, 14.2, 2.8], [8.8, 6.8, 3.8], 0.85, LEATHER_DARK, { r1: 0.6, seg: 5 });
    k.rod([8.6, 7.4, 3.7], [8.95, 6.3, 3.85], 0.7, GOLD_EDGE, { r1: 0.3, seg: 4, hull: 0.4 });
    k.rod([5.9, 15.0, 2.6], [5.2, 17.4, 2.4], 0.5, LEATHER, { seg: 4 });
    k.rod([4.9, 14.8, 2.5], [7.0, 15.2, 2.7], 0.4, GOLD_EDGE, { seg: 4, gloss: 0.6 });
    k.ball([5.1, 17.7, 2.4], 0.6, GOLD_EDGE, { detail: 0, gloss: 0.6 });
    // The neck, and the spear arm; the hand round the shaft goes with the spear when it strikes.
    k.rod([0, 27.6, -0.2], [0, 33.8, 0.4], 2.0, SKIN, { seg: 7 });
    limb(k, [6.2, 26.8, 0], [10.0, 21.8, 0.6], [12.4, 21.2, 1.8], { r: 1.08 });
    const butt: V3 = [12.4, 0.6, 1.6], top: V3 = [14.0, 49.0, 1.6];
    const grip: V3 = [13.08, H(-12.6), 1.6];
    k.pivot(WEAPON, [13, H(-12.6), 1.6], () => {
      spear(k, butt, top, 8.2, { nick: worn(w, 2), snap: worn(w, 4) ? 0.6 : undefined, blood: w.blood }, 0.85);
      k.rod(butt, [butt[0] + 0.1, butt[1] + 2.6, butt[2]], 0.75, AGED, { r1: 0.95, seg: 6, gloss: 0.5 });
      const ax = new Vector3(...top).sub(new Vector3(...butt)).normalize();
      fist(k, grip, [ax.x, ax.y, ax.z], [-0.8, 0, -0.6], 1.35);
    }, { axis: TIP_FORWARD });
    guardHelm(k, c, w, KG_HELM);
    // The shield arm and the shield (the Hoplite's, a little smaller), the hand on its grip behind it.
    k.pivot(SHIELD, [-5.6, H(-19.6), 0], () => {
      limb(k, [-6.2, 26.8, 0], [-10.2, 22.2, 1.4], [-10.8, 19.8, 4.6], { r: 1.08 });
      fist(k, [-10.8, 19.4, 5.2], [1, 0, 0], [0, 0, -1], 1.15);
      k.box([-10.8, 19.4, 5.2], [4.6, 0.5, 0.5], LEATHER_DARK, { hull: 0 });
      k.frame([-11.2, 20.4, 7.0], [-0.34, -0.22, 0], () => bronzeShield(k, c, w, 12), [0.86, 0.86, 0.86]);
    }, { axis: TIP_FORWARD });
    if (w.blood >= 1) groundDrops(k, 3, 9, true, heavy(w));
  });
  return NARROW;
}


// ---- the piper ----
//
// The Spartan army's piper, who sets the pace of the advance: no helm and little armour, a grim bearded face with
// long hair under a wreath of olive leaves, the leather mouth band (it holds the pipes to his lips) round his cheeks,
// a crimson chiton under a leather harness with a small bronze disc on the chest, a short dark cloak, leg wraps, the
// pipe case at his hip. The double pipe runs from his lips to both hands, and notes rise from it. Battered, the wreath
// loses leaves and the music thins to one note; broken, the wreath is gone for good, a pipe is snapped and he plays
// no more.

const CHITON: Profile = [[5.9, 12.6], [5.5, 14.6], [5.9, 19.0], [6.2, 22.4], [5.9, 24.6], [4.3, 26.2]];
const REED = '#C9B486';
const OLIVE = '#6E7C3A';
const OLIVE_DARK = '#4C5A28';

/** One reed of the double pipe from the lips to its bell, with bronze rings; snapped half way when broken. */
function reed(k: Kit, from: V3, to: V3, snapped: boolean): void {
  const d = new Vector3(...to).sub(new Vector3(...from));
  const at = (t: number): V3 => [from[0] + d.x * t, from[1] + d.y * t, from[2] + d.z * t];
  const end = snapped ? 0.5 : 1;
  k.rod(from, at(end), 0.42, REED, { r1: 0.48, seg: 5 });
  for (const t of [0.08, 0.38, 0.7]) if (t < end) k.rod(at(t), at(t + 0.035), 0.58, AGED, { seg: 5, hull: 0, gloss: 0.5 });
  if (snapped) {
    const p = at(end);
    k.rod(p, [p[0] + 0.3, p[1] - 0.9, p[2] + 0.4], 0.3, REED, { r1: 0.05, seg: 3, hull: 0.4 });
    return;
  }
  // The flared bell.
  const u = d.clone().normalize();
  k.rod(to, [to[0] + u.x * 1.8, to[1] + u.y * 1.8, to[2] + u.z * 1.8], 0.5, REED, { r1: 1.05, seg: 6 });
  k.rod([to[0] + u.x * 1.5, to[1] + u.y * 1.5, to[2] + u.z * 1.5], [to[0] + u.x * 1.85, to[1] + u.y * 1.85, to[2] + u.z * 1.85], 1.1, AGED, { seg: 6, hull: 0, gloss: 0.5 });
}

/** A note of music rising from the pipes: a head, a stem and a flag, in dull gold. */
function note(k: Kit, x: number, y: number, z: number, s: number): void {
  const col = '#B8914C';
  k.ball([x, y, z], 1.25 * s, col, { s: [1.2, 0.85, 0.6], detail: 0, gloss: 0.3 });
  k.rod([x + 1.25 * s, y, z], [x + 1.25 * s, y + 5.6 * s, z], 0.36 * s, col, { seg: 4 });
  k.slab([0, 0, 2.4 * s, -1.6 * s, 2.0 * s, -2.6 * s, 0, -1.4 * s], 0.45, col, [x + 1.25 * s, y + 5.6 * s, z], [0, 0, 0]);
}

export function grittyPiper(k: Kit, { look: c, wear: w }: SpecialOpts): Shadow {
  turned(k, () => {
    const own = c.main;
    // The short cloak behind, from the shoulders to the waist (torn from battered).
    const hem = worn(w, 4) ? [10.4, 11.4, 7.2, 13.6, 4.0, 10.8, 0.6, 13.2, -2.8, 11.0, -6.4, 13.4, -10.4, 11.6]
      : worn(w, 3) ? [10.4, 11.6, 5.6, 12.8, 1.6, 11.2, -3.0, 12.6, -10.4, 11.6] : [10.4, 11.6, -10.4, 11.6];
    cloak(k, [-7.0, 26.4, 7.0, 26.4, 10.0, 18.2, ...hem, -10.2, 18.2], -4.6, c.dark, { lean: 0.08, folds: [-4.2, 3.8], top: 25, foot: 12.6 });
    standLegs(k, w, { wrap: '#8A7759' });
    // The chiton: a pleated skirt to the knee and the body, its folds, a broad belt.
    skirt(k, 6.8, 12.8, 7.0, 5.9, own, c.dark);
    const sk = skirtFront(6.8, 12.8, 7.0, 5.9);
    if (worn(w, 1)) { dirt(k, sk, 2.8, 7.6, 4.0, own); dirt(k, sk, -3.4, 7.4, 2.8, own); }
    tatters(k, w, 6.9, 4.9, c.dark);
    if (worn(w, 3)) tear(k, sk, -2.2, 10.2, 2.8, 2.4, own);
    lathe(k, CHITON, own, 0.72);
    const cf = frontOf(CHITON, 0.72);
    const fold = mix(own, '#000000', 0.3);
    for (const [x0, x1] of [[-3.6, -2.6], [3.4, 2.4], [-0.6, -0.2]] as const) k.line([x0, 24.0, x1, 14.2], 0.35, fold, cf);
    k.frustum([0, 0, 0], 12.0, 13.6, 6.1, 6.0, LEATHER_DARK, { sz: 0.77, seg: 12, open: true });
    k.box([0, 12.8, 4.7], [1.8, 1.3, 0.5], AGED, { gloss: 0.5 });
    // The harness: straps over both shoulders crossing on the chest, a bronze disc where they cross.
    const hf = frontOf(CHITON, 0.72, 0.32);
    k.line([-4.4, 25.6, -1.4, 20.0, 1.6, 15.6, 3.8, 13.4], 0.95, LEATHER, hf);
    k.line([4.4, 25.6, 1.4, 20.0, -1.6, 15.6, -3.8, 13.4], 0.95, LEATHER, hf);
    if (!helmBroken(w)) {
      const pc = hf(0, 19.9);
      k.frame([pc.p[0], pc.p[1], pc.p[2] + 0.2], [-0.1, 0, 0], () => {
        k.slab(ell(0, 0, 1.9, 1.9, 10), 0.5, AGED, [0, 0, 0], [0, 0, 0], { gloss: 0.5 });
        k.line([...ell(0, 0, 1.45, 1.45, 10), 1.45, 0], 0.22, GOLD_EDGE, (x, y) => ({ p: [x, y, 0.27], n: [0, 0, 1] }));
        if (worn(w, 2)) dent(k, (x, y) => ({ p: [x, y, 0.27], n: [0, 0, 1] }), 0.6, -0.4, 0.6, AGED);
      });
    } else k.line([-0.6, 20.4, 0.8, 19.2], 0.4, '#2E2418', hf);
    if (w.blood >= 1) smear(k, cf, -2.6, 23.4, 0.1, -1, 3.8, 1.3);
    if (heavy(w)) { smear(k, cf, 2.8, 21.0, -0.2, -1, 4.0, 1.2); smear(k, sk, 1.4, 11.8, 0, -1, 3.0, 1.0); }
    if (heavy(w)) for (const sd of [-1, 1]) drip(k, (x, y) => ({ p: [x, y, 1.75], n: [0, 0, 1] }), sd * 2.8 + 0.3, 6.6, 3.2, 0.8);
    // The pipe case at his left hip, hung from the belt.
    k.rod([-6.0, 13.0, 1.4], [-7.0, 4.6, 2.6], 1.15, LEATHER, { r1: 0.7, seg: 6 });
    k.rod([-6.0, 13.6, 1.4], [-6.15, 12.0, 1.6], 1.35, LEATHER_DARK, { seg: 6 });
    if (worn(w, 2)) scratches(k, (x, y) => ({ p: [x, y, 2.9], n: [0, 0, 1] }), [[-7.0, 9.4, -6.2, 7.6]], '#B79B74', 0.25);
    // The neck and the head: grim, bearded, long hair, the wreath, the mouth band.
    k.rod([0, 25.6, -0.1], [0, 29.2, 0.3], 1.75, SKIN, { seg: 7 });
    const face: V3 = [0, 31.9, 0.7];
    bareFace(k, face, w, { beard: '#3E2616' });
    hairCap(k, face, 3.9, HAIR, { long: true });
    // The wreath of olive leaves round the brow; fewer once battered, gone once broken (a bare twig left).
    const leaves = helmBroken(w) ? [] : worn(w, 3) ? [-2.6, -2.0, -1.3, 1.3, 2.0, 2.6] : [-2.7, -2.1, -1.5, -0.9, -0.3, 0.3, 0.9, 1.5, 2.1, 2.7];
    const wy = face[1] + 3.7, wr = 4.35;
    if (helmBroken(w)) k.frustum([face[0], 0, face[2] - 0.9], wy - 0.2, wy + 0.2, wr, wr, '#5A4128', { arc: [Math.PI * 0.55, Math.PI * 0.9], seg: 10, sz: 0.95 });
    for (const [i, a] of leaves.entries()) {
      const x = face[0] + Math.sin(a) * wr, z = face[2] - 0.9 + Math.cos(a) * wr * 0.95;
      k.frame([x, wy + (i % 2 ? 0.3 : -0.1), z], [0.35, a + Math.PI / 2, i % 2 ? 0.5 : -0.4], () => {
        k.ball([0, 0, 0], 1, i % 3 === 0 ? OLIVE_DARK : OLIVE, { s: [1.15, 0.42, 0.62], detail: 0, hull: 0.5 });
      });
    }
    // The mouth band round the cheeks and its mouthpiece.
    const my = face[1] - 1.75;
    const band = '#A47C4B';
    k.frustum([face[0], 0, face[2] - 0.2], my - 0.55, my + 0.55, 4.75, 4.75, band, { sz: 0.95, seg: 12, open: true });
    k.frame([face[0], my, face[2] + 4.15], [0, 0, 0], () => k.slab(ell(0, 0, 1.4, 1.0, 8), 0.5, mix(band, '#000000', 0.35)));
    // The double pipe: two reeds spreading from the lips, one in each hand, flared at the ends.
    const mouth: V3 = [face[0], my, face[2] + 4.2];
    const ends: [V3, V3] = [[-4.4, 17.0, 9.4], [4.4, 17.4, 9.0]];
    ends.forEach((end, i) => {
      const sd = i === 0 ? -1 : 1;
      const snapped = sd > 0 && worn(w, 4);
      reed(k, mouth, end, snapped);
      const t = sd < 0 ? 0.62 : 0.4;
      const hand: V3 = [mouth[0] + (end[0] - mouth[0]) * t, mouth[1] + (end[1] - mouth[1]) * t, mouth[2] + (end[2] - mouth[2]) * t];
      const ax = new Vector3(end[0] - mouth[0], end[1] - mouth[1], end[2] - mouth[2]).normalize();
      limb(k, [sd * 5.6, 24.6, 0.2], [sd * 7.6, 19.6, 3.0], [hand[0] + sd * 0.9, hand[1] - 0.9, hand[2] - 1.1], { sleeve: own, sleeveTo: 0.45 });
      fist(k, hand, [ax.x, ax.y, ax.z], [sd * 0.8, 0.2, -0.4], 0.9);
    });
    // Notes rise from the music: two, then one once battered, none once broken.
    if (!worn(w, 4)) note(k, 10.2, 35.0, 2.0, 1);
    if (!worn(w, 3)) note(k, 14.4, 26.8, 2.0, 0.82);
    if (w.blood >= 1) groundDrops(k, 4.5, 6, true, heavy(w));
  });
  return NARROW;
}


// ---- the scout ----
//
// The Spartans' runner, light and quick: crouched low on one knee, leaning into the spring, a short leaf blade held
// forward. A young, beardless, grim face looking ahead under a deep hood, a long hooded cloak in the owner's dark
// colour sweeping to the ground behind him, a short crimson tunic, a belt with a pouch, bare arms, leg wraps and
// sandals. No armour at all. Its wear: dust on the knee he kneels on, a frayed hem, then a torn tunic, the hood's
// tail and the cloak's hem torn; broken, the hood is ripped away (his short hair shows), the blade snapped, the
// cloak in rags.

const SC_LEAN = -0.3;
const SC_HIP: V3 = [0, 9.6, 0];
const SC_TORSO: Profile = [[5.3, 0.4], [4.9, 2.2], [5.2, 6.2], [5.6, 9.2], [5.3, 11.0], [3.9, 12.4]];

/** A point in the scout's leaning torso frame, in the figure's own frame. */
function lean(p: V3): V3 {
  const c = Math.cos(SC_LEAN), s = Math.sin(SC_LEAN);
  return [SC_HIP[0] + p[0] * c - p[1] * s, SC_HIP[1] + p[0] * s + p[1] * c, SC_HIP[2] + p[2]];
}

export function grittyScout(k: Kit, { look: c, wear: w }: SpecialOpts): Shadow {
  turned(k, () => {
    const own = c.main, ownDark = c.dark;
    const wrap = '#857257', sandal = GT.SANDAL;
    // The cloak sweeping down behind him to the ground (torn from battered, rags once broken).
    const hem = worn(w, 4) ? [-14.0, 1.2, -12.2, 3.8, -10.8, 0.8, -9.0, 3.4, -7.6, 0.6, -6.2, 3.0]
      : worn(w, 3) ? [-14.0, 1.2, -11.6, 2.6, -9.6, 0.8, -7.8, 2.2, -6.2, 1.0] : [-14.0, 1.2, -6.2, 1.0];
    const outline = [6.4, 21.8, 1.0, 23.4, -3.8, 20.6, -8.2, 13.6, -12.0, 6.0, ...hem, -2.6, 6.4, 2.4, 13.0, 6.6, 17.0];
    k.slab(outline, 1.1, ownDark, [0, 0, -4.6], [0, 0.22, 0]);
    for (const [x0, y0, x1, y1] of [[-2.0, 20.6, -9.6, 3.4], [2.6, 20.8, -4.2, 6.6]] as const) {
      k.slab([x0 - 0.8, y0, x0 + 0.6, y0, x1 + 1.2, y1, x1 - 1.2, y1], 1.2, mix(ownDark, '#000000', 0.28), [0, 0, -5.2], [0, 0.22, 0], { hull: 0 });
    }
    // The legs: the back knee down, the shin along the ground; the front leg bent, ready to spring.
    k.pivot(LEGS_PIECE, ANKLE_AT, () => {
      k.rod([-2.4, 9.4, -0.8], [-6.2, 2.4, -1.0], 1.85, SKIN, { r1: 1.55, seg: 7 });
      k.ball([-6.3, 2.0, -0.9], 1.55, SKIN, { detail: 0 });
      k.rod([-6.6, 1.7, -1.0], [-10.4, 2.0, -1.4], 1.45, wrap, { r1: 1.05, seg: 7 });
      for (const t of [0.3, 0.6]) k.rod([-6.6 - 3.8 * t, 1.7 + 0.3 * t, -1.0 - 0.4 * t], [-6.9 - 3.8 * t, 1.72 + 0.3 * t, -1.03 - 0.4 * t], 1.45 - 0.35 * t, mix(wrap, '#000000', 0.3), { seg: 7, hull: 0 });
      k.rod([2.4, 9.4, 0.8], [7.4, 10.6, 2.0], 1.85, SKIN, { r1: 1.6, seg: 7 });
      k.ball([7.5, 10.5, 2.1], 1.6, SKIN, { detail: 0 });
      k.rod([7.4, 10.2, 2.0], [6.9, 2.4, 2.4], 1.5, wrap, { r1: 1.05, seg: 7 });
      for (const t of [0.35, 0.65]) k.rod([7.4 - 0.5 * t, 10.2 - 7.8 * t, 2.0 + 0.4 * t], [7.37 - 0.5 * t, 9.8 - 7.8 * t, 2.03 + 0.4 * t], 1.5 - 0.4 * t, mix(wrap, '#000000', 0.3), { seg: 7, hull: 0 });
      if (worn(w, 1)) k.decal(ell(0, 0, 1.2, 0.8, 7), mix(SKIN, '#3D3A34', 0.55), (x, y) => ({ p: [-6.3 + x, 2.0 + y, 0.75], n: [0, 0, 1] }));
      if (heavy(w)) drip(k, (x, y) => ({ p: [x, y, 3.65], n: [0, 0.3, 1] }), 6.6, 8.6, 3.2, 0.8);
    }, { axis: [1, 0, 0] });
    k.pivot(FEET_PIECE, [0, 0, 0], () => {
      // The back foot up on its toes behind the knee; the front foot flat, pointing ahead.
      k.box([-10.9, 1.55, -1.4], [1.5, 2.8, 2.8], sandal, { rot: [0, 0, -0.35] });
      k.box([-10.5, 2.15, -1.4], [1.0, 0.4, 3.0], sandal, { hull: 0, rot: [0, 0, -0.35] });
      k.box([7.8, 0.55, 2.6], [5.0, 1.1, 3.0], sandal);
      k.ball([8.0, 1.4, 2.6], 1, SKIN, { s: [2.0, 0.75, 1.3], detail: 0 });
      for (const x of [6.8, 8.6]) k.box([x, 1.55, 2.6], [0.5, 0.35, 3.1], sandal, { hull: 0 });
    });
    // The body, leaning into the spring: a short tunic, a belt with a pouch.
    const front = frontOf(SC_TORSO, 0.72);
    k.frame(SC_HIP, [0, 0, SC_LEAN], () => {
      skirt(k, -2.4, 1.0, 6.2, 5.4, own, ownDark, 0.72, 12);
      lathe(k, SC_TORSO, own, 0.72);
      const fold = mix(own, '#000000', 0.3);
      for (const [x0, x1] of [[-3.0, -2.2], [2.8, 2.0]] as const) k.line([x0, 10.4, x1, 2.4], 0.32, fold, front);
      k.frustum([0, 0, 0], 0.2, 1.4, 5.45, 5.35, LEATHER_DARK, { sz: 0.77, seg: 12, open: true });
      k.box([-3.6, 0.0, 3.4], [2.2, 2.0, 1.4], LEATHER, { rot: [0, -0.5, 0] });
      k.box([0.4, 0.8, 4.1], [1.4, 1.1, 0.4], AGED, { gloss: 0.5 });
      // The blade's sheath at the left hip.
      k.rod([-4.6, 1.4, 2.8], [-6.4, -4.4, 3.6], 0.75, LEATHER_DARK, { r1: 0.45, seg: 5 });
      k.rod([-4.6, 1.4, 2.8], [-4.8, 0.8, 2.9], 0.85, AGED, { seg: 5, hull: 0 });
      const sk = skirtFront(-2.4, 1.0, 6.2, 5.4);
      if (worn(w, 1)) dirt(k, sk, 2.0, -1.6, 3.6, own);
      tatters(k, w, -2.3, 4.4, ownDark, -1.0);
      if (worn(w, 3)) tear(k, front, 1.8, 6.6, 3.0, 2.6, own);
      if (worn(w, 4)) tear(k, front, -2.6, 2.8, 2.4, 2.0, own);
      if (w.blood >= 1) smear(k, front, -1.6, 10.0, 0.1, -1, 3.6, 1.2);
      if (heavy(w)) { smear(k, front, 2.2, 8.4, -0.2, -1, 3.6, 1.1); smear(k, sk, 0.6, 0.4, 0, -1, 2.4, 0.9); }
    });
    // The arms: the left hand holds the cloak's edge, the right one the blade, forward and low.
    limb(k, lean([-5.0, 10.4, 0.2]), [-4.8, 15.6, 2.4], [-3.0, 13.0, 4.6], { r: 0.95 });
    fist(k, [-2.7, 12.6, 5.0], [0, 1, 0.2], [-0.6, 0.2, 0.7], 0.85);
    limb(k, lean([5.0, 10.4, 0.2]), [8.2, 13.2, 2.4], [9.0, 15.4, 4.6], { r: 0.95 });
    const hilt: V3 = [9.6, H(-8.4), 5.2], tip: V3 = [16.0, H(-11.6), 5.2];
    k.pivot(WEAPON, hilt, () => {
      const ax = new Vector3(...tip).sub(new Vector3(...hilt)).normalize();
      shortBlade(k, hilt, tip, { nick: worn(w, 2), snap: worn(w, 4), blood: w.blood }, { flatTo: [0, 0, 1], width: 0.9 });
      fist(k, hilt, [ax.x, ax.y, ax.z], [0, 0.6, -0.7], 0.85);
    }, { axis: TIP_RIGHT, fwd: [1, 0, 0] });
    // The neck and the head, turned a little toward where he is going, in the hood.
    k.rod(lean([0, 11.6, -0.1]), [4.5, 22.4, 0.5], 1.55, SKIN, { seg: 7 });
    const hc = lean([0, 15.6, 0.6]);
    k.frame(hc, [0.05, 0.15, 0], () => {
      const face: V3 = [0, 0, 0];
      bareFace(k, face, w, { r: 3.6, beard: null });
      if (helmBroken(w)) {
        hoodCollar(k, face, 3.6, ownDark, 1.2);
        hairCap(k, face, 3.6, HAIR);
      } else {
        hood(k, face, 3.6, ownDark, { point: [-1.6, 1.6, -5.2], torn: worn(w, 3), collar: 1.2 });
        k.ball([1.6, -4.6, 2.6], 0.6, AGED, { detail: 0, hull: 0.4, gloss: 0.5 });
        if (worn(w, 2)) dirt(k, (x, y) => ({ p: [x, y, 1.6], n: [0, 0.4, 1] }), 2.6, 4.2, 2.2, ownDark);
      }
    });
    if (w.blood >= 1) groundDrops(k, 4, 8, true, heavy(w));
  });
  return NARROW;
}

