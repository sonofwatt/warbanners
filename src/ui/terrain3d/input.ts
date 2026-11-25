// What the 3D terrain draws, taken from the board's scene, and which SVG layers it replaces. No three.js here: the
// board imports this file whether the option is on or off, so it must stay small and free of side effects.
import type { BuildingId, HexKey, Resource, Terrain, Tile } from '../../engine';
import type { SceneItem } from '../board/scene';

/** One explored tile as the terrain sees it. Fogged tiles carry nothing but their key. */
export interface GlTile {
  terrain: Terrain;
  resource: Resource | null;
  building: BuildingId | null;
  village: boolean;
  treasure: boolean;
  road: boolean;
  city: boolean;
}
export interface GlMap {
  radius: number;
  tiles: Record<HexKey, GlTile>;
  fog: HexKey[]; // never explored: drawn as today's blank fog tile, nothing about the ground beneath
}

/**
 * How tall a tile's side wall shows on screen with the 3D terrain, in board units: the board reads as a thick slab
 * of land (the SVG board's wall is THICK, 9). Only the walls below the tile tops grow; the tops stay where they are.
 */
export const THICK_3D = 45;

/** Terrains and resources that have WebGL art. Anything else is left to the SVG board, so nothing goes missing. */
export const GL_TERRAIN: ReadonlySet<Terrain> = new Set<Terrain>(['field', 'forest', 'mountain', 'water']);
export const GL_RESOURCE: ReadonlySet<Resource> = new Set<Resource>(['orchard', 'cropland', 'game', 'ore']);

/** The SVG layers a tile draws. With the terrain on, the ground, roads, terrain features and resources go to WebGL. */
export interface SvgLayers {
  base: boolean; // the tile's top face and walls (TileBase), fog included
  road: boolean;
  feature: boolean; // mountains, forests, water waves, and the grove behind what shares a forest
  resource: boolean;
}

const ALL: SvgLayers = { base: true, road: true, feature: true, resource: true };

export function svgLayers(t: { fog: boolean; tile: Tile | null }, gl: boolean): SvgLayers {
  if (!gl) return ALL;
  if (t.fog || t.tile === null) return { base: false, road: false, feature: false, resource: false };
  if (!GL_TERRAIN.has(t.tile.terrain)) return ALL;
  return { base: false, road: false, feature: false, resource: t.tile.resource !== null && !GL_RESOURCE.has(t.tile.resource) };
}

/**
 * The terrain map for the scene, its signature (equal signatures need no rebuild), and the veiled tiles with
 * their own signature (a change of veil only repaints, it never rebuilds geometry).
 */
export function glMapOf(items: readonly SceneItem[], radius: number): { map: GlMap; key: string; veiled: HexKey[]; veilKey: string } {
  const tiles: Record<HexKey, GlTile> = {};
  const fog: HexKey[] = [];
  const veiled: HexKey[] = [];
  for (const it of items) {
    if (it.kind !== 'tile') continue;
    if (it.fog || it.tile === null) {
      fog.push(it.key);
      continue;
    }
    const t = it.tile;
    if (!GL_TERRAIN.has(t.terrain)) continue;
    tiles[it.key] = {
      terrain: t.terrain,
      resource: t.resource !== null && GL_RESOURCE.has(t.resource) ? t.resource : null,
      building: t.building,
      village: t.village,
      treasure: t.treasure,
      road: t.road,
      city: it.city !== null,
    };
    if (it.veiled) veiled.push(it.key);
  }
  const keys = Object.keys(tiles).sort();
  const key = `${radius}|${keys.map((k) => {
    const t = tiles[k]!;
    return `${k}:${t.terrain[0]}${t.resource ?? '-'}${t.building ?? '-'}${t.village ? 'v' : ''}${t.treasure ? 't' : ''}${t.road ? 'r' : ''}${t.city ? 'c' : ''}`;
  }).join(' ')}|${fog.slice().sort().join(' ')}`;
  return { map: { radius, tiles, fog }, key, veiled, veilKey: veiled.slice().sort().join(' ') };
}
