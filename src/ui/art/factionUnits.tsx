import type { ReactElement } from 'react';
import type { UnitTypeId } from '../../engine';
import { Ink } from './features';
import { SKIN } from './palette';
import {
  BOOT,
  HAIR,
  MANE,
  SHARED_FIGURES,
  STEEL,
  STEEL_DARK,
  STRING,
  Shadow,
  WOOD,
  WOOD_DARK,
  dome,
  hand,
  head,
  horse,
  rider,
  standingBody,
} from './units';
import type { FigureProps } from './units';

// The four Spartan and four Mongol figures, drawn like the shared eight: feet
// near (0, 4), inside x -20..20 and y -36..8. The two champions, the King's
// Guard and the Khan's Guard, stand taller and may reach y -40. Everything in
// the owner's colour comes from props; `accent` is the faction's metal.

export type FactionFigure = 'hoplite' | 'kingsGuard' | 'piper' | 'scout' | 'horseArcher' | 'khansGuard' | 'skyCaller' | 'camp';

const BRONZE_RIM = '#8A6420';
const PIPE = '#EFE3C4';
const LEAF = '#5DB866';
const DUN = '#C3925A';
const DUN_DARK = '#9C6F3F';
const BLACK_HORSE = '#4A3B33';
const BLACK_HORSE_DARK = '#33281F';
const HORSE_HAIR = '#2A201B';
const PALE_HORSE = '#EAE3D6';
const PALE_HORSE_DARK = '#C7BDAC';
const PIEBALD = '#6B4A35';
const FELT = '#F2ECDD';
const FELT_DARK = '#D8CDB6';
const FUR = '#7A5230';

/** A round hoplite shield face-on at (x, y): a dark rim, the metal face and a boss. */
function roundShield(ink: Ink, x: number, y: number, r: number, metal: string): void {
  ink.circle(x, y, r, BRONZE_RIM);
  ink.circle(x, y, r - 1.1, metal);
}

// ---- Spartans ----

function hoplite(p: FigureProps): ReactElement {
  const ink = new Ink();
  // The long spear, held upright and a little forward, taller than the man.
  ink.line(12, 3.6, 14.4, -30, WOOD_DARK, 1.6);
  ink.poly([14.8, -36, 16.6, -30.2, 14.4, -28.6, 12.4, -30.6], STEEL_DARK);
  ink.poly([14.8, -36, 14.4, -28.6, 12.4, -30.6], STEEL);
  standingBody(ink, p.colour);
  hand(ink, 13, -11);
  head(ink, 0, -22.4);
  // A bronze helmet with cheek guards, and a horsehair crest arching front to back.
  ink.shape('M -9.4 -24.4 C -10 -36 7.6 -36 9.6 -27.6 C 6 -31.6 -4.6 -32.6 -6.4 -25 Z', p.colour.main);
  ink.shape('M -6.4 -25 C -4.6 -32.6 6 -31.6 9.6 -27.6 C 5.6 -29.4 -3 -30 -4.4 -25.4 Z', p.colour.dark);
  dome(ink, 0, -23.2, 7, p.accent);
  ink.rect(-7, -24.4, 2.8, 7.6, p.accent, 1.2);
  ink.rect(4.2, -24.4, 2.8, 7.6, p.accent, 1.2);
  ink.rect(-7, -25.2, 14, 1.4, BRONZE_RIM);
  // The great round shield with a lambda chevron in the owner's dark colour.
  roundShield(ink, -5.6, -9.6, 9.8, p.accent);
  ink.poly([-5.6, -17.2, 0.4, -3.6, -2.6, -3.6, -5.6, -11, -8.6, -3.6, -11.6, -3.6], p.colour.dark);
  return <g>{[<Shadow key="s" />, ...ink.items]}</g>;
}

