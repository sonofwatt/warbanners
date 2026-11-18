import { CONFIG } from './data/config';
import { UNITS } from './data/units';
import { distance, key, parseKey, range } from './hex';
import type { HexKey } from './hex';
import { hasTrait, tileAt } from './state';
import type { City, MatchState, PlayerId, Tile, Unit } from './types';

function addAround(s: MatchState, out: Set<HexKey>, center: HexKey, radius: number): void {
  for (const h of range(parseKey(center), radius)) {
    const k = key(h);
    if (tileAt(s, k) !== undefined) out.add(k);
  }
}

function unitSight(s: MatchState, u: Unit): number {
  const bonus = tileAt(s, u.pos)?.terrain === 'mountain' ? CONFIG.mountainSightBonus : 0;
  return UNITS[u.type].sight + bonus;
}

export function visibleTiles(s: MatchState, player: PlayerId): Set<HexKey> {
  const out = new Set<HexKey>();
  for (const u of s.units) {
    if (u.owner !== player || u.blinded) continue;
    addAround(s, out, u.pos, unitSight(s, u));
  }
  for (const c of s.cities) {
    if (c.owner === player) addAround(s, out, c.pos, c.radius + 1);
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

function hasSpotterNextTo(s: MatchState, player: PlayerId, pos: HexKey): boolean {
  const at = parseKey(pos);
  for (const u of s.units) {
    if (u.owner === player && !u.blinded && distance(parseKey(u.pos), at) === 1) return true;
  }
  for (const c of s.cities) {
    if (c.owner === player && distance(parseKey(c.pos), at) === 1) return true;
  }
  return false;
}

export function canSeeUnit(s: MatchState, player: PlayerId, u: Unit): boolean {
  if (u.owner === player) return true;
  if (!visibleTiles(s, player).has(u.pos)) return false;
  if (hasTrait(u, 'hidden')) return hasSpotterNextTo(s, player, u.pos);
  return true;
}

export interface PlayerView {
  player: PlayerId; tiles: Record<HexKey, Tile>; cities: City[]; units: Unit[]; visible: HexKey[];
}

export function playerView(s: MatchState, player: PlayerId): PlayerView {
  const explored = s.players[player]?.explored ?? [];
  const tiles: Record<HexKey, Tile> = {};
  for (const k of explored) {
    const t = tileAt(s, k);
    if (t !== undefined) tiles[k] = structuredClone(t);
  }
  const visible = visibleTiles(s, player);
  const units = s.units
    .filter((u) => u.owner === player || (visible.has(u.pos) && canSeeUnit(s, player, u)))
    .map((u) => structuredClone(u));
  const cities = s.cities.filter((c) => tiles[c.pos] !== undefined).map((c) => structuredClone(c));
  return { player, tiles, cities, units, visible: [...visible].sort() };
}
