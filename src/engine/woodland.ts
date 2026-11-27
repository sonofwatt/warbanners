// Woodland Nations helpers (rules 11). Imports data and types only, so vision.ts can import this file without a cycle.
import { FACTIONS } from './data/factions';
import { UNITS } from './data/units';
import type { MatchState, Unit } from './types';

// A unit veiled by a Smoke Keeper stays hidden through the stamp in `veilUntil`, whatever it stands on.
export function isVeiled(s: Pick<MatchState, 'stamp'>, u: Unit): boolean {
  return u.veilUntil !== undefined && s.stamp <= u.veilUntil;
}

// Hidden from an enemy who is not next to it: the `hidden` trait, a forest under a forest-hiding faction, or a veil.
// Takes a view-shaped state, so the UI and the AI can ask it of what they see.
export function isHidden(s: Pick<MatchState, 'tiles' | 'players' | 'stamp'>, u: Unit): boolean {
  if (UNITS[u.type].traits.includes('hidden')) return true;
  if (isVeiled(s, u)) return true;
  const faction = s.players[u.owner]?.faction;
  return faction !== undefined && FACTIONS[faction].forestHidden && s.tiles[u.pos]?.terrain === 'forest';
}
