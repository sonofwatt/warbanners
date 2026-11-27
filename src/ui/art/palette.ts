import type { FactionId, PlayerId } from '../../engine';

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
  woodland: { main: '#E0901A', dark: '#B26A0C' },
};

export const ACCENT: Record<FactionId, string> = {
  spartans: '#C8963E',
  mongols: '#D4A72C',
  woodland: '#A4452C',
};

/** A faction's own colour: faction cards and pickers. A player on the board uses seatColour. */
export function playerColour(faction: FactionId): { main: string; dark: string } {
  return PLAYER_COLOURS[faction];
}

/** The second player's colour in a mirror match, so the two sides never look alike. */
export const MIRROR_COLOUR: { main: string; dark: string } = { main: '#6B3FA0', dark: '#4E2D77' };
export const MIRROR_ACCENT = '#C9B6E4';

/** Seat 1 in a match where both players lead the same faction. */
export const mirrorSeat = (factions: readonly FactionId[], id: PlayerId): boolean =>
  id === 1 && factions[0] !== undefined && factions[0] === factions[1];

/** A player's colour: their faction's, except the second seat of a mirror match. */
export function seatColour(factions: readonly FactionId[], id: PlayerId): { main: string; dark: string } {
  const f = factions[id];
  if (f === undefined) return PLAYER_COLOURS.spartans;
  return mirrorSeat(factions, id) ? MIRROR_COLOUR : PLAYER_COLOURS[f];
}

/** A player's accent, paired with seatColour. */
export function seatAccent(factions: readonly FactionId[], id: PlayerId): string {
  const f = factions[id];
  if (f === undefined) return ACCENT.spartans;
  return mirrorSeat(factions, id) ? MIRROR_ACCENT : ACCENT[f];
}

/** How one player is drawn: their colour and accent (seatLook gives a match's player; lookOf a faction's own). */
export interface Look { colour: { main: string; dark: string }; accent: string }
export const seatLook = (factions: readonly FactionId[], id: PlayerId): Look => ({ colour: seatColour(factions, id), accent: seatAccent(factions, id) });
export const factionLook = (f: FactionId): Look => ({ colour: PLAYER_COLOURS[f], accent: ACCENT[f] });
