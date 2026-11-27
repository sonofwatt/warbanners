import { CONFIG } from './data/config';
import { UNITS } from './data/units';
import { distance, key, parseKey, range } from './hex';
import type { HexKey } from './hex';
import { freshDeeds } from './heroes';
import { tileAt } from './state';
import { isHidden } from './woodland';
import type { City, MatchState, PlayerId, Tile, Unit } from './types';

function addAround(s: MatchState, out: Set<HexKey>, center: HexKey, radius: number): void {
  for (const h of range(parseKey(center), radius)) {
    const k = key(h);
    if (tileAt(s, k) !== undefined) out.add(k);
  }
}

export function unitSight(s: MatchState, u: Unit): number {
  const bonus = tileAt(s, u.pos)?.terrain === 'mountain' ? CONFIG.mountainSightBonus : 0;
  return UNITS[u.type].sight + (u.heroTraits.includes('watchful') ? CONFIG.heroes.watchfulSight : 0) + bonus;
}

export function visibleTiles(s: MatchState, player: PlayerId): Set<HexKey> {
  const out = new Set<HexKey>();
  for (const u of s.units) {
    if (u.owner !== player || u.blinded) continue;
    addAround(s, out, u.pos, unitSight(s, u));
  }
  for (const c of s.cities) {
    if (c.owner === player) addAround(s, out, c.pos, c.radius + CONFIG.citySightExtra);
  }
  return out;
}

export function refreshExplored(s: MatchState, player: PlayerId): void {
  const p = s.players[player];
  if (p === undefined) return;
  const all = new Set<HexKey>(p.explored);
  for (const k of visibleTiles(s, player)) all.add(k);
  p.explored = [...all].sort();
}

// A unit or city of `player` close enough to reveal a hidden unit on `pos`: a city also sees one on its own tile.
function hasSpotterNextTo(s: MatchState, player: PlayerId, pos: HexKey): boolean {
  const at = parseKey(pos);
  for (const u of s.units) {
    if (u.owner === player && !u.blinded && distance(parseKey(u.pos), at) <= CONFIG.hiddenRevealRange) return true;
  }
  for (const c of s.cities) {
    if (c.owner === player && distance(parseKey(c.pos), at) <= CONFIG.hiddenRevealRange) return true;
  }
  return false;
}

// `visible` is visibleTiles(s, player); callers checking many units compute it once and pass it in.
export function canSeeUnit(
  s: MatchState, player: PlayerId, u: Unit, visible: ReadonlySet<HexKey> = visibleTiles(s, player),
): boolean {
  if (u.owner === player) return true;
  if (!visible.has(u.pos)) return false;
  if (isHidden(s, u)) return hasSpotterNextTo(s, player, u.pos);
  return true;
}

export interface PlayerView {
  player: PlayerId; tiles: Record<HexKey, Tile>; cities: City[]; units: Unit[]; visible: HexKey[];
}

// The view is a copy that shares nothing with the match. It is made field by field rather than with structuredClone,
// which costs several times more and is paid on the phone's main thread after every action.
export function playerView(s: MatchState, player: PlayerId): PlayerView {
  const explored = s.players[player]?.explored ?? [];
  const tiles: Record<HexKey, Tile> = {};
  for (const k of explored) {
    const t = tileAt(s, k);
    if (t !== undefined) tiles[k] = { ...t };
  }
  const visible = visibleTiles(s, player);
  const units = s.units
    .filter((u) => u.owner === player || (visible.has(u.pos) && canSeeUnit(s, player, u, visible)))
    .map((u) => ({
      ...u, lure: u.lure === null ? null : { ...u.lure }, heroTraits: [...u.heroTraits],
      deeds: u.owner === player ? { ...u.deeds } : freshDeeds(),   // deeds are private; traits and items are public
    }));
  const cities = s.cities.filter((c) => tiles[c.pos] !== undefined).map((c) => ({ ...c, pendingRewards: [...c.pendingRewards] }));
  return { player, tiles, cities, units, visible: [...visible].sort() };
}
