// Gritty's basic foot soldiers as detailed toon figures, after the Hoplite (toonHoplite.ts): the Warrior, the
// Spearman, the Swordsman, the Defender and the Sellsword. Built only in Gritty (figures.ts); Bright keeps its toon
// figures. Either side can build all five, so the owner's colour rides on cloth and paint (vivid for marks) and the
// rest is the shared earthy Gritty palette (GT, and the iron, mail, linen and hide below).
//
// One army: every man stands on the Hoplite's frame (shaped legs with knees, a skirt to the knee, a shaped torso, a
// neck clear of it, the Hoplite's bare grim face under his headgear, arms with real hands round what they hold). Each
// keeps his own unit's identity, weapon and moving pieces from its Bright toon figure (figures.ts), at the same pivots:
//
// - Warrior: the cheapest fighter. A hide vest with a fur collar over his tunic, bare arms, wrapped shins, shaggy hair
//   under the owner's headband, a crude short chopping sword and a small plank shield with a painted ring.
// - Spearman: a quilted linen corselet, leather greaves, a conical bronze cap of riveted plates, the long spear upright
//   and the tall oval shield with its wooden spine.
// - Swordsman: a mail shirt with mail sleeves, leather vambraces and boots, a round iron helm with cheek guards and a
//   combed plume, a sword in each hand.
// - Defender: the heaviest kit. The great tower shield in front, a round iron helm with a nose guard and a mail
//   aventail, layered steel pauldrons, iron vambraces and greaves, a gauntleted fist.
// - Sellsword: a mercenary in mismatched gear. A ragged cloak, a riveted leather jerkin over a patched tunic, a steel
//   pauldron on one shoulder and a leather one on the other, one iron greave and one wrapped shin, a dented iron
//   kettle hat with rust on it, a long blade held low in both hands.
//
// The wear follows grittyToon.ts: scratches (1), dents and a nicked blade (2), a crack, a chipped shield and a torn hem
// (3), and when broken a piece of the headgear gone for good with a dark torn edge (it stays gone once scarred), half
// the shield gone with its paint clipped at the break, and the weapon snapped. Blood and the healed scar come from the
// shared bare face.
import { CylinderGeometry, Quaternion, TorusGeometry, Vector3 } from 'three';
import { COS_E, flat, H, Kit, mix, SQUASH } from './kit';
import type { Surface, V3 } from './kit';
import {
  ANKLE, BLOOD, BLOOD_LIGHT, crack, dent, dirt, discPoly, discWear, drip, ell, FEET, groundDrops, heavy, helmBroken,
  LEGS, SCRATCH, SCRATCH_DARK, scratches, setYaw, SKIN, smear, smearPoly, spear, splitPoly, tearPolys, worn,
} from './parts';
import type { Cut, Look, Wear } from './parts';
import { bareFace, crestBrush, GT, metalEdge, onPlane, plate, tornEdge, vivid } from './grittyToon';

// The moving pieces' names, as figures.ts has them (not imported from there: figures.ts imports this file).
const WEAPON = 'weapon';
const WEAPON2 = 'weapon2';
const SHIELD = 'shield';
const ARM_R = 'armR';
const ARM_L = 'armL';
const TIP_FORWARD: V3 = [1, 0, 0];
const YAW = 0.38;
const NARROW = { rx: 9.5, rz: 6, x: 0.5 };

/** The foot soldiers' own colours, beside GT's: iron, mail, linen, hide, fur, wraps, blades. */
export const GF = {
  IRON: '#7C8184', IRON_DARK: '#53575A', IRON_LIT: '#C4C7C2', MAIL: '#6E7275', MAIL_DARK: '#3F4245',
  RUST: '#7C4A2A', LINEN: '#BCAA84', LINEN_DARK: '#857456', HIDE: '#86643F', FUR: '#56402D', FUR_LIT: '#7A5F42',
  WRAP: '#9E8D6F', WRAP_DARK: '#6E6049', BOOT: '#4A311E', WOOD: '#7C5A36', WOOD_DARK: '#4D3821', GRIP: '#3A2616',
  BLADE: '#A6AAA9', BLADE_DARK: '#61666A', BLADE_LIT: '#DADCD6',
  HAIR: '#3B2616', HAIR_BLACK: '#1E1610', HAIR_GREY: '#6D6459', BEARD_RED: '#5E341B',
} as const;

const { LEATHER, LEATHER_DARK, SKIN_SHADE, AGED, AGED_DARK, GOLD_EDGE } = GT;

// ---- the frame every man stands on (the Hoplite's) ----

/** The bare face's centre: the Hoplite's, so every head sits where his does. */
const FACE: V3 = [0, 34.3, 0.9];
const SZ = 0.72;
type Profile = readonly (readonly [number, number])[];
/** The torso's profile, bottom to top: [radius, height]. A cloth body; armour sits a little outside it. */
const BODY: Profile = [[5.9, 12.6], [5.7, 14.8], [6.1, 19.0], [6.6, 22.4], [6.3, 24.8], [4.8, 26.4]];
const grow = (p: Profile, d: number, y0 = -Infinity): Profile => p.filter(([, y]) => y >= y0).map(([r, y]) => [r + d, y] as const);

const radiusAt = (p: Profile, y: number): number => {
  if (y <= p[0]![1]) return p[0]![0];
  for (let i = 0; i + 1 < p.length; i++) {
    const [r0, y0] = p[i]!, [r1, y1] = p[i + 1]!;
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return p[p.length - 1]![0];
};

/** A faceted body shell shaped to a profile (a torso, a mail shirt, a vest open at the front with `arc`). */
function shellBody(k: Kit, p: Profile, colour: string, o: { seg?: number; arc?: [number, number]; gloss?: number; hull?: number; cap?: boolean } = {}): void {
  const seg = o.seg ?? 12;
  const g = new CylinderGeometry(1, 1, 1, seg, p.length - 1, true, o.arc?.[0] ?? 0, o.arc?.[1] ?? Math.PI * 2);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.round((pos.getY(i) + 0.5) * (p.length - 1));
    const [r, y] = p[ring]!;
    pos.setXYZ(i, pos.getX(i) * r, y, pos.getZ(i) * r * SZ);
  }
  if (o.arc === undefined) g.rotateY(Math.PI / seg);
  k.add(g, colour, { gloss: o.gloss ?? 0.2, hull: o.hull });
  // The top closed round the neck, so no dark hollow shows from above.
  if (o.cap !== false && o.arc === undefined) {
    const [r, y] = p[p.length - 1]!;
    k.frustum([0, 0, -0.1], y - 0.05, y + 0.55, r + 0.05, 2.4, mix(colour, '#000000', 0.12), { sz: SZ + 0.04, seg, gloss: o.gloss ?? 0.2, hull: 0 });
  }
}

/** The front of a body shell, for marks on it: (x, y) in the figure's frame. */
const bodyFront = (p: Profile, lift = 0.18): Surface => (x, y) => {
  const r = radiusAt(p, y);
  const z = SZ * Math.sqrt(Math.max(r * r * 0.05, r * r - x * x));
  const n = new Vector3(x / (r * 1.4), 0, 1).normalize();
  return { p: [x, y, z + lift], n: [n.x, n.y, n.z] };
};

/** A band round the body at y (a belt, a hem), just outside the profile. */
function band(k: Kit, p: Profile, y: number, h: number, colour: string, out = 0.25, gloss = 0.2): void {
  const r = radiusAt(p, y) + out;
  k.frustum([0, 0, 0], y - h / 2, y + h / 2, r, r - 0.05, colour, { sz: SZ + 0.03, seg: 12, open: true, gloss });
}

/** A belt with its buckle at the front. */
function belt(k: Kit, p: Profile, y: number, colour: string, buckle: string): void {
  band(k, p, y, 1.2, colour, 0.3);
  k.box([0.4, y, SZ * (radiusAt(p, y) + 0.3) + 0.3], [1.7, 1.4, 0.6], buckle, { gloss: 0.5 });
}

/** Dots on a surface (rivets, studs): cheap decals. */
function dots(k: Kit, s: Surface, pts: readonly (readonly [number, number])[], r: number, colour: string): void {
  for (const [x, y] of pts) k.decal(ell(x, y, r, r, 5), colour, s);
}

/** The skirt from the waist to the knee: pleated or plain, a darker hem; dirt, tatters and a tear by stage. */
function skirt(k: Kit, w: Wear, o: { colour: string; hem: string; y0?: number; y1?: number; r0?: number; r1?: number; pleats?: boolean; tear?: boolean }): Surface {
  const y0 = o.y0 ?? 7.4, y1 = o.y1 ?? 13.0, r0 = o.r0 ?? 7.0, r1 = o.r1 ?? 5.8;
  const g = new CylinderGeometry(r1, r0, y1 - y0, 16, 1, true);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getX(i), pos.getZ(i));
    const kk = o.pleats === false ? 1 : Math.round((a / (Math.PI * 2)) * 16) % 2 === 0 ? 1.08 : 0.94;
    pos.setXYZ(i, pos.getX(i) * kk, pos.getY(i), pos.getZ(i) * kk * SZ);
  }
  g.translate(0, (y0 + y1) / 2, 0);
  k.add(g, o.colour);
  k.frustum([0, 0, 0], y0, y0 + 1.0, r0 + 0.25, r0 + 0.05, o.hem, { sz: SZ + 0.03, seg: 16, open: true });
  const s: Surface = (x, y) => {
    const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0))), r = r0 + (r1 - r0) * t + 0.3;
    return { p: [x, y, SZ * Math.sqrt(Math.max(r * r * 0.05, r * r - x * x)) + 0.25], n: [x / 14, 0.1, 1] };
  };
  if (worn(w, 1)) dirt(k, s, 2.8, y0 + 1.0, 4.4, o.hem);
  if (worn(w, 3)) {
    // The hem torn: tatters hanging at the front right.
    const n = worn(w, 4) ? 4 : 3, drop = worn(w, 4) ? 2.2 : 1.5;
    const pts: number[] = [0.6, y0 + 0.7];
    for (let i = 0; i < n; i++) pts.push(0.6 + (i + 0.5) * 1.4, y0 - (i % 2 ? drop * 0.55 : drop), 0.6 + (i + 1) * 1.4, y0 + 0.1);
    pts.push(0.6 + n * 1.4, y0 + 0.7);
    k.slab(pts, 0.5, o.hem, [0, 0, SZ * r0 * 0.9], [0, 0.3, 0]);
  }
  if (worn(w, 4) && o.tear !== false) {
    const [lip, gap] = tearPolys(-2.8, y0 + 3.0, 3.0, 2.6);
    k.decal(lip, mix(o.colour, '#000000', 0.45), s);
    k.decal(gap, SKIN, s);
  }
  return s;
}

