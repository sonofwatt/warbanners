import type { Ink } from './features';
import type { WearProps } from './units';

// Battle wear for Gritty mode: small, bold marks drawn on a figure's big shapes (shield, helmet, blade, tunic,
// crest) as it takes damage. Every helper draws with the figure's own Ink, in board units, so the marks scale and
// round with the rest of it. Figures stay flat and toy-like: plain fills, no gradients, no filters, and no stroke
// thinner than 0.7 units, so a mark still reads on a phone at about one pixel per unit.
//
// A figure calls `worn(w, n)` and `bloody(w, n)` to decide which marks to draw, and draws nothing extra when its
// `wear` prop is absent, so Bright mode renders exactly as before.

/** Dried blood, deep and dull (Gritty is muted, never saturated): the body of a smear or a drop. */
export const BLOOD = '#561A16';
/** Fresher blood: the small lit part of a smear. */
export const BLOOD_LIGHT = '#6E2A23';
/** The dark of a dent, a nick or a gouge, laid over any metal or wood at partial strength. */
export const DENT = '#1B1D21';
/** A pale scratch across wood, bronze or a coloured tunic. */
export const SCRATCH = '#CFCBC0';
/** A scratch across light steel, where a pale one would not show. */
export const SCRATCH_DARK = '#666B72';
/** A healed scar on skin: a little darker and pinker than the skin itself. */
export const SCAR = '#C98F72';
/** The stitch ticks across a scar. */
export const SCAR_DARK = '#A8735B';
/** A crack running through wood or metal. */
export const CRACK = '#26231F';
/** Mud and dust. */
export const DIRT = '#3D3A34';

/** How strong a dent's dark is. */
const DENT_OPACITY = 0.5;
/** How strong a dirt smudge is. */
const DIRT_OPACITY = 0.55;
/** The default width of a scratch or crack: bold enough to read at phone size. */
const MARK_W = 0.9;

/** A path string with every number rounded to two decimals, so no tiny float reaches Ink as 1e-16. */
function d(parts: TemplateStringsArray, ...v: number[]): string {
  return parts.reduce((out, part, i) => out + part + (i < v.length ? String(Math.round(v[i]! * 100) / 100) : ''), '');
}

/** True when the figure is worn to at least stage `n` (1 scuffed, 2 dented, 3 battered, 4 broken). */
export function worn(w: WearProps | undefined, n: 1 | 2 | 3 | 4): boolean {
  return w !== undefined && w.stage >= n;
}

/** True when the figure shows at least blood level `n` (1 slight, 2 more). */
export function bloody(w: WearProps | undefined, n: 1 | 2): boolean {
  return w !== undefined && w.blood >= n;
}

/** True when the figure was once broken and has healed: its headgear keeps the broken piece and its face a scar. */
export function scarred(w: WearProps | undefined): boolean {
  return w?.scarred === true;
}

/** True when headgear should show its broken piece: at the broken stage, or ever after once healed. */
export function helmBroken(w: WearProps | undefined): boolean {
  return worn(w, 4) || scarred(w);
}

// ---- scuffs and scratches ----

/** One straight scratch from (x1, y1) to (x2, y2). Pale by default; pass SCRATCH_DARK on light steel. */
export function scratch(ink: Ink, x1: number, y1: number, x2: number, y2: number, colour = SCRATCH, width = MARK_W): void {
  ink.line(x1, y1, x2, y2, colour, width);
}

/** Several scratches at once, each as [x1, y1, x2, y2]. */
export function scratches(ink: Ink, marks: readonly (readonly [number, number, number, number])[], colour = SCRATCH, width = MARK_W): void {
  for (const [x1, y1, x2, y2] of marks) scratch(ink, x1, y1, x2, y2, colour, width);
}

/** A dirt smudge centred on (x, y), about `w` wide: two soft overlapping blobs of mud. */
export function dirt(ink: Ink, x: number, y: number, w: number): void {
  ink.ellipse(x, y, w * 0.5, w * 0.24, DIRT, DIRT_OPACITY);
  ink.ellipse(x + w * 0.22, y - w * 0.12, w * 0.24, w * 0.16, DIRT, DIRT_OPACITY);
}

// ---- dents, nicks and cracks ----

