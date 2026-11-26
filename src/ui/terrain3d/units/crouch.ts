// The hunker crouch of a 3D figure: a guard pose a unit takes while it is dug in (rules 7 hunker), eased in when it
// hunkers and out when it moves, acts or is attacked out of it. Pure maths, no three.js and no clock: the caller
// passes the time.
//
// A guard is a lowering of the whole body (the legs and feet stay on the ground, the shins tipping forward so the
// knees come out in front), a lean forward, and a turn and shift of each moving piece in the frame it was built in:
//
// - shield bearers bring the shield to the centre front and raise it, so the helmet just shows over the rim; the
//   spear slides up through the hand so its butt stays on the ground, angled out past the shield's edge;
// - foot units without a shield crouch low with the weapon held close (the archer's bow low and close, the
//   swordsman's blades crossed in front, the sellsword's blade upright before him);
// - riders hunch over the horse's neck, the horse lowers its head and settles on its legs;
// - the trebuchet locks its arm down and settles a little; the camp settles.
//
// Idle life goes on while crouched, smaller. A strike or a block plays on top of the guard (units3d.ts adds them).
import { ARM_L, ARM_R, BOW, FEET, LEGS, NECK, RIDER, SHIELD, WEAPON, WEAPON2 } from './figures';
import type { UnitType } from './figures';
import type { V3 } from './kit';

/** How long the crouch takes to ease in or out (ms). */
export const CROUCH_MS = 230;

/**
 * One piece's guard: a turn of `angle` radians about `axis` (in the frame the piece was built in; by default the
 * piece's own axis) and a shift (world units, in that frame).
 */
export interface PieceGuard { angle: number; shift: V3; axis?: V3 }

/** A figure's whole guard, at full crouch. */
export interface Guard {
  /** How far the body sinks (world units; the legs and feet stay on the ground). */
  drop: number;
  /** How far the body leans forward along its front (radians). */
  lean: number;
  /** A small settle in height (a fraction: 0.05 is 5 percent lower), for the siege engines. */
  squash: number;
  /** How much of the idle life is left at full crouch (0 to 1). */
  idle: number;
  /** The trebuchet arm's extra turn (radians, counterclockwise on screen; negative lowers the long end). */
  arm: number;
  pieces: Readonly<Record<string, PieceGuard>>;
}

const Z: V3 = [0, 0, 1];
const X: V3 = [1, 0, 0];
const NONE: V3 = [0, 0, 0];

/** How far a foot figure sinks: about a quarter of its height to the eyes. */
export const FOOT_DROP = 8;
/** The shins tip forward this far (radians) at full crouch, so the knees show in front of the tunic's hem. */
const KNEES = 1.3;

/** A foot figure's crouch: the body sinks by `drop`, the feet stay put and the shins tip forward. */
function foot(pieces: Record<string, PieceGuard>, o: { drop?: number; lean?: number; knees?: number; toes?: number } = {}): Guard {
  const drop = o.drop ?? FOOT_DROP;
  return {
    drop, lean: o.lean ?? 0.1, squash: 0, idle: 0.45, arm: 0,
    pieces: {
      [LEGS]: { angle: o.knees ?? KNEES, shift: [0, drop, 0] },
      [FEET]: { angle: 0, shift: [0, drop, o.toes ?? 2.2] },
      ...pieces,
    },
  };
}
/** A spear held upright: it slides up through the hand so its butt stays on the ground, and leans out a little. */
const spearUp = (drop: number, out: number, slide = 0): PieceGuard => ({ angle: -out, axis: Z, shift: [slide, drop - 0.6, 0] });

/** A rider's crouch: the body settles over its legs, the rider hunches forward, the horse lowers its head. */
function mounted(hunch = 0.42): Guard {
  return {
    drop: 1.8, lean: 0, squash: 0, idle: 0.45, arm: 0,
    pieces: {
      [LEGS]: { angle: 0, shift: [0, 1.8, 0] },
      [NECK]: { angle: -0.55, axis: Z, shift: [0, -0.8, 0] },
      [RIDER]: { angle: hunch, shift: [0, -1.2, 0] },
    },
  };
}