// ---- limbs and hands ----

interface LimbOpts {
  /** The upper arm's colour (skin, a sleeve, mail) and the forearm's. */
  upper?: string;
  lower?: string;
  /** A bracer or vambrace over the forearm, or wraps at the wrist. */
  bracer?: string;
  wraps?: string;
  /** A band round the upper arm. */
  armband?: string;
}

/** An arm: the shoulder's cap, the upper arm, the elbow, the forearm, ending at the wrist. */
function limb(k: Kit, shoulder: V3, elbow: V3, wrist: V3, o: LimbOpts = {}): void {
  const up = o.upper ?? SKIN, lo = o.lower ?? SKIN;
  k.ball(shoulder, 1, up, { s: [2.0, 2.2, 2.0], detail: 0 });
  k.rod(shoulder, elbow, 1.6, up, { r1: 1.3, seg: 6 });
  k.ball(elbow, 1.3, mix(lo, '#000000', 0.12), { detail: 0, hull: 0 });
  k.rod(elbow, wrist, 1.35, lo, { r1: 1.0, seg: 6 });
  const e = new Vector3(...elbow), wv = new Vector3(...wrist), d = wv.clone().sub(e).normalize();
  const at = (t: number): V3 => { const p = wv.clone().addScaledVector(d, -t); return [p.x, p.y, p.z]; };
  if (o.bracer) {
    k.rod(at(0.3), at(Math.min(3.0, e.distanceTo(wv) - 0.6)), 1.22, o.bracer, { r1: 1.42, seg: 7, gloss: 0.35 });
    k.rod(at(0.35), at(0.75), 1.3, mix(o.bracer, '#000000', 0.3), { seg: 7, hull: 0 });
  } else if (o.wraps) {
    for (const t of [0.5, 1.1, 1.7]) k.rod(at(t - 0.22), at(t + 0.22), 1.16 + t * 0.06, t > 1 ? o.wraps : mix(o.wraps, '#000000', 0.2), { seg: 7, hull: 0 });
  }
  if (o.armband) {
    const s = new Vector3(...shoulder), m = s.clone().lerp(e, 0.62), dd = e.clone().sub(s).normalize().multiplyScalar(0.35);
    k.rod([m.x - dd.x, m.y - dd.y, m.z - dd.z], [m.x + dd.x, m.y + dd.y, m.z + dd.z], 1.48, o.armband, { seg: 7, hull: 0 });
  }
}

/** A hand closed round a bar along `axis` at p: the fingers wrapping it, the back of the hand, the thumb over them. */
function fist(k: Kit, p: V3, axis: V3, back: V3, r = 0.9, skin: string = SKIN): void {
  const ax = new Vector3(...axis).normalize();
  const t = new TorusGeometry(r, 0.85, 4, 6, Math.PI * 1.6);
  t.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), ax));
  t.translate(...p);
  k.add(t, skin, { hull: 0.7 });
  const b = new Vector3(...back).normalize();
  k.ball([p[0] + b.x * r * 0.9, p[1] + b.y * r * 0.9, p[2] + b.z * r * 0.9], 1, skin === SKIN ? SKIN_SHADE : mix(skin, '#000000', 0.15), { detail: 0 });
  const top = ax.clone().multiplyScalar(1.2);
  k.rod([p[0] + b.x * 0.8 + top.x, p[1] + b.y * 0.8 + top.y, p[2] + b.z * 0.8 + top.z], [p[0] - b.x * 0.4 + top.x * 0.7, p[1] - b.y * 0.4 + top.y * 0.7, p[2] - b.z * 0.4 + top.z * 0.7 + 0.6], 0.42, skin, { r1: 0.36, seg: 5 });
}

interface LegOpts {
  /** The shin's colour (skin, a boot's leg, trousers), the knee's, the shoe's. */
  shin: string;
  knee: string;
  boot: string;
  /** A greave over the shin, per side (x negative first): its colour, or none. */
  greave?: readonly [string | null, string | null];
  /** Cloth wraps round the shin, per side. */
  wraps?: readonly [string | null, string | null];
  /** A knee cop (iron over the knee). */
  cop?: string;
  /** A tall boot: its cuff's height. */
  tall?: number;
}

/** The legs (the shins turn forward about the ankles in a crouch) and the shoes (which stay on the ground). */
function legs(k: Kit, w: Wear, o: LegOpts): void {
  k.pivot(LEGS, ANKLE, () => {
    [-1, 1].forEach((s, side) => {
      const greave = o.greave?.[side] ?? null, wraps = o.wraps?.[side] ?? null;
      const g = new CylinderGeometry(1.75, 1.3, 4.4, 8, 2, true);
      const pos = g.attributes.position!;
      for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i)) < 0.1) pos.setXYZ(i, pos.getX(i) * 1.22, pos.getY(i), pos.getZ(i) * 1.22);
      g.translate(s * 2.8, 4.6, 0.2);
      k.add(g, greave ?? o.shin, { gloss: greave ? 0.45 : 0 });
      if (greave) k.rod([s * 2.8, 2.6, 2.05], [s * 2.8, 6.6, 1.9], 0.2, mix(greave, '#FFFFFF', 0.35), { seg: 3, hull: 0, caps: false });
      if (wraps) for (const [y, r] of [[3.2, 1.62], [4.4, 1.98], [5.6, 2.0]] as const) {
        k.frustum([s * 2.8, 0, 0.2], y - 0.32, y + 0.32, r + 0.06, r, wraps, { seg: 8, hull: 0, sz: 1 });
      }
      k.ball([s * 2.8, 7.4, 0.4], 1.6, o.knee, { detail: 0 });
      if (o.cop) k.dome([s * 2.8, 7.0, 1.0], 1.45, o.cop, { to: 1.3, seg: 7, s: [1, 1, 0.8], gloss: 0.45 });
      k.rod([s * 2.8, 2.2, 0.2], [s * 2.8, 2.6, 0.2], 1.3, o.tall ? o.boot : o.shin, { seg: 7, hull: 0 });
    });
    if (worn(w, 1)) for (const s of [-1, 1]) k.decal(ell(s * 2.8, 3.6, 0.9, 0.6, 7), mix(o.shin, '#3D3A34', 0.55), flat(2.45));
    if (heavy(w)) drip(k, flat(2.3), -2.4, 6.6, 3.4, 0.8);
  }, { axis: [1, 0, 0] });
  k.pivot(FEET, [0, 0, 0], () => {
    for (const s of [-1, 1]) {
      k.box([s * 3.0, 0.65, 1.0], [3.4, 1.3, 5.0], o.boot);
      k.box([s * 3.0, 0.12, 1.0], [3.5, 0.25, 5.1], mix(o.boot, '#000000', 0.35), { hull: 0 });
      k.ball([s * 3.0, 1.3, 1.6], 1, o.boot, { s: [1.6, 0.8, 1.8], detail: 0 });
      if (o.tall) k.frustum([s * 3.0, 0, 0.4], 1.0, o.tall, 1.85, 1.75, o.boot, { seg: 8, sz: 1 });
      else k.frustum([s * 3.0, 0, 0.4], 1.0, 2.4, 1.75, 1.55, o.boot, { seg: 8, sz: 1 });
    }
  });
}

// ---- weapons ----

interface BladeOpts {
  len: number; hw: number;
  /** A crude chopping blade, widening to the point (the Warrior's), or a straight one. */
  chopper?: boolean;
  guard: string; guardW?: number;
  gripLen?: number; grip?: string; pommel?: string;
  nick?: boolean; snap?: number; blood?: number; scuffed?: boolean;
}

/**
 * A blade from its guard along `dir` (the figure's frame, in the screen plane): the blade with a dark fuller and a lit
 * bevel, a crossguard, a wrapped grip behind the guard and a pommel. Nicked, snapped (a dark broken end) and bloodied.
 */
