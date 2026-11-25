// How long a unit takes to move from one tile to another, for the board's slide. Pure numbers, no DOM and no clock.
//
// The svg look keeps its quick slide (SLIDE_MS, ease-out). The 3D look plays a move as a turn, then a walk: the unit
// holds on its old tile while its figure turns to face the way it goes (TURN_LEAD_MS), then travels with an ease in
// and out at a pace per hex that depends on how it moves (riders and scouts are quicker, the siege engines slower),
// capped so that even a long move is over in under a second.
import { distance, parseKey } from '../../engine';
import type { HexKey, UnitTypeId } from '../../engine';

/** The svg look's slide: the same for every move. */
export const SLIDE_MS = 180;
/** The 3D look: the figure turns on its old tile for this long before it sets off (facing.ts TURN_MS is 160). */
export const TURN_LEAD_MS = 140;
/** The 3D look: a foot unit's time per hex of travel. */
export const HEX_MS = 240;
/** The 3D look: the most any travel takes, however far the move. */
export const TRAVEL_CAP_MS = 820;
/** The 3D look's ease for the travel: in and out, a little firmer than the css ease-in-out. */
export const TRAVEL_EASING = 'cubic-bezier(0.45, 0, 0.4, 1)';

const MOUNTED = new Set<string>(['horseman', 'knight', 'horseArcher', 'khansGuard', 'skyCaller']);

/** How a unit's time per hex compares with a foot unit's: below 1 is quicker. */
export function paceOf(type: UnitTypeId | string): number {
  if (type === 'scout') return 0.8;
  if (MOUNTED.has(type)) return 0.85;
  if (type === 'catapult' || type === 'camp') return 1.3;
  return 1;
}

/** Hexes between two tiles (0 for the same tile). */
export function hexesBetween(a: HexKey, b: HexKey): number {
  return distance(parseKey(a), parseKey(b));
}

/** The 3D look's travel time for a move of `hexes` hexes: the unit's pace per hex, capped. 0 for no move. */
export function travelMs(type: UnitTypeId | string, hexes: number): number {
  if (!(hexes > 0)) return 0;
  return Math.min(TRAVEL_CAP_MS, Math.round(HEX_MS * paceOf(type) * hexes));
}

/** The whole slide of a move in the 3D look: the turn on the spot, then the travel. */
export function slideMs3d(type: UnitTypeId | string, hexes: number): number {
  return hexes > 0 ? TURN_LEAD_MS + travelMs(type, hexes) : 0;
}

/**
 * How far through its travel a 3D slide of `totalMs` is after `elapsedMs` of it (0 to 1, before the ease), or null
 * while the figure is still turning on its old tile (or no slide).
 */
export function travelPhase(elapsedMs: number, totalMs: number): number | null {
  const travel = totalMs - TURN_LEAD_MS;
  if (!(travel > 0) || !(elapsedMs >= TURN_LEAD_MS)) return null;
  return Math.min(1, (elapsedMs - TURN_LEAD_MS) / travel);
}

/**
 * The keyframes of a slide from `from` to `to` (css transforms): in the 3D look the unit holds where it was for the
 * turn, then travels eased in and out; the svg look slides at once. The whole animation runs with linear timing.
 */
export function slideFrames(from: string, to: string, totalMs: number, look3d: boolean): Keyframe[] {
  if (!look3d || !(totalMs > TURN_LEAD_MS)) return [{ transform: from }, { transform: to }];
  const hold = Math.round((TURN_LEAD_MS / totalMs) * 1000) / 1000;
  return [
    { transform: from, offset: 0 },
    { transform: from, offset: hold, easing: TRAVEL_EASING },
    { transform: to, offset: 1 },
  ];
}
