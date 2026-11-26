// The Gritty Catapult in 3D: a heavy counterweight engine of rough-hewn dark timber, our own design. Two long rails
// on four iron-tyred spoked wheels, an A-frame each side carrying an iron axle, a throwing arm with a plank-and-iron
// box of stones hung from its short end and an iron-bound cup at its long end, a windlass and its rope at the back,
// rope lashings at the joints, and the owner's colour (deep, unmuted, as on the Gritty Hoplite) as a cloth wrapped
// on the arm, a cloth over the counterweight and a pennant. Drawn with the Gritty light (shaders.ts GRITTY_LIGHT).
//
// Same figure space and moving pieces as the toon trebuchet (figures.ts): the arm (ARM) and the stone (STONE_PIECE)
// turn on the axle (units/idle.ts swings them); broken, the arm is snapped and fixed, and there is nothing to throw.
//
// Wear: scuffs and mud, then gouges, then a splintered rail end, a spoke gone and the windlass rope snapped and frayed;
// broken, the arm's tip is snapped off with its cup on the ground, a wheel's rim is broken, the counterweight box is
// split and spilling stones. Crews do not bleed: the blood levels are fire instead (scorch on the timber, then burnt
// wreckage and scorched ground). Scarred: the repairs show, a pale new spoke and a splint lashed to the arm.
import { Color, CylinderGeometry, IcosahedronGeometry, LatheGeometry, Quaternion, TorusGeometry, Vector2, Vector3 } from 'three';
import { flat, ground, Kit, mix } from './kit';
import type { PartOpts, Surface, V3 } from './kit';
import { ell, heavy, setYaw, worn } from './parts';
import type { Look, Wear } from './parts';

const TIMBER = '#4E3C2B';
const TIMBER_DARK = '#35291E';
const GRAIN = '#251B13';
const FRESH_WOOD = '#A88A62';
const IRON = '#3C3F42';
const IRON_LIT = '#6E7276';
const ROPE = '#8E7B57';
const ROPE_DARK = '#5E5038';
const STONE = '#7A766E';
const STONE_DARK = '#5A564F';
const SCORCH = '#151110';
const EMBER = '#7A2E12';
const MUD = '#3A3226';
const SCUFF = '#A88E66';
/** Bare wood where a blow has split the timber: pale against the weathered surface. */
const BARE = '#B3916A';
const FLAME = '#E8742A';
const FLAME_HOT = '#F6C35A';

const ARM = 'arm';
const STONE_PIECE = 'stone';
/** The arm's cocked angle and the length of its long end: the toon trebuchet's (figures.ts ARM_COCKED, ARM_LONG). */
export const REAL_ARM_COCKED = -0.66;
export const REAL_ARM_LONG = 16;
const YAW = 0.38 * 0.6;
/** The whole engine grown to the toon trebuchet's height on the board. */
const SIZE = 1.3;

/** The owner's colour, deepened and saturated as on the Gritty Hoplite. */
function vivid(hex: string): string {
  const col = new Color(hex), hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  col.setHSL((hsl.h + 0.975) % 1, Math.min(1, hsl.s * 1.35 + 0.1), Math.max(0.18, hsl.l * 0.7));
  return '#' + col.getHexString();
}

/**
 * A squared timber from a to b (the figure frame), w wide across the screen and d deep, its front face toward +z of
 * its own frame. `f` adds marks on that face: (x across, y along from a) on the surface `s`.
 */
function beam(k: Kit, a: V3, b: V3, w: number, d: number, colour: string, f?: (s: Surface, len: number) => void, o: PartOpts = {}): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const ang = Math.atan2(dy, dx) - Math.PI / 2;
  const tilt = -Math.asin(dz / len);
  k.frame(a, [tilt, 0, ang], () => {
    k.box([0, len / 2, 0], [w, len, d], colour, o);
    const s = flat(d / 2);
    // The grain: a few dark lines along the timber, broken so it reads hewn rather than sawn.
    const n = Math.max(1, Math.round(w / 0.9));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / n + (i % 2 ? 0.12 : -0.1);
      const cut = len * (0.3 + 0.17 * i) % len;
      k.line([x, 0.2, x + 0.05, cut - 0.3], 0.1, GRAIN, s);
      k.line([x - 0.05, cut + 0.4, x, len - 0.2], 0.1, GRAIN, s);
    }
    f?.(s, len);
  });
}