function kingsGuard(p: FigureProps): ReactElement {
  const ink = new Ink();
  // The spear stands upright beside him, reaching higher than any foot soldier's.
  ink.line(13, -33.6, 13, 3.4, WOOD_DARK, 1.7);
  ink.poly([13, -40, 15.1, -34, 13, -32.2, 10.9, -34], STEEL_DARK);
  ink.poly([13, -40, 13, -32.2, 10.9, -34], STEEL);
  // A long cape in the owner's colour falls behind him to his heels.
  ink.shape('M -7 -21 C -12 -12 -14 -3 -13 2.6 L 13 2.6 C 13.4 -4 11.6 -13 7 -21 Z', p.colour.dark);
  ink.shape('M -7 -21 C -12 -12 -14 -3 -13 2.6 L -2 2.6 C -3 -6 -3 -14 0 -21 Z', p.colour.main);
  // Legs, boots, a kilt of the owner's colour and a bronze breastplate.
  ink.rect(-4.6, -5, 3.4, 7.5, SKIN);
  ink.rect(1.2, -5, 3.4, 7.5, SKIN);
  ink.rect(-5, 1.6, 4, 2.4, BOOT, 1);
  ink.rect(1, 1.6, 4, 2.4, BOOT, 1);
  ink.rect(-6.5, -10, 13, 6, p.colour.dark, 1.5);
  ink.rect(-6.5, -10, 11, 6, p.colour.main, 1.5);
  ink.rect(-6.8, -21.6, 13.6, 13, p.accent, 3.5);
  ink.rect(-6.8, -10.6, 13.6, 2, BRONZE_RIM, 1);
  ink.stroke('M -3.6 -17 Q -1.8 -14.6 0 -17 Q 1.8 -14.6 3.6 -17', BRONZE_RIM, 0.7);
  hand(ink, 13, -12.6);
  head(ink, 0, -26.6);
  // A crest worn side to side, the mark of a leader, over a bronze helmet.
  ink.shape('M -11.2 -31.2 C -10.4 -39.8 10.4 -39.8 11.2 -31.2 C 6.8 -33.4 -6.8 -33.4 -11.2 -31.2 Z', p.colour.main);
  ink.shape('M -11.2 -31.2 C -6.8 -33.4 6.8 -33.4 11.2 -31.2 C 7 -32 -7 -32 -11.2 -31.2 Z', p.colour.dark);
  dome(ink, 0, -27.4, 7, p.accent);
  ink.rect(-7, -28.6, 2.8, 7.6, p.accent, 1.2);
  ink.rect(4.2, -28.6, 2.8, 7.6, p.accent, 1.2);
  ink.rect(-7, -29.4, 14, 1.4, BRONZE_RIM);
  // A bronze shield on his left arm, with a boss in the owner's colour.
  roundShield(ink, -11.4, -11.6, 7.6, p.accent);
  ink.circle(-11.4, -11.6, 4.4, BRONZE_RIM);
  ink.circle(-11.4, -11.6, 3.4, p.accent);
  ink.circle(-11.4, -11.6, 1.8, p.colour.main);
  return <g>{[<Shadow key="s" />, ...ink.items]}</g>;
}

function piper(p: FigureProps): ReactElement {
  const ink = new Ink();
  // A short cloak hangs from his shoulders behind him, to the waist.
  ink.shape('M -7.4 -17.4 C -10.4 -14 -10.8 -9.6 -10 -6.8 L 10 -6.8 C 10.8 -9.6 10.4 -14 7.4 -17.4 Z', p.colour.dark);
  standingBody(ink, p.colour);
  ink.circle(-4.6, -15.6, 1.2, p.accent);
  ink.circle(4.6, -15.6, 1.2, p.accent);
  head(ink, 0, -23);
  // Short hair with a wreath of leaves.
  dome(ink, 0, -23.8, 6.7, HAIR);
  for (const [x, y] of [[-5.6, -25.4], [-3, -27.2], [0, -27.8], [3, -27.2], [5.6, -25.4]] as const) ink.ellipse(x, y, 1.6, 1, LEAF);
  // The double pipe: two reeds spreading from the lips, one in each hand, flared at the ends.
  ink.line(-0.6, -19.4, -4.6, -6.6, PIPE, 1.4);
  ink.line(0.6, -19.4, 4.6, -6.6, PIPE, 1.4);
  ink.poly([-4, -7.4, -5.4, -4.4, -6.8, -5.2, -5.8, -7.8], PIPE);
  ink.poly([4, -7.4, 5.4, -4.4, 6.8, -5.2, 5.8, -7.8], PIPE);
  ink.line(-6, -15.6, -3.4, -11.6, p.colour.main, 3);
  ink.line(6, -15.6, 3.4, -11.6, p.colour.dark, 3);
  hand(ink, -3.2, -11.4);
  hand(ink, 3.2, -11.4);
  // Two notes rise from the music.
  ink.circle(10.6, -24.6, 1.5, p.accent);
  ink.line(11.8, -24.8, 11.8, -31.2, p.accent, 0.8);
  ink.poly([11.8, -31.6, 14.6, -29.6, 11.8, -29.6], p.accent);
  ink.circle(14.8, -17.4, 1.3, p.accent);
  ink.line(15.8, -17.6, 15.8, -22.6, p.accent, 0.8);
  return <g>{[<Shadow key="s" />, ...ink.items]}</g>;
}