/**
 * A dent in metal or wood at (x, y), radius r: a dark hollow. Pass `lip` (a lighter tone of the surface) for a lit
 * rim under it; leave it out on small parts, where a pale lip reads as a grin.
 */
export function dent(ink: Ink, x: number, y: number, r: number, lip?: string): void {
  ink.ellipse(x, y, r, r * 0.75, DENT, DENT_OPACITY);
  if (lip !== undefined) ink.stroke(d`M ${x - r * 0.8} ${y + r * 0.55} Q ${x} ${y + r * 1.25} ${x + r * 0.8} ${y + r * 0.55}`, lip, 0.7);
}

/** A crack: a jagged line through the points [x0, y0, x1, y1, ...]. */
export function crack(ink: Ink, pts: readonly number[], colour = CRACK, width = MARK_W): void {
  let path = '';
  for (let i = 0; i + 1 < pts.length; i += 2) path += (i === 0 ? 'M' : ' L') + d` ${pts[i]!} ${pts[i + 1]!}`;
  ink.stroke(path, colour, width);
}

/**
 * A notch in a blade drawn from (x1, y1) to (x2, y2) with half-width `half`: a dark bite into one edge at fraction
 * `t` along it. `side` 1 or -1 picks the edge; `size` is how far the bite reaches into the blade.
 */
export function bladeNotch(ink: Ink, x1: number, y1: number, x2: number, y2: number, t: number, side: 1 | -1, size = 1.2, half = 1.3): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy * side;
  const ny = ux * side;
  const cx = x1 + dx * t + nx * (half + 0.2);
  const cy = y1 + dy * t + ny * (half + 0.2);
  const b = size * 0.75;
  ink.poly([cx - ux * b, cy - uy * b, cx + ux * b, cy + uy * b, cx - nx * size, cy - ny * size], DENT, 0.85);
}

/**
 * A snapped end at (x, y) on a shaft or blade running in direction (dx, dy) and `width` across: a short jagged
 * point in the part's own colour, so the part ends in splinters instead of a clean cap.
 */
export function snappedEnd(ink: Ink, x: number, y: number, dx: number, dy: number, width: number, fill: string): void {
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const h = width / 2;
  const at = (a: number, s: number): [number, number] => [x + ux * a + nx * s, y + uy * a + ny * s];
  ink.poly([...at(-0.6, h), ...at(1.6, h * 0.7), ...at(0.5, h * 0.15), ...at(1.1, -h * 0.4), ...at(0.2, -h * 0.75), ...at(-0.6, -h)], fill);
}

// ---- shields and other discs ----

/** A piece cut out of a disc: between angles `from` and `to` (degrees, clockwise from +x as on screen) only
 * radius `inner` is left. `jag` roughens the broken edge. */
export interface Cut {
  from: number;
  to: number;
  inner: number;
  jag?: number;
}

const inCut = (a: number, c: Cut): boolean => {
  const norm = (v: number): number => ((v % 360) + 360) % 360;
  const s = norm(c.from);
  const e = norm(c.to);
  const x = norm(a);
  return s <= e ? x >= s && x <= e : x >= s || x <= e;
};

/**
 * A disc at (cx, cy) of radius r with pieces cut out of it. With no cuts it is exactly `ink.circle`, so a figure can
 * always draw its shield through this. `inset` pulls the cuts in further, for an inner layer: a shield's face drawn
 * with inset about 0.8 leaves its dark rim showing along every break.
 */
export function wornDisc(ink: Ink, cx: number, cy: number, r: number, fill: string, cuts: readonly Cut[] = [], inset = 0): void {
  if (cuts.length === 0) {
    ink.circle(cx, cy, r, fill);
    return;
  }
  const step = 7.5;
  const angles = new Set<number>();
  for (let a = 0; a < 360; a += step) angles.add(a);
  for (const c of cuts) {
    angles.add(((c.from % 360) + 360) % 360);
    angles.add(((c.to % 360) + 360) % 360);
  }
  const sorted = [...angles].sort((a, b) => a - b);
  const pts: number[] = [];
  const push = (a: number, rr: number): void => {
    const t = (a * Math.PI) / 180;
    pts.push(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr);
  };
  sorted.forEach((a, i) => {
    const cut = cuts.find((c) => inCut(a, c));
    if (!cut) {
      push(a, r);
      return;
    }
    const inner = Math.min(r, Math.max(0, cut.inner - inset));
    const jag = (cut.jag ?? 0) * (i % 2 === 0 ? 1 : -1);
    const atFrom = Math.abs(a - (((cut.from % 360) + 360) % 360)) < 1e-6;
    const atTo = Math.abs(a - (((cut.to % 360) + 360) % 360)) < 1e-6;
    // A sharp step at each end of the cut: full radius, then straight in to the broken edge (or back out).
    if (atFrom) push(a, r);
    push(a, Math.min(r, inner + jag));
    if (atTo) push(a, r);
  });
  ink.poly(pts, fill);
}

