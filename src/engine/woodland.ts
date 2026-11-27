// Woodland Nations helpers (rules 11). Imports data, hex and types only, so vision.ts can import this file without a cycle.
import { CONFIG } from './data/config';
import { FACTIONS } from './data/factions';
import { UNITS } from './data/units';
import { distance, parseKey } from './hex';
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

const traitOf = (u: Unit, t: 'bow' | 'forestEye'): boolean => UNITS[u.type].traits.includes(t);

// rules 11, bow: a unit's normal range (no mountain or forest eye bonus): its type's range, or 2 for a bow unit whose
// owner knows Archery.
export function normalRange(s: Pick<MatchState, 'players'>, u: Unit): number {
  const range = UNITS[u.type].range;
  return traitOf(u, 'bow') && s.players[u.owner]?.techs.includes('archery') === true ? Math.max(range, 2) : range;
}

// rules 11, forest eye: the extra reach of a forestEye unit standing on a forest that has not moved or acted this turn.
export function forestEyeReach(s: Pick<MatchState, 'tiles'>, u: Unit): number {
  return traitOf(u, 'forestEye') && !u.moved && !u.acted && s.tiles[u.pos]?.terrain === 'forest'
    ? CONFIG.woodland.forestEyeRange : 0;
}

// rules 11, bow: a bow unit attacking or striking back from 2 tiles or more shoots rather than fights in melee.
export function bowShot(_s: unknown, attacker: Unit, target: Unit): boolean {
  return traitOf(attacker, 'bow') && distance(parseKey(attacker.pos), parseKey(target.pos)) >= 2;
}