function scout(p: FigureProps): ReactElement {
  const ink = new Ink();
  // Crouched low: the back knee down, the front leg bent, ready to spring.
  ink.line(-5, -3, -7.4, 2.2, SKIN, 3.4);
  ink.line(4, -4.4, 7.2, -3, SKIN, 3.4);
  ink.line(7.2, -3, 6.8, 2.2, SKIN, 3.2);
  ink.rect(-10, 1.6, 4.4, 2.4, BOOT, 1);
  ink.rect(4.8, 1.6, 4.4, 2.4, BOOT, 1);
  ink.rect(-6.4, -12.6, 12.6, 10, p.colour.main, 3.5);
  ink.rect(-6.4, -5.2, 12.6, 2.6, p.colour.dark, 1.3);
  // The hooded cloak in the owner's dark colour, sweeping down his back.
  ink.shape('M -1 -22.6 C -9 -21 -12.6 -10 -13.4 2 L -6.6 0.6 C -6.6 -6 -5.6 -10 -1 -12.6 Z', p.colour.dark);
  ink.circle(1.6, -15.6, 6.6, p.colour.dark);
  ink.poly([-2.6, -20.4, -9.4, -24.6, -4.4, -16], p.colour.dark);
  head(ink, 2.2, -14.8, 5.4);
  dome(ink, 2.2, -15.8, 5.8, p.colour.dark);
  // A short dagger held low and forward.
  ink.line(9.4, -8.2, 15.4, -11.4, STEEL_DARK, 2);
  ink.line(9.4, -8.6, 15.2, -11.8, STEEL, 0.9);
  ink.line(8.6, -10, 9.8, -6.8, WOOD_DARK, 1.3);
  ink.line(4, -9, 8.4, -8.4, p.colour.main, 3);
  hand(ink, 8.8, -8.2);
  return <g>{[<Shadow key="s" />, ...ink.items]}</g>;
}

// ---- Mongols ----

/** A cap with a turned-up fur brim and a point of metal on top, on a head at (x, y). */
function steppeCap(ink: Ink, x: number, y: number, c: FigureProps['colour'], accent: string): void {
  dome(ink, x, y - 0.8, 5.8, c.dark);
  ink.poly([x - 1.6, y - 6.2, x, y - 10, x + 1.6, y - 6.2], accent);
  ink.rect(x - 6.2, y - 3, 12.4, 2.4, FUR, 1.2);
}

function horseArcher(p: FigureProps): ReactElement {
  const ink = new Ink();
  horse(ink, DUN, DUN_DARK, MANE);
  rider(ink, p.colour, p.colour.main);
  ink.rect(-5, -13.6, 10, 1.8, p.accent);
  head(ink, 0, -25.6, 5.4);
  steppeCap(ink, 0, -25.6, p.colour, p.accent);
  // Turned in the saddle, he draws the bow back over the horse's rump.
  ink.stroke('M -8.4 -30.8 Q -10.6 -30.6 -11.6 -28 Q -17.6 -17.4 -11.6 -6.8 Q -10.6 -4.2 -8.4 -4', WOOD_DARK, 1.8);
  ink.stroke('M -11.4 -28.4 L 1.8 -17.4 L -11.4 -6.4', STRING, 0.6);
  ink.line(-4.6, -17.4, -12.6, -17.4, p.colour.main, 3);
  ink.line(2, -17.4, -17.2, -17.4, WOOD, 0.9);
  ink.poly([-19.8, -17.4, -16.6, -18.9, -16.6, -15.9], STEEL_DARK);
  ink.poly([2.4, -17.4, 4.4, -19, 4.4, -15.8], p.accent);
  hand(ink, -13, -17.4);
  hand(ink, 1.6, -17.4);
  return <g>{[<Shadow key="s" wide />, ...ink.items]}</g>;
}

