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
const EDGE_PX = 24; // the most sky the view may show past the board's edge

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

/**
 * Where the view centre may be along one axis. When the board is larger than the screen on that axis,
 * the view may run at most EDGE_PX past the board's edge; when it is smaller, it is centred.
 */
function clampAxis(c: number, lo: number, hi: number, scale: number, screenPx: number): number {
  if ((hi - lo) * scale <= screenPx) return (lo + hi) / 2;
  const reach = (screenPx / 2 - EDGE_PX) / scale;
  return clamp(c, lo + reach, hi - reach);
}

function clampCamera(c: Camera, bounds: Box, vp: Viewport): Camera {
  const scale = clampScale(c.scale, bounds, vp);
  return {
    cx: clampAxis(c.cx, bounds.minX, bounds.maxX, scale, vp.w),
    cy: clampAxis(c.cy, bounds.minY, bounds.maxY, scale, vp.h),
    scale,
  };
}

export function startCamera(focus: Pt, bounds: Box, vp: Viewport): Camera {
  return clampCamera({ cx: focus.x, cy: focus.y, scale: DEFAULT_TILE_PX / TILE_W }, bounds, vp);
}

/** The camera moved so the board point p is in the middle of the slot (as near as the clamp allows), zoom kept. */
export function centreOn(c: Camera, p: Pt, bounds: Box, vp: Viewport): Camera {
  return clampCamera({ cx: p.x, cy: p.y, scale: c.scale }, bounds, vp);
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

/**
 * After the slot changes size (a panel opening beside or below it): the board point at the slot's top-left
 * corner stays where it is, so a slot that only loses its bottom or right part moves nothing. The sky the view
 * already showed past an edge is allowed to stay, so a board that was centred is not nudged by the edge rule.
 */
export function keepCorner(c: Camera, was: Viewport, now: Viewport, bounds: Box): Camera {
  const scale = clampScale(c.scale, bounds, now);
  const moved = { cx: c.cx + (now.w - was.w) / 2 / c.scale, cy: c.cy + (now.h - was.h) / 2 / c.scale, scale: c.scale };
  if (scale !== c.scale) return clampCamera(moved, bounds, now);
  const axis = (v: number, lo: number, hi: number, wasC: number, wasPx: number, nowPx: number): number => {
    if ((hi - lo) * scale <= nowPx) return (lo + hi) / 2;
    const skyLo = Math.max(EDGE_PX, (lo - (wasC - wasPx / 2 / scale)) * scale);
    const skyHi = Math.max(EDGE_PX, (wasC + wasPx / 2 / scale - hi) * scale);
    return clamp(v, lo + (nowPx / 2 - skyLo) / scale, hi - (nowPx / 2 - skyHi) / scale);
  };
  return {
    cx: axis(moved.cx, bounds.minX, bounds.maxX, c.cx, was.w, now.w),
    cy: axis(moved.cy, bounds.minY, bounds.maxY, c.cy, was.h, now.h),
    scale,
  };
}

const KEEP_PX = 8; // the room keepInView leaves between a kept box and the slot's edge

/** The least pan that brings `box` (board units) inside the slot with a small margin; none when it is already. */
export function keepInView(c: Camera, vp: Viewport, box: Box, bounds: Box): Camera {
  const lo = boardToScreen(c, vp, { x: box.minX, y: box.minY });
  const hi = boardToScreen(c, vp, { x: box.maxX, y: box.maxY });
  const shift = (a: number, b: number, size: number): number => {
    if (b - a > size - 2 * KEEP_PX) return a < KEEP_PX ? KEEP_PX - a : 0; // too big to fit: show its start
    if (a < KEEP_PX) return KEEP_PX - a;
    if (b > size - KEEP_PX) return size - KEEP_PX - b;
    return 0;
  };
  const dx = shift(lo.x, hi.x, vp.w);
  const dy = shift(lo.y, hi.y, vp.h);
  if (dx === 0 && dy === 0) return c;
  return panBy(c, dx, dy, bounds, vp);
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