const GUARDS: Record<UnitType, Guard> = {
  // The shield bearers: the shield to the centre front, raised; the helmet just over its rim.
  hoplite: foot({
    [SHIELD]: { angle: 0.22, shift: [4.6, 13, 3.2] },
    [WEAPON]: spearUp(FOOT_DROP, 0.22, -1.0),
  }),
  spearman: foot({
    [SHIELD]: { angle: 0.22, shift: [6.4, 11, 2.6] },
    [WEAPON]: spearUp(FOOT_DROP, 0.2),
  }),
  kingsGuard: foot({
    [SHIELD]: { angle: 0.3, axis: X, shift: [10.4, 13, 2.4] },
    [WEAPON]: spearUp(FOOT_DROP, 0.2, -1.2),
  }),
  warrior: foot({
    [SHIELD]: { angle: 0.22, shift: [7.4, 13.5, 2.6] },
    [WEAPON]: { angle: 0.35, axis: Z, shift: [-1.0, 1.5, 1.0] },
  }),
  // The tower shield is already in front: brought to the middle and set down on the ground before him.
  defender: foot({
    [SHIELD]: { angle: 0.12, shift: [2.6, 4.2, 1.2] },
  }),
  // No shield: crouched low, the weapon held close.
  swordsman: foot({
    [ARM_R]: { angle: -0.55, shift: [-0.6, 0, 3.0] },
    [ARM_L]: { angle: 0.55, shift: [0.6, 0, 3.0] },
    [WEAPON]: { angle: 1.35, axis: Z, shift: NONE },
    [WEAPON2]: { angle: -1.35, axis: Z, shift: NONE },
  }),
  archer: foot({
    [BOW]: { angle: 0.85, axis: Z, shift: [3.0, -1.0, 2.0] },
  }),
  sellsword: foot({
    [WEAPON]: { angle: 2.2, axis: Z, shift: [-1.6, 0, 1.6] },
  }),
  piper: foot({}),
  // The scout already crouches: a little lower, the dagger drawn in.
  scout: foot({ [WEAPON]: { angle: 0.3, axis: Z, shift: [-1.6, 0, 0] } }, { drop: 2.6, lean: 0.06, knees: 0, toes: 0 }),
  // Riders.
  horseman: mounted(),
  knight: mounted(),
  horseArcher: mounted(),
  khansGuard: mounted(0.36),
  skyCaller: mounted(),
  // Siege and the camp: a small settle, nothing more.
  catapult: { drop: 0, lean: 0, squash: 0.05, idle: 0.45, arm: -0.45, pieces: {} },
  camp: { drop: 0, lean: 0, squash: 0.04, idle: 0.45, arm: 0, pieces: {} },
};

/** A figure's guard. */
export function guardOf(type: UnitType): Guard {
  return GUARDS[type];
}

/** The crouch of one unit: easing from `from` to `to` (0 standing, 1 crouched) over `ms` from `at`. */
export interface Crouch { from: number; to: number; at: number; ms: number }

/** A unit first seen: standing or crouched at once (it does not ease into a pose it already had). */
export function crouchNow(hunkered: boolean, nowMs: number): Crouch {
  const v = hunkered ? 1 : 0;
  return { from: v, to: v, at: nowMs, ms: 0 };
}

const smooth = (x: number): number => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** How far crouched the unit is at `nowMs` (0 standing, 1 crouched). */
export function crouchAt(c: Crouch, nowMs: number): number {
  if (!(c.ms > 0) || nowMs >= c.at + c.ms) return c.to;
  if (nowMs <= c.at) return c.from;
  return c.from + (c.to - c.from) * smooth((nowMs - c.at) / c.ms);
}

/**
 * Crouch (true) or stand (false), easing from wherever the figure is now over `ms` (CROUCH_MS, or 0 for at once:
 * reduced motion). A change half way through eases back from where it got to, over the part of the time it needs.
 */
export function crouchTo(c: Crouch, hunkered: boolean, nowMs: number, ms = CROUCH_MS): Crouch {
  const to = hunkered ? 1 : 0;
  const from = crouchAt(c, nowMs);
  if (from === to || !(ms > 0)) return { from: to, to, at: nowMs, ms: 0 };
  return { from, to, at: nowMs, ms: ms * Math.max(0.5, Math.abs(to - from)) };
}

/** Whether the crouch is still easing at `nowMs`. */
export function crouchBusy(c: Crouch, nowMs: number): boolean {
  return c.ms > 0 && nowMs < c.at + c.ms;
}