function khansGuard(p: FigureProps): ReactElement {
  const ink = new Ink();
  horse(ink, BLACK_HORSE, BLACK_HORSE_DARK, HORSE_HAIR);
  // Lamellar armour on the horse: rows of plates in the owner's colour.
  ink.shape('M -14 -8 C -13.4 -13.4 6 -14 9.4 -9.4 L 11 -2 L -14.2 -1.6 Z', p.colour.main);
  for (const y of [-9.4, -6.2, -3.2]) ink.rect(-14, y, 24.6, 1, p.colour.dark);
  ink.poly([5, -10, 10, -19.5, 13, -20.6, 14, -17, 11.4, -8], p.colour.main);
  ink.line(7.6, -12, 12.2, -17.6, p.colour.dark, 1);
  ink.rect(-14.2, -2.6, 25.2, 1.6, p.accent);
  // The standard: a tall lance hung with a tuft of horsehair below a gold ring,
  // held upright at his side behind the saddle.
  ink.line(-9, 0.4, -9, -34, WOOD_DARK, 1.6);
  ink.poly([-9, -40, -7.1, -34.4, -9, -32.8, -10.9, -34.4], STEEL);
  ink.rect(-10.8, -32.8, 3.6, 1.4, p.accent, 0.6);
  ink.shape('M -10.4 -31.4 L -7.6 -31.4 C -6.6 -27 -7.4 -23 -9 -19.6 C -9.6 -22 -10 -22 -11.2 -20.6 C -11.4 -22 -12 -22 -13 -21 C -12.4 -24.4 -11.6 -27.6 -10.4 -31.4 Z', HORSE_HAIR);
  // The rider sits tall in lamellar armour under a steel helmet with a spike.
  ink.rect(-1.6, -13, 4, 9.4, p.colour.dark, 2);
  ink.rect(-2, -5.4, 4.6, 2.2, BOOT, 1);
  ink.rect(-5.4, -23.6, 10.8, 12.6, p.colour.main, 3);
  for (const y of [-20.4, -17.4, -14.4]) ink.rect(-5.4, y, 10.8, 1, p.colour.dark);
  ink.rect(-5.4, -13, 10.8, 1.8, p.accent);
  head(ink, 0, -27.6, 5.4);
  ink.shape('M -6.4 -28.4 L -6.8 -23 L -4.6 -24 L -4.4 -28.8 Z', STEEL_DARK);
  ink.shape('M 6.4 -28.4 L 6.8 -23 L 4.6 -24 L 4.4 -28.8 Z', STEEL_DARK);
  ink.shape('M -6.2 -29.6 C -6 -34.4 -2 -36.4 0 -39.6 C 2 -36.4 6 -34.4 6.2 -29.6 Z', STEEL);
  ink.rect(-6.4, -30.6, 12.8, 1.6, p.accent);
  ink.line(-4, -17.4, -7.6, -15.4, p.colour.main, 3);
  hand(ink, -9, -15.4);
  return <g>{[<Shadow key="s" wide />, ...ink.items]}</g>;
}