function blade(k: Kit, guard: V3, dir: V3, o: BladeOpts): void {
  const L = o.len, hw = o.hw, gl = o.gripLen ?? 3.2;
  const ang = Math.atan2(dir[1], dir[0]) - Math.PI / 2;
  k.frame(guard, [0, 0, ang], () => {
    const edgeAt = (y: number): number => (o.chopper ? hw * (0.85 + 0.35 * Math.min(1, y / (L * 0.65))) : hw);
    const snapAt = o.snap !== undefined ? o.snap * L : undefined;
    const pts: number[] = [-hw * (o.chopper ? 0.85 : 1), 0, edgeAt(0), 0];
    const nickAt = L * 0.48;
    if (o.nick && (snapAt === undefined || nickAt < snapAt - 1.5)) {
      const e = edgeAt(nickAt);
      pts.push(edgeAt(nickAt - 0.9), nickAt - 0.9, e - 0.9, nickAt - 0.1, e * 0.7, nickAt + 0.3, edgeAt(nickAt + 0.9), nickAt + 0.9);
    }
    let jag: number[] = [];
    if (snapAt !== undefined) {
      const e = edgeAt(snapAt);
      jag = [e, snapAt - 0.4, e * 0.35, snapAt + 0.8, -hw * 0.1, snapAt + 0.1, -hw * 0.55, snapAt + 1.1, -hw, snapAt + 0.2];
      pts.push(...jag);
    } else if (o.chopper) {
      pts.push(edgeAt(L * 0.65), L * 0.65, hw * 1.05, L - hw * 0.9, hw * 0.1, L, -hw, L - hw * 2.2);
    } else {
      pts.push(hw, L - hw * 1.8, 0, L, -hw, L - hw * 1.8);
    }
    k.slab(pts, 0.55, GF.BLADE, [0, 0, 0], [0, 0, 0], { gloss: 0.6 });
    const end = (snapAt ?? L - hw * 2) - 0.4;
    const s = flat(0.3);
    k.line([0, 0.7, 0, end * (o.chopper ? 0.8 : 0.92)], hw * 0.36, GF.BLADE_DARK, s);
    k.line([-hw * 0.72, 0.6, -hw * 0.72, end], 0.3, GF.BLADE_LIT, s);
    if (jag.length > 0) k.line(jag, 0.32, GT.TORN, flat(0.31));
    if (o.scuffed) k.line([hw * 0.2, L * 0.3, hw * 0.6, L * 0.38], 0.22, SCRATCH_DARK, flat(0.32));
    if (o.blood) k.decal(smearPoly(0.25, end * 0.6, 0, 1, end * 0.38, hw * 1.5), BLOOD, flat(0.33));
    if ((o.blood ?? 0) >= 2) {
      k.decal(smearPoly(-0.2, end * 0.18, 0, 1, end * 0.5, hw * 1.6), BLOOD, flat(0.34));
      k.decal(smearPoly(0.4, end * 0.92, 0, -1, end * 0.3, hw * 1.2), BLOOD_LIGHT, flat(0.35));
      for (const t of [0.25, 0.55]) k.ball([hw * 0.9, end * t, 0.2], 0.42, BLOOD, { detail: 0, hull: 0 });
    }
    k.box([0, -0.25, 0], [o.guardW ?? 4.6, 0.9, 1.1], o.guard, { gloss: 0.45 });
    k.rod([0, -gl - 0.5, 0], [0, -0.7, 0], 0.55, o.grip ?? GF.GRIP, { seg: 6 });
    for (const t of [0.3, 0.62]) k.rod([0, -0.7 - gl * t - 0.18, 0], [0, -0.7 - gl * t + 0.18, 0], 0.64, mix(o.grip ?? GF.GRIP, '#000000', 0.3), { seg: 6, hull: 0 });
    k.ball([0, -gl - 0.9, 0], 0.85, o.pommel ?? o.guard, { detail: 0, gloss: 0.45 });
  });
}

/** Where along a blade's grip a hand closes: `t` back from the guard. */
const behind = (guard: V3, dir: V3, t: number): V3 => [guard[0] - dir[0] * t, guard[1] - dir[1] * t, guard[2] - dir[2] * t];
const unit = (a: V3, b: V3): V3 => { const v = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize(); return [v.x, v.y, v.z]; };

// ---- headgear ----

/** The hair under any headgear: the back and sides of the head, below a helm's rim. */
function backHair(k: Kit, colour: string): void {
  k.ball([FACE[0], FACE[1] + 0.3, FACE[2] - 1.5], 4.0, colour, { detail: 0, s: [1.14, 1.12, 1.05] });
}

interface SegHelm {
  /** The rim's centre; rings up from it: [height above the rim, radius], the last radius 0 for a point. */
  base: V3;
  rings: readonly (readonly [number, number])[];
  seg: number;
  colour: string;
  /** Every other plate this colour (a riveted helm of two tones). */
  alt?: string;
  /** Seams between the plates in this colour (gold on bronze, bright on iron), or none; on every `seamEvery`th seam. */
  seam?: string | null;
  seamEvery?: number;
  /** Plates torn away: segments [from, to) between rings [j0, j1), their edge a dark torn line. */
  hole?: { from: number; to: number; j0: number; j1: number };
}

/** A helm of faceted plates, segment by segment and ring by ring; segment 0 faces the front, seg - 1 the near side. */
function segHelm(k: Kit, h: SegHelm): { pt: (i: number, j: number) => V3; facet: (i: number, j: number) => Surface } {
  const { base, rings, seg } = h;
  const pt = (i: number, j: number): V3 => {
    const a = ((i - 0.5) / seg) * Math.PI * 2, [dy, r] = rings[j]!;
    return [base[0] + Math.sin(a) * r, base[1] + dy, base[2] + Math.cos(a) * r];
  };
  const centre: V3 = [base[0], base[1] + rings[1]![0] * 0.5, base[2]];
  const hole = h.hole;
  const gone = (i: number, j: number): boolean => hole !== undefined && i >= hole.from && i < hole.to && j >= hole.j0 && j < hole.j1;
  for (let j = 0; j + 1 < rings.length; j++) for (let i = 0; i < seg; i++) {
    if (gone(i, j)) continue;
    const apex = rings[j + 1]![1] < 1e-3;
    const pts = apex ? [pt(i, j), pt(i + 1, j), pt(i, j + 1)] : [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)];
    plate(k, pts, h.alt !== undefined && i % 2 ? h.alt : h.colour, centre, { gloss: 0.45 });
  }
  if (h.seam) for (let i = 0; i < seg; i += h.seamEvery ?? 1) {
    const chain: V3[] = [];
    for (let j = 0; j < rings.length; j++) {
      if (hole && j > hole.j0 && j <= hole.j1 && i > hole.from && i <= hole.to && (i < hole.to || j < hole.j1)) break;
      chain.push(pt(i, j));
    }
    if (chain.length > 1) metalEdge(k, chain, 0.16, h.seam);
  }
  if (hole) {
    // The torn edge: across the bottom of the hole (jagged), up its sides, across its top.
    const jagged = (a: V3, b: V3, n: number, amp: number): V3[] => {
      const out: V3[] = [];
      for (let t = 0; t <= n; t++) {
        const f = t / n, z = t === 0 || t === n ? 0 : (t % 2 ? amp : -amp * 0.6);
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f + z, a[2] + (b[2] - a[2]) * f]);
      }
      return out;
    };
    for (let i = hole.from; i < hole.to; i++) {
      tornEdge(k, jagged(pt(i, hole.j0), pt(i + 1, hole.j0), 4, 0.45), 0.26);
      if (rings[hole.j1]![1] > 1e-3 && hole.j1 < rings.length - 1) tornEdge(k, jagged(pt(i, hole.j1), pt(i + 1, hole.j1), 4, -0.35), 0.26);
    }
    for (const i of [hole.from, hole.to]) for (let j = hole.j0; j < hole.j1; j++) tornEdge(k, jagged(pt(i, j), pt(i, j + 1), 3, 0.3), 0.26);
  }
  const facet = (i: number, j: number): Surface => onPlane(pt(i, j), pt(i + 1, j), rings[j + 1]![1] < 1e-3 ? pt(i, j + 1) : pt(i + 1, j + 1));
  return { pt, facet };
}

/** A riveted brow band round a helm's rim. */
function browBand(k: Kit, base: V3, r: number, colour: string, rivet: string, arc?: [number, number]): void {
  k.frustum([base[0], 0, base[2]], base[1] - 0.15, base[1] + 1.1, r + 0.25, r + 0.05, colour, { seg: 16, sz: 1, gloss: 0.4, arc, open: true });
  for (const a of arc ? [0.0, 0.9] : [-0.9, 0, 0.9]) {
    k.ball([base[0] + Math.sin(a) * (r + 0.35), base[1] + 0.48, base[2] + Math.cos(a) * (r + 0.35)], 0.24, rivet, { detail: 0, hull: 0, gloss: 0.6 });
  }
}

// ---- small shared marks ----

/** Blood on a body's front and drops at the feet, by level. */
function bodyBlood(k: Kit, s: Surface, w: Wear, x = -1.6, y = 23.6): void {
  if (w.blood >= 1) smear(k, s, x, y, 0.1, -1, 4.0, 1.4);
  if (w.blood >= 2) { smear(k, s, x + 4.0, y - 3.0, -0.2, -1, 4.4, 1.2); smear(k, s, x - 1.0, y - 7.6, 0.2, -1, 3.0, 1.0); }
  if (w.blood >= 1) groundDrops(k, 3, 9, true, w.blood >= 2);
}

/** Stand the figure in its three-quarter turn. */
function stand(k: Kit, f: () => void): void {
  setYaw(YAW);
  k.frame([0, 0, 0], [0, YAW, 0], f);
  setYaw(0);
}

/** The neck, clear between the body and the head. */
const neck = (k: Kit): void => k.rod([0, 26.0, -0.2], [0, 31.5, 0.4], 1.9, SKIN, { seg: 7 });

/** The frame of a round shield leaning back in front of the body, clear of it (as parts.roundShield places it). */
function shieldAt(x: number, svgY: number, z: number, r: number, lean = -0.36): { at: V3; rot: V3 } {
  const need = SZ * 7.0 + 0.9 + r * Math.sin(Math.abs(lean));
  const dz = Math.max(0, need - z);
  return { at: [x, H(svgY) + (dz * SQUASH) / COS_E, z + dz], rot: [lean, 0, 0] };
}

export interface FootOpts { look: Look; wear: Wear }
type Shadow = typeof NARROW;

// ==== the Warrior ====

const VEST: Profile = grow(BODY, 0.4, 13);

