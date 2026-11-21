import type { ReactElement } from 'react';
import { Ink } from './features';
import { SKIN } from './palette';

// The eight unit figures every faction shares, and the status marks drawn
// above one. A figure stands with its feet near (0, 4), the centre of the
// tile's top face being the origin, and stays inside x -20..20, y -36..8.
// Everything in the owner's colour comes from props; the rest is neutral.

export interface FigureProps {
  colour: { main: string; dark: string };
  accent: string;
}

export type SharedFigure = 'warrior' | 'spearman' | 'swordsman' | 'defender' | 'archer' | 'horseman' | 'knight' | 'catapult' | 'sellsword';

const EYE = '#3A2A1E';
export const HAIR = '#5B3A22';
export const BOOT = '#6B4A2B';
export const WOOD = '#9C6B3E';
export const WOOD_DARK = '#6B4A2B';
export const STEEL = '#D5DAE0';
export const STEEL_DARK = '#9AA2AC';
const STONE = '#8F8A80';
const HORSE = '#8B5A33';
const HORSE_DARK = '#6B4226';
export const MANE = '#4A2E1A';
const GREY_HORSE = '#D2CBBF';
const GREY_HORSE_DARK = '#A9A194';
export const STRING = '#F2ECDD';

/** The soft blob under a figure: black at 18%. */
export function Shadow(p: { wide?: boolean }): ReactElement {
  return p.wide ? (
    <ellipse cx={0} cy={4.2} rx={16} ry={3.4} fill="#000000" fillOpacity={0.18} />
  ) : (
    <ellipse cx={0.5} cy={4.2} rx={9} ry={2.8} fill="#000000" fillOpacity={0.18} />
  );
}

// ---- shared parts (the faction figures use them too) ----

/** Legs, boots and a tunic in the owner's colour with a darker hem. */
export function standingBody(ink: Ink, c: FigureProps['colour']): void {
  ink.rect(-4.6, -3, 3.4, 5.5, SKIN);
  ink.rect(1.2, -3, 3.4, 5.5, SKIN);
  ink.rect(-5, 1.6, 4, 2.4, BOOT, 1);
  ink.rect(1, 1.6, 4, 2.4, BOOT, 1);
  // The tunic, its right side in shade.
  ink.rect(-6.5, -17, 13, 15, c.dark, 3.5);
  ink.rect(-6.5, -17, 11, 15, c.main, 3.5);
  ink.rect(-6.5, -5, 13, 3, c.dark, 1.5);
}

/** A big round head with two dot eyes, centred on (x, y). */
export function head(ink: Ink, x: number, y: number, r = 6.4): void {
  ink.circle(x, y, r, SKIN);
  ink.circle(x - r * 0.33, y + r * 0.1, r * 0.13, EYE);
  ink.circle(x + r * 0.33, y + r * 0.1, r * 0.13, EYE);
}

/** A rounded cap over the top half of a head of radius r at (x, y). */
export function dome(ink: Ink, x: number, y: number, r: number, fill: string): void {
  const k = r * 1.33;
  ink.shape(`M ${x - r} ${y} C ${x - r} ${y - k} ${x + r} ${y - k} ${x + r} ${y} Z`, fill);
}

export function hand(ink: Ink, x: number, y: number): void {
  ink.circle(x, y, 1.9, SKIN);
}

/** A blade from hilt (x1, y1) to point (x2, y2), with a crossguard. */
function sword(ink: Ink, x1: number, y1: number, x2: number, y2: number, guard: string): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  // Two-tone blade: shaded steel, its lit edge on the left.
  const lx = nx < 0 ? nx : -nx;
  const ly = nx < 0 ? ny : -ny;
  ink.line(x1, y1, x2, y2, STEEL_DARK, 2.6);
  ink.line(x1 + lx * 0.5, y1 + ly * 0.5, x2 + lx * 0.5, y2 + ly * 0.5, STEEL, 1.4);
  ink.line(x1 + nx * 2.6, y1 + ny * 2.6, x1 - nx * 2.6, y1 - ny * 2.6, guard, 1.4);
}

