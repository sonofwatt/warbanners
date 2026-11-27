// Which way a 3D unit figure faces. Pure maths, no three.js and no clock: the caller passes the time.
//
// Every figure is built in its rest pose, the three-quarter view (figures.ts turns its parts by STAND_YAW, MOUNT_YAW
// and RIDER_YAW). A unit shows that pose when it first appears and turns back to it when it hunkers. When it moves it
// turns to face the way it travels, and when it attacks it turns to face its target; it keeps that facing until its
// next move, attack or hunker. Facing is a turn of the whole figure about the vertical through its feet, its "yaw"
// from the rest pose (0 at rest), eased the short way round.
//
// Headings are world angles about the vertical: a figure whose front has heading h points along (sin h, 0, cos h) in
// world space, where +x is screen right and +z is toward the viewer (layout.ts). Heading 0 faces the viewer, pi faces
// away, pi/2 is a profile to the right of the screen.
import { SQUASH } from '../layout';
import { MOUNT_YAW, RIDER_YAW, STAND_YAW } from './figures';
import type { UnitType } from './figures';

/** How long a turn takes for a move or a hunker, and for an attack (quicker, so it is round before the lunge peaks). */
export const TURN_MS = 160;
export const AIM_TURN_MS = 120;

/**
 * The world heading of a move or an aim along the board vector (dx, dy) (board units: x right, y down the screen),
 * so that the figure's front, seen through the tilted camera, points along that vector on screen. Board y is the
 * ground depth squashed by SQUASH, so the depth is dy / SQUASH. Null for no vector.
 */
export function headingOf(dx: number, dy: number): number | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return null;
  return Math.atan2(dx, dy / SQUASH);
}

/**
 * Where a built figure's front points in its rest pose (world headings): `move` is the front that leads a move
 * (the body, the horse's head, the trebuchet's throwing side, the camp's draught pole), and `aim` is the one that
 * points at a target (a bow's arrow, a lance, a spear held forward). A part built facing +z under a turn of yaw a
 * has heading a; one facing +x has heading pi/2 + a; one facing -x has heading a - pi/2.
 */
export interface Fronts { move: number; aim: number }

const HALF = Math.PI / 2;
const stand: Fronts = { move: STAND_YAW, aim: STAND_YAW };
const horse = HALF + MOUNT_YAW;
const FRONTS: Record<UnitType, Fronts> = {
  warrior: stand, spearman: stand, swordsman: stand, defender: stand, sellsword: stand,
  hoplite: stand, kingsGuard: stand, piper: stand,
  // The archer walks body first and shoots side on: the arrow points along -x.
  archer: { move: STAND_YAW, aim: STAND_YAW - HALF },
  // The scout crouches side on, his dagger forward along +x.
  scout: { move: HALF + STAND_YAW, aim: HALF + STAND_YAW },
  // Riders: the horse's head leads; the spear or lance (along +x in the rider's turn) aims.
  horseman: { move: horse, aim: HALF + RIDER_YAW },
  knight: { move: horse, aim: HALF + RIDER_YAW },
  khansGuard: { move: horse, aim: horse },
  skyCaller: { move: horse, aim: horse },
  // The horse archer shoots back over the rump (his arrow along -x in the rider's turn).
  horseArcher: { move: horse, aim: RIDER_YAW - HALF },
  // The trebuchet throws toward -x (its pennant is at the back), turned by STAND_YAW * 0.6.
  catapult: { move: STAND_YAW * 0.6 - HALF, aim: STAND_YAW * 0.6 - HALF },
  // The camp rolls pole first (+x).
  camp: { move: HALF + STAND_YAW * 0.6, aim: HALF + STAND_YAW * 0.6 },
  // rules 11
  skirmisher: stand, trapper: stand, warChief: stand, smokeKeeper: stand,
  woodlandHunter: { move: STAND_YAW, aim: STAND_YAW - HALF },
};

export function frontsOf(type: UnitType): Fronts {
  return FRONTS[type];
}

/** An angle brought into (-pi, pi]. */
export function wrap(a: number): number {
  const t = Math.PI * 2;
  const r = a - t * Math.floor((a + Math.PI) / t);
  return r === -Math.PI ? Math.PI : r;
}

/** The yaw from rest that turns front `front` to heading `heading`. */
export const yawFor = (front: number, heading: number): number => wrap(heading - front);
/** The yaw that faces a move along (dx, dy), or null for no move. */
export function moveYaw(type: UnitType, dx: number, dy: number): number | null {
  const h = headingOf(dx, dy);
  return h === null ? null : yawFor(frontsOf(type).move, h);
}
/** The yaw that aims at a target (dx, dy) away, or null when it stands on the same point. */
export function aimYaw(type: UnitType, dx: number, dy: number): number | null {
  const h = headingOf(dx, dy);
  return h === null ? null : yawFor(frontsOf(type).aim, h);
}

