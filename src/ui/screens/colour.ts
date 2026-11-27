import type { FactionId } from '../../engine';

// A player's colour is their faction's, from the look reference.
export const FACTION_COLOUR: Record<FactionId, { main: string; dark: string }> = {
  spartans: { main: '#B3261E', dark: '#8E1D17' },
  mongols: { main: '#2D6DB5', dark: '#1F4F87' },
  woodland: { main: '#2F7A3E', dark: '#1F5A2B' },
};
