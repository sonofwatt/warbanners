// How a 3D figure moves along a slide: foot units walk, scouts trot, riders gallop, the trebuchet and the camp lurch
// on their wheels. Pure maths, no three.js and no clock: the caller passes how far the figure has gone (in hexes) and
// how far through its travel it is.
//
// The cycle is driven by the distance travelled, not by time, so the steps keep pace with the slide as it eases in
// and out and a figure never skates. The motion swells in as the figure sets off and dies away as it arrives, so it
// starts and ends in its standing pose.

export type GaitKind = 'walk' | 'trot' | 'gallop' | 'lurch';

const MOUNTED = new Set(['horseman', 'knight', 'horseArcher', 'khansGuard', 'skyCaller']);

export function gaitKind(type: string): GaitKind {
  if (type === 'scout') return 'trot';
  if (type === 'catapult' || type === 'camp') return 'lurch';
  return MOUNTED.has(type) ? 'gallop' : 'walk';
}

/** Full gait cycles per hex travelled (a walk cycle is two steps; a gallop cycle is one bound). */
export const CYCLES_PER_HEX: Record<GaitKind, number> = { walk: 1.25, trot: 1.75, gallop: 1.1, lurch: 1 };

/**
 * One frame of a gait, in the figure's own frame (feet at the origin, before it is turned to its facing): a bob up
 * and a sway sideways (world units), a roll about the direction of travel and a pitch about the side axis (radians;
 * a positive pitch dips the front).
 */
export interface GaitPose { bob: number; sway: number; roll: number; pitch: number }

export const STILL: GaitPose = Object.freeze({ bob: 0, sway: 0, roll: 0, pitch: 0 });

const smooth = (x: number): number => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** How much of the gait shows at travel phase `p` (0 to 1): it swells in over the first fifth and fades over the last. */
export function gaitWeight(p: number | null | undefined): number {
  if (p === null || p === undefined || !(p > 0) || p >= 1) return 0;
  return Math.min(smooth(p / 0.2), smooth((1 - p) / 0.2));
}

/**
 * The gait of kind `kind` after `hexes` hexes of travel, scaled by `weight` (gaitWeight). Every motion is at most
 * about a tenth of a radian and a few world units (a figure stands about 45 world units tall), so the figure stays on
 * its line and its status plate.
 */
export function gaitPose(kind: GaitKind, hexes: number, weight: number): GaitPose {
  if (!(weight > 0) || !Number.isFinite(hexes)) return STILL;
  const c = hexes * CYCLES_PER_HEX[kind] * Math.PI * 2;
  switch (kind) {
    case 'walk':
      // Two steps a cycle: the body rises over each planted foot and rolls toward it; the spear and shield go with it.
      return {
        bob: 2.4 * Math.abs(Math.sin(c)) * weight,
        sway: 0.8 * Math.sin(c) * weight,
        roll: 0.11 * Math.sin(c) * weight,
        pitch: (0.06 + 0.02 * Math.cos(2 * c)) * weight,
      };
    case 'trot':
      // Quicker, lower and springier, leaning into the run.
      return {
        bob: 2.8 * Math.abs(Math.sin(c)) * weight,
        sway: 0.35 * Math.sin(c) * weight,
        roll: 0.08 * Math.sin(c) * weight,
        pitch: (0.12 + 0.03 * Math.cos(2 * c)) * weight,
      };
    case 'gallop':
      // A rocking bound: the forehand rises as the hind legs push, then the front dips as it lands; the rider rides it.
      return {
        bob: 3.2 * (0.5 + 0.5 * Math.sin(c - 0.6)) * weight,
        sway: 0,
        roll: 0.015 * Math.sin(c) * weight,
        pitch: 0.16 * Math.sin(c) * weight,
      };
    case 'lurch':
      // A heavy roll over rough ground: a slow rock side to side and a nod as the wheels bump.
      return {
        bob: 0.8 * Math.abs(Math.sin(c)) * weight,
        sway: 0,
        roll: 0.07 * Math.sin(c) * weight,
        pitch: 0.05 * Math.sin(2 * c + 0.8) * weight,
      };
  }
}
