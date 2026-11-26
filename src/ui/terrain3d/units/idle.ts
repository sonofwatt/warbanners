// Idle life for the 3D unit figures: a slow sway or breath for units at rest, a weight shift for mounts, the
// trebuchet's aim adjustments, and the trebuchet arm's swing during a lunge. Pure maths from a unit id and a time,
// no three.js and no clock: the caller passes the time, so the same inputs always give the same pose.
//
// Every motion is small: at most a few hundredths of a radian and under a world unit, so a figure never leaves its
// tile or its svg status plate.

/** How an idle figure moves. */
export type IdleKind = 'foot' | 'mounted' | 'siege' | 'none';

const MOUNTED = new Set(['horseman', 'knight', 'horseArcher', 'khansGuard', 'skyCaller']);

export function idleKind(type: string): IdleKind {
  if (type === 'camp') return 'none';
  if (type === 'catapult') return 'siege';
  return MOUNTED.has(type) ? 'mounted' : 'foot';
}

/** A well mixed integer hash of a unit id, in [0, 1). */
function unitHash(id: number, salt: number): number {
  let h = (Math.imul(id | 0, 0x9e3779b1) ^ Math.imul(salt | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Each unit's own place in the idle cycle, in [0, 2 pi), so neighbours never move in lockstep. */
export function idlePhase(id: number): number {
  return unitHash(id, 1) * Math.PI * 2;
}

/** Each unit's own pace: 0.85 to 1.15 times the base rate. */
export function idleRate(id: number): number {
  return 0.85 + 0.3 * unitHash(id, 2);
}

/**
 * One frame of idle motion, in figure space (feet at the origin): a tilt about the axis toward the viewer and a
 * turn about the vertical (radians), a bob and a sideways shift (world units), a breath (y scale minus 1), and the
 * trebuchet arm's offset from its cocked angle (radians).
 */
export interface IdlePose { tilt: number; yaw: number; bob: number; shift: number; breathe: number; arm: number }

export const REST: IdlePose = Object.freeze({ tilt: 0, yaw: 0, bob: 0, shift: 0, breathe: 0, arm: 0 });

/** The base sway period in seconds; each unit runs at its own idleRate. */
export const SWAY_PERIOD = 3.6;
/** A trebuchet changes its aim once in this many seconds (at its own rate), and rests in between. */
export const AIM_PERIOD = 7;
/** How long a trebuchet takes to swing to a new aim, in seconds; it holds still for the rest of the period. */
export const AIM_MOVE = 1.8;

const ease = (t: number): number => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/**
 * The idle pose of unit `id` of kind `kind` at time `t` (seconds), scaled by `weight` (0 still, 1 full), so a unit
 * that has just stopped moving eases back into its idle life.
 */
export function idlePose(kind: IdleKind, id: number, t: number, weight = 1): IdlePose {
  if (kind === 'none' || !(weight > 0)) return REST;
  const ph = idlePhase(id);
  const w = ((Math.PI * 2) / SWAY_PERIOD) * idleRate(id);
  const a = w * t + ph;
  if (kind === 'foot') {
    return { tilt: 0.022 * Math.sin(a) * weight, yaw: 0, bob: 0, shift: 0, breathe: 0.012 * Math.sin(2 * a + 0.7) * weight, arm: 0 };
  }
  if (kind === 'mounted') {
    // The horse shifts its weight from one side to the other, slowly, with a small rock and a breath.
    return {
      tilt: 0.014 * Math.sin(a * 0.8) * weight,
      yaw: 0,
      bob: 0.18 * Math.sin(2 * a * 0.8 + 1.1) * weight,
      shift: 0.35 * Math.sin(a * 0.5 + 0.4) * weight,
      breathe: 0.008 * Math.sin(2 * a + 0.3) * weight,
      arm: 0,
    };
  }
  // Siege: now and then it changes its aim, a small turn of the frame and a little play in the arm, then holds.
  const aim = aimAt(id, t);
  return { tilt: 0, yaw: aim.yaw * weight, bob: 0, shift: 0, breathe: 0, arm: aim.arm * weight };
}

/** The trebuchet's aim at time t: it eases from one held aim to the next at the start of each period. */
export function aimAt(id: number, t: number): { yaw: number; arm: number } {
  const period = AIM_PERIOD / idleRate(id);
  const x = t / period + unitHash(id, 3);
  const n = Math.floor(x);
  const into = (x - n) * period;
  const target = (k: number): { yaw: number; arm: number } => ({
    yaw: 0.07 * (unitHash(id, 100 + k) * 2 - 1),
    arm: 0.05 * (unitHash(id, 200 + k) * 2 - 1),
  });
  const from = target(n - 1), to = target(n);
  const s = ease(into / AIM_MOVE);
  return { yaw: from.yaw + (to.yaw - from.yaw) * s, arm: from.arm + (to.arm - from.arm) * s };
}

/** How far the trebuchet arm swings through on an attack, from cocked, in radians (counterclockwise on screen). */
export const ARM_SWING = 2.9;
/** Where in the lunge the arm reaches the top of its swing (the lunge's own furthest point is at 0.3). */
export const ARM_TOP = 0.28;

/**
 * The trebuchet arm's angle from cocked at lunge phase `p` (0 to 1; null when not lunging): it whips up and over,
 * shudders at the top, then is winched back to cocked by the end of the lunge.
 */
export function armSwing(p: number | null | undefined): number {
  if (p === null || p === undefined || !(p > 0) || p >= 1) return 0;
  if (p < ARM_TOP) { const x = p / ARM_TOP; return ARM_SWING * x * x; }
  if (p < 0.4) return ARM_SWING + 0.12 * Math.sin((Math.PI * (p - ARM_TOP)) / (0.4 - ARM_TOP));
  return ARM_SWING * (1 - ease((p - 0.4) / 0.6));
}

/** Whether the stone is still in the cup at lunge phase p: it leaves at the top of the swing and is back once cocked. */
export function stoneLoaded(p: number | null | undefined): boolean {
  if (p === null || p === undefined || !(p > 0) || p >= 1) return true;
  return p < ARM_TOP * 0.95 || p > 0.92;
}

/** How much idle motion a unit that stopped moving `sinceMs` ago has back: none at once, all after SETTLE_MS. */
export const SETTLE_MS = 450;
export function settleWeight(sinceMs: number): number {
  return ease(sinceMs / SETTLE_MS);
}
