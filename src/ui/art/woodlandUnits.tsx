import type { ReactElement } from 'react';
import { Ink } from './features';
import { SKIN } from './palette';
import { STEEL, STEEL_DARK, STRING, Shadow, WOOD, WOOD_DARK, dome, hand, head } from './units';
import type { FigureProps } from './units';

// The five Woodland Nations figures (rules 11), drawn like the others: feet near (0, 4), inside x -20..20 and
// y -36..8 (the War Chief, a champion, may reach y -40). The owner's colour is the breechcloth, sash and trim, so the
// two sides stay apart; the faction's own colours are forest green, red ochre and bone. Our own designs, kept to
// everyday Woodlands dress: no headdresses, pipes or sacred objects.

export type WoodlandFigure = 'skirmisher' | 'woodlandHunter' | 'warChief' | 'smokeKeeper' | 'trapper';

export const FOREST = '#2F5D3A';
export const FOREST_DARK = '#22452B';
export const OCHRE = '#A4452C';
export const BONE = '#E9E1CF';
const BUCK = '#C79A66';
const BUCK_DARK = '#A07445';
const MOCCASIN = '#8A6038';
const BLACK_HAIR = '#2B211C';
const FUR = '#7A5230';
const FUR_DARK = '#5C3D23';
const BRASS = '#D2A63C';
const CLAY = '#B5653A';
const CLAY_DARK = '#8F4E2C';
const SMOKE = '#C9CDD2';
const IRON = '#5E646B';
const ROPE = '#C2A170';

/** Buckskin leggings with a fringe down the outside and soft moccasins, a breechcloth and sash in the owner's colour. */
function leggings(ink: Ink, c: FigureProps['colour']): void {
  ink.rect(-4.6, -5, 3.4, 7.6, BUCK);
  ink.rect(1.2, -5, 3.4, 7.6, BUCK_DARK);
  for (const y of [-3.6, -1.6, 0.4]) { ink.line(-5.2, y, -4.4, y + 0.8, BUCK_DARK, 0.6); ink.line(5.2, y, 4.4, y + 0.8, BUCK_DARK, 0.6); }
  ink.rect(-5.2, 1.8, 4.2, 2.2, MOCCASIN, 1.1);
  ink.rect(1, 1.8, 4.2, 2.2, MOCCASIN, 1.1);
  // The breechcloth hangs front and back below the sash.
  ink.poly([-3, -6.4, 3, -6.4, 2.4, 1, -2.4, 1], c.main);
  ink.poly([0.4, -6.4, 3, -6.4, 2.4, 1, 0.6, 1], c.dark);
}

/** A bare-chested body over leggings: the torso and the sash, its tails falling at the left hip. */
function bareBody(ink: Ink, c: FigureProps['colour']): void {
  leggings(ink, c);
  ink.rect(-6.2, -17.4, 12.4, 12, SKIN, 3.4);
  ink.rect(2.6, -17.4, 3.6, 12, '#D9A577', 2);
  ink.rect(-6.4, -7.6, 12.8, 2.4, c.dark, 1.1);
  ink.poly([-6, -6, -4.2, -6, -5.4, -0.6, -7, -1], c.main);
  // A broad sash from the right shoulder to the left hip, so the owner's colour reads from afar.
  ink.poly([3.4, -17.4, 6.2, -17.4, 6.2, -15, -3.6, -5.4, -6.2, -5.4, -6.2, -7.8], c.main);
  ink.poly([4.6, -17.4, 6.2, -17.4, 6.2, -15, -3.6, -5.4, -4.8, -5.4], c.dark);
}

/** Straight black hair to the shoulders, under a head at (x, y). */
function longHair(ink: Ink, x: number, y: number): void {
  ink.shape(`M ${x - 6.8} ${y + 4} C ${x - 8} ${y - 9.6} ${x + 8} ${y - 9.6} ${x + 6.8} ${y + 4} L ${x + 5} ${y - 1} L ${x - 5} ${y - 1} Z`, BLACK_HAIR);
}

// ---- Skirmisher: buckskin leggings, breechcloth and sash, a short bow on the back, a ball-headed club ----

