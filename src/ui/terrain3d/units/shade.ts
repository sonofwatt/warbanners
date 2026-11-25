// How a spent unit's 3D figure darkens: pure numbers, no three.js. The figure is painted with one of a few shared
// material sets (units3d.ts), so the 200 ms ease is drawn in steps; at the end it is exactly as dark as the svg
// figure's filter (theme.css .unit-shade.spent). The easing itself is the crouch's (crouch.ts crouchTo).

/** How long a unit takes to darken when spent, and to lighten when its next turn starts (ms). */
export const SHADE_MS = 200;
/** The number of shade steps between fresh (0) and spent (SHADE_STEPS). */
export const SHADE_STEPS = 8;

/** The step for a shade of `v` (0 fresh to 1 spent). */
export function shadeStep(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * SHADE_STEPS);
}
