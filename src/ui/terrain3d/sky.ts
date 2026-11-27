// The board's light for a match's weather and time of day (a look only: the rules never read it). Plain numbers, no
// three.js, so the board, the SVG look and tests can all read them; terrain3d.ts copies them into its uniforms. Day
// and Clear together are exactly the light the 3D board had before there was a choice.
import type { Look, TimeOfDay, Weather } from '../../app/advanced';
import { daylight, lerp, lerp3, lerpHex, sunPath, WARM } from './daylight';

export type Rgb = readonly [number, number, number];

export interface SkyLight {
  /** Toward the sun (or moon), not normalised. */
  dir: readonly [number, number, number];
  light: Rgb; // the toon key colour
  shadow: Rgb; // the toon shade colour
  tint: Rgb; // a grade multiplied in last, over the terrain and the props
  unitTint: Rgb; // the same grade for the unit figures, lighter so they stay readable
  glow: number; // lanterns, furnaces and city windows: 1 by day, brighter in the dark
  windows: number; // how much the windows light up and light the ground (0 by day): the bonfires' night factor, fire
  fire: number; // how much light the village bonfires cast round them (0 by day, 1 at night)
  sea: string; // the sea beyond the board's edge (the slot's background)
  cast: number; // how dark the figures' cast shadows are (units3d.ts): clear by day 0.42, faint at night
  air: Rgb; // the light on mist and smoke, relative to the day's: exactly 1 by day in clear weather
}

type TimeLight = Omit<SkyLight, 'air'>;

const TIMES: Record<TimeOfDay, TimeLight> = {
  day: {
    dir: [-0.55, 0.8, 0.28], light: [1.05, 1.02, 0.96], shadow: [0.68, 0.70, 0.80], tint: [1, 1, 1], unitTint: [1, 1, 1],
    glow: 1, windows: 0, fire: 0, sea: '#3E80AE', cast: 0.42,
  },
  // The warm middle of a dawn (daylight.ts WARM): low warm light from the left (the east), pink in the shade.
  dawn: {
    dir: [-0.9, 0.36, 0.42], light: [1.14, 0.92, 0.78], shadow: [0.60, 0.56, 0.72], tint: [1.0, 0.94, 0.93], unitTint: [1.0, 0.97, 0.96],
    glow: 1.15, windows: 0.5, fire: 0.5, sea: '#4D7AA6', cast: 0.42,
  },
  // The warm middle of a dusk: low orange light from the right (the west), violet shade.
  dusk: {
    dir: [0.88, 0.34, 0.36], light: [1.16, 0.82, 0.58], shadow: [0.52, 0.46, 0.64], tint: [0.96, 0.87, 0.86], unitTint: [1.0, 0.94, 0.92],
    glow: 1.35, windows: 0.62, fire: 0.62, sea: '#3D5F8E', cast: 0.4,
  },
  // A cool moon high on the left; the lit windows, lanterns and furnaces carry the warmth.
  night: {
    dir: [-0.35, 0.86, 0.38], light: [0.70, 0.78, 1.0], shadow: [0.36, 0.42, 0.62], tint: [0.56, 0.64, 0.90], unitTint: [0.86, 0.89, 1.0],
    glow: 1.9, windows: 1, fire: 1, sea: '#18284A', cast: 0.2,
  },
};

// The sun just over the horizon (daylight.ts SUN_LOW): in the east (screen left, where the day's light comes from)
// at dawn, in the west (screen right) at dusk, a little toward the viewer as the day's light is.
const SUN_LOW_DIR: Record<'dawn' | 'dusk', readonly [number, number, number]> = {
  dawn: [-0.95, 0.17, 0.4],
  dusk: [0.95, 0.17, 0.38],
};

function blend(a: TimeLight, b: TimeLight, t: number): TimeLight {
  return {
    dir: a.dir, light: lerp3(a.light, b.light, t), shadow: lerp3(a.shadow, b.shadow, t), tint: lerp3(a.tint, b.tint, t),
    unitTint: lerp3(a.unitTint, b.unitTint, t), glow: lerp(a.glow, b.glow, t), windows: lerp(a.windows, b.windows, t), fire: lerp(a.fire, b.fire, t),
    sea: lerpHex(a.sea, b.sea, t), cast: lerp(a.cast, b.cast, t),
  };
}

/**
 * The light of a time of day at `round`. Day and night are fixed. Dawn runs from the night (round 1) through its warm
 * table to full day (round 30 on), dusk the other way; the colours pass through the warm table halfway, and the
 * light's direction follows the sun (daylight.ts sunPath).
 */