function skirmisher(p: FigureProps): ReactElement {
  const ink = new Ink();
  // The short bow slung on the back, its string across the shoulders.
  ink.stroke('M -9 -27 Q -15 -16 -9 -5', WOOD_DARK, 1.6);
  ink.line(-9, -27, -9, -5, STRING, 0.5);
  bareBody(ink, p.colour);
  longHair(ink, 0, -23);
  head(ink, 0, -22.4);
  // A headband in the owner's colour and one feather at the back of the head, tipped in ochre.
  ink.rect(-6.6, -26.2, 13.2, 1.8, p.colour.dark, 0.9);
  ink.shape('M -5.4 -26 C -9.6 -30.4 -10.6 -33.6 -9.6 -35.6 C -8 -33 -6.4 -30 -4.6 -26.6 Z', BONE);
  ink.shape('M -9.6 -35.6 C -10.4 -34.4 -10.4 -33.2 -9.8 -32.2 C -9 -33.4 -9.2 -34.6 -9.6 -35.6 Z', OCHRE);
  // The ball-headed club held forward in the right hand, the ball red ochre on dark wood.
  ink.line(8, -9.6, 13.4, -21, WOOD_DARK, 1.8);
  ink.circle(14.2, -22.8, 3.2, WOOD_DARK);
  ink.circle(13.6, -23.4, 2, WOOD);
  ink.line(9.8, -13.4, 11.4, -16.6, OCHRE, 1.9);
  ink.line(4.6, -14, 8, -10, SKIN, 3);
  hand(ink, 8.2, -9.6);
  return <g>{[<Shadow key="s" />, ...ink.items]}</g>;
}

// ---- Woodland Hunter: a long bow, a quiver of fletched arrows, a fur mantle, a green-brown hood ----

function woodlandHunter(p: FigureProps): ReactElement {
  const ink = new Ink();
  // The quiver on the back, three fletched arrows over the right shoulder.
  ink.poly([2.4, -26, 7.8, -28, 11.6, -12.6, 7.4, -11], FUR_DARK);
  for (const [x, y] of [[4, -31], [6, -32.2], [8, -31.4]] as const) {
    ink.line(x - 0.6, y + 4, x, y, WOOD, 0.8);
    ink.poly([x, y, x - 1.4, y - 2.2, x + 1.4, y - 2.2], OCHRE);
  }
  leggings(ink, p.colour);
  ink.rect(-6.4, -17.4, 12.8, 12.4, p.colour.main, 3.4);
  ink.rect(2.6, -17.4, 3.8, 12.4, p.colour.dark, 2);
  ink.rect(-6.6, -7.8, 13.2, 2.2, BUCK_DARK, 1);
  // The fur mantle over the shoulders.
  ink.shape('M -8.6 -16.6 C -8.6 -20 8.6 -20 8.6 -16.6 L 7.4 -12.8 L 4 -14.6 L 0 -12.6 L -4 -14.6 L -7.4 -12.8 Z', FUR);
  // A green-brown hood, falling to the shoulders.
  ink.circle(0, -22.6, 7.4, FOREST);
  ink.poly([-7, -21, -8.4, -15.8, -3, -18], FOREST_DARK);
  head(ink, 0, -21.8, 5.8);
  dome(ink, 0, -23.2, 6.2, FOREST);
  ink.line(-5.4, -24, 5.4, -24, FOREST_DARK, 0.9);
  // The long bow held upright in the left hand, taller than the hunter, an arrow along it.
  ink.stroke('M -12 -36 Q -19 -16 -12 4', WOOD_DARK, 2);
  ink.line(-12, -36, -12, 4, STRING, 0.55);
  ink.line(-12.6, -30, -12.6, -8, WOOD, 0.8);
  ink.poly([-12.6, -31.8, -11.4, -29.4, -13.8, -29.4], STEEL_DARK);
  ink.line(-5.4, -14, -12, -15, p.colour.main, 3);
  hand(ink, -12.6, -15);
  return <g>{[<Shadow key="s" />, ...ink.items]}</g>;
}

// ---- War Chief: a gunstock club with brass tacks and a steel spike, a scalplock, a tasselled trade-cloth shirt ----

