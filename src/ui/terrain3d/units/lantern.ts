// The lantern a unit carries after dark, and the light it throws on the ground. Pure maths, no three.js, so the
// light's shape can be tested in Node; units3d.ts draws it, and LANTERN_GLSL below is the same function for the GPU.
//
// The light falls ahead of the unit, the way it faces: about 60 percent of it in the quarter ahead (45 degrees
// either side of its heading), about 20 percent in each side quarter, and none in the quarter behind. It is a pool
// about the unit's feet whose strength falls off with distance (the same in every direction) and with the angle
// from the heading (a plateau ahead, a lower one either side, nothing behind, with soft steps between).
import type { UnitType } from './figures';

/** How far the lantern's light reaches over the ground from the unit's feet (world units; a tile is 52 across). */
export const LAMP_REACH = 21;
/** A lantern warms the figures within this reach (world units), on the faces turned toward it (shaders.ts). */
export const LAMP_WARM_REACH = 15;
/** The angular weight ahead and to the sides (relative), and the soft steps between them (radians, each side). */
export const LAMP_AHEAD = 2.77;
export const LAMP_SIDE = 1.0;
export const LAMP_SOFT = 0.22;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The angular weight at `a` radians from the heading (either side): LAMP_AHEAD ahead, stepping down to LAMP_SIDE
 * across 45 degrees, and down to nothing before 135 degrees, so the quarter behind is dark.
 */
export function lampAngle(a: number): number {
  const x = Math.abs(a);
  const q = Math.PI / 4;
  const side = LAMP_SIDE + (LAMP_AHEAD - LAMP_SIDE) * (1 - smooth(q - LAMP_SOFT, q + LAMP_SOFT, x));
  return side * (1 - smooth(3 * q - 2 * LAMP_SOFT, 3 * q, x));
}

/** The falloff with distance from the feet: full at the feet, half way at half the reach, nothing at LAMP_REACH. */
export function lampReach(r: number): number {
  return 1 - smooth(0, LAMP_REACH, r);
}

/** The light at a ground point `ahead` along the heading and `side` across it (world units), before the night factor. */
export function lampLight(ahead: number, side: number): number {
  const r = Math.hypot(ahead, side);
  if (r >= LAMP_REACH) return 0;
  return lampReach(r) * lampAngle(Math.atan2(side, ahead)) / LAMP_AHEAD;
}

/**
 * How the light is shared between the quarters round the unit (ahead, left, right, behind; together 1), summed over
 * a fine grid of the ground. The test holds it at 60, 20, 20 and 0 percent.
 */
export function lampSplit(step = 0.1): { ahead: number; left: number; right: number; behind: number } {
  const s = { ahead: 0, left: 0, right: 0, behind: 0 };
  const n = Math.ceil(LAMP_REACH / step);
  for (let i = -n; i < n; i++) {
    for (let j = -n; j < n; j++) {
      const x = (i + 0.5) * step, y = (j + 0.5) * step;
      const v = lampLight(x, y);
      if (v <= 0) continue;
      const a = Math.atan2(y, x);
      if (Math.abs(a) <= Math.PI / 4) s.ahead += v;
      else if (Math.abs(a) >= (3 * Math.PI) / 4) s.behind += v;
      else if (a > 0) s.left += v;
      else s.right += v;
    }
  }
  const all = s.ahead + s.left + s.right + s.behind;
  return { ahead: s.ahead / all, left: s.left / all, right: s.right / all, behind: s.behind / all };
}

/** The GLSL twin of lampLight (and lampAngle and lampReach): `p` is (ahead, side) in world units. */
export const LANTERN_GLSL = /* glsl */ `
float lampLight(vec2 p) {
  float r = length(p);
  if (r >= ${LAMP_REACH.toFixed(2)}) return 0.0;
  float x = abs(atan(p.y, p.x));
  const float Q = 0.78539816;
  float side = ${LAMP_SIDE.toFixed(3)} + ${(LAMP_AHEAD - LAMP_SIDE).toFixed(3)} * (1.0 - smoothstep(Q - ${LAMP_SOFT.toFixed(3)}, Q + ${LAMP_SOFT.toFixed(3)}, x));
  side *= 1.0 - smoothstep(3.0 * Q - ${(2 * LAMP_SOFT).toFixed(3)}, 3.0 * Q, x);
  return (1.0 - smoothstep(0.0, ${LAMP_REACH.toFixed(2)}, r)) * side / ${LAMP_AHEAD.toFixed(3)};
}
`;

/** Where the lantern hangs on a figure, in its body's rest frame (world units): how far ahead and to the side of its
 * move front, and how high. Riders hold it at the saddle, the trebuchet hangs it from its frame, the camp by its door.
 */
export function lanternHang(type: UnitType): { ahead: number; side: number; y: number } {
  switch (type) {
    case 'horseman': case 'knight': case 'horseArcher': case 'khansGuard': case 'skyCaller':
      return { ahead: 2, side: 7.5, y: 19 };
    case 'catapult': return { ahead: 6, side: 9, y: 13 };
    case 'camp': return { ahead: 7, side: -7, y: 9 };
    default: return { ahead: 6, side: -2.5, y: 11 };
  }
}