/** A small round shield of planks: an iron rim, a ring painted in the owner's colour, an iron boss. */
function plankShield(k: Kit, c: Look, w: Wear, r: number): void {
  const cuts: Cut[] = [];
  if (worn(w, 3) && !worn(w, 4)) cuts.push({ from: 285, to: 318, inner: r * 0.66, jag: 0.4 });
  if (worn(w, 4)) cuts.push({ from: 300, to: 322, inner: r * 0.8, jag: 0.3 });
  const x0 = -r * 0.1;
  const split = (p: number[], inset = 0): number[] => (worn(w, 4) ? splitPoly(p, x0 + inset) : p);
  k.slab(split(discPoly(r, cuts, 0, 14)), 1.3, GF.IRON_DARK, [0, 0, 0], [0, 0, 0], { gloss: 0.35 });
  k.slab(split(discPoly(r - 0.7, cuts, 0.7, 14), 0.5), 0.9, vivid(c.main), [0, 0, 0.35], [0, 0, 0], { hull: 0 });
  k.slab(split(discPoly(r * 0.62, cuts.filter((ct) => ct.inner < r * 0.62), 0, 12), 0.6), 0.9, GF.WOOD, [0, 0, 0.5], [0, 0, 0], { hull: 0 });
  const s = flat(0.98);
  // The planks' seams, where there is still wood.
  for (const x of [-r * 0.36, r * 0.36]) {
    if (worn(w, 4) && x < x0 + 0.8) continue;
    const h = Math.sqrt(r * r * 0.38 - x * x);
    k.line([x, -h, x, h], 0.22, GF.WOOD_DARK, s);
  }
  k.frame([0, 0, 0.9], [Math.PI / 2, 0, 0], () => k.dome([0, 0, 0], 1.7, GF.IRON, { to: Math.PI / 2, seg: 8, gloss: 0.5 }));
  k.ball([0, 0, 2.5], 0.35, GF.IRON_LIT, { detail: 0, hull: 0 });
  for (const a of [0.4, 1.45, 2.5, 3.55, 4.6, 5.65]) {
    const x = Math.cos(a) * (r - 0.35), y = Math.sin(a) * (r - 0.35);
    if (worn(w, 4) && x < x0 + 0.6) continue;
    if (cuts.some((ct) => { const d = ((-a * 180) / Math.PI + 720) % 360; return d >= ct.from && d <= ct.to; })) continue;
    k.decal(ell(x, y, 0.3, 0.3, 5), GF.IRON_LIT, flat(0.72));
  }
  if (worn(w, 4)) {
    // The split: a dark splintered line down the break, and splinters.
    const yb = r * 0.95;
    k.line([x0 + 0.3, yb, x0 + 0.9, yb * 0.5, x0 + 0.2, 0, x0 + 0.8, -yb * 0.5, x0 + 0.3, -yb], 0.35, GT.TORN, flat(1.0));
    k.rod([x0 + 0.4, 1.2, 0.5], [x0 - 0.9, 1.6, 0.6], 0.3, GF.WOOD, { r1: 0.05, seg: 4, hull: 0.6 });
    k.rod([x0 + 0.4, -2.0, 0.5], [x0 - 0.7, -2.4, 0.6], 0.25, GF.WOOD, { r1: 0.05, seg: 4, hull: 0.6 });
  }
  discWear(k, flat(1.0), r, GF.WOOD, w);
}

/** The Warrior: rough and lightly armoured. */
export function grittyWarrior(k: Kit, { look: c, wear: w }: FootOpts): Shadow {
  stand(k, () => {
    legs(k, w, { shin: SKIN, knee: SKIN, boot: GF.BOOT, wraps: [GF.WRAP, GF.WRAP] });
    skirt(k, w, { colour: c.main, hem: c.dark, pleats: false, y0: 7.6 });
    // The tunic, and over it a hide vest open down the front, a fur collar, a belt with a pouch.
    shellBody(k, BODY, c.main);
    shellBody(k, VEST, GF.HIDE, { arc: [0.42, Math.PI * 2 - 0.84], gloss: 0.15 });
    for (const sd of [-1, 1]) {
      const a = sd * 0.42, at = (y: number): V3 => { const r = radiusAt(VEST, y); return [Math.sin(a) * r, y, Math.cos(a) * r * SZ + 0.1]; };
      k.rod(at(13.4), at(25.4), 0.55, GF.FUR_LIT, { seg: 5, hull: 0.6 });
    }
    k.frustum([0, 0, -0.2], 24.8, 27.2, 6.4, 4.4, GF.FUR, { sz: 0.82, seg: 10 });
    for (const [x, z] of [[-4.4, 2.8], [-1.6, 3.9], [1.6, 3.9], [4.4, 2.8], [-5.6, 0.2], [5.6, 0.2]] as const) k.ball([x, 26.0, z], 1.0, GF.FUR_LIT, { detail: 0, hull: 0, s: [1.2, 0.8, 1] });
    const vs = bodyFront(VEST, 0.15);
    // Lacing across the opening.
    const front = bodyFront(BODY, 0.12);
    for (const y of [16.0, 18.6, 21.2]) k.line([-2.2, y + 0.8, 2.2, y - 0.6], 0.3, GF.GRIP, front);
    belt(k, BODY, 13.0, GF.GRIP, GF.IRON);
    k.box([-4.8, 11.6, 3.4], [2.4, 2.4, 1.2], LEATHER, { rot: [0, -0.5, 0] });
    if (worn(w, 1)) scratches(k, vs, [[-5.0, 21.0, -3.6, 22.4], [3.4, 16.6, 5.0, 17.4]], mix(GF.HIDE, '#FFFFFF', 0.4), 0.4);
    if (worn(w, 2)) dent(k, vs, -4.6, 17.2, 0.9, GF.HIDE);
    if (worn(w, 3)) { const [lip, gap] = tearPolys(4.2, 20.4, 2.4, 3.2); k.decal(lip, mix(GF.HIDE, '#000000', 0.5), vs); k.decal(gap, c.main, vs); }
    neck(k);
    // The sword arm, bare, wrapped at the wrist; the crude blade goes with the hand when it strikes.
    limb(k, [5.8, 24.6, 0], [8.9, 20.6, 0.8], [8.4, 17.9, 2.8], { wraps: GF.WRAP, armband: LEATHER_DARK });
    const grip: V3 = [8.2, H(-9.5), 3.4];
    const dir = unit(grip, [13.5, H(-19), 3.4]);
    k.pivot(WEAPON, grip, () => {
      blade(k, [grip[0] + dir[0] * 1.9, grip[1] + dir[1] * 1.9, grip[2]], dir, {
        len: 10.4, hw: 1.25, chopper: true, guard: GF.WOOD_DARK, guardW: 3.4, gripLen: 2.8, pommel: GF.IRON,
        nick: worn(w, 2), snap: worn(w, 4) ? 0.5 : undefined, blood: w.blood, scuffed: worn(w, 1),
      });
      fist(k, grip, dir, [0.6, 0, -0.8], 1.05);
    }, { axis: TIP_FORWARD });
    // The head: grim and bearded, shaggy hair, the owner's headband (cut through when broken, an end hanging loose).
    bareFace(k, FACE, w, { beard: GF.HAIR, hair: GF.HAIR });
    backHair(k, GF.HAIR);
    for (const [x, y, z, dx] of [[-4.2, 33.2, -1.0, -0.5], [-3.0, 32.6, -3.0, -0.2], [0, 32.4, -3.8, 0], [3.0, 32.6, -3.0, 0.2], [4.2, 33.2, -1.0, 0.5]] as const) {
      k.rod([x * 0.8, y + 2.6, z * 0.8], [x + dx, y, z], 1.1, GF.HAIR, { r1: 0.2, seg: 5 });
    }
    const hb = vivid(c.dark);
    const bc: V3 = [FACE[0], 0, FACE[2] - 0.5];
    if (helmBroken(w)) {
      k.frustum(bc, 36.3, 37.5, 4.95, 4.8, hb, { seg: 14, sz: 1, arc: [-2.4, 4.2] });
      k.slab([0, 0, 1.0, 0, 1.3, -4.4, 0.4, -4.9], 0.5, hb, [-5.0, 36.7, -0.4], [0, -1.45, 0.12]);
    } else {
      k.frustum(bc, 36.3, 37.5, 4.95, 4.8, hb, { seg: 14, sz: 1, open: true });
      k.box([4.6, 36.8, -2.0], [0.9, 1.1, 1.0], hb, { rot: [0, 0.6, 0] });
      k.slab([0, 0, 0.9, 0, 1.2, -3.6, 0.2, -3.8], 0.5, hb, [4.9, 36.4, -2.4], [0, 1.2, -0.1]);
    }
    // The shield arm and the small plank shield, the hand on its grip behind it.
    k.pivot(SHIELD, [-5.4, H(-15.6), 0], () => {
      limb(k, [-5.8, 24.6, 0], [-8.8, 20.6, 1.2], [-7.6, 18.0, 5.0], { wraps: GF.WRAP });
      fist(k, [-7.4, 17.6, 5.6], [1, 0, 0], [0, 0, -1], 1.0);
      const f = shieldAt(-7.2, -9.2, 5.2, 6);
      k.frame(f.at, f.rot, () => plankShield(k, c, w, 6));
    }, { axis: TIP_FORWARD });
    bodyBlood(k, front, w, -1.0, 23.4);
  });
  return NARROW;
}

// ==== the Spearman ====

const CORSELET: Profile = grow(BODY, 0.45, 12);

/** The conical bronze cap of riveted plates, a brow band; broken, a plate on the near side torn out for good. */
function spearHelm(k: Kit, w: Wear): void {
  const base: V3 = [FACE[0], 36.6, FACE[2] - 0.45];
  const open = helmBroken(w);
  const h = segHelm(k, {
    base, rings: [[0, 4.55], [1.9, 4.35], [4.4, 3.0], [7.6, 0]], seg: 8, colour: AGED, alt: mix(AGED, AGED_DARK, 0.4), seam: GOLD_EDGE,
    hole: open ? { from: 6, to: 8, j0: 1, j1: 2 } : undefined,
  });
  browBand(k, base, 4.55, AGED_DARK, GOLD_EDGE);
  k.ball([base[0], base[1] + 7.7, base[2]], 0.6, GOLD_EDGE, { detail: 0, hull: 0, gloss: 0.6 });
  const front = h.facet(0, 0), near = h.facet(7, 0);
  if (worn(w, 1)) { scratches(k, front, [[-0.9, 38.2, 0.7, 37.8]], SCRATCH, 0.22); scratches(k, near, [[-3.4, 38.2, -2.4, 37.7]], SCRATCH, 0.22); }
  if (worn(w, 2)) dent(k, front, 0.5, 38.0, 0.55, AGED);
  if (worn(w, 3)) crack(k, h.facet(1, 0), [1.6, 38.4, 2.0, 37.8, 1.7, 37.3], 0.2);
}