export function timeLight(time: TimeOfDay, round: number): TimeLight {
  if (time === 'day' || time === 'night') return TIMES[time];
  const p = daylight(time, round);
  if (p >= 1) return TIMES.day;
  if (p <= 0) return TIMES.night;
  const warm = TIMES[time];
  const mixed = p < WARM ? blend(TIMES.night, warm, p / WARM) : blend(warm, TIMES.day, (p - WARM) / (1 - WARM));
  return { ...mixed, dir: sunPath(TIMES.night.dir, SUN_LOW_DIR[time], TIMES.day.dir, p) };
}

// What each weather does to the light: the key loses colour and strength toward grey (the shade comes up to meet
// it, so the light is flatter), and the grade cools.
const WEATHER: Record<Weather, { grey: number; tint: Rgb; sea: number }> = {
  clear: { grey: 0, tint: [1, 1, 1], sea: 0 },
  cloudy: { grey: 0.5, tint: [0.9, 0.91, 0.94], sea: 0.15 },
  rain: { grey: 0.6, tint: [0.8, 0.83, 0.9], sea: 0.25 },
  snow: { grey: 0.35, tint: [0.97, 0.99, 1.04], sea: 0.1 },
};

const mul = (a: Rgb, b: Rgb): Rgb => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const luma = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

function greySea(hex: string, t: number): string {
  if (t === 0) return hex;
  const n = Number.parseInt(hex.slice(1), 16);
  const c: Rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const g = luma(c) * 0.92;
  const out = mix(c, [g, g, g], t).map((v) => Math.round(v).toString(16).padStart(2, '0'));
  return `#${out.join('')}`.toUpperCase();
}

// Mist and smoke are lit by a soft mix of the key and the shade, relative to the day's, so by day they are exactly
// as before and at night they take the moonlight.
const airOf = (light: Rgb, shadow: Rgb): Rgb => mix(shadow, light, 0.65);
const DAY_AIR = airOf(TIMES.day.light, TIMES.day.shadow);
const withAir = (t: TimeLight): SkyLight => {
  const a = airOf(t.light, t.shadow);
  return { ...t, air: [a[0] / DAY_AIR[0], a[1] / DAY_AIR[1], a[2] / DAY_AIR[2]] };
};

/** The light for a look at `round` (dawn and dusk change over the match; the rest do not). */
export function skyLight(look: Look, round = 1): SkyLight {
  const t = timeLight(look.time, round);
  const w = WEATHER[look.weather];
  if (look.weather === 'clear') return withAir(t);
  const flat = (luma(t.light) + luma(t.shadow)) / 2;
  const light = mix(t.light, [flat, flat, flat * 1.02], w.grey);
  const shadow = mix(t.shadow, [flat * 0.86, flat * 0.87, flat * 0.92], w.grey * 0.6);
  return withAir({
    ...t, light, shadow, tint: mul(t.tint, w.tint), unitTint: mix(t.unitTint, mul(t.unitTint, w.tint), 0.5),
    sea: greySea(t.sea, w.sea), cast: t.cast * Math.max(0.15, 1 - 1.3 * w.grey),
  });
}

type Grade = { fill: string; opacity: number };
const GRADES: Record<TimeOfDay, Grade | null> = {
  day: null,
  dawn: { fill: '#E07A62', opacity: 0.16 },
  dusk: { fill: '#5B2E55', opacity: 0.26 },
  night: { fill: '#0C1838', opacity: 0.5 },
};
// Two grades blended as the overlays they are: the colour weighted by each one's opacity.
function blendGrade(a: Grade | null, b: Grade | null, t: number): Grade | null {
  const oa = a?.opacity ?? 0, ob = b?.opacity ?? 0;
  const opacity = lerp(oa, ob, t);
  if (opacity <= 0.001) return null;
  const wb = (ob * t) / ((oa * (1 - t)) + ob * t);
  return { fill: lerpHex(a?.fill ?? b!.fill, b?.fill ?? a!.fill, wb), opacity };
}
/** The time of day's grade at `round`: dawn and dusk pass from the night's through their own to none, as the 3D light. */
function gradeAt(time: TimeOfDay, round: number): Grade | null {
  if (time === 'day' || time === 'night') return GRADES[time];
  const p = daylight(time, round);
  if (p >= 1) return GRADES.day;
  if (p <= 0) return GRADES.night;
  return p < WARM ? blendGrade(GRADES.night, GRADES[time], p / WARM) : blendGrade(GRADES[time], GRADES.day, (p - WARM) / (1 - WARM));
}

/** The SVG board's grade for a look at `round`: one dark (or warm) silhouette over each tile's art, or null for none. */
export function svgGrade(look: Look, round = 1): { fill: string; opacity: number } | null {
  const g = gradeAt(look.time, round);
  const wet = look.weather === 'rain' ? 0.14 : look.weather === 'cloudy' ? 0.1 : 0;
  if (g === null) return wet === 0 ? null : { fill: '#3A4656', opacity: wet };
  return { fill: g.fill, opacity: Math.min(0.6, g.opacity + wet * 0.5) };
}
