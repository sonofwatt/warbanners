import { R } from './layout';
import type { Box, Pt } from './layout';

/** cx, cy: the board point at the viewport centre. scale: pixels per board unit. */
export interface Camera {
  cx: number;
  cy: number;
  scale: number;
}
export interface Viewport {
  w: number;
  h: number;
}

export const DEFAULT_TILE_PX = 64; // tile width on screen when a match opens
export const MAX_TILE_PX = 110; // closest zoom

const TILE_W = R * Math.sqrt(3);
const MARGIN_PX = 16;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Whole board visible with a 16 px margin; this is the farthest zoom. */
export function fitScale(bounds: Box, vp: Viewport): number {
  const sx = (vp.w - 2 * MARGIN_PX) / (bounds.maxX - bounds.minX);
  const sy = (vp.h - 2 * MARGIN_PX) / (bounds.maxY - bounds.minY);
  return Math.min(sx, sy);
}

function clampScale(scale: number, bounds: Box, vp: Viewport): number {
  const lo = fitScale(bounds, vp);
  const hi = Math.max(lo, MAX_TILE_PX / TILE_W);
  return clamp(scale, lo, hi);
}

function clampCamera(c: Camera, bounds: Box, vp: Viewport): Camera {
  return {
    cx: clamp(c.cx, bounds.minX, bounds.maxX),
    cy: clamp(c.cy, bounds.minY, bounds.maxY),
    scale: clampScale(c.scale, bounds, vp),
  };
}

export function startCamera(focus: Pt, bounds: Box, vp: Viewport): Camera {
  return clampCamera({ cx: focus.x, cy: focus.y, scale: DEFAULT_TILE_PX / TILE_W }, bounds, vp);
}

/** Dragging by (dx, dy) pixels moves the board with the finger, so the centre moves the other way. */
export function panBy(c: Camera, dxPx: number, dyPx: number, bounds: Box, vp: Viewport): Camera {
  return clampCamera({ cx: c.cx - dxPx / c.scale, cy: c.cy - dyPx / c.scale, scale: c.scale }, bounds, vp);
}

/** The board point under atPx stays under it (unless a clamp stops it). */
export function zoomAt(c: Camera, factor: number, atPx: Pt, bounds: Box, vp: Viewport): Camera {
  const scale = clampScale(c.scale * factor, bounds, vp);
  const p = screenToBoard(c, vp, atPx);
  return clampCamera(
    { cx: p.x - (atPx.x - vp.w / 2) / scale, cy: p.y - (atPx.y - vp.h / 2) / scale, scale },
    bounds,
    vp,
  );
}

/** After a rotation or resize: same centre, scale re-clamped. */
export function refit(c: Camera, bounds: Box, vp: Viewport): Camera {
  return clampCamera(c, bounds, vp);
}

export function screenToBoard(c: Camera, vp: Viewport, px: Pt): Pt {
  return { x: c.cx + (px.x - vp.w / 2) / c.scale, y: c.cy + (px.y - vp.h / 2) / c.scale };
}

export function boardToScreen(c: Camera, vp: Viewport, p: Pt): Pt {
  return { x: vp.w / 2 + (p.x - c.cx) * c.scale, y: vp.h / 2 + (p.y - c.cy) * c.scale };
}
