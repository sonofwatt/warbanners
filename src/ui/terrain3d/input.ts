// What the 3D terrain draws, taken from the board's scene, and which SVG layers it replaces. No three.js here: the
// board imports this file whether the option is on or off, so it must stay small and free of side effects.
import type { BuildingId, City, FactionId, HexKey, Resource, Terrain, Tile } from '../../engine';
import type { SceneItem, SceneTile } from '../board/scene';
import { playerColour } from '../art/palette';
import { borderLines } from '../art/tiles';
import { bordersKey, THICK_3D, tileCode } from './codes';

// The pieces the lazy 3D chunk needs at run time live in codes.ts, so this file (which reaches the svg art and,
// through it, the engine) stays out of that chunk.
export { bordersKey, THICK_3D, tileCode };

/** One explored tile as the terrain sees it. Fogged tiles carry nothing but their key. */
export interface GlTile {
  terrain: Terrain;
  resource: Resource | null;
  harvested: boolean; // rules 8: its resource was harvested; the resource stays and is drawn faded, as in the SVG
  building: BuildingId | null;
  village: boolean;
  treasure: boolean;
  road: boolean;
  city: boolean;
  // The city standing here, as the 3D look draws it: its owner's faction (roof colour and style), level, capital and
  // walls. Null on a tile with no city (and on a city whose owner has no faction, which the svg leaves blank too).
  town: GlTown | null;
  // buildings3d: the faction owning the land, for a market's awnings (null for every other tile, so a border that
  // moves never rebuilds a tile whose look does not show it), and a treasure drawn beside a unit standing on it.
  owner?: FactionId | null;
  beside?: boolean;
  // tracks3d: a busy road's wear, for the ground shader (left out on a light road and every other tile).
  roadWear?: GlRoadWear;
}
/**
 * tracks3d: how worn a road is: `road` its wear step at the tile's centre (0, a light road, to 3), `edges` its wear
 * where it meets each neighbour, a base 4 digit per edge in the 3D look's edge order (layout.ts EDGE_NB).
 */
export interface GlRoadWear { road: number; edges: number }
/** What a city shows in 3D. A reward waiting to be chosen (the star) stays in the svg, over everything. */
export interface GlTown { faction: FactionId; level: number; capital: boolean; walls: boolean }
export interface GlMap {
  radius: number;
  tiles: Record<HexKey, GlTile>;
  fog: HexKey[]; // never explored: drawn as today's blank fog tile, nothing about the ground beneath
  // Territory borders, drawn in the 3D scene so a mountain, a city or a tree in front of one hides it (it shows faintly
  // through). Optional, so a map built by hand for a test or a sample can leave them out.
  borders?: GlBorder[];
  // water3d: the match's seed, for the choices the look makes from the map alone (which mountains join in a ridge,
  // ridges.ts), so every viewer and every redraw agrees. 0 when left out.
  seed?: number;
}
/**
 * A tile's territory border: its edges (the engine's direction order, as SceneTile.borderEdges), the owner's colour,
 * and the lines the svg Border draws for them, in board units round the tile centre ([ax, ay, bx, by] each).
 */
export interface GlBorder { key: HexKey; edges: number[]; colour: string; lines: [number, number, number, number][] }


/** Terrains and resources that have WebGL art. Anything else is left to the SVG board, so nothing goes missing. */
export const GL_TERRAIN: ReadonlySet<Terrain> = new Set<Terrain>(['field', 'forest', 'mountain', 'water']);
export const GL_RESOURCE: ReadonlySet<Resource> = new Set<Resource>(['orchard', 'cropland', 'game', 'ore', 'jewels', 'fish']);
/**
 * Buildings with WebGL art: every one. The mine (a timber-framed tunnel into the mountain, a lantern inside) and its
 * foundry; the farm, granary, orchard, plantation, lumber camp, lumber mill and market (buildings.ts).
 */
export const GL_BUILDING: ReadonlySet<BuildingId> = new Set<BuildingId>([
  'farm', 'lumberCamp', 'mine', 'market', 'orchard', 'plantation', 'lumberMill', 'foundry', 'granary',
]);