/** The tall oval shield: an iron rim, the owner's face, a wooden spine and an iron boss down the middle. */
function ovalShield(k: Kit, c: Look, w: Wear): void {
  const sy = 1.5;
  const cuts: Cut[] = [];
  if (worn(w, 3) && !worn(w, 4)) cuts.push({ from: 290, to: 320, inner: 5.8 * 0.66, jag: 0.35 });
  if (worn(w, 4)) cuts.push({ from: 300, to: 322, inner: 5.8 * 0.8, jag: 0.3 });
  const x0 = -0.8;
  const oval = (r: number, inset = 0, cu: Cut[] = cuts): number[] => {
    const p = discPoly(r, cu, inset, 16).map((v, i) => (i % 2 ? v * sy : v));
    return worn(w, 4) ? splitPoly(p, x0 + inset, 0.8) : p;
  };
  k.slab(oval(5.8), 1.4, GF.IRON_DARK, [0, 0, 0], [0, 0, 0], { gloss: 0.35 });
  k.slab(oval(5.1, 0.6), 1.0, c.main, [0, 0, 0.45], [0, 0, 0], { hull: 0 });
  const s = flat(0.97);
  // A painted border inside the rim in the owner's deep colour, the wooden spine and the boss.
  k.line(oval(4.3, 0.6, []).concat(oval(4.3, 0.6, []).slice(0, 2)), 0.45, vivid(c.dark), s);
  const top = worn(w, 3) ? 6.2 : 7.3;
  k.box([0, (top - 7.3) / 2, 1.15], [1.3, top + 7.3, 0.7], GF.WOOD, { gloss: 0.2 });
  k.ball([0, 0, 1.3], 1, GF.IRON, { s: [1.7, 2.6, 0.9], detail: 1, gloss: 0.5 });
  for (const y of [-6.4, 5.6]) k.ball([0, y, 1.55], 0.3, GF.IRON_LIT, { detail: 0, hull: 0 });
  if (worn(w, 4)) {
    k.line([x0 + 0.4, 8.4, x0 + 1.0, 4.0, x0 + 0.3, 0.2, x0 + 0.9, -4.2, x0 + 0.3, -8.4], 0.35, GT.TORN, flat(1.0));
    crack(k, s, [x0 + 0.5, 1.4, 1.2, 2.0, 2.8, 1.4], 0.3);
  }
  discWear(k, (x, y) => s(x, y * sy), 5.8, c.main, w);
}

/** The Spearman: a long spear, a helm, a tall oval shield. */
export function grittySpearman(k: Kit, { look: c, wear: w }: FootOpts): Shadow {
  stand(k, () => {
    // The long spear upright beside him; the hand that holds it stays with the arm, so the spear slides through it.
    const grip: V3 = [10, H(-11), 2.4];
    k.pivot(WEAPON, grip, () => {
      spear(k, [10, 0.6, 2.4], [10, H(-29.6), 2.4], (36 - 29.6) / 0.785 + 0.6, { nick: worn(w, 2), snap: worn(w, 4) ? 0.62 : undefined, blood: w.blood });
      k.ball([10, 1.5, 2.4], 0.95, GF.IRON_DARK, { detail: 0, s: [1, 1.4, 1] });
      if (!worn(w, 4)) for (const y of [H(-29.6) - 1.4, H(-29.6) - 0.6]) k.rod([10, y - 0.3, 2.4], [10, y + 0.3, 2.4], 0.98, LEATHER_DARK, { seg: 6, hull: 0 });
    }, { axis: TIP_FORWARD });
    legs(k, w, { shin: SKIN, knee: SKIN, boot: GT.SANDAL, greave: [LEATHER, LEATHER] });
    skirt(k, w, { colour: c.main, hem: c.dark });
    // The quilted linen corselet: stitched in rows and down the front, shoulder flaps, a leather belt.
    shellBody(k, CORSELET, GF.LINEN, { gloss: 0.1 });
    const s = bodyFront(CORSELET, 0.14);
    for (const y of [15.0, 17.4, 19.8, 22.2]) k.line([-5.4, y + 0.25, -2.6, y, 0, y - 0.1, 2.6, y, 5.4, y + 0.25], 0.22, GF.LINEN_DARK, s);
    for (const x of [-2.4, 2.4]) k.line([x, 13.6, x * 1.05, 24.8], 0.22, GF.LINEN_DARK, s);
    for (const sd of [-1, 1]) {
      k.box([sd * 4.6, 25.4, 0], [3.4, 0.9, 5.6], GF.LINEN, { rot: [0, 0, sd * -0.35] });
      k.box([sd * 4.6, 25.95, 0], [3.0, 0.2, 5.0], GF.LINEN_DARK, { rot: [0, 0, sd * -0.35], hull: 0 });
    }
    // The corselet's hem: strips of quilted linen over the skirt.
    for (let i = 0; i < 7; i++) {
      const a = -1.5 + (i / 6) * 3.0;
      k.box([Math.sin(a) * 6.45, 11.6, Math.cos(a) * 6.45 * 0.76], [1.9, 2.6, 0.45], i % 2 ? GF.LINEN : mix(GF.LINEN, '#000000', 0.12), { rot: [0, a, 0] });
    }
    belt(k, CORSELET, 13.2, LEATHER_DARK, AGED);
    if (worn(w, 1)) { dirt(k, s, 3.4, 15.0, 3.4, GF.LINEN); scratches(k, s, [[-4.2, 21.4, -2.8, 22.8]], GF.LINEN_DARK, 0.3); }
    if (worn(w, 2)) dent(k, s, 3.2, 20.6, 0.9, GF.LINEN);
    if (worn(w, 3)) { const [lip, gap] = tearPolys(-3.0, 18.0, 2.6, 3.2); k.decal(lip, GF.LINEN_DARK, s); k.decal(gap, c.main, s); }
    neck(k);
    // The spear arm in a short sleeve of the owner's colour, a leather bracer, the hand round the shaft.
    limb(k, [5.8, 24.6, 0], [8.7, 20.8, -0.4], [9.3, 19.4, 1.8], { upper: c.main, bracer: LEATHER });
    fist(k, grip, [0, 1, 0], [0.9, 0, -0.3], 1.0);
    bareFace(k, FACE, w, { beard: '#5A3A22', hair: GF.HAIR });
    backHair(k, GF.HAIR);
    spearHelm(k, w);
    k.pivot(SHIELD, [-5.4, H(-15.6), 0], () => {
      limb(k, [-5.8, 24.6, 0], [-8.4, 20.6, 1.2], [-6.4, 18.6, 3.4], { upper: c.main, bracer: LEATHER });
      fist(k, [-6.2, 18.2, 3.9], [1, 0, 0], [0, 0, -1], 1.0);
      k.frame([-6, H(-9), 5.4], [-0.36, 0, 0], () => ovalShield(k, c, w));
    }, { axis: TIP_FORWARD });
    bodyBlood(k, s, w);
  });
  return NARROW;
}

// ==== the Swordsman ====

const MAILSHIRT: Profile = [[7.0, 10.8], [6.5, 12.6], ...grow(BODY, 0.35, 14)];

/** Rows of mail rings on a surface: short dark arcs, offset row to row. */
function mailRows(k: Kit, s: Surface, x0: number, x1: number, y0: number, y1: number, step = 1.9): void {
  let row = 0;
  for (let y = y0; y <= y1; y += step, row++) {
    const pts: number[] = [];
    for (let x = x0 + (row % 2) * 0.9; x <= x1; x += 1.8) pts.push(x, y, x + 0.9, y - 0.45);
    k.line(pts, 0.2, GF.MAIL_DARK, s);
  }
}