function warChief(p: FigureProps): ReactElement {
  const ink = new Ink();
  // A powder-horn strap across the body, the horn at the left hip (drawn behind the arm).
  leggings(ink, p.colour);
  // Garters below the knee.
  ink.rect(-4.8, -1.6, 3.8, 1, OCHRE);
  ink.rect(1, -1.6, 3.8, 1, OCHRE);
  // The trade-cloth shirt in the owner's colour (the sides must read apart), tassels below its lower edge, open at the
  // chest to show a band of tattooed triangles.
  for (let x = -6.4; x <= 6.5; x += 1.6) ink.line(x, -6, x * 1.05, -3.2, p.colour.dark, 0.7);
  ink.rect(-7.2, -20.4, 14.4, 15, p.colour.main, 3.6);
  ink.rect(3, -20.4, 4.2, 15, p.colour.dark, 2);
  ink.poly([-2.6, -20.4, 2.6, -20.4, 1.6, -12, -1.6, -12], SKIN);
  for (const x of [-1.6, 0, 1.6]) ink.poly([x - 0.7, -18.6, x + 0.7, -18.6, x, -17.4], '#2F3A4A');
  ink.rect(-7.4, -7.6, 14.8, 2.4, OCHRE, 1.1);
  ink.poly([4.4, -6, 6.4, -6, 7.4, -0.4, 5.4, 0], OCHRE);
  ink.line(-6.4, -19.6, 5.6, -8.6, BUCK_DARK, 1.1);
  ink.shape('M 5 -9.6 C 8 -9 9.6 -7.4 9.2 -5.4 C 7.6 -6.6 6 -7.4 4.4 -7.8 Z', BONE);
  // The head: shaved, with a tall scalplock gathered at the crown and falling back, and a silver earring.
  head(ink, 0, -27.4, 6.8);
  ink.shape('M -1.6 -33.6 C -1.2 -38.6 2.2 -39.6 3 -36 C 4.6 -32 7 -28 9.4 -24.4 C 6.2 -26.6 3.6 -30 1.6 -33 Z', BLACK_HAIR);
  ink.circle(0.6, -34, 1.6, OCHRE);
  ink.circle(-6.4, -25, 1, STEEL);
  // The gunstock club held low in the right hand: dark wood with brass tacks.
  // A flat board: the shaft bends at an elbow into a head that flares toward its end, the inner edge scalloped up to a
  // hooked tip, a spike out of the outer edge just past the bend (the same outline as the 3D figure).
  ink.poly([8.3, -7.18, 9.11, -6.36, 13.89, -10.5, 14.47, -11.45, 18.41, -10.95, 14.99, -12.36, 15.99, -14.69, 17.84, -17.34, 19.88, -19.54, 17.7, -19.43, 15.71, -19.68, 13.71, -21.27, 14.45, -19.36, 14.68, -17.66, 14.42, -15.87, 13.72, -14.19, 12.97, -12.93, 12.26, -11.86, 11.76, -11.21, 8.94, -7.81], WOOD_DARK);
  for (const [x, y] of [[10.46, -8.56], [12.01, -10.11], [14.51, -13.60], [15.49, -15.63], [16.47, -17.66]] as const) ink.circle(x, y, 0.6, BRASS);
  ink.line(9.4, -6.6, 8.6, -4.6, BUCK_DARK, 0.8);
  ink.line(5.6, -16, 9.4, -8.6, p.colour.dark, 3.4);
  hand(ink, 9.8, -7.6);
  ink.line(-5.6, -16, -8, -8, p.colour.main, 3.4);
  hand(ink, -8.2, -7.8);
  return <g>{[<Shadow key="s" />, ...ink.items]}</g>;
}

// ---- Smoke Keeper: an older figure with a fringed shawl and a clay smoke bowl trailing wisps ----

