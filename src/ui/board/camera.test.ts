import { expect, test } from 'vitest';
import { R, boardBounds, hexToBoard, tileBox } from './layout';
import { boardToScreen, fitScale, keepCorner, keepInView, panBy, screenToBoard, startCamera, zoomAt } from './camera';

const B = boardBounds(6);
const VP = { w: 412, h: 915 };

test('fit shows the whole board', () => {
  expect(fitScale(B, VP)).toBeCloseTo(380 / 675.5, 3);
});

test('a match opens at the default zoom on its focus', () => {
  const c = startCamera(hexToBoard('-2,5'), B, VP);
  expect(R * Math.sqrt(3) * c.scale).toBeCloseTo(64, 5);
  expect(c.cx).toBeCloseTo(25.98, 2);
  // 415 board units tall at 1.2317 px each is 511 px, less than 915: the board is centred top to bottom.
  expect(c.cy).toBeCloseTo((B.minY + B.maxY) / 2, 5);
});

test('a focus near the edge stops where the board edge is 24 px from the screen edge', () => {
  const vp = { w: 915, h: 412 };
  const c = startCamera(hexToBoard('-2,5'), B, vp);
  // 675.5 units wide at 1.2317 px is 832 px, less than 915: centred left to right.
  expect(c.cx).toBeCloseTo(0, 5);
  // Taller than 412 px: the bottom of the view may reach 24 px below the board, so the centre is
  // at most maxY + (24 - 206) / scale = 195 - 147.77 = 47.23, short of the focus at 139.5.
  expect(c.cy).toBeCloseTo(B.maxY + (24 - vp.h / 2) / c.scale, 5);
  expect(c.cy).toBeCloseTo(47.23, 2);
  expect(boardToScreen(c, vp, { x: 0, y: B.maxY }).y).toBeCloseTo(vp.h - 24, 5);
});

test('the view shows at most 24 px past the board on an axis where the board is the larger', () => {
  for (const [dx, dy] of [[99999, 0], [-99999, 0]]) {
    const c = panBy({ cx: 0, cy: 0, scale: 2 }, dx!, dy!, B, VP);
    const left = boardToScreen(c, VP, { x: B.minX, y: 0 }).x;
    const right = boardToScreen(c, VP, { x: B.maxX, y: 0 }).x;
    expect(Math.max(left, VP.w - right)).toBeCloseTo(24, 5);
  }
});

test('zoom keeps the point under the finger', () => {
  const vp = { w: 400, h: 800 };
  const c = zoomAt({ cx: 0, cy: 0, scale: 1 }, 2, { x: 300, y: 400 }, B, vp);
  expect(c.cx).toBeCloseTo(50, 5);
  expect(c.cy).toBeCloseTo(0, 5);
  expect(c.scale).toBeCloseTo(2, 5);
});

test('zoom and pan are clamped', () => {
  expect(zoomAt({ cx: 0, cy: 0, scale: 1 }, 100, { x: 0, y: 0 }, B, VP).scale).toBeCloseTo(
    110 / (30 * Math.sqrt(3)),
    5,
  );
  expect(zoomAt({ cx: 0, cy: 0, scale: 1 }, 0.001, { x: 0, y: 0 }, B, VP).scale).toBeCloseTo(
    fitScale(B, VP),
    5,
  );
  const far = panBy({ cx: 0, cy: 0, scale: 1 }, -99999, -99999, B, VP);
  // Wider than the screen (675.5 px at scale 1): the right edge stops 24 px in from the screen's
  // right edge, so cx = maxX + 24 - 206 = 155.75. Shorter than the screen (415 px): centred.
  expect(far.cx).toBeCloseTo(B.maxX + 24 - VP.w / 2, 5);
  expect(far.cx).toBeCloseTo(155.75, 2);
  expect(far.cy).toBeCloseTo((B.minY + B.maxY) / 2, 5);
});

test('screen and board convert both ways', () => {
  const c = { cx: 12, cy: -7, scale: 1.3 };
  const p = screenToBoard(c, VP, { x: 100, y: 500 });
  const back = boardToScreen(c, VP, p);
  expect(back.x).toBeCloseTo(100, 5);
  expect(back.y).toBeCloseTo(500, 5);
});

test('a slot that loses its bottom or right part keeps the board still under the rest', () => {
  const big = { w: 360, h: 536 };
  const c = panBy(startCamera(hexToBoard('0,0'), B, big), 20, -30, B, big);
  for (const small of [{ w: 360, h: 355 }, { w: 240, h: 536 }]) {
    const k = keepCorner(c, big, small, B);
    expect(k.scale).toBe(c.scale);
    for (const p of [{ x: 0, y: 0 }, { x: 100, y: 200 }]) {
      const was = boardToScreen(c, big, p); const now = boardToScreen(k, small, p);
      expect(now.x).toBeCloseTo(was.x, 6); expect(now.y).toBeCloseTo(was.y, 6);
    }
  }
});

test('keepInView pans only as far as a box needs to be inside the slot, and not at all when it is', () => {
  const vp = { w: 360, h: 355 };
  const c = panBy(startCamera(hexToBoard('0,0'), B, vp), 0, 0, B, vp);
  const near = tileBox('0,0');
  expect(keepInView(c, vp, near, B)).toEqual(c);
  // A tile low in the view comes up just far enough to clear the bottom by the margin.
  const low = tileBox('-2,5');
  const before = boardToScreen(c, vp, { x: 0, y: low.maxY }).y;
  expect(before).toBeGreaterThan(vp.h);
  const k = keepInView(c, vp, low, B);
  const top = boardToScreen(k, vp, { x: low.minX, y: low.minY }); const bottom = boardToScreen(k, vp, { x: low.maxX, y: low.maxY });
  expect(top.y).toBeGreaterThanOrEqual(0); expect(bottom.y).toBeLessThanOrEqual(vp.h);
  expect(top.x).toBeGreaterThanOrEqual(0); expect(bottom.x).toBeLessThanOrEqual(vp.w);
  expect(vp.h - bottom.y).toBeLessThan(16);
});

test('tileBox covers the tile, its side wall and a figure standing on it', () => {
  const b = tileBox('1,2'); const p = hexToBoard('1,2');
  expect(b.minX).toBeLessThan(p.x); expect(b.maxX).toBeGreaterThan(p.x);
  expect(p.y - b.minY).toBeGreaterThan(30); expect(b.maxY).toBeGreaterThan(p.y);
});
