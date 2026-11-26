import { expect, test } from 'vitest';
import { boardBounds, hexToBoard, tileBox } from './layout';
import { boardToScreen, cameraBetween, deadZone, easeInOut, followAction, PAN_MAX_MS, PAN_MIN_MS, panMs, startCamera } from './camera';
import type { Camera } from './camera';

// A big board in a landscape slot, so the view can pan both ways.
const B = boardBounds(9);
const VP = { w: 915, h: 412 };
const cam = (): Camera => ({ ...startCamera(hexToBoard('0,0'), B, VP), scale: 1.6 });

test('the dead zone is the middle 60 percent of the slot', () => {
  expect(deadZone(VP)).toEqual({ minX: 183, minY: 82.4, maxX: 732, maxY: 329.6 });
});

test('an action inside the dead zone does not move the view (the same camera comes back)', () => {
  const c = cam();
  const near = tileBox('1,0');
  expect(followAction(c, VP, near, B)).toBe(c);
  expect(followAction(c, VP, tileBox('0,0'), B)).toBe(c);
});

test('an action outside it pans just enough to bring it inside the zone', () => {
  const c = cam();
  const far = tileBox('6,0');
  const n = followAction(c, VP, far, B);
  expect(n).not.toBe(c);
  expect(n.scale).toBe(c.scale);
  const z = deadZone(VP);
  const hi = boardToScreen(n, VP, { x: far.maxX, y: far.maxY });
  expect(hi.x).toBeCloseTo(z.maxX, 5); // the least pan: its far edge lands on the zone's edge
  // Down and up: the same.
  const low = followAction(c, VP, tileBox('0,4'), B);
  expect(boardToScreen(low, VP, { x: 0, y: tileBox('0,4').maxY }).y).toBeCloseTo(z.maxY, 5);
});

test('an action larger than the zone is centred in it', () => {
  const c = cam();
  const a = tileBox('-6,0'), b = tileBox('6,0');
  const box = { minX: a.minX, minY: Math.min(a.minY, b.minY), maxX: b.maxX, maxY: Math.max(a.maxY, b.maxY) };
  const n = followAction(c, VP, box, B);
  const lo = boardToScreen(n, VP, { x: box.minX, y: 0 }), hi = boardToScreen(n, VP, { x: box.maxX, y: 0 });
  expect((lo.x + hi.x) / 2).toBeCloseTo(VP.w / 2, 5);
});

test('at the board edge the pan stops where the clamp stops it', () => {
  const c = cam();
  const n = followAction(c, VP, tileBox('9,0'), B);
  const again = followAction(n, VP, tileBox('9,0'), B);
  // Asking again from where it stopped moves no further.
  expect(again.cx).toBeCloseTo(n.cx, 5);
});

test('a pan takes 250 ms for a short hop and up to 400 ms across the screen', () => {
  const c = cam();
  expect(panMs(c, c, VP)).toBe(PAN_MIN_MS);
  const hop = { ...c, cx: c.cx + 20 / c.scale };
  expect(panMs(c, hop, VP)).toBeGreaterThan(PAN_MIN_MS);
  expect(panMs(c, hop, VP)).toBeLessThan(270);
  expect(panMs(c, { ...c, cx: c.cx + 5000 }, VP)).toBe(PAN_MAX_MS);
  const mid = panMs(c, { ...c, cx: c.cx + 450 / c.scale }, VP);
  expect(mid).toBeGreaterThan(300);
  expect(mid).toBeLessThan(PAN_MAX_MS);
});

test('the pan eases in and out: slow at both ends, quick in the middle, no jump', () => {
  expect(easeInOut(0)).toBe(0);
  expect(easeInOut(1)).toBe(1);
  expect(easeInOut(0.5)).toBeCloseTo(0.5, 10);
  expect(easeInOut(0.1)).toBeLessThan(0.01);
  expect(easeInOut(0.9)).toBeGreaterThan(0.99);
  // Never more than a small step per 1/60 of the pan: no frame jumps.
  let prev = 0;
  for (let i = 1; i <= 60; i++) {
    const v = easeInOut(i / 60);
    expect(v).toBeGreaterThanOrEqual(prev);
    expect(v - prev).toBeLessThan(0.051);
    prev = v;
  }
});

test('in between, the camera moves along the line and zooms evenly', () => {
  const a: Camera = { cx: 0, cy: 0, scale: 1 };
  const b: Camera = { cx: 100, cy: -50, scale: 4 };
  expect(cameraBetween(a, b, 0)).toBe(a);
  expect(cameraBetween(a, b, 1)).toBe(b);
  expect(cameraBetween(a, b, 0.5)).toEqual({ cx: 50, cy: -25, scale: 2 });
});