function smokeKeeper(p: FigureProps): ReactElement {
  const ink = new Ink();
  // A long skirt-like wrap to the ankles in the owner's colour.
  ink.rect(-4.2, 0.6, 3.6, 3.2, MOCCASIN, 1.2);
  ink.rect(0.6, 0.6, 3.6, 3.2, MOCCASIN, 1.2);
  ink.rect(-6.4, -12, 12.8, 13.4, BUCK, 3);
  ink.rect(2.4, -12, 4, 13.4, BUCK_DARK, 2);
  // The fringed shawl over the shoulders in the owner's colour, an ochre stripe and a bone fringe.
  ink.shape('M -8.6 -18 C -9.6 -12 -9 -8.6 -7 -6.6 L 7 -6.6 C 9 -8.6 9.6 -12 8.6 -18 Z', p.colour.main);
  ink.shape('M 3 -18 L 8.6 -18 C 9.6 -12 9 -8.6 7 -6.6 L 3.4 -6.6 Z', p.colour.dark);
  ink.rect(-8.6, -11.6, 17.2, 1.4, OCHRE);
  for (let x = -6.6; x <= 6.6; x += 1.65) ink.line(x, -6.6, x, -4.8, BONE, 0.7);
  // Grey hair in two long braids, and a lined face.
  head(ink, 0, -23);
  ink.shape('M -6.6 -22 C -7.6 -31 7.6 -31 6.6 -22 C 4 -26 -4 -26 -6.6 -22 Z', '#B9B4AD');
  ink.line(-6, -21, -6.6, -12.6, '#B9B4AD', 1.8);
  ink.line(6, -21, 6.6, -12.6, '#B9B4AD', 1.8);
  ink.line(-2.6, -19.6, -1, -19.6, '#C9966B', 0.5);
  ink.line(1, -19.6, 2.6, -19.6, '#C9966B', 0.5);
  // The clay bowl held out in both hands, smoke rising and drifting.
  ink.ellipse(9.4, -12, 4.2, 2.4, CLAY);
  ink.ellipse(9.4, -12.8, 3.4, 1.2, CLAY_DARK);
  ink.circle(8, -14, 1.9, SMOKE);
  ink.circle(10.6, -17.6, 2.4, SMOKE);
  ink.circle(9, -21.6, 2, SMOKE);
  ink.circle(12, -24.8, 1.6, SMOKE);
  ink.circle(10.4, -28, 1.2, SMOKE);
  hand(ink, 6, -11.6);
  hand(ink, 12.6, -11.4);
  return <g>{[<Shadow key="s" />, ...ink.items]}</g>;
}

// ---- Trapper: a fur hat, coiled rope, a hide pack and a small iron trap at the belt ----

function trapper(p: FigureProps): ReactElement {
  const ink = new Ink();
  // The hide pack on the back.
  ink.rect(-11, -20, 7, 11, BUCK_DARK, 2);
  ink.rect(-11, -20, 7, 2.4, FUR, 1.2);
  leggings(ink, p.colour);
  ink.rect(-6.4, -17.4, 12.8, 12.4, p.colour.main, 3.4);
  ink.rect(2.6, -17.4, 3.8, 12.4, p.colour.dark, 2);
  ink.rect(-6.6, -7.8, 13.2, 2.2, BUCK_DARK, 1);
  ink.line(-6, -17, 5.8, -8, BUCK_DARK, 1.6);
  // Coiled rope over the shoulder.
  ink.circle(3.6, -13, 3.6, ROPE);
  ink.circle(3.6, -13, 2.2, BUCK);
  // The small iron trap at the belt: two jaws and a chain link.
  ink.stroke('M -4.4 -5.2 Q -2 -2.6 0.4 -5.2', IRON, 1.1);
  ink.stroke('M -4.4 -5.2 Q -2 -7.8 0.4 -5.2', IRON, 1.1);
  ink.circle(-2, -5.2, 0.7, IRON);
  head(ink, 0, -22.6);
  // The fur hat, round and deep, with a tail hanging at the back.
  dome(ink, 0, -23.6, 7.4, FUR);
  ink.rect(-7.6, -24.6, 15.2, 2.6, FUR_DARK, 1.2);
  ink.shape('M -7 -23.4 C -10 -21 -11 -17 -10.2 -14.2 C -8.6 -16 -7.4 -19 -6 -22.6 Z', FUR_DARK);
  // A walking staff in the left hand.
  ink.line(-9.4, -24, -11, 3.6, WOOD_DARK, 1.5);
  ink.line(-5.6, -15, -9.6, -11.6, p.colour.main, 3);
  hand(ink, -9.8, -11.6);
  return <g>{[<Shadow key="s" />, ...ink.items]}</g>;
}

export const WOODLAND_FIGURES: Record<WoodlandFigure, (p: FigureProps) => ReactElement> = {
  skirmisher, woodlandHunter, warChief, smokeKeeper, trapper,
};
