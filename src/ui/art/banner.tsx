import type { ReactElement } from 'react';
import type { UnitTypeId } from '../../engine';
import { Ink } from './features';

// The war banner above a unit's head: a small flag in its owner's colour with the unit type's glyph on the left and
// the green health pips beside it, and the status marks round it (taunted and blinded to its left, the "new" glint
// or the hunker shield to its right, then a carried item's badge). Drawn in the figures' coordinates: feet near
// (0, 4), the centre of the tile's top face at the origin, the banner centred on x 0 above the tallest head.
// A hero's banner has a gold edge (the pennant stays on the figure too); an own hidden unit's banner carries a
// slashed eye after its glyph: no enemy sees it unless one stands next to it.

/** The banner's middle, top to bottom; the marks beside it are centred on this line too. */
export const BANNER_MID = -44;
/** The banner's height (without its edge). */
export const BANNER_H = 10;
const EDGE = 0.8;
/** The glyph's slot at the banner's left end, and the hidden eye's slot after it. */
const ICON_SLOT = 9.6;
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
/** The glyphs' colour: a warm white, clear on every faction colour. */
export const GLYPH = '#FFF4DE';
const GOLD = '#FFDA4D';

const pipCount = (maxHp: number): number => Math.max(1, Math.ceil(maxHp / 5));
const pipsWidth = (maxHp: number): number => pipCount(maxHp) * PIP_W + (pipCount(maxHp) - 1) * PIP_GAP;
const bannerWidth = (maxHp: number, hidden: boolean): number => ICON_SLOT + (hidden ? EYE_SLOT : 0) + pipsWidth(maxHp) + 2 * INSET + END;

/** The x of the banner's right end (its edge included), for a unit of this maximum health. */
export function bannerRight(maxHp: number, hidden = false): number {
  return bannerWidth(maxHp, hidden) / 2 + EDGE;
}

// ---- the glyphs ----

