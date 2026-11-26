// Where the 3D board's waterfalls are: every side of a water tile that shows its water column to the camera with
// nothing in front of it, so the sea spills over the board's edge into the abyss. Pure maths, no three.js.
import type { HexKey } from '../../engine';
import type { GlMap } from './input';
import { centre, EDGE_NB, parse, R, SQUASH, COS_E, WALL, WATER_Y } from './layout';

/**
 * The edges the camera can see: their outward normals (60e degrees, world z toward the viewer) point at it. Edge 0
 * and 3 are seen edge on and the back three face away, so only edges 1 and 2 ever show a wall.
 */
export const FRONT_EDGES: readonly number[] = [1, 2];

/** How far below the wall's foot the falling water runs on into the abyss before it has faded away, in world units. */
export const FALL_TAIL = 26;

const hexDist = (q: number, r: number): number => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;

/**
 * The edges of water tile `k` that pour over: front edges whose neighbour is off the board. A neighbour on the board
 * always covers the wall (its own top and wall stand in front, fogged or not, in WebGL or in the svg), so only the
 * board's rim falls. Empty for land and for tiles that are not drawn.
 */
export function waterfallEdges(map: GlMap, k: HexKey): number[] {
  const t = map.tiles[k];
  if (t === undefined || t.terrain !== 'water' || t.city) return [];
  const { q, r } = parse(k);
  const out: number[] = [];
  for (const e of FRONT_EDGES) {
    const [dq, dr] = EDGE_NB[e]!;
    if (hexDist(q + dq, r + dr) > map.radius) out.push(e);
  }
  return out;
}

/** One waterfall: the tile, the edge, its two top corners (world x, z), its outward normal and its board box. */
export interface FallSpot {
  key: HexKey;
  q: number;
  r: number;
  edge: number;
  a: [number, number];
  b: [number, number];
  n: [number, number];
  /** The board-space box it covers on screen, from the water's lip to the end of the fall, for the on-screen test. */
  box: { x0: number; x1: number; y0: number; y1: number };
}

/** Every waterfall on the map, in a stable order. */
export function fallSpots(map: GlMap): FallSpot[] {
  const out: FallSpot[] = [];
  for (const k of Object.keys(map.tiles).sort()) {
    for (const e of waterfallEdges(map, k)) {
      const { q, r } = parse(k);
      const c = centre(q, r);
      const corner = (i: number): [number, number] => { const a = ((30 + 60 * i) * Math.PI) / 180; return [c.x + R * Math.cos(a), c.z + R * Math.sin(a)]; };
      // Edge e runs from corner e-1 to corner e (as the tile walls are built).
      const a = corner((e + 5) % 6), b = corner(e);
      const n: [number, number] = [Math.cos((e * Math.PI) / 3), Math.sin((e * Math.PI) / 3)];
      const flare = 8; // the sheet leans out and the mist spreads, a little beyond the corners
      const xs = [a[0], b[0]], zs = [a[1], b[1]];
      const top = Math.min(...zs) * SQUASH - (WATER_Y + 2) * COS_E;
      const bottom = (Math.max(...zs) + flare) * SQUASH + (WALL + FALL_TAIL + 6) * COS_E;
      out.push({ key: k, q, r, edge: e, a, b, n, box: { x0: Math.min(...xs) - flare - 14, x1: Math.max(...xs) + flare + 14, y0: top, y1: bottom } });
    }
  }
  return out;
}

/** Whether any of the boxes meets the view: the board rect centred on (cx, cy), w by h board units. */
export function anyInView(boxes: readonly { x0: number; x1: number; y0: number; y1: number }[], view: { x0: number; x1: number; y0: number; y1: number }): boolean {
  for (const b of boxes) if (b.x1 >= view.x0 && b.x0 <= view.x1 && b.y1 >= view.y0 && b.y0 <= view.y1) return true;
  return false;
}
