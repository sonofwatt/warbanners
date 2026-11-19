import { expect, test } from 'vitest';
import { R, boardBounds, hexToBoard } from './layout';
import { boardToScreen, fitScale, panBy, screenToBoard, startCamera, zoomAt } from './camera';

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
