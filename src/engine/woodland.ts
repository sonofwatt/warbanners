// Woodland Nations helpers (rules 11). Imports data, hex and types, and state.ts only for removeUnit, which runs inside
// a function call, so vision.ts (which state.ts imports) can import this file without a load-order problem.
import { CONFIG } from './data/config';
import { FACTIONS } from './data/factions';
import { UNITS } from './data/units';
import { DIRS, add, distance, key, parseKey } from './hex';
import type { HexKey } from './hex';
import { removeUnit } from './state';
import type { GameEvent, MatchState, PlayerId, Unit } from './types';

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

// rules 11, Dash-strike: the tile the charge runs through, the first in direction order next to both the attacker and
// the target that is enterable, not a mountain, explored by the attacker's owner and free of units; null if none.
// Asked of the real state it is the truth; asked of a believed state it is the player's own guess.
export function chargeTile(s: Pick<MatchState, 'tiles' | 'units' | 'players'>, attacker: Unit, targetPos: HexKey): HexKey | null {
  const from = parseKey(attacker.pos);
  const to = parseKey(targetPos);
  const explored = s.players[attacker.owner]?.explored ?? [];
  for (const d of DIRS) {
    const h = add(from, d);
    if (distance(h, to) !== 1) continue;
    const k = key(h);
    const terrain = s.tiles[k]?.terrain;
    if (terrain === undefined || terrain === 'water' || terrain === 'mountain') continue;
    if (!explored.includes(k) || s.units.some((u) => u.pos === k)) continue;
    return k;
  }
  return null;
}

// rules 11, snare: is there a snare on `at` that a unit of `notOwner` would spring (one of another player's)?
export function snareAt(s: Pick<MatchState, 'snares'>, at: HexKey, notOwner: PlayerId): boolean {
  return s.snares?.some((n) => n.at === at && n.owner !== notOwner) === true;
}

// rules 11, snare: `u` has entered its tile by its own move, a lure or a kill advance. If an enemy snare is there it is
// used up and `u` takes snareDamage and has no movement left this turn; a unit it kills earns nobody a deed. True when
// it sprang (the unit may then be dead). The last snare used up takes the key with it, so the state hashes tidy.
export function springSnare(s: MatchState, u: Unit, ev: GameEvent[]): boolean {
  const i = s.snares?.findIndex((n) => n.at === u.pos && n.owner !== u.owner) ?? -1;
  if (i < 0) return false;
  s.snares!.splice(i, 1);
  if (s.snares!.length === 0) delete s.snares;
  const damage = CONFIG.woodland.snareDamage;
  u.hp -= damage;
  ev.push({ type: 'snared', unit: u.id, at: u.pos, damage });
  u.mp = 0; u.bonusMp = 0;
  if (u.hp <= 0) {
    removeUnit(s, u.id);
    ev.push({ type: 'died', unit: u.id });
  }
  return true;
}

// rules 11, snare: add a snare of `owner` on `at`; past snareMax the owner's oldest simply disappears.
export function setSnare(s: MatchState, owner: PlayerId, at: HexKey): void {
  const snares = s.snares ?? [];
  snares.push({ owner, at });
  if (snares.filter((n) => n.owner === owner).length > CONFIG.woodland.snareMax) {
    snares.splice(snares.findIndex((n) => n.owner === owner), 1);
  }
  s.snares = snares;
}