/**
 * One turn of a figure: from yaw `from` to yaw `to` (already the short way round, so `to - from` is within pi),
 * starting at `at` (ms) and taking `ms`. Before `at` it holds `from`; after `at + ms` it holds `to`.
 */
export interface Turn { from: number; to: number; at: number; ms: number }

/** The rest facing: the three-quarter view the figure is built in. */
export const REST_TURN: Turn = Object.freeze({ from: 0, to: 0, at: -Infinity, ms: 0 });

const ease = (x: number): number => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** The yaw of a turn at time `now`. */
export function yawAt(t: Turn, now: number): number {
  if (!(t.ms > 0) || now >= t.at + t.ms) return t.to;
  if (now <= t.at) return t.from;
  return t.from + (t.to - t.from) * ease((now - t.at) / t.ms);
}

/** Whether a turn is still under way (or waiting to start) at `now`. */
export function turning(t: Turn, now: number): boolean {
  return t.ms > 0 && now < t.at + t.ms && t.from !== t.to;
}

/**
 * A new turn toward yaw `target`, from wherever the figure is at `now`, the short way round, starting at `at`
 * (default now) and taking `ms` (0 turns at once: reduced motion).
 */
export function turnTo(prev: Turn, target: number, now: number, ms: number, at = now): Turn {
  const from = wrap(yawAt(prev, now));
  const to = from + wrap(target - from);
  if (!(ms > 0)) return { from: to, to, at: now, ms: 0 };
  return { from, to, at: Math.max(now, at), ms };
}

/** A turn waiting its time: to yaw `yaw`, starting at `at`, taking `ms` (an attack later in a chain). */
export interface Pending { yaw: number; at: number; ms: number }

/**
 * A figure's facing: the turn under way and the turns queued after it, in time order. Each queued turn starts from
 * wherever the figure has got to when its time comes, so a chain of attacks faces each target in turn.
 */
export interface Facing { turn: Turn; queue: readonly Pending[] }

export const REST_FACING: Facing = Object.freeze({ turn: REST_TURN, queue: Object.freeze([]) as readonly Pending[] });

/** A facing held at yaw `yaw` (a unit seen again, as it was last seen). */
export const heldAt = (yaw: number): Facing => ({ turn: { from: yaw, to: yaw, at: -Infinity, ms: 0 }, queue: [] });

/** The facing at `now` with every queued turn whose time has come started (in order, each from where the last got to). */
export function settle(f: Facing, now: number): Facing {
  if (f.queue.length === 0 || f.queue[0]!.at > now) return f;
  let turn = f.turn;
  let i = 0;
  for (; i < f.queue.length && f.queue[i]!.at <= now; i++) {
    const p = f.queue[i]!;
    turn = turnTo(turn, p.yaw, p.at, p.ms);
  }
  return { turn, queue: f.queue.slice(i) };
}

/** The yaw at `now`, with queued turns taken into account. */
export const facingYaw = (f: Facing, now: number): number => yawAt(settle(f, now).turn, now);

/** Whether the facing is still turning, or has a turn queued, at `now`. */
export const facingBusy = (f: Facing, now: number): boolean => f.queue.length > 0 || turning(f.turn, now);

/** A new turn now that replaces anything queued (a move or a hunker is a new action: older aims are dropped). */
export function turnNow(f: Facing, yaw: number, now: number, ms: number): Facing {
  return { turn: turnTo(settle(f, now).turn, yaw, now, ms), queue: [] };
}

/**
 * Queue a turn to yaw `yaw` that should be round by `by` (a lunge's start): it starts `ms` before, but never before
 * now nor before the turns already under way or queued have finished, so each target of a chain is faced in order.
 * With no time (reduced motion) it still waits for its moment and then turns at once.
 */
export function queueTurn(f: Facing, yaw: number, now: number, ms: number, by: number): Facing {
  const s = settle(f, now);
  const last = s.queue.at(-1);
  const busyUntil = last !== undefined ? last.at + last.ms : s.turn.ms > 0 ? s.turn.at + s.turn.ms : now;
  const at = Math.max(now, by - ms, busyUntil);
  if (at <= now && s.queue.length === 0) return { turn: turnTo(s.turn, yaw, now, ms), queue: [] };
  return { turn: s.turn, queue: [...s.queue, { yaw, at, ms }] };
}
