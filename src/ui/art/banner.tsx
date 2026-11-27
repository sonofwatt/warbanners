import { useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { UnitTypeId } from '../../engine';
import { Emblem, EMBLEM_R, emblemPaint } from './emblems';
import { Ink } from './features';

// The war banner above a unit's head: a small flag in its owner's colour with the unit type's round emblem badge
// over its left end and the green health pips running out to its right, and the status marks round it (taunted and
// blinded to its left, the "new" glint or the hunker shield to its right, then a carried item's badge). A hero's
// banner has a gold edge and a gold ring round its badge (the pennant stays on the figure too); an own hidden unit's
// banner carries a slashed eye after its badge: no enemy sees it unless one stands next to it.
//
// WarBanner draws in its own frame, the flag centred on x 0 with its middle at BANNER_MID. BannerPlace then moves
// it (and the item badge with it) so the badge sits just behind the unit's head: centred over the head, low enough
// that the head hides about 5 percent of it. The head is not drawn over the badge: the badge has a head-shaped bite
// cut out of its foot, so whatever is drawn under the banner shows there (the svg figure, or in the 3D look the
// units canvas under the overlay svg). Each unit type's head, in each look, is in HEADS; when the unit hunkers the
// banner drops (and in the 3D look, where a rider hunches forward, moves) with the head.

/** The banner's middle, top to bottom; the marks beside it are centred on this line too. */
export const BANNER_MID = -44;
/** The banner's height (without its edge). */
export const BANNER_H = 10;
const EDGE = 0.8;
/** The emblem badge over the banner's left end: 1.3 times the banner's height across, its middle a little below the
 * banner's so the flag's foot is clear of the head that bites into the badge's, and the gap before what follows it. */
export const BADGE_D = 1.3 * BANNER_H;
export const BADGE_Y = BANNER_MID + 1;
const BADGE_GAP = 0.6;
/** The hidden eye's slot after the badge. */
const EYE_SLOT = 8.4;
/** The swallowtail cut in the banner's right end. */
const NOTCH = 2.4;
const END = 2.8;

const PIP_W = 3.4;
export const PIP_H = 3.4;
const PIP_GAP = 0.8;
const INSET = 0.9;
/** The top of the pips (they are centred on the banner's middle). */
export const PIP_Y = BANNER_MID - PIP_H / 2;
/** The spacing of the marks beside the banner, centre to centre. */
export const MARK_STEP = 7.6;
/** The radius of the round marks (taunted, blinded) and of the glint; the hunker shield is about as big. */
export const MARK_R = 3.4;
/** Where the "new" glint sits, right of the banner's right end. */
export const GLINT_GAP = 5;
const PIP_FULL = '#7BD957';
const PIP_EMPTY = '#5E5A52';
export const PLATE = '#2B2B2A';
/** The hidden eye's colour: a warm white, clear on every faction colour. */
export const GLYPH = '#FFF4DE';
const GOLD = '#FFDA4D';

const r2 = (v: number, k = 100): number => Math.round(v * k) / k;
const pipCount = (maxHp: number): number => Math.max(1, Math.ceil(maxHp / 5));
const pipsWidth = (maxHp: number): number => pipCount(maxHp) * PIP_W + (pipCount(maxHp) - 1) * PIP_GAP;
const bannerWidth = (maxHp: number, hidden: boolean): number => BADGE_D + BADGE_GAP + (hidden ? EYE_SLOT : 0) + pipsWidth(maxHp) + 2 * INSET + END;

/** The x of the banner's right end (its edge included), for a unit of this maximum health. */
export function bannerRight(maxHp: number, hidden = false): number {
  return bannerWidth(maxHp, hidden) / 2 + EDGE;
}

// ---- where the banner goes: behind the head ----

/** Which figures the banner stands over: the svg figures or the 3D ones (each has its own heads). */
export type Look = 'svg' | '3d';

/**
 * A head, in the figures' coordinates, standing: `x` its middle, `top` the top of its head and headgear (the
 * broad part: a thin spike, a plume tip or a camp's pennant is left out) and `r` the radius of the round of it
 * that bites into the badge.
 */
export interface Head { x: number; top: number; r: number }

/** The badge's outer radius as drawn: the disc's, out to the outside of its ink rim (2.3 emblem units more). */
export const BADGE_R = r2((BADGE_D / 2) * ((EMBLEM_R + 2.3) / EMBLEM_R));

/**
 * How far the head reaches up into the badge, from its foot as drawn. With the badge's radius of 6.94 and a head's of
 * 6 to 14 the head hides 4.9 to 5.8 percent of the badge (the catapult's stone, radius 4: 4.3); banner.test.tsx
 * works it out. Measured on screen, soft edges included, it is 5 to 7.5 percent.
 */
export const OVERLAP = 1.7;

const hd = (x: number, top: number, r = 7): Head => ({ x, top, r });

/**
 * The heads of the svg figures (art/units.tsx, art/factionUnits.tsx), measured from the drawings. The catapult has
 * no head: the stone in its cup stands for one.
 */
export const HEADS_SVG: Readonly<Record<UnitTypeId, Head>> = {
  warrior: hd(0, -30.2), spearman: hd(0, -30.4), swordsman: hd(1, -32.6), defender: hd(1, -31), archer: hd(0, -31.4),
  horseman: hd(0, -32.2, 6), knight: hd(0.5, -33.6, 6), catapult: hd(-12, -31.1, 4), sellsword: hd(0, -31.7, 9),
  hoplite: hd(0, -33.5, 9), kingsGuard: hd(0, -37.6, 11), piper: hd(0, -30.5), scout: hd(2.2, -22.2, 6),
  horseArcher: hd(0, -32.6, 6), khansGuard: hd(0, -37.4, 6), skyCaller: hd(0, -34, 10), camp: hd(0, -28.8, 14),
};

/**
 * The heads of the 3D figures (terrain3d/units/figures.ts) in their rest pose, as they come out on screen, measured
 * from renders. The trebuchet's head is the top of its arm.
 */
export const HEADS_3D: Readonly<Record<UnitTypeId, Head>> = {
  warrior: hd(0, -31.2), spearman: hd(0, -31.9), swordsman: hd(0, -33.6), defender: hd(1, -32.4), archer: hd(-0.5, -31),
  horseman: hd(0, -32.4, 6), knight: hd(0, -35, 6), catapult: hd(-4, -24.5, 6), sellsword: hd(0, -33.9, 9),
  hoplite: hd(0, -35, 8), kingsGuard: hd(0, -38.6, 11), piper: hd(0, -31.2), scout: hd(1, -22.2, 6),
  horseArcher: hd(0, -33.2, 6), khansGuard: hd(0, -36.4, 6), skyCaller: hd(0, -36.3, 10), camp: hd(0, -30.6, 14),
};

/**
 * The svg crouch (theme.css .unit-crouch.hunkered): the figure scaled by CROUCH_SX across and CROUCH_SY down about
 * the origin, then lowered CROUCH_DY. A head at (x, y) goes to (x * CROUCH_SX, y * CROUCH_SY + CROUCH_DY).
 */
export const CROUCH_SX = 1.06;
export const CROUCH_SY = 0.8;
export const CROUCH_DY = 0.8;

/**
 * How a 3D head moves when the unit hunkers (terrain3d/units/crouch.ts), measured from renders: foot figures sink,
 * riders hunch forward over the horse's neck, the scout and the siege engines barely move.
 */
export const HUNKER_3D: Readonly<Record<UnitTypeId, { dx: number; dy: number }>> = {
  warrior: { dx: 1, dy: 8.2 }, spearman: { dx: 1, dy: 8.3 }, swordsman: { dx: 1.5, dy: 8.9 }, defender: { dx: 1.5, dy: 8.3 },
  archer: { dx: -0.5, dy: 8.6 }, horseman: { dx: 7, dy: 5.4 }, knight: { dx: 8.5, dy: 7.4 }, catapult: { dx: 0, dy: 0 },
  sellsword: { dx: 1, dy: 8.2 }, hoplite: { dx: 1.5, dy: 8.8 }, kingsGuard: { dx: 2, dy: 9.4 }, piper: { dx: 1.5, dy: 8.3 },
  scout: { dx: 1, dy: 1.5 }, horseArcher: { dx: 8, dy: 5.9 }, khansGuard: { dx: 7, dy: 5.3 }, skyCaller: { dx: 9.5, dy: 6.8 },
  camp: { dx: 0, dy: 1.6 },
};

/** Where a unit's head is in a look, standing or hunkered. */
export function headOf(type: UnitTypeId, look: Look, hunkered = false): Head {
  if (look === '3d') {
    const h = HEADS_3D[type];
    if (!hunkered) return h;
    const m = HUNKER_3D[type];
    return { ...h, x: h.x + m.dx, top: h.top + m.dy };
  }
  const h = HEADS_SVG[type];
  return hunkered ? { ...h, x: h.x * CROUCH_SX, top: h.top * CROUCH_SY + CROUCH_DY } : h;
}

/** The badge's middle in the banner's own frame. */
export function badgeX(maxHp: number, hidden = false): number {
  return -bannerWidth(maxHp, hidden) / 2 + BADGE_D / 2;
}

/** How far BannerPlace moves the banner: its badge centred over the head, the head OVERLAP up into its foot. */
export function bannerShift(type: UnitTypeId, maxHp: number, hidden: boolean, look: Look, hunkered = false): { x: number; y: number } {
  const h = headOf(type, look, hunkered);
  return { x: r2(h.x - badgeX(maxHp, hidden)), y: r2(h.top + OVERLAP - BADGE_R - BADGE_Y) };
}

/**
 * The banner (and the item badge) moved behind the unit's head. A css transform, so a hunker eases it down with the
 * figure's crouch (theme.css .banner-place).
 */
export function BannerPlace(p: { type: UnitTypeId; maxHp: number; hidden?: boolean; look: Look; hunkered?: boolean; children?: ReactNode }): ReactElement {
  const s = bannerShift(p.type, p.maxHp, p.hidden === true, p.look, p.hunkered === true);
  return <g className="banner-place" data-banner-place={p.look} style={{ transform: `translate(${s.x}px, ${s.y}px)` }}>{p.children}</g>;
}

// ---- the hidden eye ----

/**
 * A small mark drawn into an 8 by 8 box centred on (cx, cy). Coordinates are written about the box's centre and moved
 * here, so the markup holds only absolute numbers.
 */
class At {
  constructor(private readonly ink: Ink, private readonly cx: number, private readonly cy: number) {}
  private xy(p: readonly number[]): number[] {
    return p.map((v, i) => v + (i % 2 === 0 ? this.cx : this.cy));
  }
  private d(path: string): string {
    let i = 0;
    return path.replace(/-?\d+(\.\d+)?/g, (v) => String(Math.round((Number(v) + (i++ % 2 === 0 ? this.cx : this.cy)) * 100) / 100));
  }
  poly(p: readonly number[], fill: string): this { this.ink.poly(this.xy(p), fill); return this; }
  rect(x: number, y: number, w: number, h: number, fill: string, rx?: number): this { this.ink.rect(x + this.cx, y + this.cy, w, h, fill, rx); return this; }
  circle(x: number, y: number, r: number, fill: string): this { this.ink.circle(x + this.cx, y + this.cy, r, fill); return this; }
  ellipse(x: number, y: number, rx: number, ry: number, fill: string): this { this.ink.ellipse(x + this.cx, y + this.cy, rx, ry, fill); return this; }
  line(x1: number, y1: number, x2: number, y2: number, stroke: string, w: number): this {
    this.ink.line(x1 + this.cx, y1 + this.cy, x2 + this.cx, y2 + this.cy, stroke, w);
    return this;
  }
  shape(path: string, fill: string): this { this.ink.shape(this.d(path), fill); return this; }
  stroke(path: string, stroke: string, w: number): this { this.ink.stroke(this.d(path), stroke, w); return this; }
}

/** The slashed eye on an own hidden unit's banner: its enemies see it only from next to it. */
function hiddenEye(g: At, fg: string, bg: string): void {
  g.shape('M -3.6 0 Q 0 -3.6 3.6 0 Q 0 3.6 -3.6 0 Z', fg);
  g.circle(0, 0, 1.4, bg);
  g.line(-3, 3, 3, -3, bg, 1.5);
  g.line(-3, 3, 3, -3, fg, 0.7);
}

// ---- the banner and its marks ----

/**
 * The badge with a head's bite out of its foot, as a clip path filled even-odd: a square round the whole emblem (its
 * top and weapon reach past the disc: the emblem box is 56 of the disc's 34 units up, 54 across) less the lens where
 * the head's round (radius `r`, its top OVERLAP above the badge's foot) overlaps the disc (or a hero's ring, radius
 * `outer`). Only the disc is bitten: a weapon hanging below it stays whole.
 */
export function badgeCut(bx: number, r: number, outer = BADGE_R): string {
  const half = (BADGE_D / 2) * (60 / EMBLEM_R);
  // A little past the drawn edge, so its soft edge goes too.
  const R = outer + 0.3;
  const d = BADGE_R - OVERLAP + r;
  const yi = (d * d + R * R - r * r) / (2 * d);
  const w = Math.sqrt(Math.max(0, R * R - yi * yi));
  const x = r2(bx);
  const y = r2(BADGE_Y + yi);
  return `M ${r2(x - half)} ${r2(BADGE_Y - half)} H ${r2(x + half)} V ${r2(BADGE_Y + half)} H ${r2(x - half)} Z `
    + `M ${r2(x - w)} ${y} A ${r} ${r} 0 0 1 ${r2(x + w)} ${y} A ${r2(R)} ${r2(R)} 0 0 1 ${r2(x - w)} ${y} Z`;
}

export interface WarBannerProps {
  type: UnitTypeId;
  colour: { main: string; dark: string };
  hp: number;
  maxHp: number;
  /** An own unit with nothing left to do this turn: the banner darkens with the figure (theme.css .unit-shade). */
  spent: boolean;
  fresh: boolean;
  taunted: boolean;
  blinded: boolean;
  hunkered?: boolean;
  hero?: boolean;
  /** An own unit that enemies see only from next to it (the hidden trait): the slashed eye. Never set for an enemy. */
  hidden?: boolean;
  /** Whose head bites into the badge: the svg figure's (the default) or the 3D one's. */
  look?: Look;
}

/** The banner over a unit: its emblem badge, one health pip per 5 health (full for health left), and its marks. */
export function WarBanner(p: WarBannerProps): ReactElement {
  const cutId = `badge-cut${useId().replace(/[^\w-]/g, '')}`;
  const hidden = p.hidden === true;
  const total = pipCount(p.maxHp);
  const full = Math.min(total, Math.max(0, Math.ceil(p.hp / 5)));
  const w = bannerWidth(p.maxHp, hidden);
  const left = -w / 2;
  const right = w / 2;
  const top = BANNER_MID - BANNER_H / 2;
  const bottom = BANNER_MID + BANNER_H / 2;
  const flag = (l: number, t: number, r: number, b: number, notch: number): string =>
    `M ${l + 1.4} ${t} L ${r} ${t} L ${r - notch} ${BANNER_MID} L ${r} ${b} L ${l + 1.4} ${b} Q ${l} ${b} ${l} ${b - 1.4} L ${l} ${t + 1.4} Q ${l} ${t} ${l + 1.4} ${t} Z`;
  // The badge's middle; the flag starts under it, so its left end is hidden behind the badge.
  const bx = left + BADGE_D / 2;
  const body = new Ink();
  // The edge: the owner's dark colour, gold for a hero.
  body.shape(flag(bx - EDGE, top - EDGE, right + EDGE, bottom + EDGE, NOTCH), p.hero === true ? GOLD : p.colour.dark);
  body.shape(flag(bx, top, right, bottom, NOTCH), p.colour.main);
  const after = left + BADGE_D + BADGE_GAP;
  const eye = new Ink();
  if (hidden) hiddenEye(new At(eye, after + EYE_SLOT / 2, BANNER_MID), GLYPH, p.colour.main);
  const pw = pipsWidth(p.maxHp);
  const px = after + (hidden ? EYE_SLOT : 0);
  body.rect(px, PIP_Y - INSET, pw + 2 * INSET, PIP_H + 2 * INSET, PLATE, 1.2);
  const pips: ReactElement[] = [];
  for (let i = 0; i < total; i++) {
    const on = i < full;
    pips.push(
      <rect
        key={`p${i}`}
        data-pip={on ? 'full' : 'empty'}
        x={Math.round((px + INSET + i * (PIP_W + PIP_GAP)) * 100) / 100}
        y={PIP_Y}
        width={PIP_W}
        height={PIP_H}
        rx={0.8}
        fill={on ? PIP_FULL : PIP_EMPTY}
      />,
    );
  }
  // Marks sit in a row to the left of the banner, the "new" spark or the hunker shield to its right. They keep
  // their own colours when the unit is spent, so they read the same on a dark banner.
  const mid = BANNER_MID;
  let x = left - EDGE - 4.4;
  const marks = new Ink();
  if (p.taunted) {
    // A red badge with an exclamation mark: this unit has been provoked.
    marks.circle(x, mid, MARK_R, '#E0563F');
    marks.rect(x - 0.6, mid - 2.2, 1.2, 2.8, '#FFFFFF', 0.5);
    marks.circle(x, mid + 1.8, 0.7, '#FFFFFF');
    x -= MARK_STEP;
  }
  if (p.blinded) {
    // A grey badge with a shut eye: this unit cannot see far.
    marks.circle(x, mid, MARK_R, '#6F6A80');
    marks.stroke(`M ${x - 2} ${mid - 0.5} Q ${x} ${mid + 1.5} ${x + 2} ${mid - 0.5}`, '#FFFFFF', 0.8);
    marks.line(x - 1, mid + 0.7, x - 1.5, mid + 1.9, '#FFFFFF', 0.5);
    marks.line(x + 1, mid + 0.7, x + 1.5, mid + 1.9, '#FFFFFF', 0.5);
  }
  const slot = right + EDGE + GLINT_GAP;
  if (p.fresh) marks.glint(slot, mid - 0.9, MARK_R, '#FFC93C');
  const shield = new Ink();
  if (!p.fresh && p.hunkered === true) {
    // A steel shield in the glint's slot (a hunkered unit is never fresh): this unit is dug in.
    const cx = slot;
    const t = mid - MARK_R;
    shield.shape(`M ${cx - 3} ${t} L ${cx + 3} ${t} L ${cx + 3} ${t + 2.8} Q ${cx + 3} ${t + 5.6} ${cx} ${t + 6.8} Q ${cx - 3} ${t + 5.6} ${cx - 3} ${t + 2.8} Z`, '#FFFFFF');
    shield.shape(`M ${cx - 2.2} ${t + 0.7} L ${cx + 2.2} ${t + 0.7} L ${cx + 2.2} ${t + 2.8} Q ${cx + 2.2} ${t + 5} ${cx} ${t + 5.9} Q ${cx - 2.2} ${t + 5} ${cx - 2.2} ${t + 2.8} Z`, '#7B8C9A');
    shield.line(cx, t + 1.4, cx, t + 5, '#FFFFFF', 0.6);
  }
  return (
    <g>
      <g className={p.spent ? 'unit-shade spent' : 'unit-shade'} data-banner={p.type} data-hero-banner={p.hero === true ? '' : undefined}>
        {body.items}
        <g data-glyph={p.type}>
          {/* The head's bite out of the badge's foot: what is under the banner (the head) shows there. */}
          <clipPath id={cutId}>
            <path d={badgeCut(bx, headOf(p.type, p.look ?? 'svg').r, p.hero === true ? BADGE_D / 2 + 1.5 : BADGE_R)} clipRule="evenodd" />
          </clipPath>
          <g clipPath={`url(#${cutId})`} data-badge-cut="">
            {p.hero === true ? <circle cx={r2(bx)} cy={BADGE_Y} r={BADGE_D / 2 + 1.5} fill={GOLD} /> : null}
            <g transform={`translate(${r2(bx)} ${BADGE_Y}) scale(${r2(BADGE_D / 2 / EMBLEM_R, 10000)})`}>
              <Emblem type={p.type} paint={emblemPaint(p.colour)} small />
            </g>
          </g>
        </g>
        {hidden ? <g data-hidden-eye="">{eye.items}</g> : null}
        {pips}
      </g>
      {marks.items}
      {shield.items.length > 0 ? <g data-hunker-mark="">{shield.items}</g> : null}
    </g>
  );
}