/**
 * A piece broken out of a part (a helmet's dome, a cap) drawn over it: the outline `pts` [x0, y0, x1, y1, ...] in the
 * `edge` colour, and inside it, pulled in toward its middle by `rim`, what shows underneath (hair, skin, lining).
 * Keep `pts` inside the part, over what lies beneath, so nothing floats past its silhouette.
 */
export function brokenPatch(ink: Ink, pts: readonly number[], under: string, edge: string, rim = 0.7): void {
  let cx = 0;
  let cy = 0;
  const n = pts.length / 2;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    cx += pts[i]! / n;
    cy += pts[i + 1]! / n;
  }
  const inner: number[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const dx = pts[i]! - cx;
    const dy = pts[i + 1]! - cy;
    const l = Math.hypot(dx, dy) || 1;
    const k = Math.max(0, l - rim) / l;
    inner.push(cx + dx * k, cy + dy * k);
  }
  ink.poly(pts, edge);
  ink.poly(inner, under);
}

// ---- cloth ----

/**
 * A frayed hem: `teeth` ragged tatters hanging below the edge at y, across x..x+w, in the cloth's colour. Longer
 * `drop` reads as more torn.
 */
export function frayedHem(ink: Ink, x: number, y: number, w: number, fill: string, teeth = 3, drop = 1.8): void {
  const tw = w / teeth;
  const pts: number[] = [x, y - 0.8];
  for (let i = 0; i < teeth; i++) {
    const long = i % 2 === 0 ? drop : drop * 0.6;
    pts.push(x + tw * (i + 0.45), y + long, x + tw * (i + 1), y);
  }
  pts.push(x + w, y - 0.8);
  ink.poly(pts, fill);
}

/**
 * A tear in cloth centred on (x, y), `w` wide and `h` tall: a jagged slit showing `under` (skin, or the cloth's
 * dark lining), with a dark lip along its left edge.
 */
export function tear(ink: Ink, x: number, y: number, w: number, h: number, under: string, lip: string): void {
  const hw = w / 2;
  const hh = h / 2;
  ink.poly([x - hw * 0.2, y - hh, x + hw * 0.5, y - hh * 0.3, x + hw, y + hh * 0.2, x + hw * 0.1, y + hh, x - hw, y + hh * 0.3, x - hw * 0.3, y - hh * 0.1], lip);
  ink.poly([x - hw * 0.05, y - hh * 0.7, x + hw * 0.45, y - hh * 0.15, x + hw * 0.7, y + hh * 0.2, x + hw * 0.05, y + hh * 0.7, x - hw * 0.6, y + hh * 0.25, x - hw * 0.1, y - hh * 0.05], under);
}

// ---- blood (dark and dull, never gore: a cut, a smear, a few drops and a pool on the ground) ----

/** A fresh cut on skin from (x1, y1) to (x2, y2): a short dark-red line. Drawn from the broken stage, blood or not. */
export function cut(ink: Ink, x1: number, y1: number, x2: number, y2: number, width = 0.9): void {
  ink.line(x1, y1, x2, y2, BLOOD, width);
}

/**
 * A healed scar starting at (x, y) and running `len` units in the direction (dx, dy), with `ticks` stitch marks across
 * it. Give it the same start, direction and length as the face's blood smear so the scar sits where the cut bled.
 */
