// The board's light for a match's weather and time of day (a look only: the rules never read it). Plain numbers, no
// three.js, so the board, the SVG look and tests can all read them; terrain3d.ts copies them into its uniforms. Day
// and Clear together are exactly the light the 3D board had before there was a choice.
import type { Look, TimeOfDay, Weather } from '../../app/advanced';

export type Rgb = readonly [number, number, number];

export interface SkyLight {
  /** Toward the sun (or moon), not normalised. */
  dir: readonly [number, number, number];
  light: Rgb; // the toon key colour
  shadow: Rgb; // the toon shade colour
  tint: Rgb; // a grade multiplied in last, over the terrain and the props
  unitTint: Rgb; // the same grade for the unit figures, lighter so they stay readable
  glow: number; // lanterns, furnaces and city windows: 1 by day, brighter in the dark
  windows: number; // how much the city windows light up (0 by day)
  sea: string; // the sea beyond the board's edge (the slot's background)
}

const TIMES: Record<TimeOfDay, SkyLight> = {
  day: {
    dir: [-0.55, 0.8, 0.28], light: [1.05, 1.02, 0.96], shadow: [0.68, 0.70, 0.80], tint: [1, 1, 1], unitTint: [1, 1, 1],
    glow: 1, windows: 0, sea: '#3E80AE',
  },
  // Low warm light from the left, pink in the shade.
  dawn: {
    dir: [-0.9, 0.36, 0.42], light: [1.14, 0.92, 0.78], shadow: [0.60, 0.56, 0.72], tint: [1.0, 0.94, 0.93], unitTint: [1.0, 0.97, 0.96],
    glow: 1.15, windows: 0.25, sea: '#4D7AA6',
  },
  // Low orange light from the right, violet shade.
  dusk: {
    dir: [0.88, 0.34, 0.36], light: [1.16, 0.82, 0.58], shadow: [0.52, 0.46, 0.64], tint: [0.96, 0.87, 0.86], unitTint: [1.0, 0.94, 0.92],
    glow: 1.35, windows: 0.6, sea: '#3D5F8E',
  },
  // A cool moon high on the left; the lit windows, lanterns and furnaces carry the warmth.
  night: {
    dir: [-0.35, 0.86, 0.38], light: [0.70, 0.78, 1.0], shadow: [0.36, 0.42, 0.62], tint: [0.56, 0.64, 0.90], unitTint: [0.86, 0.89, 1.0],
    glow: 1.9, windows: 1, sea: '#18284A',
  },
};

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

/** The light for a look. */
export function skyLight(look: Look): SkyLight {
  const t = TIMES[look.time];
  const w = WEATHER[look.weather];
  if (look.weather === 'clear') return t;
  const flat = (luma(t.light) + luma(t.shadow)) / 2;
  const light = mix(t.light, [flat, flat, flat * 1.02], w.grey);
  const shadow = mix(t.shadow, [flat * 0.86, flat * 0.87, flat * 0.92], w.grey * 0.6);
  return {
    ...t, light, shadow, tint: mul(t.tint, w.tint), unitTint: mix(t.unitTint, mul(t.unitTint, w.tint), 0.5),
    sea: greySea(t.sea, w.sea),
  };
}

/** The SVG board's grade for a look: one dark (or warm) silhouette over each tile's art, or null for none. */
export function svgGrade(look: Look): { fill: string; opacity: number } | null {
  const base: Record<TimeOfDay, { fill: string; opacity: number } | null> = {
    day: null,
    dawn: { fill: '#E07A62', opacity: 0.16 },
    dusk: { fill: '#5B2E55', opacity: 0.26 },
    night: { fill: '#0C1838', opacity: 0.5 },
  };
  const g = base[look.time];
  const wet = look.weather === 'rain' ? 0.14 : look.weather === 'cloudy' ? 0.1 : 0;
  if (g === null) return wet === 0 ? null : { fill: '#3A4656', opacity: wet };
  return { fill: g.fill, opacity: Math.min(0.6, g.opacity + wet * 0.5) };
}
