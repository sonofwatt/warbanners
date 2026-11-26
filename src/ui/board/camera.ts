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
 * What a panel lying over the board covers of the slot, in slot pixels from each edge (the unit card at the bottom
 * in portrait, the side column in landscape). The slot itself keeps its size; only the part not covered counts for
 * the dead zone and for keeping a selection in sight, and the clamp lets the view run that much further on the
 * covered side, so the map's edge tiles can still be brought out from under the panel.
 */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Where the view centre may be along one axis. When the board is larger than the screen on that axis,
 * the view may run at most EDGE_PX past the board's edge; when it is smaller, it is centred. `padLo` and `padHi`
 * (pixels) let it run that much further past the low (top or left) and high (bottom or right) edges.
 */
function axisRange(lo: number, hi: number, scale: number, screenPx: number, padLo = 0, padHi = 0): [number, number] {
  let a: number, b: number;
  if ((hi - lo) * scale <= screenPx) {
    a = b = (lo + hi) / 2;
  } else {
    const reach = (screenPx / 2 - EDGE_PX) / scale;
    a = lo + reach;
    b = hi - reach;
  }
  return [a - padLo / scale, b + padHi / scale];
}

function clampCamera(c: Camera, bounds: Box, vp: Viewport, slack: Insets = NO_INSETS): Camera {
  const scale = clampScale(c.scale, bounds, vp);
  const [x0, x1] = axisRange(bounds.minX, bounds.maxX, scale, vp.w, slack.left, slack.right);
  const [y0, y1] = axisRange(bounds.minY, bounds.maxY, scale, vp.h, slack.top, slack.bottom);
  return { cx: clamp(c.cx, x0, x1), cy: clamp(c.cy, y0, y1), scale };
}

/**
 * The room the clamp gives a move that starts from `c`: on each side, what the panel covers there, or how far `c`
 * already runs past the plain limit on that side, whichever is more. So a view left past the plain limit when a
 * panel closed stays where it is (nothing eases it back), and the next drag or zoom never jumps it in: it can only
 * come back toward the board, never run further out.
 */
export function slackFor(c: Camera, bounds: Box, vp: Viewport, cover: Insets = NO_INSETS): Insets {
  const [x0, x1] = axisRange(bounds.minX, bounds.maxX, c.scale, vp.w);
  const [y0, y1] = axisRange(bounds.minY, bounds.maxY, c.scale, vp.h);
  const past = (v: number): number => Math.max(0, v * c.scale);
  return {
    left: Math.max(cover.left, past(x0 - c.cx)),
    right: Math.max(cover.right, past(c.cx - x1)),
    top: Math.max(cover.top, past(y0 - c.cy)),
    bottom: Math.max(cover.bottom, past(c.cy - y1)),
  };
}

/** The part of the slot a panel does not cover, in slot pixels. */
export function uncovered(vp: Viewport, cover: Insets = NO_INSETS): Box {
  return { minX: cover.left, minY: cover.top, maxX: vp.w - cover.right, maxY: vp.h - cover.bottom };
}

/** The opening view: the default zoom, the focus in the middle of the part of the slot no panel or bar covers. */
export function startCamera(focus: Pt, bounds: Box, vp: Viewport, cover: Insets = NO_INSETS): Camera {
  const scale = clampScale(DEFAULT_TILE_PX / TILE_W, bounds, vp);
  return centreOn({ cx: focus.x, cy: focus.y, scale }, focus, bounds, vp, cover);
}

/**
 * The camera moved so the board point p is in the middle of the part of the slot no panel covers (as near as the
 * clamp allows), zoom kept.
 */
export function centreOn(c: Camera, p: Pt, bounds: Box, vp: Viewport, cover: Insets = NO_INSETS, slack: Insets = cover): Camera {
  const u = uncovered(vp, cover);
  const sx = (u.minX + u.maxX) / 2, sy = (u.minY + u.maxY) / 2;
  return clampCamera({ cx: p.x - (sx - vp.w / 2) / c.scale, cy: p.y - (sy - vp.h / 2) / c.scale, scale: c.scale }, bounds, vp, slack);
}

/** Dragging by (dx, dy) pixels moves the board with the finger, so the centre moves the other way. */
export function panBy(c: Camera, dxPx: number, dyPx: number, bounds: Box, vp: Viewport, slack: Insets = NO_INSETS): Camera {
  return clampCamera({ cx: c.cx - dxPx / c.scale, cy: c.cy - dyPx / c.scale, scale: c.scale }, bounds, vp, slack);
}