/** The round iron helm with cheek guards and a combed plume; broken, the near cheek guard torn away for good. */
function swordHelm(k: Kit, c: Look, w: Wear): void {
  const base: V3 = [FACE[0], 36.0, FACE[2] - 0.45];
  const open = helmBroken(w);
  const h = segHelm(k, {
    base, rings: [[0, 4.9], [2.0, 4.6], [3.9, 3.3], [5.3, 0]], seg: 8, colour: GF.IRON, seam: GF.IRON_LIT, seamEvery: 2,
    hole: open ? { from: 7, to: 8, j0: 0, j1: 1 } : undefined,
  });
  browBand(k, base, 4.9, GF.IRON_DARK, GF.IRON_LIT, open ? [0.75, Math.PI * 2 - 1.5] : undefined);
  // The neck guard at the back.
  k.frustum([base[0], 0, base[2]], base[1] - 2.2, base[1] - 0.1, 5.7, 5.0, GF.IRON_DARK, { arc: [Math.PI * 0.62, Math.PI * 0.76], seg: 10, sz: 1, gloss: 0.4 });
  // The cheek guards: plates hanging from the rim down the sides of the face, hinged at the top.
  for (const sd of [-1, 1]) {
    if (open && sd < 0) {
      // Torn off: a stub of the hinge and its torn edge.
      k.box([sd * 4.75, base[1] - 0.3, base[2] + 2.0], [0.5, 0.9, 1.4], GF.IRON_DARK, { hull: 0 });
      tornEdge(k, [[sd * 4.75, base[1] - 0.8, base[2] + 1.2], [sd * 4.85, base[1] - 1.2, base[2] + 2.0], [sd * 4.75, base[1] - 0.9, base[2] + 2.8]], 0.2);
      continue;
    }
    const q = (x: number, y: number, z: number): V3 => [sd * x, y, z];
    const pts = [q(4.9, 36.2, 3.6), q(4.95, 36.2, -0.2), q(4.5, 32.2, 0.2), q(3.7, 31.1, 2.2), q(3.9, 32.3, 4.0)];
    plate(k, pts, GF.IRON, [0, 33.6, FACE[2] - 0.6], { gloss: 0.45 });
    metalEdge(k, [pts[0]!, pts[4]!, pts[3]!, pts[2]!], 0.15, GF.IRON_LIT);
    k.ball(q(5.0, 35.5, 1.7), 0.26, GF.IRON_LIT, { detail: 0, hull: 0 });
  }
  // The plume on a short post, front to back, in horsehair dyed the owner's colour, like the Hoplite's crest.
  const top = base[1] + 5.3;
  k.box([base[0], top + 0.6, base[2] - 0.4], [1.0, 1.6, 1.0], GF.IRON_DARK);
  crestBrush(k, { root: [base[0], top + 1.4, base[2] - 0.6], colour: vivid(c.main), shorn: worn(w, 3), length: 7.4, height: 6.4, thick: 1.15 });
  const front = h.facet(0, 0), near = h.facet(7, 1);
  if (worn(w, 1)) { scratches(k, front, [[-0.9, 37.2, 0.5, 36.5]], SCRATCH, 0.22); scratches(k, near, [[-3.2, 38.6, -2.2, 38.0]], SCRATCH, 0.22); }
  if (worn(w, 2)) dent(k, front, 0.5, 37.0, 0.6, GF.IRON);
  if (worn(w, 3)) crack(k, h.facet(1, 0), [1.4, 37.5, 2.0, 36.9, 1.7, 36.3], 0.2);
}

/** The Swordsman: a sword in each hand, mail and a better mix of armour. */
export function grittySwordsman(k: Kit, { look: c, wear: w }: FootOpts): Shadow {
  stand(k, () => {
    legs(k, w, { shin: GF.BOOT, knee: c.dark, boot: GF.BOOT, tall: 6.8 });
    skirt(k, w, { colour: c.main, hem: c.dark, y0: 7.4, y1: 11.4, r0: 7.0, r1: 6.6 });
    // The mail shirt to the hips, a sash in the owner's colour, a leather baldric, leather shoulder guards.
    shellBody(k, MAILSHIRT, GF.MAIL, { gloss: 0.4 });
    const s = bodyFront(MAILSHIRT, 0.12);
    mailRows(k, s, -5.4, 5.0, 15.0, 24.8);
    mailRows(k, s, -5.4, 5.0, 11.4, 11.4);
    k.frustum([0, 0, 0], 10.6, 11.4, 7.15, 7.0, GF.MAIL_DARK, { sz: SZ + 0.03, seg: 12, open: true });
    band(k, MAILSHIRT, 13.4, 2.0, c.main, 0.3);
    k.box([4.6, 13.2, 3.4], [1.6, 1.8, 1.2], c.dark, { rot: [0, 0.7, 0] });
    for (const [dx, a] of [[0, 0.1], [1.1, -0.15]] as const) k.slab([-0.6, 0, 0.6, 0, 0.8, -4.2, 0, -3.6, -0.7, -4.4], 0.4, c.main, [4.7 + dx, 12.6, 3.3 - dx * 0.6], [0, 0.7, a]);
    const bs = bodyFront(MAILSHIRT, 0.3);
    k.line([-5.2, 24.4, -1.6, 19.6, 2.0, 15.6, 4.6, 13.0], 1.1, LEATHER, bs);
    k.decal(ell(-1.6, 19.6, 0.55, 0.55, 6), GF.IRON_LIT, bodyFront(MAILSHIRT, 0.4));
    if (worn(w, 1)) scratches(k, s, [[2.6, 21.6, 4.2, 22.6]], GF.IRON_LIT, 0.3);
    if (worn(w, 2)) dent(k, s, -3.4, 17.0, 0.9, GF.MAIL);
    if (worn(w, 3)) { const [lip, gap] = tearPolys(3.2, 18.2, 2.6, 3.0); k.decal(lip, GF.MAIL_DARK, s); k.decal(gap, c.main, s); }
    neck(k);
    // Each arm carries its blade (a crouch brings them in across the body); both blades come down together in a
    // strike, each about its own grip.
    for (const sd of [-1, 1]) {
      const piece = sd < 0 ? ARM_L : ARM_R, wpiece = sd < 0 ? WEAPON2 : WEAPON;
      k.pivot(piece, [sd * 5.4, H(-15.8), 0], () => {
        k.ball([sd * 5.9, 25.6, 0], 1, LEATHER, { s: [2.4, 1.6, 2.4], detail: 0, gloss: 0.25 });
        limb(k, [sd * 5.8, 24.6, 0], [sd * 8.6, 21.4, 0.4], [sd * 9.0, 20.8, 1.6], { upper: GF.MAIL, lower: c.main, bracer: LEATHER_DARK });
        const grip: V3 = [sd * 9.4, H(-12.6), 2.2];
        const dir = unit(grip, [sd * 15.5, H(-25), 2.2]);
        k.pivot(wpiece, grip, () => {
          blade(k, [grip[0] + dir[0] * 1.6, grip[1] + dir[1] * 1.6, grip[2]], dir, {
            len: 13.4, hw: 1.0, guard: GF.IRON, guardW: 4.4, gripLen: 2.6, pommel: GF.IRON,
            nick: sd < 0 ? worn(w, 2) : worn(w, 3), snap: sd > 0 && worn(w, 4) ? 0.45 : undefined, blood: sd < 0 ? w.blood : Math.min(1, w.blood), scuffed: worn(w, 1),
          });
          fist(k, grip, dir, [sd * 0.6, 0, -0.8], 1.0, LEATHER_DARK);
        }, { axis: TIP_FORWARD });
      });
    }
    bareFace(k, FACE, w, { beard: mix(SKIN, GF.HAIR_BLACK, 0.4), hair: GF.HAIR_BLACK });
    backHair(k, GF.HAIR_BLACK);
    swordHelm(k, c, w);
    bodyBlood(k, s, w);
  });
  return NARROW;
}

// ==== the Defender ====

/** A shoulder guard of layered steel lames (or one of hardened leather), turned out over the shoulder. */
function pauldron(k: Kit, at: V3, side: number, colour: string, lames = 3, edge: string | null = GF.IRON_LIT): void {
  for (let l = lames - 1; l >= 0; l--) {
    k.frame([at[0] + side * l * 0.45, at[1] - l * 0.95, at[2]], [0, 0, -side * (0.5 + l * 0.12)], () => {
      k.dome([0, 0, 0], 2.7 - l * 0.12, l % 2 ? mix(colour, '#000000', 0.12) : colour, { to: 1.25, seg: 7, s: [1, 0.75, 1.1], gloss: 0.45 });
    });
  }
  if (edge) k.ball([at[0], at[1] + 1.9, at[2]], 0.28, edge, { detail: 0, hull: 0 });
}

/** The round iron helm with its nose guard and a mail aventail; broken, the nose guard and a plate torn off for good. */
function defenderHelm(k: Kit, w: Wear): void {
  const base: V3 = [FACE[0], 36.0, FACE[2] - 0.4];
  const open = helmBroken(w);
  const h = segHelm(k, {
    base, rings: [[0, 5.0], [2.2, 4.75], [4.2, 3.4], [5.6, 0]], seg: 8, colour: GF.IRON, alt: mix(GF.IRON, GF.IRON_DARK, 0.35), seam: GF.IRON_LIT, seamEvery: 2,
    hole: open ? { from: 7, to: 8, j0: 0, j1: 2 } : undefined,
  });
  browBand(k, base, 5.0, GF.IRON_DARK, GF.IRON_LIT, open ? [0.75, Math.PI * 2 - 1.5] : undefined);
  // The aventail: mail hanging from the rim round the back and the sides, onto the shoulders.
  k.frustum([base[0], 0, base[2] - 0.4], 28.8, base[1] + 0.2, 5.9, 5.1, GF.MAIL, { arc: [1.05, Math.PI * 2 - 2.1], seg: 12, sz: 1, gloss: 0.4 });
  k.frustum([base[0], 0, base[2] - 0.4], 28.6, 29.4, 6.0, 5.9, GF.MAIL_DARK, { arc: [1.05, Math.PI * 2 - 2.1], seg: 12, sz: 1, hull: 0 });
  // The nose guard down from the brow band.
  const nz = FACE[2] + 4.55;
  if (!open) {
    plate(k, [[-0.6, 36.4, nz + 0.2], [0.6, 36.4, nz + 0.2], [0.45, 32.6, nz + 0.35], [0, 32.2, nz + 0.4], [-0.45, 32.6, nz + 0.35]], GF.IRON, [0, 34.4, FACE[2]], { gloss: 0.5 });
    metalEdge(k, [[0, 36.2, nz + 0.45], [0, 32.5, nz + 0.6]], 0.14, GF.IRON_LIT);
  } else {
    plate(k, [[-0.6, 36.4, nz + 0.2], [0.6, 36.4, nz + 0.2], [0.5, 35.2, nz + 0.28], [-0.5, 35.4, nz + 0.28]], GF.IRON_DARK, [0, 34.4, FACE[2]], { gloss: 0.3 });
    tornEdge(k, [[-0.6, 35.5, nz + 0.45], [-0.2, 35.1, nz + 0.45], [0.2, 35.4, nz + 0.45], [0.6, 35.1, nz + 0.45]], 0.2);
  }
  const front = h.facet(0, 0), side = h.facet(1, 0);
  if (worn(w, 1)) { scratches(k, side, [[1.4, 37.6, 2.8, 37.0]], SCRATCH, 0.22); scratches(k, h.facet(0, 1), [[-1.0, 39.0, 0.6, 38.5]], SCRATCH, 0.22); }
  if (worn(w, 2)) { dent(k, front, 0.9, 37.2, 0.6, GF.IRON); dent(k, h.facet(1, 1), 2.2, 39.2, 0.5, GF.IRON); }
  if (worn(w, 3)) crack(k, side, [2.6, 37.8, 3.0, 37.0, 2.7, 36.4], 0.2);
}

