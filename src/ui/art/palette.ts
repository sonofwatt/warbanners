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