/** The board point under atPx stays under it (unless a clamp stops it). */
export function zoomAt(c: Camera, factor: number, atPx: Pt, bounds: Box, vp: Viewport, slack: Insets = NO_INSETS): Camera {
  const scale = clampScale(c.scale * factor, bounds, vp);
  const p = screenToBoard(c, vp, atPx);
  return clampCamera(
    { cx: p.x - (atPx.x - vp.w / 2) / scale, cy: p.y - (atPx.y - vp.h / 2) / scale, scale },
    bounds,
    vp,
    slack,
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

const KEEP_PX = 8; // the room keepInView leaves between a kept box and the slot's edge, unless told otherwise

/**
 * The least pan that brings `box` (board units) inside the part of the slot no panel covers, `margin` pixels clear
 * of its edges; none when it is already there (then `c` itself comes back). Used for a new selection: a tile the
 * player can see where the panel leaves the board never moves the view.
 */
export function keepInView(
  c: Camera, vp: Viewport, box: Box, bounds: Box, opts: { cover?: Insets; margin?: number; slack?: Insets } = {},
): Camera {
  const m = opts.margin ?? KEEP_PX;
  const cover = opts.cover ?? NO_INSETS;
  const u = uncovered(vp, cover);
  const lo = boardToScreen(c, vp, { x: box.minX, y: box.minY });
  const hi = boardToScreen(c, vp, { x: box.maxX, y: box.maxY });
  const shift = (a: number, b: number, from: number, to: number): number => {
    if (b - a > to - from - 2 * m) return a < from + m ? from + m - a : 0; // too big to fit: show its start
    if (a < from + m) return from + m - a;
    if (b > to - m) return to - m - b;
    return 0;
  };
  const dx = shift(lo.x, hi.x, u.minX, u.maxX);
  const dy = shift(lo.y, hi.y, u.minY, u.maxY);
  if (dx === 0 && dy === 0) return c;
  const next = panBy(c, dx, dy, bounds, vp, opts.slack ?? cover);
  return Math.abs(next.cx - c.cx) * c.scale < 0.5 && Math.abs(next.cy - c.cy) * c.scale < 0.5 ? c : next;
}

/** After a rotation or resize: same centre, scale re-clamped. */
export function refit(c: Camera, bounds: Box, vp: Viewport, slack: Insets = NO_INSETS): Camera {
  return clampCamera(c, bounds, vp, slack);
}

export function screenToBoard(c: Camera, vp: Viewport, px: Pt): Pt {
  return { x: c.cx + (px.x - vp.w / 2) / c.scale, y: c.cy + (px.y - vp.h / 2) / c.scale };
}

export function boardToScreen(c: Camera, vp: Viewport, p: Pt): Pt {
  return { x: vp.w / 2 + (p.x - c.cx) * c.scale, y: vp.h / 2 + (p.y - c.cy) * c.scale };
}

/**
 * The dead zone: the middle part of the slot (this share of its width and of its height) where an action can happen
 * without the view following it. The board slot sits under the top bar; a panel lying over it (the unit card, the
 * side column) is left out first, so the zone is the middle of what the player can see.
 */
export const DEAD_ZONE = 0.6;

/** The dead zone in slot pixels: the middle share of the part of the slot no panel covers. */
export function deadZone(vp: Viewport, zone = DEAD_ZONE, cover: Insets = NO_INSETS): Box {
  const u = uncovered(vp, cover);
  const w = u.maxX - u.minX, h = u.maxY - u.minY;
  const mx = (w * (1 - zone)) / 2, my = (h * (1 - zone)) / 2;
  return { minX: u.minX + mx, minY: u.minY + my, maxX: u.maxX - mx, maxY: u.maxY - my };
}

/**
 * The view for an action covering `box` (board units): unchanged when the box is already inside the dead zone (a
 * camera equal to `c` is returned as `c` itself), else the least pan that brings it inside, or, when it is larger
 * than the zone along an axis, centres it along that axis. Clamped to the board as every pan is, so near the board's
 * edge the view may stop short.
 */
export function followAction(
  c: Camera, vp: Viewport, box: Box, bounds: Box, opts: { zone?: number; cover?: Insets; slack?: Insets } = {},
): Camera {
  const cover = opts.cover ?? NO_INSETS;
  const z = deadZone(vp, opts.zone ?? DEAD_ZONE, cover);
  const lo = boardToScreen(c, vp, { x: box.minX, y: box.minY });
  const hi = boardToScreen(c, vp, { x: box.maxX, y: box.maxY });
  const shift = (a: number, b: number, zlo: number, zhi: number): number => {
    if (b - a > zhi - zlo) return (zlo + zhi) / 2 - (a + b) / 2;
    if (a < zlo) return zlo - a;
    if (b > zhi) return zhi - b;
    return 0;
  };
  const dx = shift(lo.x, hi.x, z.minX, z.maxX);
  const dy = shift(lo.y, hi.y, z.minY, z.maxY);
  if (dx === 0 && dy === 0) return c;
  const next = panBy(c, dx, dy, bounds, vp, opts.slack ?? cover);
  return Math.abs(next.cx - c.cx) * c.scale < 0.5 && Math.abs(next.cy - c.cy) * c.scale < 0.5 ? c : next;
}

/** The shortest and longest an automatic pan takes: quick for a short hop, a little longer across the screen. */
export const PAN_MIN_MS = 250;
export const PAN_MAX_MS = 400;

/** How long an automatic pan from `a` to `b` takes, by how far the board moves on screen (and how much it zooms). */
export function panMs(a: Camera, b: Camera, vp: Viewport): number {
  const px = Math.hypot((b.cx - a.cx) * a.scale, (b.cy - a.cy) * a.scale);
  const zoom = Math.abs(Math.log(b.scale / a.scale)) * Math.max(vp.w, vp.h) / 2;
  const reach = Math.max(vp.w, vp.h);
  const t = Math.min(1, (px + zoom) / reach);
  return Math.round(PAN_MIN_MS + (PAN_MAX_MS - PAN_MIN_MS) * t);
}

/** Ease in and out (cubic): a smooth but quick start, the same stop. 0 at 0, 1 at 1. */
export function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** The camera a share `t` (0 to 1, already eased) of the way from `a` to `b`; the scale moves evenly in log space. */
export function cameraBetween(a: Camera, b: Camera, t: number): Camera {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    cx: a.cx + (b.cx - a.cx) * t,
    cy: a.cy + (b.cy - a.cy) * t,
    scale: a.scale * Math.pow(b.scale / a.scale, t),
  };
}
