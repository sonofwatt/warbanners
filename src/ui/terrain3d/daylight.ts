// Dawn and dusk change over the match (a look only: the rules never read it). Dawn opens on the night and brightens
// round by round into full day by round DAYLIGHT_ROUNDS; dusk is the same run backwards, from day into night. The
// round is the one both players share (app/record.ts roundOf), so every phone and every replay draws the same light.
// Plain numbers, no three.js: sky.ts blends its light tables with these, the SVG grade too, and tests read them.
import type { TimeOfDay } from '../../app/advanced';

export type Vec3 = readonly [number, number, number];

/** The round from which dawn is full day and dusk full night. */
export const DAYLIGHT_ROUNDS = 30;

/** How far toward full day the light is at `round`: 0 night, 1 day. Day and night do not change with the round. */
export function daylight(time: TimeOfDay, round: number): number {
  if (time === 'day') return 1;
  if (time === 'night') return 0;
  const r = Number.isFinite(round) ? round : 1;
  const k = Math.min(1, Math.max(0, (r - 1) / (DAYLIGHT_ROUNDS - 1)));
  return time === 'dawn' ? k : 1 - k;
}

/** Where along the night-to-day run the sun stands lowest, just risen (dawn) or just set (dusk). */
export const SUN_LOW = 0.15;
/** Where along the run the colours are the dawn (or dusk) table's own: the warm middle of the change. */
export const WARM = 0.5;

/** `a` to `b` by `t`, clamped. */
export function lerp(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return a + (b - a) * k;
}
export function lerp3(a: Vec3, b: Vec3, t: number): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
const norm = (v: Vec3): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
/**
 * Between two directions by `t`, normalised: the height above the horizon and the bearing each move evenly (the
 * bearing the shorter way round), so a sun going down only sinks, and never climbs on the way.
 */
export function turnTo(a: Vec3, b: Vec3, t: number): [number, number, number] {
  const [ax, ay, az] = norm(a), [bx, by, bz] = norm(b);
  const k = Math.min(1, Math.max(0, t));
  const ea = Math.asin(ay), eb = Math.asin(by);
  const fa = Math.atan2(az, ax);
  let d = Math.atan2(bz, bx) - fa;
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  const e = ea + (eb - ea) * k, f = fa + d * k;
  return [Math.cos(e) * Math.cos(f), Math.sin(e), Math.cos(e) * Math.sin(f)];
}

/**
 * The light's direction at `p` (0 night, 1 day) on the way through dawn or dusk: the moon (`moon`, at 0) hands over
 * to the sun just over the horizon (`low`, at SUN_LOW), which then climbs to the day's place (`high`, at 1). Dawn's
 * low sun is on the east and dusk's on the west, so a dawn's sun climbs and a dusk's sinks across the sky.
 */
export function sunPath(moon: Vec3, low: Vec3, high: Vec3, p: number): [number, number, number] {
  if (p <= 0) return norm(moon);
  if (p >= 1) return norm(high);
  if (p < SUN_LOW) return turnTo(moon, low, p / SUN_LOW);
  return turnTo(low, high, (p - SUN_LOW) / (1 - SUN_LOW));
}

/** A '#RRGGBB' colour between two others. */
export function lerpHex(a: string, b: string, t: number): string {
  const ca = Number.parseInt(a.slice(1), 16), cb = Number.parseInt(b.slice(1), 16);
  const ch = (n: number, s: number): number => (n >> s) & 255;
  const out = [16, 8, 0].map((s) => Math.round(lerp(ch(ca, s), ch(cb, s), t)).toString(16).padStart(2, '0'));
  return `#${out.join('')}`.toUpperCase();
}

/**
 * How far a shadow reaches for the light's slope, against a true one: shorter, as the board's figures are tall for
 * their tiles (about 42 world units on a tile 52 across), so the day's shadow stays near the feet. The longest reach
 * (a sun on the horizon) is capped so a shadow stays within about two tiles.
 */
export const CAST_SCALE = 0.55;
export const MAX_REACH = 2.0;
/**
 * A low sun (dawn and dusk) throws longer, darker shadows, as David asked: below LOW_FROM of height the reach grows
 * by up to LOW_LONGER and the darkness by up to LOW_DARKER (at the horizon), the darkness capped at CAST_MAX.
 * The day's high sun and the night's high moon are untouched.
 */
export const LOW_FROM = 0.6;
export const LOW_LONGER = 0.8;
export const LOW_DARKER = 0.7;
export const CAST_MAX = 0.62;
/**
 * The cast shadow for a light direction (toward the light) and a strength: how far a figure's shadow reaches across
 * the ground per unit of its height (x and z in world space, pointing away from the light), and how dark it is.
 */
export function castShadow(dir: Vec3, strength: number): { step: [number, number]; alpha: number } {
  const [x, y, z] = norm(dir);
  const flat = Math.hypot(x, z);
  if (flat < 1e-6) return { step: [0, 0], alpha: strength };
  const low = Math.min(1, Math.max(0, (LOW_FROM - y) / LOW_FROM));
  const reach = Math.min(MAX_REACH, (CAST_SCALE * (1 + LOW_LONGER * low) * flat) / Math.max(y, 1e-3));
  const alpha = low > 0 ? Math.min(Math.max(strength, CAST_MAX), strength * (1 + LOW_DARKER * low)) : strength;
  return { step: [(-x / flat) * reach, (-z / flat) * reach], alpha };
}
