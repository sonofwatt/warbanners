import type { FactionId } from '../../engine';

export type Ground = 'grass' | 'water' | 'rock' | 'sand' | 'fog';

/** Each ground as [top face, left wall, right wall]. The light comes from the left. */
export const GROUND: Record<Ground, readonly [string, string, string]> = {
  grass: ['#A9D975', '#86B957', '#74A54A'],
  water: ['#7CC8EE', '#57A6CF', '#4792BB'],
  rock: ['#CFC8B6', '#ABA493', '#989181'],
  sand: ['#EAD7A0', '#C9B47A', '#B5A069'],
  fog: ['#E9EEF2', '#CBD3DA', '#B9C2CA'],
};

/**
 * Gritty mode's grounds: the same five under a low, overcast sky. Olive-grey grass, cold slate water, wet stone,
 * drab sand, and fog as a near-black murk. Mood only: muted and cool, so small bright figures read on top.
 */
export const GROUND_GRITTY: Record<Ground, readonly [string, string, string]> = {
  grass: ['#5A6B4C', '#47563C', '#3C4934'],
  water: ['#465C68', '#374A55', '#2E3F49'],
  rock: ['#79766F', '#5F5C57', '#53504B'],
  sand: ['#8A8068', '#6E6652', '#615A48'],
  fog: ['#2C3136', '#23272B', '#1E2125'],
};

/** The overcast grade Gritty gives the scenery (trees, rocks, buildings, cities): less colour, less light, a cold cast. */
export const GRADE = { keep: 0.5, light: 0.78, cast: [70, 84, 98] as const, castShare: 0.14 };

const graded = new Map<string, string>();

/** A #RRGGBB colour under Gritty's grade; anything else is returned as it is. */
export function grade(colour: string): string {
  const hit = graded.get(colour);
  if (hit !== undefined) return hit;
  const m = /^#([0-9a-f]{6})$/i.exec(colour);
  if (m === null) return colour;
  const n = Number.parseInt(m[1]!, 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luma = 0.299 * rgb[0]! + 0.587 * rgb[1]! + 0.114 * rgb[2]!;
  const out = rgb.map((c, i) => {
    const muted = luma + (c - luma) * GRADE.keep;
    const lit = muted * GRADE.light;
    return Math.round(lit * (1 - GRADE.castShare) + GRADE.cast[i]! * GRADE.castShare);
  });
  const hex = `#${out.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  graded.set(colour, hex);
  return hex;
}

/**
 * Gritty's figures: a milder grade than the scenery's, the same the 3D figures get (terrain3d/shaders.ts mute):
 * 78 percent of the colour kept and 90 percent of the light, so they sit in the overcast board and still tell sides apart.
 */
export const MUTE = { keep: 0.78, light: 0.9 };

const muted = new Map<string, string>();

/** A #RRGGBB colour as Gritty draws a figure; anything else (none, a url, rgba) is returned as it is. */
export function mute(colour: string): string {
  const hit = muted.get(colour);
  if (hit !== undefined) return hit;
  const m = /^#([0-9a-f]{6})$/i.exec(colour);
  if (m === null) return colour;
  const n = Number.parseInt(m[1]!, 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luma = 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
  const out = rgb.map((c) => Math.round((luma + (c - luma) * MUTE.keep) * MUTE.light));
  const hex = `#${out.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  muted.set(colour, hex);
  return hex;
}

export const SKIN = '#E8B88A';

export const PLAYER_COLOURS: Record<FactionId, { main: string; dark: string }> = {
  spartans: { main: '#B3261E', dark: '#8E1D17' },
  mongols: { main: '#2D6DB5', dark: '#1F4F87' },
};

export const ACCENT: Record<FactionId, string> = {
  spartans: '#C8963E',
  mongols: '#D4A72C',
};

/** Stage 1: a player's colour is their faction's. */
export function playerColour(faction: FactionId): { main: string; dark: string } {
  return PLAYER_COLOURS[faction];
}
