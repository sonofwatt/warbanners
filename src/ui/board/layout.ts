import { key, neighbors, parseKey, range } from '../../engine';
import type { HexKey } from '../../engine';

export const R = 30; // tile radius, centre to corner, in board units
export const SQUASH = 0.62; // vertical scale of the tilt
export const THICK = 9; // height of the tile's side wall (0.3 of R)
export const FIGURE_H = 34; // how far a figure stands above its tile centre

export interface Pt {
  x: number;
  y: number;
}
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const SQRT3 = Math.sqrt(3);

/** Centre of the tile's top face. */
export function hexToBoard(k: HexKey): Pt {
  const { q, r } = parseKey(k);
  return { x: R * SQRT3 * (q + r / 2), y: R * 1.5 * SQUASH * r };
}

/** Six corners of the top face, clockwise from lower right. */
export function tileCorners(k: HexKey): Pt[] {
  const c = hexToBoard(k);
  const out: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const a = ((30 + 60 * i) * Math.PI) / 180;
    out.push({ x: c.x + R * Math.cos(a), y: c.y + R * Math.sin(a) * SQUASH });
  }
  return out;
}

/** The hex whose top face holds p (nearest by cube rounding). */
export function boardToHex(p: Pt): HexKey {
  const r = p.y / SQUASH / (R * 1.5);
  const q = p.x / (R * SQRT3) - r / 2;
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return key({ q: rq, r: rr });
}

/** Sort comparator: smaller y first, then smaller x. */
export function depthOrder(a: HexKey, b: HexKey): number {
  const pa = hexToBoard(a);
  const pb = hexToBoard(b);
  return pa.y - pb.y || pa.x - pb.x;
}

/** Every hex of the board, back to front. */
export function boardKeys(radius: number): HexKey[] {
  return range({ q: 0, r: 0 }, radius).map(key).sort(depthOrder);
}

/** One tile with its side wall below (`wall` board units, THICK unless the 3D terrain's taller walls are drawn) and the height of a figure standing on it above. */
export function tileBox(k: HexKey, wall = THICK): Box {
  const c = hexToBoard(k);
  return {
    minX: c.x - (R * SQRT3) / 2,
    maxX: c.x + (R * SQRT3) / 2,
    minY: c.y - R * SQUASH - FIGURE_H,
    maxY: c.y + R * SQUASH + wall,
  };
}

/** Includes side walls below (`wall` board units tall) and figure height above. */
export function boardBounds(radius: number, wall = THICK): Box {
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const k of boardKeys(radius)) {
    const t = tileBox(k, wall);
    box.minX = Math.min(box.minX, t.minX);
    box.maxX = Math.max(box.maxX, t.maxX);
    box.minY = Math.min(box.minY, t.minY);
    box.maxY = Math.max(box.maxY, t.maxY);
  }
  return box;
}

/** Unit direction to each of the six neighbours, in the engine's DIRS order. */
export function edgeDirs(): readonly Pt[] {
  const o = hexToBoard('0,0');
  return neighbors({ q: 0, r: 0 }).map((n) => {
    const p = hexToBoard(key(n));
    const len = Math.hypot(p.x - o.x, p.y - o.y);
    return { x: (p.x - o.x) / len, y: (p.y - o.y) / len };
  });
}