/** Iron bands round a timber at fractions `at` of its length (the same frame as beam). */
function bands(k: Kit, a: V3, b: V3, w: number, d: number, at: readonly number[]): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  k.frame(a, [-Math.asin(dz / len), 0, Math.atan2(dy, dx) - Math.PI / 2], () => {
    for (const t of at) k.box([0, len * t, 0], [w + 0.3, 0.55, d + 0.3], IRON, { gloss: 0.6, hull: 0.5 });
  });
}

/** A rope lashing: turns of rope round a joint (the same frame as beam). */
function lashing(k: Kit, a: V3, b: V3, w: number, d: number, t: number, frayed = false): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  k.frame(a, [-Math.asin(dz / len), 0, Math.atan2(dy, dx) - Math.PI / 2], () => {
    for (let i = 0; i < 4; i++) k.box([0, len * t + (i - 1.5) * 0.3, 0], [w + 0.42, 0.22, d + 0.42], i % 2 ? ROPE : ROPE_DARK, { hull: 0 });
    if (frayed) for (const [x, l] of [[-0.3, 1.4], [0.2, 1.0], [0.5, 1.7]] as const) k.rod([x, len * t - 0.6, d / 2 + 0.25], [x + 0.3, len * t - 0.6 - l, d / 2 + 0.6], 0.08, ROPE, { r1: 0.03, seg: 3, hull: 0 });
  });
}

/** A spoked wheel at c (its axle along z), radius r: a wooden rim, an iron tyre, a hub and six spokes. */
function wheel(k: Kit, c: V3, r: number, o: { near: boolean; missing?: readonly number[]; fresh?: readonly number[]; broken?: boolean; mud?: boolean }): void {
  k.frame(c, [0, 0, 0], () => {
    // Broken: a length of the rim and tyre gone at the lower front, the spokes there with it.
    const arc = o.broken ? Math.PI * 2 - 1.3 : Math.PI * 2;
    const start = o.broken ? -0.4 : 0;
    const rim = new TorusGeometry(r - 0.55, 0.55, 4, 16, arc);
    rim.rotateZ(start);
    k.add(rim, TIMBER, { hull: 0.7 });
    const tyre = new CylinderGeometry(r, r, 1.25, 18, 1, true, Math.PI / 2 - start - arc, arc);
    tyre.rotateX(Math.PI / 2);
    k.add(tyre, IRON, { gloss: 0.6, hull: 0.6 });
    const hub = new CylinderGeometry(0.95, 1.05, 2.0, 8);
    hub.rotateX(Math.PI / 2);
    k.add(hub, TIMBER_DARK, { hull: 0.6 });
    k.ball([0, 0, 1.05], 0.55, IRON, { detail: 0, gloss: 0.6, hull: 0 });
    for (let i = 0; i < 6; i++) {
      if (o.missing?.includes(i)) {
        // A stub left in the hub.
        const a = (i / 6) * Math.PI * 2 + 0.3;
        k.box([Math.cos(a) * 1.4, Math.sin(a) * 1.4, 0], [1.0, 0.5, 0.5], TIMBER_DARK, { rot: [0, 0, a], hull: 0.5 });
        continue;
      }
      const a = (i / 6) * Math.PI * 2 + 0.3;
      if (o.broken && Math.cos(a - (start + arc + 0.65)) > 0.75) continue;
      const m = (r - 0.5) / 2 + 0.5;
      k.box([Math.cos(a) * m, Math.sin(a) * m, 0], [r - 1.4, 0.55, 0.55], o.fresh?.includes(i) ? FRESH_WOOD : TIMBER, { rot: [0, 0, a], hull: 0.5 });
    }
    if (o.mud) {
      const face = flat(0.7);
      k.decal(ell(0.4, -r + 1.0, 1.8, 0.45, 8), MUD, face);
    }
  });
}

/** A gouge: bare pale wood in a dark split, as a blow leaves it in old timber. */
function gouge(k: Kit, s: Surface, x: number, y: number, r: number): void {
  k.decal(ell(x, y, r * 0.55, r * 1.3, 8, 0.2), BARE, s);
  k.decal(ell(x + 0.05, y, r * 0.18, r * 0.95, 6, 0.2), '#1A130D', s);
}

/** A small fire: tongues of flame standing on a timber or the ground at p. */
function flames(k: Kit, p: V3, size: number): void {
  for (const [dx, dz, h, r, col] of [[0, 0, 2.6, 0.75, FLAME], [0.6, 0.3, 1.8, 0.5, FLAME], [-0.5, -0.2, 1.6, 0.45, FLAME], [0.1, 0.15, 1.3, 0.35, FLAME_HOT]] as const) {
    k.rod([p[0] + dx * size, p[1], p[2] + dz * size], [p[0] + dx * size * 0.6, p[1] + h * size, p[2] + dz * size], r * size, col, { r1: 0.02, seg: 5, hull: 0 });
  }
}