/** The great tower shield: an iron edge, planks painted in the owner's colour, bronze straps and boss, studs. */
function towerShield(k: Kit, c: Look, w: Wear): void {
  const hw = 16.5 / 2, hh = 22 / 0.954 / 2;
  const rect = (x0: number, y0: number, x1: number, y1: number): number[] => [x0, y0, x1, y0, x1, y1, x0, y1];
  let outer = rect(-hw, -hh, hw, hh);
  let inner = rect(-hw + 1.2, -hh + 1.2, hw - 1.2, hh - 1.2);
  if (worn(w, 3)) {
    outer = [-hw, -hh, hw, -hh, hw, hh - 4.2, hw - 1.6, hh - 2.6, hw - 2.2, hh - 3.4, hw - 4.0, hh, -hw, hh];
    inner = [-hw + 1.2, -hh + 1.2, hw - 1.2, -hh + 1.2, hw - 1.2, hh - 5.0, hw - 2.4, hh - 3.6, hw - 3.0, hh - 4.4, hw - 4.6, hh - 1.2, -hw + 1.2, hh - 1.2];
  }
  // Broken: the lower left piece split away along the grain and across.
  const brk = [-hw + 5.4, -hh, -hw + 4.4, -4.6, -hw + 3.2, -3.4, -hw + 2.4, -0.6, -hw, 0.6];
  if (worn(w, 4)) {
    outer = [-hw + 5.4, -hh, hw, -hh, hw, hh - 4.2, hw - 1.6, hh - 2.6, hw - 2.2, hh - 3.4, hw - 4.0, hh, -hw, hh, -hw, 0.6, -hw + 2.4, -0.6, -hw + 3.2, -3.4, -hw + 4.4, -4.6];
    inner = [-hw + 6.4, -hh + 1.2, hw - 1.2, -hh + 1.2, hw - 1.2, hh - 5.0, hw - 2.4, hh - 3.6, hw - 3.0, hh - 4.4, hw - 4.6, hh - 1.2, -hw + 1.2, hh - 1.2, -hw + 1.2, -0.2, -hw + 3.0, -1.4, -hw + 3.9, -4.0, -hw + 5.3, -5.4];
  }
  k.slab(outer, 1.6, GF.IRON_DARK, [0, 0, 0], [0, 0, 0], { gloss: 0.35 });
  k.slab(inner, 1.0, c.main, [0, 0, 0.5], [0, 0, 0], { hull: 0 });
  const s = flat(1.02);
  // The planks' seams in the paint, down to what is left.
  for (const x of [-4.8, 1.8, 5.0]) {
    const y0 = worn(w, 4) && x < -hw + 6 ? -1.0 : -hh + 1.2;
    const y1 = worn(w, 3) && x > hw - 4.8 ? hh - 4.6 : hh - 1.2;
    k.line([x, y0, x, y1], 0.22, mix(c.main, '#000000', 0.35), s);
  }
  // Bronze straps across and down, riveted, the great boss where they cross.
  const cx = -1.2, cy = 0.4;
  const across0 = -hw + 1.2;
  k.box([(across0 + hw - 1.2) / 2, cy, 1.15], [hw - 1.2 - across0, 2.0, 0.45], AGED, { gloss: 0.45 });
  const down0 = worn(w, 4) ? -3.0 : -hh + 1.2, down1 = hh - 1.2;
  k.box([cx, (down0 + down1) / 2, 1.2], [2.0, down1 - down0, 0.45], AGED, { gloss: 0.45 });
  metalEdge(k, [[across0, cy + 1.0, 1.42], [hw - 1.2, cy + 1.0, 1.42]], 0.13);
  metalEdge(k, [[cx - 1.0, down1, 1.47], [cx - 1.0, cy + 1.0, 1.47]], 0.13);
  for (const [x, y] of [[-6.2, cy], [4.6, cy], [cx, 8.6], [cx, -8.2]] as const) {
    if (worn(w, 4) && y < -3) continue;
    k.ball([x, y, 1.45], 0.38, GOLD_EDGE, { detail: 0, hull: 0, gloss: 0.6 });
  }
  k.frame([cx, cy, 1.3], [Math.PI / 2, 0, 0], () => k.dome([0, 0, 0], 2.6, AGED, { to: Math.PI / 2, seg: 10, gloss: 0.5 }));
  k.ball([cx, cy, 3.9], 0.5, GOLD_EDGE, { detail: 0, hull: 0, gloss: 0.6 });
  // Studs along the iron edge.
  for (const [x, y] of [[-hw + 0.6, hh - 0.6], [hw - 0.6, -hh + 0.6], [-hw + 0.6, -hh + 0.6], [hw - 0.6, 0], [-hw + 0.6, 6.0], [3.0, -hh + 0.6], [-3.0, hh - 0.6]] as const) {
    if (worn(w, 4) && x < -hw + 5.4 && y < 0.6) continue;
    if (worn(w, 3) && y === hh - 0.6 && x > 0) continue;
    k.decal(ell(x, y, 0.32, 0.32, 5), GF.IRON_LIT, flat(0.92));
  }
  if (worn(w, 1)) scratches(k, s, [[-6.4, 6.6, -3.8, 8.2], [3.0, -4.0, 5.6, -2.6], [2.4, 7.4, 4.4, 6.0]], SCRATCH, 0.3);
  if (worn(w, 2)) { dent(k, s, 4.0, 4.2, 1.2, c.main); dent(k, s, -5.0, -6.2, 1.1, c.main); }
  if (worn(w, 3)) crack(k, s, [5.2, 10.4, 4.2, 8.0, 5.0, 6.2, 3.8, 3.6], 0.3);
  if (worn(w, 4)) {
    k.line(brk, 0.5, GT.TORN, flat(1.08));
    crack(k, s, [-4.6, 2.6, -3.0, 0.2, -3.6, -3.0], 0.3);
  }
  if (w.blood >= 1) smear(k, s, 3.2, 6.4, -0.2, -1, 3.4, 1.3);
  if (heavy(w)) {
    smear(k, s, -3.8, 3.6, 0.3, -1, 4.0, 1.4);
    for (const [x, y, r] of [[5.6, 1.6, 0.4], [-5.8, 8.0, 0.35], [1.0, -6.4, 0.4]] as const) k.decal(ell(x, y, r, r, 6), BLOOD, s);
  }
}

/** The Defender: the great shield, the heaviest kit. */
export function grittyDefender(k: Kit, { look: c, wear: w }: FootOpts): Shadow {
  stand(k, () => {
    legs(k, w, { shin: GF.BOOT, knee: GF.MAIL, boot: GF.BOOT, greave: [GF.IRON, GF.IRON], cop: GF.IRON });
    skirt(k, w, { colour: c.main, hem: c.dark, y0: 7.4, y1: 10.6 });
    // The mail shirt, and a steel breastplate over its front.
    shellBody(k, MAILSHIRT, GF.MAIL, { gloss: 0.4 });
    const ms = bodyFront(MAILSHIRT, 0.12);
    mailRows(k, ms, -5.4, 5.0, 10.8, 14.0);
    k.frustum([0, 0, 0], 9.6, 10.4, 7.35, 7.2, GF.MAIL_DARK, { sz: SZ + 0.03, seg: 12, open: true });
    const PLATE = grow(BODY, 0.7, 14.8);
    shellBody(k, PLATE, GF.IRON, { arc: [-1.25, 2.5], gloss: 0.5 });
    const ps = bodyFront(PLATE, 0.12);
    k.line([0, 15.4, 0, 25.2], 0.3, GF.IRON_LIT, ps);
    belt(k, MAILSHIRT, 13.6, LEATHER_DARK, AGED);
    if (worn(w, 1)) scratches(k, ps, [[2.2, 21.0, 4.0, 22.2]], SCRATCH, 0.3);
    if (worn(w, 2)) dent(k, ps, 3.0, 18.4, 0.9, GF.IRON);
    if (worn(w, 3)) crack(k, ps, [2.2, 24.6, 3.0, 22.6, 2.4, 21.2], 0.3);
    neck(k);
    // The free arm: a steel pauldron, a mail sleeve, an iron vambrace, a gauntleted fist at his side.
    pauldron(k, [6.0, 25.6, 0], 1, GF.IRON);
    limb(k, [5.8, 24.4, 0], [7.8, 20.6, 0.2], [7.6, 18.6, 2.2], { upper: GF.MAIL, lower: GF.MAIL, bracer: GF.IRON });
    fist(k, [7.5, 17.8, 2.9], [0.2, 0.2, 1], [1, 0, 0], 0.95, GF.IRON_DARK);
    bareFace(k, FACE, w, { beard: '#4F4034', hair: GF.HAIR });
    backHair(k, GF.HAIR);
    defenderHelm(k, w);
    // The shield arm behind the great shield, which covers him from chin to ankle.
    k.pivot(SHIELD, [-2.75, H(-17), 3.0], () => {
      pauldron(k, [-6.0, 25.6, 0], -1, GF.IRON, 2);
      limb(k, [-5.8, 24.4, 0], [-7.4, 20.6, 1.6], [-4.4, 18.4, 3.6], { upper: GF.MAIL, lower: GF.MAIL, bracer: GF.IRON });
      // Further out than the Bright shield and leaning back less, clear of the breastplate; raised as much as moving it
      // forward lowers it on screen.
      k.frame([-2.75, H(-8.7) + (2.4 * SQUASH) / COS_E, 8.4], [-0.22, 0, 0], () => towerShield(k, c, w));
    }, { axis: TIP_FORWARD });
    if (w.blood >= 1) groundDrops(k, 6.5, 8, true, w.blood >= 2);
  });
  return NARROW;
}