/** A four-legged horse facing right, its body centred near (-2, -6.5). */
export function horse(ink: Ink, coat: string, shade: string, mane: string): void {
  // Far legs first, a shade darker, then the near ones.
  ink.line(-7, -4, -8, 3, shade, 2.6);
  ink.line(7, -4, 8.6, 3, shade, 2.6);
  ink.line(-10.4, -4, -11.4, 3.4, coat, 2.6);
  ink.line(4, -4, 4.6, 3.6, coat, 2.6);
  for (const x of [-8.1, 8.7, -11.5, 4.7]) ink.rect(x - 1.4, 2.6, 2.8, 1.4, MANE, 0.6);
  ink.line(-13.4, -8, -17, -0.6, mane, 2.6);
  ink.ellipse(-2, -6.5, 12.5, 6, coat);
  ink.poly([5, -10, 10, -19.5, 13.6, -21, 14.6, -16.6, 11.4, -6], coat);
  ink.poly([10.6, -21, 14, -23, 19.6, -18, 19, -15.4, 16.4, -15.2, 12.4, -15.6], coat);
  ink.poly([12, -21.6, 12.6, -25.6, 14.4, -22.6], coat);
  ink.poly([5, -10.6, 9.6, -19.8, 11.6, -21, 10.8, -18.6, 7, -10], mane);
  ink.circle(15.2, -19.6, 0.8, EYE);
}

/** The rider's seat: a leg over the near flank and a torso. */
export function rider(ink: Ink, c: FigureProps['colour'], torso: string): void {
  ink.rect(-1.6, -12, 4, 8.4, c.dark, 2);
  ink.rect(-2, -5.4, 4.6, 2.2, BOOT, 1);
  ink.rect(-5, -21, 10, 11, torso, 3);
}

// ---- the eight ----

function warrior(p: FigureProps): ReactElement {
  const ink = new Ink();
  standingBody(ink, p.colour);
  // A short sword held low and forward in the right hand.
  sword(ink, 8.2, -9.5, 13.5, -19, WOOD_DARK);
  hand(ink, 8, -9);
  head(ink, 0, -23);
  // Shaggy hair and a headband in the owner's dark colour.
  ink.shape('M -6.6 -23.5 C -7.4 -32.5 7.4 -32.5 6.6 -23.5 L 5.2 -25.6 L 2.6 -24.6 L 0 -26 L -2.6 -24.6 L -5.2 -25.6 Z', HAIR);
  ink.rect(-6.6, -26.4, 13.2, 2, p.colour.dark, 1);
  // A small round wooden shield with an iron rim and a metal boss.
  ink.circle(-7, -9, 6, WOOD_DARK);
  ink.circle(-7, -9, 4.9, WOOD);
  ink.line(-7, -13.6, -7, -4.4, WOOD_DARK, 0.7);
  ink.circle(-7, -9, 1.7, p.accent);
  return <g>{[<Shadow key="s" />, ...ink.items]}</g>;
}

// A wandering sword for hire: a long cloak flaring behind him, a battered brimmed hat, a steel pauldron on one
// shoulder and a leather one on the other, a patched tunic, and a long blade held low in both hands.
function sellsword(p: FigureProps): ReactElement {
  const ink = new Ink();
  // The cloak hangs from his shoulders and flares back to the left, its hem ragged, a patch sewn on.
  ink.shape('M -5.6 -18.4 L 5.6 -18.4 L 7.4 0.4 L 3 1.4 L -0.4 0 L -4.4 1.8 L -8.4 0.2 L -13.2 1.6 L -11.6 -6 Z', p.colour.dark);
  ink.rect(-11.4, -4.6, 3.2, 3, p.colour.main, 0.6);
  standingBody(ink, p.colour);
  // A leather patch on the tunic and a belt with a buckle.
  ink.rect(-5, -14.2, 4.2, 4, WOOD, 0.8);
  ink.rect(-6.5, -7.6, 13, 2, BOOT, 0.6);
  ink.rect(-1, -7.8, 2.4, 2.4, p.accent, 0.5);
  // The cloak's collar, then two shoulders that do not match.
  ink.rect(-5.6, -19.4, 11.2, 3.2, p.colour.dark, 1.6);
  ink.ellipse(-6.4, -16.4, 3.8, 2.8, STEEL);
  ink.ellipse(-6.4, -15.6, 3.2, 1.6, STEEL_DARK);
  ink.ellipse(6.4, -16.4, 3.2, 2.4, WOOD);
  // The long blade, held low and forward in both hands, its point near the ground.
  ink.line(4, -13.8, 6.4, -11.4, WOOD_DARK, 1.8);
  sword(ink, 6.6, -11.2, 18.6, 1.8, p.accent);
  hand(ink, 5.2, -12.6);
  hand(ink, 7.4, -10.4);
  head(ink, 0, -23);
  // A short beard and a dented, broad-brimmed iron hat.
  ink.shape('M -5.4 -21 C -5 -15.4 5 -15.4 5.4 -21 L 3 -19.4 L -3 -19.4 Z', HAIR);
  dome(ink, 0, -26.2, 5.6, STEEL_DARK);
  ink.poly([1.4, -32.2, 3.4, -31.4, 2.4, -29.6], STEEL);
  ink.rect(-9.6, -27.4, 19.2, 2.2, STEEL, 1.1);
  return <g>{[<Shadow key="s" />, ...ink.items]}</g>;
}

