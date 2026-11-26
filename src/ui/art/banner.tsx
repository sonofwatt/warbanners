import type { ReactElement } from 'react';
import type { UnitTypeId } from '../../engine';
import { Emblem, EMBLEM_R, emblemPaint } from './emblems';
import { Ink } from './features';

// The war banner above a unit's head: a small flag in its owner's colour with the unit type's round emblem badge
// over its left end and the green health pips running out to its right, and the status marks round it (taunted and
// blinded to its left, the "new" glint or the hunker shield to its right, then a carried item's badge). Drawn in the
// figures' coordinates: feet near (0, 4), the centre of the tile's top face at the origin, the banner centred on
// x 0 above the tallest head. A hero's banner has a gold edge and a gold ring round its badge (the pennant stays on
// the figure too); an own hidden unit's banner carries a slashed eye after its badge: no enemy sees it unless one
// stands next to it.

/** The banner's middle, top to bottom; the marks beside it are centred on this line too. */
export const BANNER_MID = -44;
/** The banner's height (without its edge). */
export const BANNER_H = 10;
const EDGE = 0.8;
/** The emblem badge over the banner's left end: 1.6 times the banner's height across, its middle a little above the
 * banner's so its foot stays clear of the heads, and the gap before what follows it. */
export const BADGE_D = 1.6 * BANNER_H;
export const BADGE_Y = BANNER_MID - 1;
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
}

/** The banner over a unit: its emblem badge, one health pip per 5 health (full for health left), and its marks. */
export function WarBanner(p: WarBannerProps): ReactElement {
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
          {p.hero === true ? <circle cx={r2(bx)} cy={BADGE_Y} r={BADGE_D / 2 + 1.5} fill={GOLD} /> : null}
          <g transform={`translate(${r2(bx)} ${BADGE_Y}) scale(${r2(BADGE_D / 2 / EMBLEM_R, 10000)})`}>
            <Emblem type={p.type} paint={emblemPaint(p.colour)} small />
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