function skyCaller(p: FigureProps): ReactElement {
  const ink = new Ink();
  // A piebald horse: pale, with big dark patches, so it never reads as the Knight's grey.
  horse(ink, PALE_HORSE, PALE_HORSE_DARK, PIEBALD);
  ink.ellipse(-9, -7.4, 4.6, 3.8, PIEBALD);
  ink.ellipse(3.6, -4.8, 3.4, 2.4, PIEBALD);
  ink.poly([7.4, -11.6, 10.4, -17.8, 12.6, -16.2, 10.6, -9.4], PIEBALD);
  ink.rect(-11.2, -1.2, 2.8, 3.6, PIEBALD, 1);
  // The staff, held up behind him and topped with a bronze mirror, flies three broad streamers back
  // over the horse's rump, clear of its head and of the rider.
  ink.line(-3.6, -9, -11.6, -31.4, WOOD_DARK, 1.6);
  ink.shape('M -12.2 -31.2 C -15.4 -31 -16 -27.4 -19.8 -26 C -15.8 -25.4 -14.2 -27.4 -11.6 -28.2 Z', p.accent);
  ink.shape('M -11.6 -28.4 C -14.8 -27 -15 -23.6 -19.2 -21.6 C -15.2 -21.4 -13.4 -23.6 -10.8 -25.4 Z', STRING);
  ink.shape('M -10.8 -25.6 C -13.6 -23.8 -13.4 -20.6 -17.4 -17.8 C -13.4 -18 -11.8 -20.6 -9.8 -22.6 Z', p.colour.main);
  ink.circle(-12, -32.6, 3.2, p.accent);
  ink.circle(-12, -32.6, 1.9, STRING);
  ink.circle(-12.6, -33.2, 0.8, p.accent);
  rider(ink, p.colour, p.colour.main);
  ink.rect(-5, -13.6, 10, 1.8, p.colour.dark);
  ink.line(-3, -17.6, -6.6, -18.6, p.colour.main, 3);
  hand(ink, -7.2, -18.8);
  head(ink, 0, -25.4, 5.4);
  // A wide felt hat with a low crown and a short fringe over the brow.
  ink.ellipse(0, -29.4, 10.6, 2.2, p.colour.dark);
  ink.shape('M -5 -29.2 C -5 -35.6 5 -35.6 5 -29.2 Z', p.colour.dark);
  ink.rect(-5, -31.4, 10, 1.4, p.accent);
  for (const x of [-4.4, -2.2, 0, 2.2, 4.4]) ink.line(x, -27.8, x, -26.8, p.colour.dark, 0.7);
  return <g>{[<Shadow key="s" wide />, ...ink.items]}</g>;
}

function camp(p: FigureProps): ReactElement {
  const ink = new Ink();
  // The draught pole runs forward from the cart.
  ink.line(10, -5, 19, -1.4, WOOD_DARK, 1.6);
  // The cart bed.
  ink.rect(-15, -8.4, 28, 3.4, WOOD_DARK, 1);
  ink.rect(-15, -8.4, 25, 2.4, WOOD, 1);
  // The round felt tent: walls, a domed roof, a painted door and roof bands.
  ink.rect(-12.4, -20.4, 24.8, 12.4, FELT, 1);
  ink.rect(4.4, -20.4, 8, 12.4, FELT_DARK, 1);
  ink.shape('M -13.6 -19.6 C -11 -31.6 11 -31.6 13.6 -19.6 Z', FELT);
  ink.shape('M 4.4 -28.4 C 9.6 -26.8 12.6 -23.6 13.6 -19.6 L 4.4 -19.6 Z', FELT_DARK);
  ink.rect(-13, -21, 26, 2, p.colour.dark, 1);
  ink.rect(-12.4, -12.6, 24.8, 1.2, p.colour.dark);
  ink.ellipse(0, -28.4, 3.4, 1.2, WOOD_DARK);
  ink.rect(-3.2, -17.6, 6.4, 9.6, WOOD_DARK, 0.8);
  ink.rect(-2.2, -16.8, 4.4, 8.8, p.colour.main, 0.6);
  ink.rect(-0.3, -16.8, 0.6, 8.8, p.accent);
  // The owner's pennant above the smoke hole.
  ink.line(0, -28.6, 0, -35.4, WOOD_DARK, 1);
  ink.poly([0.4, -35.6, 6, -33.6, 0.4, -31.6], p.colour.main);
  // Two big spoked wheels on one axle.
  for (const x of [-9.4, 8.6]) {
    ink.circle(x, -1.6, 5.4, WOOD_DARK);
    ink.circle(x, -1.6, 4, WOOD);
    ink.line(x - 3.6, -1.6, x + 3.6, -1.6, WOOD_DARK, 0.8);
    ink.line(x, -5.2, x, 2, WOOD_DARK, 0.8);
    ink.circle(x, -1.6, 1.3, p.accent);
  }
  return <g>{[<Shadow key="s" wide />, ...ink.items]}</g>;
}

export const FACTION_FIGURES: Record<FactionFigure, (p: FigureProps) => ReactElement> = {
  hoplite,
  kingsGuard,
  piper,
  scout,
  horseArcher,
  khansGuard,
  skyCaller,
  camp,
};

/** Every unit type's figure, shared and faction together. */
export const FIGURES: Record<UnitTypeId, (p: FigureProps) => ReactElement> = { ...SHARED_FIGURES, ...FACTION_FIGURES };