function spearman(p: FigureProps): ReactElement {
  const ink = new Ink();
  // The tall spear stands beside him, upright.
  ink.line(10, -30, 10, 3.4, WOOD_DARK, 1.6);
  ink.poly([10, -36, 12, -30.4, 10, -28.6, 8, -30.4], STEEL_DARK);
  ink.poly([10, -36, 10, -28.6, 8, -30.4], STEEL);
  standingBody(ink, p.colour);
  hand(ink, 10, -11);
  head(ink, 0, -23);
  dome(ink, 0, -23.5, 6.9, p.accent);
  ink.rect(-6.9, -25, 13.8, 1.6, p.accent);
  // A tall oval shield: metal rim, owner's colour, a bar of metal down the middle.
  ink.ellipse(-6, -9, 5.8, 8.6, p.accent);
  ink.ellipse(-6, -9, 4.4, 7.2, p.colour.dark);
  ink.rect(-6.8, -15.4, 1.6, 12.8, p.accent, 0.8);
  return <g>{[<Shadow key="s" />, ...ink.items]}</g>;
}

function swordsman(p: FigureProps): ReactElement {
  const ink = new Ink();
  standingBody(ink, p.colour);
  // A sword raised in each hand, the blades making a V.
  ink.line(-5.4, -14.5, -9, -12, p.colour.main, 3);
  ink.line(5.4, -14.5, 9, -12, p.colour.main, 3);
  sword(ink, -9.4, -12.6, -15.5, -25, p.accent);
  sword(ink, 9.4, -12.6, 15.5, -25, p.accent);
  hand(ink, -9.2, -12.2);
  hand(ink, 9.2, -12.2);
  head(ink, 0, -22.4);
  // A steel helmet with cheek guards and a tall plume in the metal colour, front to back.
  ink.shape('M -2 -29 C -1.4 -35.4 7 -36 9.8 -27.6 C 6.6 -31.6 2.6 -32.2 1.6 -28.8 Z', p.accent);
  ink.shape('M -7 -21 C -7.6 -32.5 7.6 -32.5 7 -21 L 5.2 -20.4 L 4.8 -24.2 L -4.8 -24.2 L -5.2 -20.4 Z', STEEL);
  ink.rect(-7, -25.4, 14, 1.4, STEEL_DARK);
  return <g>{[<Shadow key="s" />, ...ink.items]}</g>;
}

function defender(p: FigureProps): ReactElement {
  const ink = new Ink();
  standingBody(ink, p.colour);
  hand(ink, 7.4, -10);
  head(ink, 1, -23.4);
  // A round steel helmet with a nose guard.
  dome(ink, 1, -24, 7, STEEL);
  ink.rect(0.2, -25, 1.6, 4.4, STEEL_DARK, 0.6);
  // The tower shield covers him from chin to ankle.
  ink.rect(-11, -19.5, 16.5, 22, p.colour.dark, 2.6);
  ink.rect(-9.6, -18.1, 13.7, 19.2, p.colour.main, 1.8);
  ink.rect(-9.6, -10.2, 13.7, 2.4, p.accent);
  ink.rect(-3.9, -18.1, 2.4, 19.2, p.accent);
  ink.circle(-2.7, -9, 2.6, p.accent);
  return <g>{[<Shadow key="s" />, ...ink.items]}</g>;
}

function archer(p: FigureProps): ReactElement {
  const ink = new Ink();
  // The quiver hangs on his back, two arrows showing over the right shoulder.
  ink.line(4.2, -27, 3, -31.4, WOOD, 0.9);
  ink.line(6.4, -27.8, 6.2, -32.4, WOOD, 0.9);
  ink.poly([3, -31.4, 1.4, -33.6, 4.2, -33.2], STRING);
  ink.poly([6.2, -32.4, 4.8, -34.8, 7.6, -34.6], STRING);
  ink.poly([2, -26.4, 7.6, -28.6, 12.4, -13, 7.8, -11.2], WOOD_DARK);
  ink.poly([2, -26.4, 7.6, -28.6, 8.2, -26.6, 2.8, -24.4], p.accent);
  standingBody(ink, p.colour);
  // A pointed hood in the owner's dark colour; the bowstring runs behind the face.
  ink.circle(0, -23, 7.4, p.colour.dark);
  ink.poly([-3.2, -29.6, 0.6, -34.4, 3.8, -29.4], p.colour.dark);
  ink.stroke('M -10.6 -27.5 L 1.4 -14 L -10.6 -0.5', STRING, 0.6);
  head(ink, -0.4, -22.2, 5.8);
  // The bow, drawn: bow arm out to the left, the arrow nocked at the chest.
  ink.line(-4.8, -14, -11.6, -14, p.colour.main, 3);
  ink.stroke('M -10.6 -27.5 Q -19.6 -14 -10.6 -0.5', WOOD_DARK, 1.9);
  ink.line(2, -14, -16.4, -14, WOOD, 0.9);
  ink.poly([-19.6, -14, -16, -15.6, -16, -12.4], STEEL_DARK);
  ink.poly([2.4, -14, 4.6, -15.8, 4.6, -12.2], p.accent);
  hand(ink, -12.6, -14);
  hand(ink, 1.6, -14);
  return <g>{[<Shadow key="s" wide />, ...ink.items]}</g>;
}

