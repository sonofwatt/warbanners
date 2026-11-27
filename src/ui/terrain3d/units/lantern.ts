// The lantern a unit carries after dark, and the light it throws on the ground. Pure maths, no three.js, so the
// light's shape can be tested in Node; units3d.ts draws it, and LANTERN_GLSL below is the same function for the GPU.
//
// The light is a pool on the ground about the point under the lantern, aimed the way the lantern shines (lampShape:
// ahead for a unit on foot, off to the lantern's side for a rider, straight out sideways for the trebuchet). It is
// one smooth gradient, brightest straight ahead and dimming toward the sides (about 60 percent of it in the quarter
// ahead, 20 in each side quarter, none behind), with no steps between the zones. Right under the lantern it is dark,
// since its own base shades the ground there, so the light lies in a crescent out in front. A rider's horse blocks
// the light on the far side of it: none falls on the horse's side.
import type { UnitType } from './figures';

/** How far the lantern's light reaches over the ground from the point under it (world units; a tile is 52 across). */
export const LAMP_REACH = 21;
/** A lantern warms the figures within this reach (world units), on the faces turned toward it (shaders.ts). */
export const LAMP_WARM_REACH = 15;
/** The angle from the aim past which the light is gone (radians: 135 degrees, so the quarter behind is dark). */
export const LAMP_EDGE = (3 * Math.PI) / 4;
/** How sharply the light dims from the aim to the sides (the power of the cosine falloff). */
export const LAMP_FALL = 2;
/** The soft edge of a body's shadow (radians, each side of the cut). */
export const LAMP_CUT_SOFT = 0.2;

/**
 * How a unit's lantern lights the ground. `aim`: the turn from the unit's heading toward the lantern's side (radians;
 * the side is lanternHang's, positive the way its `side` points). `core`: the radius of the dark spot under the
 * lantern (world units), larger the higher it hangs. `cut`: the angle from the aim, on the side away from the lantern
 * (toward the unit's body), past which the body blocks the light; 0 for none.
 */
export interface LampShape { aim: number; core: number; cut: number }

export function lampShape(type: UnitType): LampShape {
  switch (type) {
    // A rider holds it out at the saddle: it shines ahead and out to that side, and the horse shades the other side
    // (the cut falls just past the heading, so a little light still runs ahead of the horse's head).
    case 'horseman': case 'knight': case 'horseArcher': case 'khansGuard': case 'skyCaller':
      return { aim: 0.6, core: 7, cut: 0.75 };
    // The trebuchet hangs it on its frame and throws it straight out sideways, whichever way it rolls; the frame
    // behind it shades the rest.
    case 'catapult': return { aim: Math.PI / 2, core: 5.5, cut: 1.5 };
    default: return { aim: 0, core: 3.5, cut: 0 };
  }
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The angular weight at `a` radians from the aim (either side): 1 straight ahead, falling smoothly (a cosine to the
 * power LAMP_FALL) to a quarter at the sides and to nothing at LAMP_EDGE, with no plateaus or steps.
 */
export function lampAngle(a: number): number {
  const x = Math.abs(a);
  if (x >= LAMP_EDGE) return 0;
  return Math.cos((x / LAMP_EDGE) * (Math.PI / 2)) ** LAMP_FALL;
}

/** The falloff with distance: dark under the lantern, rising to full at `core`, and fading to nothing at LAMP_REACH. */
export function lampReach(r: number, core = 0): number {
  if (r >= LAMP_REACH) return 0;
  const rise = core > 0 ? smooth(core * 0.3, core, r) : 1;
  return rise * (1 - smooth(core, LAMP_REACH, r));
}

/**
 * The light at a ground point `ahead` along the aim and `side` across it (world units, from the point under the
 * lantern; `side` positive toward the lantern's own side), before the night factor.
 */
export function lampLight(ahead: number, side: number, shape: LampShape = { aim: 0, core: 0, cut: 0 }): number {
  const r = Math.hypot(ahead, side);
  if (r >= LAMP_REACH) return 0;
  const a = Math.atan2(side, ahead);
  const block = shape.cut > 0 ? smooth(-shape.cut - LAMP_CUT_SOFT, -shape.cut + LAMP_CUT_SOFT, a) : 1;
  return lampReach(r, shape.core) * lampAngle(a) * block;
}

/**
 * How the light is shared between the quarters round the aim (ahead, left, right, behind; together 1), summed over
 * a fine grid of the ground. For a lantern with no body in the way it comes to about 60, 20, 20 and 0 percent.
 */
export function lampSplit(step = 0.1, shape?: LampShape): { ahead: number; left: number; right: number; behind: number } {
  const s = { ahead: 0, left: 0, right: 0, behind: 0 };
  const n = Math.ceil(LAMP_REACH / step);
  for (let i = -n; i < n; i++) {
    for (let j = -n; j < n; j++) {
      const x = (i + 0.5) * step, y = (j + 0.5) * step;
      const v = lampLight(x, y, shape);
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

/** The GLSL twin of lampLight (and lampAngle and lampReach): `p` is (ahead, side), `shape` is (core, cut). */
export const LANTERN_GLSL = /* glsl */ `
float lampLight(vec2 p, vec2 shape) {
  float r = length(p);
  if (r >= ${LAMP_REACH.toFixed(2)}) return 0.0;
  float a = atan(p.y, p.x);
  float x = abs(a);
  if (x >= ${LAMP_EDGE.toFixed(5)}) return 0.0;
  float ang = pow(cos(x / ${LAMP_EDGE.toFixed(5)} * 1.5707963), ${LAMP_FALL.toFixed(2)});
  float block = shape.y > 0.0 ? smoothstep(-shape.y - ${LAMP_CUT_SOFT.toFixed(3)}, -shape.y + ${LAMP_CUT_SOFT.toFixed(3)}, a) : 1.0;
  float rise = shape.x > 0.0 ? smoothstep(shape.x * 0.3, shape.x, r) : 1.0;
  return rise * (1.0 - smoothstep(shape.x, ${LAMP_REACH.toFixed(2)}, r)) * ang * block;
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