// ==== the Sellsword ====

const JERKIN: Profile = grow(BODY, 0.45, 12.2);

/** The dented iron kettle hat: a crown of plates and a broad brim, rust on it; broken, the brim torn for good. */
function kettleHat(k: Kit, w: Wear): void {
  const base: V3 = [FACE[0], 36.4, FACE[2] - 0.5];
  const h = segHelm(k, { base, rings: [[0, 4.8], [2.4, 4.45], [4.3, 2.9], [5.3, 0]], seg: 8, colour: GF.IRON_DARK, alt: mix(GF.IRON_DARK, GF.RUST, 0.25), seam: null });
  const open = helmBroken(w);
  const cuts: Cut[] = open ? [{ from: 195, to: 250, inner: 5.0, jag: 0.6 }] : [];
  // The brim, its front turned up a little so the eyes show under it.
  k.slab(discPoly(7.4, cuts, 0, 16).map((v, i) => (i % 2 ? v * 0.9 : v)), 0.6, GF.IRON, [base[0], base[1] + 0.1, base[2]], [Math.PI / 2 - 0.16, 0, 0], { gloss: 0.3 });
  k.frustum([base[0], 0, base[2]], base[1] - 0.1, base[1] + 0.8, 5.05, 4.9, mix(GF.IRON_DARK, '#000000', 0.2), { seg: 16, sz: 1 });
  if (open) {
    // The torn brim: dark jagged edges where it was hacked through.
    const p = (a: number, r: number): V3 => { const t = (a * Math.PI) / 180; return [base[0] + Math.cos(t) * r, base[1] + 0.1 - Math.sin(t) * r * 0.9 * 0.16 + 0.3, base[2] - Math.sin(t) * r * 0.9 * 0.99]; };
    tornEdge(k, [p(195, 7.3), p(203, 5.6), p(213, 5.3), p(224, 5.8), p(236, 5.1), p(250, 7.3)], 0.24);
  }
  // Rust and wear on the crown.
  const front = h.facet(0, 0), near = h.facet(7, 0);
  k.decal(ell(-2.2, 38.4, 0.8, 0.5, 6), GF.RUST, near);
  k.decal(ell(0.8, 39.4, 0.6, 0.4, 6), GF.RUST, h.facet(0, 1));
  if (worn(w, 1)) scratches(k, front, [[-0.8, 38.4, 0.8, 37.7]], GF.IRON_LIT, 0.22);
  if (worn(w, 2)) { dent(k, front, 0.4, 37.8, 0.75, GF.IRON_DARK); dent(k, near, -3.0, 37.6, 0.6, GF.IRON_DARK); }
  if (worn(w, 3)) crack(k, h.facet(1, 0), [1.6, 38.6, 2.1, 37.8, 1.8, 37.2], 0.2);
}

/** The Sellsword: a mercenary in mismatched gear, a long blade held low in both hands. */
export function grittySellsword(k: Kit, { look: c, wear: w }: FootOpts): Shadow {
  stand(k, () => {
    // The cloak hangs from his shoulders and flares back to the left, its hem ragged (more torn when broken), a patch.
    const hem = worn(w, 4) ? [8.4, 1.4, 6.0, -0.6, 3.6, 2.6, 1.2, -0.4, -1.8, 2.6, -4.6, -0.2, -7.4, 2.2, -10.4, -0.4, -13.2, 2.6]
      : worn(w, 3) ? [8.4, 1.4, 4.6, 0.4, 1.0, 2.4, -2.8, 0.6, -6.6, 2.2, -10.0, 0.6, -13.0, 2.0] : [8.4, 1.4, 3.8, 2.2, -0.6, 0.8, -4.6, 2.4, -8.6, 0.8, -13.0, 2.0];
    k.slab([-6.0, 26.2, 6.0, 26.2, 9.0, 14.0, ...hem, -11.6, 12.0], 1.0, c.dark, [0, 0, -4.4], [0.1, 0, 0]);
    for (const x of [-5.2, 2.6]) k.slab([x - 1.2, 23.4, x + 0.6, 23.4, x + 1.4 + (x < 0 ? -2.8 : 0.6), 3.4, x - 2.2 + (x < 0 ? -2.8 : 0), 3.4], 1.2, mix(c.dark, '#000000', 0.25), [0, 0, -5.0], [0.1, 0, 0], { hull: 0 });
    k.slab([-1.8, -1.6, 1.8, -1.6, 1.8, 1.6, -1.8, 1.6], 0.5, c.main, [-9.6, 6.4, -4.0], [0.1, 0, 0.1], { hull: 0 });
    // Mismatched legs: an iron greave on one, cloth wraps on the other.
    legs(k, w, { shin: SKIN, knee: SKIN, boot: GF.BOOT, greave: [GF.IRON, null], wraps: [null, GF.WRAP_DARK], tall: 3.2 });
    const ts = skirt(k, w, { colour: c.main, hem: c.dark, pleats: false, y0: 7.6, tear: false });
    k.decal([-4.6, 8.8, -2.2, 9.0, -2.0, 11.2, -4.4, 11.0], LEATHER, ts);
    for (const [x, y] of [[-4.4, 9.0], [-2.3, 9.2], [-2.2, 11.0], [-4.3, 10.8]] as const) k.decal(ell(x, y, 0.18, 0.18, 4), GF.GRIP, ts);
    // The riveted leather jerkin over the patched tunic, a belt with a brass buckle, the cloak's collar.
    shellBody(k, JERKIN, LEATHER_DARK, { gloss: 0.15 });
    const s = bodyFront(JERKIN, 0.12);
    const rivets: [number, number][] = [];
    for (const y of [15.0, 17.6, 20.2, 22.8]) for (const x of [-4.0, -1.4, 1.4, 4.0]) rivets.push([x + (y % 5.2 === 0 ? 0.6 : 0), y]);
    dots(k, s, rivets, 0.26, mix(AGED, GOLD_EDGE, 0.3));
    k.line([0, 13.4, 0, 25.6], 0.3, mix(LEATHER_DARK, '#000000', 0.4), s);
    k.decal([2.4, 18.8, 4.8, 19.2, 4.6, 21.6, 2.2, 21.4], LEATHER, s);
    belt(k, JERKIN, 13.0, GF.BOOT, c.accent);
    k.frustum([0, 0, -0.2], 25.4, 27.4, 6.0, 4.8, c.dark, { sz: 0.82, seg: 10 });
    if (worn(w, 1)) scratches(k, s, [[-4.6, 21.4, -3.2, 22.8]], mix(LEATHER, '#FFFFFF', 0.35), 0.3);
    if (worn(w, 2)) dent(k, s, 3.4, 16.2, 0.8, LEATHER_DARK);
    if (worn(w, 3)) { const [lip, gap] = tearPolys(-2.6, 17.4, 2.4, 3.0); k.decal(lip, '#1E140C', s); k.decal(gap, c.main, s); }
    // Two shoulders that do not match: steel on the left (torn off for good when broken), hardened leather on the right.
    if (!helmBroken(w)) {
      pauldron(k, [-6.2, 25.6, 0.2], -1, GF.IRON, 3);
      if (worn(w, 2)) dent(k, (x, y) => ({ p: [x, y, 2.9], n: [0, 0.3, 1] }), -6.4, 25.4, 0.6, GF.IRON);
    } else {
      k.box([-6.0, 25.4, 0.4], [1.0, 2.2, 0.5], LEATHER, { rot: [0, 0, 0.5] });
      tornEdge(k, [[-6.6, 24.3, 0.8], [-6.2, 24.0, 0.9], [-5.8, 24.4, 0.9]], 0.16);
    }
    pauldron(k, [6.2, 25.4, 0.2], 1, LEATHER, 1, null);
    k.ball([6.2, 27.0, 0.2], 0.3, AGED, { detail: 0, hull: 0 });
    neck(k);
    // The arms reach in to the long grip; the blade sweeps up from low about it (the hands stay with the arms).
    const guard: V3 = [6.6, H(-11.2), 4.8];
    const dir = unit(guard, [18.6, H(1.8), 4.8]);
    const hiHand = behind(guard, dir, 1.1), loHand = behind(guard, dir, 3.3);
    limb(k, [-5.8, 24.6, 0.4], [-3.8, 20.6, 3.4], [loHand[0] - 1.6, loHand[1] - 0.4, loHand[2] - 0.6], { upper: c.main, lower: c.main, bracer: GF.IRON });
    limb(k, [5.8, 24.4, 0.4], [8.6, 21.0, 2.2], [hiHand[0] + 0.6, hiHand[1] + 0.9, hiHand[2] - 0.2], { upper: c.main, lower: SKIN, wraps: GF.WRAP });
    fist(k, loHand, dir, [-0.4, 0.5, -0.8], 1.0, LEATHER_DARK);
    fist(k, hiHand, dir, [0.6, 0.4, -0.7], 1.0);
    k.pivot(WEAPON, guard, () => {
      blade(k, guard, dir, {
        len: 17.2, hw: 1.1, guard: c.accent, guardW: 5.0, gripLen: 4.6, grip: LEATHER_DARK, pommel: c.accent,
        nick: worn(w, 2), snap: worn(w, 4) ? 0.5 : undefined, blood: w.blood, scuffed: worn(w, 1),
      });
    }, { axis: [0, 0, 1] });
    bareFace(k, FACE, w, { beard: GF.HAIR_GREY, hair: GF.HAIR_GREY });
    backHair(k, GF.HAIR_GREY);
    kettleHat(k, w);
    bodyBlood(k, s, w, -1.2, 23.4);
  });
  return NARROW;
}