function horseman(p: FigureProps): ReactElement {
  const ink = new Ink();
  horse(ink, HORSE, HORSE_DARK, MANE);
  rider(ink, p.colour, p.colour.main);
  head(ink, 0, -25.6, 5.4);
  // A soft cloth cap with a falling tail, no armour.
  dome(ink, 0, -26.4, 5.8, p.colour.dark);
  ink.poly([3.4, -30, 8.4, -27.6, 5, -26.4], p.colour.dark);
  // A short spear held high in front of him, pointing forward.
  ink.line(2, -8, 12.4, -31.6, WOOD_DARK, 1.5);
  ink.poly([14.2, -36, 11, -32.4, 13.8, -31.2], STEEL);
  hand(ink, 5, -14.8);
  return <g>{[<Shadow key="s" wide />, ...ink.items]}</g>;
}

function knight(p: FigureProps): ReactElement {
  const ink = new Ink();
  horse(ink, GREY_HORSE, GREY_HORSE_DARK, GREY_HORSE_DARK);
  // A cloth in the owner's colour over the horse, with a scalloped hem and a metal band.
  ink.shape(
    'M -13.6 -9 C -13 -14 6 -14.5 9 -10 L 12 -1 L 9 0.4 L 6 -1 L 3 0.4 L 0 -1 L -3 0.4 L -6 -1 L -9 0.4 L -12 -1 L -14.2 0 Z',
    p.colour.main,
  );
  ink.poly([5, -10, 10, -19.5, 13, -20.6, 14, -17, 11, -4], p.colour.main);
  ink.rect(-13.6, -5.6, 24.2, 1.8, p.accent);
  // The rider in steel under a tabard, with a closed helm.
  rider(ink, p.colour, STEEL_DARK);
  ink.rect(-5, -18.6, 10, 8.6, p.colour.dark, 2.4);
  ink.shape('M -2.4 -31.6 C -2 -36 3.6 -36 4.8 -32.4 Z', p.accent);
  ink.rect(-5, -32, 10, 9.6, STEEL, 3);
  ink.rect(-5, -28.4, 10, 1.4, '#2B2B2A');
  ink.rect(-0.6, -26.2, 1.2, 3, STEEL_DARK);
  // A long lance couched under the arm and raised, passing above the horse's head so the head stays clear.
  ink.line(-12, -8, 16.2, -32.4, WOOD, 2);
  ink.poly([19.6, -35.4, 14.6, -32.6, 16.6, -30.2], STEEL_DARK);
  ink.poly([-4.2, -12.6, 0.2, -18.8, 2.4, -15.4], p.accent);
  hand(ink, -1, -17.2);
  return <g>{[<Shadow key="s" wide />, ...ink.items]}</g>;
}

function catapult(p: FigureProps): ReactElement {
  const ink = new Ink();
  // The far wheel and beam, then the A-frame, the arm, the near beam and wheel.
  ink.circle(11, -2.4, 4.4, WOOD_DARK);
  ink.rect(-14, -8, 27, 3, WOOD_DARK, 1);
  ink.poly([-4, -7, 0.6, -21, 2.8, -21, 7.6, -7, 5.2, -7, 1.7, -18, -1.6, -7], WOOD_DARK);
  // The throwing arm, raised back, with a stone in its cup.
  ink.line(9, -9, -11, -25, WOOD, 2.6);
  ink.circle(-12, -28.2, 2.9, STONE);
  ink.shape('M -15.8 -28 C -15.4 -23 -9.4 -22 -8 -26.8 Z', WOOD_DARK);
  ink.circle(1.7, -18.6, 1.6, p.accent);
  ink.rect(-15, -6, 27, 3.4, WOOD, 1);
  ink.circle(-8.6, -0.6, 4.6, WOOD_DARK);
  ink.circle(-8.6, -0.6, 3, WOOD);
  ink.circle(-8.6, -0.6, 1.2, p.accent);
  ink.circle(7.4, -0.6, 4.6, WOOD_DARK);
  ink.circle(7.4, -0.6, 3, WOOD);
  ink.circle(7.4, -0.6, 1.2, p.accent);
  // The owner's pennant on a pole at the back.
  ink.line(13.6, -5, 13.6, -30.4, WOOD_DARK, 1.2);
  ink.poly([14, -30.6, 20, -27.4, 14, -24.2], p.colour.main);
  ink.poly([14, -27.4, 20, -27.4, 14, -24.2], p.colour.dark);
  return <g>{[<Shadow key="s" wide />, ...ink.items]}</g>;
}

