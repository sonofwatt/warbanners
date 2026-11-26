// The small pieces of the terrain's input the lazy 3D chunk needs at run time. No imports, so the chunk does not pull
// in the svg art or the engine through input.ts.
import type { GlBorder, GlTile } from './input';

/**
 * How tall a tile's side wall shows on screen with the 3D terrain, in board units: the board reads as a thick slab
 * of land (the SVG board's wall is THICK, 9). Only the walls below the tile tops grow; the tops stay where they are.
 */
export const THICK_3D = 45;

/** Everything about a tile the 3D geometry shows, as a short code: equal codes build equal geometry. */
export function tileCode(t: GlTile): string {
  const town = t.town === null ? '' : `[${t.town.faction[0]}${t.town.level}${t.town.capital ? 'C' : ''}${t.town.walls ? 'W' : ''}]`;
  return `${t.terrain[0]}${t.resource ?? '-'}${t.harvested ? 'h' : ''}${t.building ?? '-'}${t.village ? 'v' : ''}${t.treasure ? 't' : ''}${t.road ? 'r' : ''}${t.city ? 'c' : ''}${t.beside === true ? 'b' : ''}${t.owner ? `(${t.owner[0]})` : ''}${town}`;
}

/** The borders' own signature: the border mesh is rebuilt only when it changes. */
export function bordersKey(borders: readonly GlBorder[] | undefined): string {
  return (borders ?? []).map((b) => `${b.key}:${b.edges.join('')}${b.colour}`).join(' ');
}