export function scar(ink: Ink, x: number, y: number, dx: number, dy: number, len: number, ticks = 2): void {
  const l = Math.hypot(dx, dy);
  const ux = dx / l;
  const uy = dy / l;
  ink.line(x, y, x + ux * len, y + uy * len, SCAR, 1);
  for (let i = 1; i <= ticks; i++) {
    const t = (len * i) / (ticks + 1);
    const cx = x + ux * t;
    const cy = y + uy * t;
    ink.line(cx + uy * 0.8, cy - ux * 0.8, cx - uy * 0.8, cy + ux * 0.8, SCAR_DARK, 0.7);
  }
}

/** A drip running straight down `len` units from (x, y), narrowing, with a bead at its foot. */
export function bloodDrip(ink: Ink, x: number, y: number, len: number, w = 0.9): void {
  const h = w / 2;
  ink.shape(d`M ${x - h} ${y} L ${x + h} ${y} Q ${x + h * 0.4} ${y + len * 0.5} ${x + h * 0.5} ${y + len} L ${x - h * 0.5} ${y + len} Q ${x - h * 0.6} ${y + len * 0.5} ${x - h} ${y} Z`, BLOOD);
  ink.circle(x, y + len, h * 1.15, BLOOD);
}

/**
 * A smear of blood starting at (x, y) and trailing `len` units in the direction (dx, dy), `w` wide at its start and
 * tapering to a point, with a small lighter fleck near the start.
 */
export function bloodSmear(ink: Ink, x: number, y: number, dx: number, dy: number, len: number, w = 1.8): void {
  const l = Math.hypot(dx, dy);
  const ux = dx / l;
  const uy = dy / l;
  const nx = -uy;
  const ny = ux;
  const h = w / 2;
  const ex = x + ux * len;
  const ey = y + uy * len;
  const bx = x - ux * h;
  const by = y - uy * h;
  ink.shape(
    d`M ${x + nx * h} ${y + ny * h} Q ${x + ux * len * 0.55 + nx * h * 0.8} ${y + uy * len * 0.55 + ny * h * 0.8} ${ex} ${ey}` +
      d` Q ${x + ux * len * 0.5 - nx * h * 0.9} ${y + uy * len * 0.5 - ny * h * 0.9} ${x - nx * h} ${y - ny * h}` +
      d` Q ${bx - nx * h} ${by - ny * h} ${bx} ${by} Q ${bx + nx * h} ${by + ny * h} ${x + nx * h} ${y + ny * h} Z`,
    BLOOD,
  );
  ink.circle(x + ux * len * 0.15 - nx * h * 0.2, y + uy * len * 0.15 - ny * h * 0.2, h * 0.42, BLOOD_LIGHT);
}

/** A single falling drop at (x, y) of radius s, its point upward. */
export function bloodDrop(ink: Ink, x: number, y: number, s = 0.8): void {
  ink.shape(d`M ${x} ${y - s * 2.2} Q ${x + s * 1.05} ${y - s * 0.7} ${x + s} ${y} Q ${x} ${y + s * 1.35} ${x - s} ${y} Q ${x - s * 1.05} ${y - s * 0.7} ${x} ${y - s * 2.2} Z`, BLOOD);
}

/** A drop fallen on the ground at (x, y): a small flat splash. */
export function bloodSpot(ink: Ink, x: number, y: number, s = 1): void {
  ink.ellipse(x, y, s * 1.3, s * 0.55, BLOOD);
  ink.ellipse(x + s * 1.9, y + s * 0.15, s * 0.45, s * 0.22, BLOOD);
}

/** A pool of blood on the ground at (x, y), lobed and flat, with a few spatters around it. `s` scales it. */
export function bloodPool(ink: Ink, x: number, y: number, s = 1): void {
  ink.ellipse(x, y, s * 2.2, s * 0.85, BLOOD);
  ink.ellipse(x + s * 1.5, y + s * 0.35, s * 1.3, s * 0.6, BLOOD);
  ink.ellipse(x - s * 1.6, y - s * 0.15, s * 0.9, s * 0.45, BLOOD);
  ink.ellipse(x - s * 0.3, y - s * 0.2, s * 0.8, s * 0.3, BLOOD_LIGHT);
  ink.ellipse(x + s * 3.9, y - s * 0.3, s * 0.45, s * 0.24, BLOOD);
  ink.ellipse(x - s * 3.4, y + s * 0.55, s * 0.4, s * 0.22, BLOOD);
  ink.ellipse(x + s * 2.6, y + s * 1.25, s * 0.35, s * 0.2, BLOOD);
}