/** The SVG layers a tile draws. With the terrain on, the ground, roads, terrain features and resources go to WebGL. */
export interface SvgLayers {
  base: boolean; // the tile's top face and walls (TileBase), fog included
  road: boolean;
  feature: boolean; // mountains, forests, water waves, and the grove behind what shares a forest
  resource: boolean;
  town: boolean; // a city's houses, hall, banner and walls (CityMark); its reward star is always drawn by the svg
  village: boolean;
  building: boolean; // the tile's building mark (BuildingMark), when it has one
  border: boolean; // the territory border lines
  treasure: boolean; // the treasure chest (Treasure), when the tile shows one
}

const ALL: SvgLayers = { base: true, road: true, feature: true, resource: true, town: true, village: true, building: true, border: true, treasure: true };
const NONE: SvgLayers = { base: false, road: false, feature: false, resource: false, town: false, village: false, building: false, border: false, treasure: false };

export function svgLayers(t: { fog: boolean; tile: Tile | null; city?: City | null }, gl: boolean): SvgLayers {
  if (!gl) return ALL;
  if (t.fog || t.tile === null) return NONE;
  if (!GL_TERRAIN.has(t.tile.terrain)) return ALL;
  return {
    ...NONE,
    resource: t.tile.resource !== null && !GL_RESOURCE.has(t.tile.resource),
    building: t.tile.building !== null && !GL_BUILDING.has(t.tile.building),
  };
}

/**
 * The terrain map for the scene, its signature (equal signatures need no rebuild), and the veiled tiles with
 * their own signature (a change of veil only repaints, it never rebuilds geometry).
 */
export function glMapOf(items: readonly SceneItem[], radius: number, factions: readonly FactionId[] = [], seed = 0): { map: GlMap; key: string; veiled: HexKey[]; veilKey: string } {
  const tiles: Record<HexKey, GlTile> = {};
  const fog: HexKey[] = [];
  const veiled: HexKey[] = [];
  const borders: GlBorder[] = [];
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
      harvested: t.harvested,
      building: t.building,
      village: t.village,
      treasure: t.treasure,
      road: t.road,
      city: it.city !== null,
      town: townOf(it.city, factions),
      owner: t.building === 'market' && it.owner !== null ? factions[it.owner] ?? null : null,
      beside: t.treasure && it.occupied,
    };
    const wear = it.city === null ? glRoadWearOf(it) : null;
    if (wear !== null) tiles[it.key]!.roadWear = wear;
    if (it.veiled) veiled.push(it.key);
    const ownerFaction = it.owner === null ? undefined : factions[it.owner];
    if (ownerFaction !== undefined && it.borderEdges.length > 0) borders.push({
      key: it.key, edges: [...it.borderEdges], colour: playerColour(ownerFaction).main,
      lines: borderLines(it.borderEdges).map(({ a, b }) => [a.x, a.y, b.x, b.y]),
    });
  }
  borders.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const keys = Object.keys(tiles).sort();
  const key = `${radius}|${seed}|${keys.map((k) => {
    const t = tiles[k]!;
    return `${k}:${tileCode(t)}`;
  }).join(' ')}|${fog.slice().sort().join(' ')}|${bordersKey(borders)}`;
  return { map: { radius, tiles, fog, borders, seed }, key, veiled, veilKey: veiled.slice().sort().join(' ') };
}

/** The 3D edge (EDGE_NB order) of an engine direction (DIRS order). */
export const edge3d = (dir: number): number => (6 - dir) % 6;

/** A scene tile's road wear packed for the 3D ground (GlRoadWear), or null on a light road or no road. */
export function glRoadWearOf(it: SceneTile): GlRoadWear | null {
  if (it.tile?.road !== true) return null;
  const wear = it.roadWear ?? [];
  let edges = 0;
  it.roadLinks.forEach((d, i) => { edges += (wear[i] ?? 0) * 4 ** edge3d(d); });
  const road = it.roadLevel ?? 0;
  return road === 0 && edges === 0 ? null : { road, edges };
}

function townOf(city: City | null, factions: readonly FactionId[]): GlTown | null {
  if (city === null) return null;
  const faction = factions[city.owner];
  return faction === undefined ? null : { faction, level: city.level, capital: city.capital, walls: city.walls };
}