/**
 * One glyph, drawn into an 8 by 8 box centred on (cx, cy), in `fg` on a ground of `bg` (cut-outs are drawn in `bg`).
 * Coordinates are written about the box's centre and moved here, so the markup holds only absolute numbers.
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

type Glyph = (g: At, fg: string, bg: string) => void;

const horseHead = (g: At, fg: string, bg: string): void => {
  g.shape('M -3 4 L -2.6 0.6 Q -2.4 -2.6 0 -3.6 L 0.4 -4.4 L 1.2 -3.5 Q 2.8 -3 3.9 -0.6 L 3.6 0.8 L 2.2 0.9 Q 1 0.3 0.4 0.9 L 1.2 4 Z', fg);
  g.circle(1.3, -2, 0.5, bg);
  g.stroke('M -1.4 -2.9 Q -2.9 -1 -2.9 2.4', bg, 0.5);
};

/** One original glyph per unit type: what the unit fights with, or what it is. */
type WoodlandId = 'skirmisher' | 'woodlandHunter' | 'warChief' | 'smokeKeeper' | 'trapper';
const BASE_GLYPHS: Record<Exclude<UnitTypeId, WoodlandId>, Glyph> = {
  // A hand axe.
  warrior: (g, fg) => {
    g.line(-1, 4, -1, -3.6, fg, 1.2);
    g.shape('M -0.6 -3.6 L 1.8 -4.2 Q 4.4 -1.4 1.8 1.4 L -0.6 0.4 Z', fg);
  },
  // A spear, its leaf blade up.
  spearman: (g, fg) => {
    g.line(0, 4, 0, -1.4, fg, 1.1);
    g.poly([0, -4.4, 1.6, -1.8, 0, -0.6, -1.6, -1.8], fg);
    g.line(-1.3, -0.3, 1.3, -0.3, fg, 0.8);
  },
  // Two swords crossed, points up.
  swordsman: (g, fg) => {
    g.line(-2.6, 2.6, 3.2, -3.4, fg, 1.1);
    g.line(2.6, 2.6, -3.2, -3.4, fg, 1.1);
    g.line(-3, 0.6, -0.8, 2.8, fg, 0.9);
    g.line(3, 0.6, 0.8, 2.8, fg, 0.9);
    g.circle(-3.3, 3.3, 0.8, fg);
    g.circle(3.3, 3.3, 0.8, fg);
  },
  // A tall shield with a band down its middle.
  defender: (g, fg, bg) => {
    g.shape('M -3.2 -4 L 3.2 -4 L 3.2 1.2 Q 3.2 3.4 0 4.4 Q -3.2 3.4 -3.2 1.2 Z', fg);
    g.rect(-0.6, -3.2, 1.2, 6.6, bg, 0.4);
  },
  // A drawn bow with its arrow.
  archer: (g, fg) => {
    g.stroke('M -1.4 -4 Q 3.6 0 -1.4 4', fg, 1.1);
    g.line(-1.4, -4, -1.4, 4, fg, 0.5);
    g.line(-3.6, 0, 2.6, 0, fg, 0.8);
    g.poly([4.2, 0, 2.4, -1.3, 2.4, 1.3], fg);
    g.poly([-3.6, 0, -4.4, -1.2, -2.8, -0.3], fg);
    g.poly([-3.6, 0, -4.4, 1.2, -2.8, 0.3], fg);
  },
  horseman: horseHead,
  // A closed helm with a plume.
  knight: (g, fg, bg) => {
    g.poly([0.2, -3.4, 2.8, -4.6, 1.8, -2.6], fg);
    g.shape('M -3.2 4 L -3.2 -1.2 Q -3.2 -3.8 0 -3.8 Q 3.2 -3.8 3.2 -1.2 L 3.2 4 Z', fg);
    g.rect(-2.5, -1, 5, 1, bg, 0.3);
    g.line(0, 1.2, 0, 3, bg, 0.6);
  },
  // A throwing engine: base, wheels, frame and the arm with its stone.
  catapult: (g, fg) => {
    g.rect(-4, 1, 8, 1.4, fg, 0.4);
    g.circle(-2.4, 2.9, 1.1, fg);
    g.circle(2.4, 2.9, 1.1, fg);
    g.poly([-0.6, 1.2, 0.5, -1.2, 1.6, 1.2], fg);
    g.line(3, 1, -2.4, -2.6, fg, 1);
    g.circle(-2.8, -3.2, 1.2, fg);
  },
  // A round shield before a spear.
  hoplite: (g, fg, bg) => {
    g.line(-4, 4, 4, -4, fg, 0.9);
    g.circle(0, 0, 3.6, fg);
    g.circle(0, 0, 2.6, bg);
    g.circle(0, 0, 1.2, fg);
  },
  // A crown.
  kingsGuard: (g, fg, bg) => {
    g.shape('M -3.9 3 L -3.9 -2.6 L -1.9 -0.4 L 0 -3.8 L 1.9 -0.4 L 3.9 -2.6 L 3.9 3 Z', fg);
    g.circle(0, 1.4, 0.8, bg);
    g.circle(-2.4, 1.4, 0.55, bg);
    g.circle(2.4, 1.4, 0.55, bg);
  },
  // Twin pipes from one mouthpiece.
  piper: (g, fg, bg) => {
    g.line(-0.4, -3.6, -2.8, 3, fg, 1.2);
    g.line(0.4, -3.6, 2.8, 3, fg, 1.2);
    g.circle(-3, 3.4, 1, fg);
    g.circle(3, 3.4, 1, fg);
    g.rect(-0.9, -4.4, 1.8, 1.4, fg, 0.4);
    for (const t of [0.35, 0.6]) {
      g.circle(-0.4 - 2.4 * t, -3.6 + 6.6 * t, 0.3, bg);
      g.circle(0.4 + 2.4 * t, -3.6 + 6.6 * t, 0.3, bg);
    }
  },
  // A short dagger, point down: the Krypteia go unseen.
  scout: (g, fg) => {
    g.poly([0, 4.4, -1.2, -0.6, 1.2, -0.6], fg);
    g.line(-2.4, -1, 2.4, -1, fg, 1);
    g.line(0, -1.4, 0, -3.4, fg, 1.1);
    g.circle(0, -3.9, 0.8, fg);
  },
  // An arrow through a horseshoe.
  horseArcher: (g, fg) => {
    g.stroke('M -3 -1 Q -3.4 3.6 0 3.6 Q 3.4 3.6 3 -1', fg, 1.4);
    g.line(0, 2.6, 0, -2.8, fg, 0.8);
    g.poly([0, -4.4, -1.4, -2.4, 1.4, -2.4], fg);
    g.poly([0, 2.4, -1.2, 3.8, 0, 3.2], fg);
    g.poly([0, 2.4, 1.2, 3.8, 0, 3.2], fg);
  },
  // A horsetail standard: a spear point, a disc and the hanging tail.
  khansGuard: (g, fg) => {
    g.line(0, 4.2, 0, -2.4, fg, 0.9);
    g.poly([0, -4.6, 0.9, -2.6, -0.9, -2.6], fg);
    g.shape('M -2 -1.9 L 2 -1.9 Q 3 1.4 1.6 3.2 L 0 2.2 L -1.6 3.2 Q -3 1.4 -2 -1.9 Z', fg);
    g.ellipse(0, -2.1, 2.3, 0.7, fg);
  },
  // A storm cloud with its bolt.
  skyCaller: (g, fg) => {
    g.circle(-1.8, 0, 1.7, fg);
    g.circle(0.4, -1.4, 2.3, fg);
    g.circle(2.4, -0.1, 1.6, fg);
    g.rect(-3.5, -0.2, 7.5, 1.7, fg, 0.8);
    g.poly([0.9, 1.6, -0.8, 3.2, 0.2, 3.2, -0.6, 4.6, 1.8, 2.5, 0.8, 2.5, 1.6, 1.6], fg);
  },
  // A tent with its door.
  camp: (g, fg, bg) => {
    g.poly([-4, 3.8, 0, -3.8, 4, 3.8], fg);
    g.poly([-1.2, 3.8, 0, 0.6, 1.2, 3.8], bg);
    g.line(0, -3.8, 0, -4.6, fg, 0.6);
  },
  // A sword across a coin: a blade for hire.
  sellsword: (g, fg, bg) => {
    g.circle(0, 0.4, 3.5, fg);
    g.circle(0, 0.4, 2.5, bg);
    g.line(0, 3.6, 0, -2.8, fg, 1.1);
    g.poly([0, -4.6, -0.6, -2.8, 0.6, -2.8], fg);
    g.line(-1.8, 1.6, 1.8, 1.6, fg, 0.9);
  },
};