/** Scorch on a face: a charred patch with a glow of embers at its heart; bigger at the second level. */
function scorch(k: Kit, s: Surface, x: number, y: number, r: number): void {
  // Long along the timber (its y), no wider than its face.
  k.decal(ell(x, y, 0.85, r, 9), SCORCH, s);
  k.decal(ell(x + 0.15, y + r * 0.6, 0.6, r * 0.5, 7), SCORCH, s);
  k.decal(ell(x, y, 0.3, r * 0.25, 6), EMBER, s);
}

export interface RealOpts { look: Look; wear: Wear }

/** The Gritty Catapult. Returns its ground shadow's size. */
export function realCatapult(k: Kit, { look: c, wear: w }: RealOpts): { rx: number; rz: number; x: number } {
  const own = vivid(c.main), ownDark = mix(own, '#000000', 0.45);
  const broken = worn(w, 4), fire = w.blood >= 1, fierce = heavy(w), mended = w.scarred === true;
  setYaw(YAW);
  // Built at a man's scale, then grown to stand as tall on the board as the toon trebuchet.
  k.frame([0, 0, 0], [0, YAW, 0], () => {
    const RAIL_Y = 6.0;
    // The far wheels, then the chassis: two rails, three cross beams.
    wheel(k, [-8.4, 4.4, -6.0], 4.4, { near: false });
    wheel(k, [8.0, 4.4, -6.0], 4.4, { near: false });
    for (const z of [-4.3, 4.3]) {
      const near = z > 0;
      const a: V3 = [-14.0, RAIL_Y, z], b: V3 = [14.0, RAIL_Y, z];
      beam(k, a, b, 2.2, 2.0, TIMBER, near ? (s, len) => {
        if (worn(w, 1)) for (const [x0, y0, x1, y1] of [[-0.6, 3.6, 0.5, 6.8], [0.4, 17.0, -0.5, 19.8], [-0.3, 25.0, 0.6, 26.6]] as const) k.line([x0, y0, x1, y1], 0.24, SCUFF, s);
        if (worn(w, 1)) k.decal(ell(0.5, len * 0.62, 0.7, 2.2, 8), mix(TIMBER, MUD, 0.7), s);
        if (worn(w, 2)) { gouge(k, s, -0.2, 9.0, 0.9); gouge(k, s, 0.3, 21.5, 0.75); }
        if (fire) scorch(k, s, 0.1, 13.0, 2.4);
        if (fierce) scorch(k, s, -0.2, 24.0, 2.2);
      } : undefined);
      bands(k, a, b, 2.2, 2.0, [0.06, 0.94]);
    }
    if (worn(w, 3)) {
      // The near rail's back end splintered.
      for (const [y, z, l, t] of [[0.5, 0.6, 2.4, 0.3], [-0.4, 0.2, 1.6, -0.4], [0.1, -0.5, 2.0, 0.1]] as const) {
        k.rod([-14.0, RAIL_Y + y, 4.3 + z], [-14.0 - l * 1.4, RAIL_Y + y + t, 4.3 + z * 1.3], 0.45, BARE, { r1: 0.05, seg: 3, hull: 0.4 });
      }
      // And a split along the near rail, its pale inside showing.
      k.frame([0, RAIL_Y, 5.32], [0, 0, 0], () => k.line([-12.5, 0.5, -9.0, 0.1, -6.4, 0.6, -4.0, 0.2], 0.3, BARE, flat(0)));
    }
    for (const x of [-10.5, -0.5, 9.0]) beam(k, [x, RAIL_Y + 1.6, -4.3], [x, RAIL_Y + 1.6, 4.3], 1.8, 1.8, TIMBER_DARK);
    // The A-frames, braced, lashed and banded at the top; the iron axle across them.
    const apex: V3 = [0.8, 21.0, 0];
    for (const z of [-3.1, 3.1]) {
      const top: V3 = [apex[0], apex[1], z];
      const feet: V3[] = [[-5.6, RAIL_Y + 1.0, z * 1.35], [7.0, RAIL_Y + 1.0, z * 1.35]];
      for (const f of feet) {
        beam(k, f, top, 1.7, 1.6, TIMBER, z > 0 ? (s, len) => {
          if (worn(w, 2)) gouge(k, s, 0.1, len * 0.4, 0.6);
          if (fierce) scorch(k, s, 0, len * 0.25, 1.2);
        } : undefined);
        lashing(k, f, top, 1.7, 1.6, 0.92, worn(w, 3) && z > 0 && f[0] > 0);
      }
      beam(k, [-3.6, 11.6, z * 1.2], [5.0, 11.6, z * 1.2], 1.2, 1.2, TIMBER_DARK);
    }
    k.rod([apex[0], apex[1], -4.0], [apex[0], apex[1], 4.0], 0.55, IRON, { seg: 8, gloss: 0.6 });
    for (const z of [-4.1, 4.1]) k.ball([apex[0], apex[1], z], 0.7, IRON_LIT, { detail: 0, gloss: 0.7, hull: 0 });
    // The windlass at the back: a drum wound with rope between two posts.
    const WX = 11.0;
    for (const z of [-3.0, 3.0]) beam(k, [WX, RAIL_Y + 1.0, z], [WX, RAIL_Y + 5.0, z], 1.2, 1.2, TIMBER_DARK);
    const drum = new CylinderGeometry(1.0, 1.0, 5.0, 8);
    drum.rotateX(Math.PI / 2);
    drum.translate(WX, RAIL_Y + 4.0, 0);
    k.add(drum, ROPE_DARK, { hull: 0.6 });
    for (const z of [-1.6, -0.5, 0.6, 1.7]) {
      const g = new CylinderGeometry(1.12, 1.12, 0.4, 8, 1, true);
      g.rotateX(Math.PI / 2);
      g.translate(WX, RAIL_Y + 4.0, z);
      k.add(g, ROPE, { hull: 0 });
    }
    k.rod([WX, RAIL_Y + 4.0, 3.6], [WX + 2.4, RAIL_Y + 5.6, 3.6], 0.3, IRON, { seg: 4, gloss: 0.5 });

    // The throwing arm (its own piece on the axle), with its counterweight, its cup and the owner's cloth.
    const armBody = (tipAt: number): void => {
      k.frame(apex, [0, 0, REAL_ARM_COCKED], () => {
        const a: V3 = [-7.6, 0, 0], b: V3 = [tipAt, 0, 0];
        beam(k, a, b, 2.0, 2.2, TIMBER, (s, len) => {
          if (worn(w, 1)) k.line([-0.5, len * 0.55, 0.4, len * 0.7], 0.24, SCUFF, s);
          if (worn(w, 2)) gouge(k, s, 0.2, len * 0.8, 0.7);
          if (fire) scorch(k, s, 0, len * 0.3, 1.3);
        });
        bands(k, a, b, 2.0, 2.2, [0.12, 0.3, 0.5, 0.75].filter((t) => -7.6 + t * (tipAt + 7.6) < tipAt - 1));
        lashing(k, a, b, 2.0, 2.2, 0.62);
        // The owner's cloth bound round the arm beside the axle.
        k.box([3.2, 0, 0], [2.6, 2.7, 2.9], own, { hull: 0.6 });
        k.box([3.2, 0, 0], [0.35, 2.85, 3.05], ownDark, { hull: 0 });
        if (mended) {
          // A splint of new wood lashed along the arm where it once split.
          k.box([7.5, 1.25, 0.2], [5.4, 0.5, 1.6], FRESH_WOOD, { hull: 0.5 });
          for (const x of [5.6, 9.4]) k.box([x, 0.2, 0], [0.5, 2.9, 2.6], ROPE, { hull: 0 });
        }
        // The counterweight: a box of planks and iron hung from a pin at the short end, hanging plumb.
        k.frame([-6.8, 0, 0], [0, 0, -REAL_ARM_COCKED], () => {
          for (const x of [-1.2, 1.2]) k.rod([x * 0.3, 0, 0], [x, -1.4, 0], 0.22, IRON, { seg: 4, gloss: 0.5 });
          const split = broken;
          k.box([0, -3.6, 0], [4.8, 4.4, 4.4], TIMBER_DARK, { hull: 0.8 });
          const face = flat(2.25);
          k.frame([0, -3.6, 0], [0, 0, 0], () => {
            for (const y of [-1.1, 0, 1.1]) k.line([-2.3, y, 2.3, y], 0.12, GRAIN, face);
            if (split) k.line([0.6, 2.2, 0.1, 0.4, 0.7, -0.6, 0.2, -2.2], 0.28, '#0E0B09', face);
          });
          for (const y of [-1.7, -5.5]) k.box([0, y, 0], [5.05, 0.45, 4.65], IRON, { gloss: 0.6, hull: 0 });
          // Stones heaped in it, under the owner's cloth thrown over one side.
          for (const [x, z, r] of [[-1.2, -0.8, 1.0], [0.9, 0.6, 1.1], [0.2, -1.2, 0.8], [-0.6, 1.1, 0.9]] as const) k.ball([x, -1.3 + r * 0.3, z], r, STONE, { detail: 0, hull: 0.4 });
          k.slab([-2.5, 0.3, 0.6, 0.6, 0.9, -2.8, -0.2, -3.6, -1.4, -2.9, -2.5, -3.4], 0.3, own, [0, -2.0, 2.45], [0, 0, 0], { hull: 0.4 });
        });
        if (tipAt >= REAL_ARM_LONG) {
          // The cup: an iron-bound wooden bowl at the long end.
          const bowl = new LatheGeometry([new Vector2(0.4, -1.4), new Vector2(1.9, -0.9), new Vector2(2.5, 0.2), new Vector2(2.6, 0.9)], 9);
          bowl.translate(REAL_ARM_LONG + 0.4, 1.2, 0);
          k.add(bowl, TIMBER_DARK, { hull: 0.7, smooth: true });
          const lip = new TorusGeometry(2.6, 0.22, 4, 12);
          lip.rotateX(Math.PI / 2);
          lip.translate(REAL_ARM_LONG + 0.4, 2.1, 0);
          k.add(lip, IRON, { gloss: 0.6, hull: 0 });
        } else {
          // Snapped: splinters at the end.
          for (const [y, z, l] of [[0.5, 0.4, 2.2], [-0.4, -0.3, 1.5], [0.1, 0.8, 1.2], [-0.6, 0.6, 1.8]] as const) {
            k.rod([tipAt, y, z], [tipAt + l, y * 1.4, z * 1.2], 0.45, BARE, { r1: 0.04, seg: 3, hull: 0.4 });
          }
        }
      });
    };
    if (broken) {
      // Snapped and fixed: it cannot throw. The tip and its cup lie on the ground in front, the stone beside them.
      armBody(REAL_ARM_LONG * 0.55);
      k.frame([14.5, 1.0, 7.5], [0, 0.4, 0.12], () => {
        beam(k, [-3.6, 0, 0], [3.0, 0, 0], 1.9, 2.0, TIMBER);
        for (const [y, z, l] of [[0.4, 0.3, 1.6], [-0.3, -0.4, 1.2]] as const) k.rod([-3.6, y, z], [-3.6 - l, y, z], 0.4, BARE, { r1: 0.04, seg: 3, hull: 0.4 });
        const bowl = new LatheGeometry([new Vector2(0.4, -1.4), new Vector2(1.9, -0.9), new Vector2(2.5, 0.2), new Vector2(2.6, 0.9)], 9);
        bowl.rotateZ(1.3);
        bowl.translate(4.4, 0.6, 0);
        k.add(bowl, TIMBER_DARK, { hull: 0.7, smooth: true });
      });
      boulder(k, [9.6, 2.0, 10.4], 2.0);
      // Stones spilled from the split counterweight.
      for (const [x, z, r] of [[-6.5, 7.6, 0.9], [-4.8, 9.0, 0.7], [-7.8, 9.6, 0.6], [-3.2, 7.2, 0.5]] as const) k.ball([x, r * 0.7, z], r, STONE_DARK, { detail: 0, hull: 0.4 });
    } else {
      k.pivot(ARM, apex, () => armBody(REAL_ARM_LONG));
      // The stone is its own piece on the same axle, so it can leave the cup at the top of the throw.
      k.pivot(STONE_PIECE, apex, () => {
        k.frame(apex, [0, 0, REAL_ARM_COCKED], () => boulder(k, [REAL_ARM_LONG + 0.4, 2.7, 0], 2.2));
      });
    }
    // The windlass rope up to the arm's long end; battered, snapped and hanging frayed.
    const tip = new Vector3(REAL_ARM_LONG - 1.0, 0, 0).applyAxisAngle(new Vector3(0, 0, 1), REAL_ARM_COCKED).add(new Vector3(...apex));
    const from: V3 = [WX - 0.8, RAIL_Y + 4.6, 0.6];
    if (!worn(w, 3)) k.rod(from, [tip.x, tip.y, tip.z + 0.8], 0.2, ROPE, { seg: 4, hull: 0.4 });
    else {
      const hang: V3 = [WX - 1.6, RAIL_Y + 1.6, 1.4];
      k.rod(from, hang, 0.2, ROPE, { seg: 4, hull: 0.4 });
      for (const [dx, dy] of [[-0.5, -1.0], [0.3, -1.2], [0.0, -0.8]] as const) k.rod(hang, [hang[0] + dx, hang[1] + dy, hang[2] + 0.2], 0.08, ROPE, { r1: 0.02, seg: 3, hull: 0 });
    }
    // The near wheels: a spoke gone from battered (mended in new wood once scarred); broken, the right one's rim.
    wheel(k, [-8.4, 4.4, 6.0], 4.4, { near: true, mud: worn(w, 1) });
    if (!broken) {
      wheel(k, [8.0, 4.4, 6.0], 4.4, { near: true, mud: worn(w, 1), missing: worn(w, 3) && !mended ? [2] : [], fresh: mended ? [2] : [] });
    } else {
      // Broken: the near right wheel is off its axle, lying on the ground with its rim split; the axle stub shows.
      k.rod([8.0, 4.4, 4.6], [8.0, 4.4, 7.0], 0.5, IRON, { seg: 6, gloss: 0.5 });
      k.frame([12.0, 0.75, 12.0], [Math.PI / 2 - 0.12, 0.5, 0], () => wheel(k, [0, 0, 0], 4.4, { near: true, broken: true, missing: [1] }));
    }
    // The owner's pennant on a pole at the back, torn when broken.
    beam(k, [-13.2, RAIL_Y + 1.0, -4.3], [-13.2, 31.0, -4.3], 0.8, 0.8, TIMBER_DARK);
    const pen = broken ? [0, 0, 5.2, -1.2, 3.6, -2.6, 5.0, -4.2, 2.4, -5.2, 0, -7.2] : [0, 0, 8.4, -1.6, 6.0, -3.8, 8.4, -6.0, 0, -7.2];
    k.slab(pen, 0.35, own, [-12.8, 31.0, -4.3], [0, 0, 0], { hull: 0.5 });
    k.slab(pen.map((v, i) => (i % 2 ? v * 0.3 : v * 0.96)), 0.4, ownDark, [-12.8, 31.0, -4.3], [0, 0, 0], { hull: 0 });
    // Fire: flames on the near rail and the arm's frame, scorch on the ground, then burnt wreckage still burning.
    if (fire) flames(k, [-1.0, RAIL_Y + 1.1, 4.6], 1.7);
    if (fierce) { flames(k, [-9.0, RAIL_Y + 1.1, 4.6], 1.9); flames(k, [5.2, RAIL_Y + 2.6, 3.9], 1.3); }
    const g = ground(0.06);
    if (fire) { k.decal(ell(4.0, 9.5, 2.6, 1.3, 10, 0.2), SCORCH, g); k.decal(ell(4.4, 9.6, 0.8, 0.4, 7), EMBER, g); }
    if (fierce) {
      k.decal(ell(-5.0, 10.6, 3.4, 1.6, 11, -0.2), SCORCH, g);
      k.decal(ell(-2.0, 12.2, 1.6, 0.8, 8), SCORCH, g);
      for (const [x, z, rot, l] of [[-6.0, 11.0, 0.5, 4.2], [-2.6, 12.6, -0.8, 3.0], [1.0, 11.6, 1.6, 2.4]] as const) {
        k.frame([x, 0.5, z], [0, rot, 0], () => k.box([0, 0, 0], [l, 0.8, 0.9], SCORCH, { hull: 0.4 }));
        k.frame([x, 0.95, z], [0, rot, 0], () => k.box([l * 0.2, 0, 0], [l * 0.35, 0.12, 0.6], EMBER, { hull: 0 }));
      }
      flames(k, [-5.4, 0.9, 11.0], 1.5);
    }
  }, [SIZE, SIZE, SIZE]);
  setYaw(0);
  return { rx: 17, rz: 8.5, x: 0 };
}

/** A rough boulder: a faceted stone, a little squashed. */
function boulder(k: Kit, c: V3, r: number): void {
  const g = new IcosahedronGeometry(r, 1);
  g.scale(1.05, 0.88, 1.0);
  g.applyQuaternion(new Quaternion().setFromAxisAngle(new Vector3(0.3, 1, 0.2).normalize(), 0.7));
  g.translate(...c);
  k.add(g, STONE, { hull: 0.6 });
}
