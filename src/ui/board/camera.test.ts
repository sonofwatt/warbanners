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
  expect(c.cy).toBeCloseTo(139.5, 2);
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
  expect(far.cx).toBeCloseTo(B.maxX, 5);
  expect(far.cy).toBeCloseTo(B.maxY, 5);
});

test('screen and board convert both ways', () => {
  const c = { cx: 12, cy: -7, scale: 1.3 };
  const p = screenToBoard(c, VP, { x: 100, y: 500 });
  const back = boardToScreen(c, VP, p);
  expect(back.x).toBeCloseTo(100, 5);
  expect(back.y).toBeCloseTo(500, 5);
});