export const GLYPHS: Record<UnitTypeId, Glyph> = {
  ...BASE_GLYPHS,
  // stand-in until Tasks 15 and 16: the Woodland glyphs reuse existing ones
  skirmisher: BASE_GLYPHS.warrior, trapper: BASE_GLYPHS.warrior, woodlandHunter: BASE_GLYPHS.archer,
  warChief: BASE_GLYPHS.swordsman, smokeKeeper: BASE_GLYPHS.piper,
};

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

/** The banner over a unit: its glyph, one health pip per 5 health (full for health left), and its marks. */
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
  const body = new Ink();
  // The edge: the owner's dark colour, gold for a hero.
  body.shape(flag(left - EDGE, top - EDGE, right + EDGE, bottom + EDGE, NOTCH), p.hero === true ? GOLD : p.colour.dark);
  body.shape(flag(left, top, right, bottom, NOTCH), p.colour.main);
  const glyph = new Ink();
  GLYPHS[p.type](new At(glyph, left + ICON_SLOT / 2 + 0.2, BANNER_MID), GLYPH, p.colour.main);
  const eye = new Ink();
  if (hidden) hiddenEye(new At(eye, left + ICON_SLOT + EYE_SLOT / 2 - 0.4, BANNER_MID), GLYPH, p.colour.main);
  const pw = pipsWidth(p.maxHp);
  const px = left + ICON_SLOT + (hidden ? EYE_SLOT : 0);
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
        <g data-glyph={p.type}>{glyph.items}</g>
        {hidden ? <g data-hidden-eye="">{eye.items}</g> : null}
        {pips}
      </g>
      {marks.items}
      {shield.items.length > 0 ? <g data-hunker-mark="">{shield.items}</g> : null}
    </g>
  );
}