export const SHARED_FIGURES: Record<SharedFigure, (p: FigureProps) => ReactElement> = {
  warrior,
  spearman,
  swordsman,
  defender,
  archer,
  horseman,
  knight,
  catapult,
  sellsword,
};

// ---- status ----

const PIP_W = 4;
export const PIP_H = 2.6;
const PIP_GAP = 1;
export const PIP_Y = -42;
/** The spacing of the marks beside the plate, centre to centre. */
export const MARK_STEP = 7.6;
/** Where the "new" glint sits, right of the plate's right end. */
export const GLINT_GAP = 5;
const PIP_FULL = '#7BD957';
const PIP_EMPTY = '#5E5A52';
export const PLATE = '#2B2B2A';

const pipCount = (maxHp: number): number => Math.max(1, Math.ceil(maxHp / 5));
const plateWidth = (maxHp: number): number => pipCount(maxHp) * PIP_W + (pipCount(maxHp) - 1) * PIP_GAP;

/** The x of the pips' right end, for a unit of this maximum health; the plate is centred on x 0. */
export function plateRight(maxHp: number): number {
  return plateWidth(maxHp) / 2;
}

/**
 * Drawn above a figure: one health pip per 5 health, full for health left.
 * `spent` is not drawn here: the caller dims the whole figure.
 */
export function StatusOverlay(p: { hp: number; maxHp: number; spent: boolean; fresh: boolean; taunted: boolean; blinded: boolean }): ReactElement {
  const total = pipCount(p.maxHp);
  const full = Math.min(total, Math.max(0, Math.ceil(p.hp / 5)));
  const w = plateWidth(p.maxHp);
  const left = -w / 2;
  const ink = new Ink();
  ink.rect(left - 1.2, PIP_Y - 1.2, w + 2.4, PIP_H + 2.4, PLATE, 1.6);
  const pips: ReactElement[] = [];
  for (let i = 0; i < total; i++) {
    const on = i < full;
    pips.push(
      <rect
        key={`p${i}`}
        data-pip={on ? 'full' : 'empty'}
        x={left + i * (PIP_W + PIP_GAP)}
        y={PIP_Y}
        width={PIP_W}
        height={PIP_H}
        rx={0.8}
        fill={on ? PIP_FULL : PIP_EMPTY}
      />,
    );
  }
  // Marks sit in a row to the left of the plate, the "new" spark to its right.
  let x = left - 5.2;
  const marks = new Ink();
  if (p.taunted) {
    // A red badge with an exclamation mark: this unit has been provoked.
    marks.circle(x, PIP_Y + 1.3, 3.4, '#E0563F');
    marks.rect(x - 0.6, PIP_Y - 0.9, 1.2, 2.8, '#FFFFFF', 0.5);
    marks.circle(x, PIP_Y + 3.1, 0.7, '#FFFFFF');
    x -= MARK_STEP;
  }
  if (p.blinded) {
    // A grey badge with a shut eye: this unit cannot see far.
    marks.circle(x, PIP_Y + 1.3, 3.4, '#6F6A80');
    marks.stroke(`M ${x - 2} ${PIP_Y + 0.8} Q ${x} ${PIP_Y + 2.8} ${x + 2} ${PIP_Y + 0.8}`, '#FFFFFF', 0.8);
    marks.line(x - 1, PIP_Y + 2, x - 1.5, PIP_Y + 3.2, '#FFFFFF', 0.5);
    marks.line(x + 1, PIP_Y + 2, x + 1.5, PIP_Y + 3.2, '#FFFFFF', 0.5);
  }
  if (p.fresh) marks.glint(left + w + GLINT_GAP, PIP_Y + 0.4, 3.4, '#FFC93C');
  return (
    <g>
      {ink.items}
      {pips}
      {marks.items}
    </g>
  );
}
