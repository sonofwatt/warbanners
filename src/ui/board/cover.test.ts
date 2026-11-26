import { expect, test } from 'vitest';
import { boardBounds, hexToBoard, tileBox } from './layout';
import { boardToScreen, centreOn, deadZone, followAction, keepInView, NO_INSETS, panBy, slackFor, startCamera, zoomAt } from './camera';
import type { Camera, Insets } from './camera';

// A panel lying over the board (the unit card at the bottom in portrait, the side column in landscape) covers part
// of the slot without resizing it. The camera's rules then measure against the part left uncovered.

const B = boardBounds(9);
const VP = { w: 412, h: 811 };
const CARD: Insets = { top: 0, right: 0, bottom: 200, left: 0 };
const cam = (): Camera => panBy({ ...startCamera(hexToBoard('0,0'), B, VP), scale: 1.6 }, 0, 0, B, VP);

test('the dead zone is the middle 60 percent of the part no panel covers', () => {
  const z = deadZone(VP, 0.6, CARD);
  expect(z.minX).toBeCloseTo(82.4, 5); expect(z.maxX).toBeCloseTo(329.6, 5);
  expect(z.minY).toBeCloseTo(611 * 0.2, 5); expect(z.maxY).toBeCloseTo(611 * 0.8, 5);
  const side = deadZone({ w: 915, h: 346 }, 0.6, { top: 0, right: 300, bottom: 0, left: 0 });
  expect(side.minX).toBeCloseTo(123, 5); expect(side.maxX).toBeCloseTo(492, 5);
});

test('an action in the dead zone of the whole slot but low in what the card leaves is followed, just to the zone edge', () => {
  const c = cam();
  // Find a tile whose ground lies inside the plain dead zone yet below the covered one.
  const plain = deadZone(VP), covered = deadZone(VP, 0.6, CARD);
  let key: string | null = null;
  for (let r = 0; r <= 9 && key === null; r += 1) {
    const k = `0,${r}`; const t = tileBox(k);
    const lo = boardToScreen(c, VP, { x: t.minX, y: t.minY }), hi = boardToScreen(c, VP, { x: t.maxX, y: t.maxY });
    if (lo.y >= plain.minY && hi.y <= plain.maxY && hi.y > covered.maxY) key = k;
  }
  expect(key).not.toBeNull();
  const box = tileBox(key!);
  expect(followAction(c, VP, box, B)).toBe(c);
  const n = followAction(c, VP, box, B, { cover: CARD });
  expect(n).not.toBe(c);
  expect(boardToScreen(n, VP, { x: box.maxX, y: box.maxY }).y).toBeCloseTo(covered.maxY, 4);
});

test('while a card covers the bottom, the clamp lets the board run up by the card height, no more', () => {
  const c = cam();
  const plain = panBy(c, 0, -99999, B, VP);
  const room = panBy(c, 0, -99999, B, VP, CARD);
  expect(boardToScreen(plain, VP, { x: 0, y: B.maxY }).y).toBeCloseTo(VP.h - 24, 4);
  // The board's bottom edge now stops 24 px above the card's top, so the last row can come out from under it.
  expect(boardToScreen(room, VP, { x: 0, y: B.maxY }).y).toBeCloseTo(VP.h - CARD.bottom - 24, 4);
  // The other sides keep their plain limits.
  expect(panBy(c, 0, 99999, B, VP, CARD).cy).toBeCloseTo(panBy(c, 0, 99999, B, VP).cy, 6);
  // A board smaller than the slot on an axis may move off centre by the covered size, toward the uncovered part.
  const small = boardBounds(3);
  const s0 = startCamera(hexToBoard('0,0'), small, VP);
  const s1 = panBy(s0, 0, -99999, small, VP, CARD);
  expect((s1.cy - s0.cy) * s0.scale).toBeCloseTo(CARD.bottom, 4);
});

test('a view a closed card left past the plain limit stays there, and a drag never jumps it in', () => {
  const c = cam();
  const pulled = panBy(c, 0, -99999, B, VP, CARD); // the card was open: the board ran up as far as it allowed
  // The card closes: the slack now comes only from how far the view already runs past the plain limit.
  const slack = slackFor(pulled, B, VP, NO_INSETS);
  expect(slack.bottom).toBeCloseTo(CARD.bottom, 4);
  expect(slack.top).toBe(0);
  // A small drag down (board follows the finger down) moves it exactly that far: no snap to the plain limit.
  const d = panBy(pulled, 0, 10, B, VP, slack);
  expect((pulled.cy - d.cy) * pulled.scale).toBeCloseTo(10, 4);
  // A drag up cannot take it further out.
  expect(panBy(pulled, 0, -50, B, VP, slack).cy).toBeCloseTo(pulled.cy, 6);
  // A pinch keeps it too.
  const z = zoomAt(pulled, 1, { x: 200, y: 300 }, B, VP, slack);
  expect(z.cy).toBeCloseTo(pulled.cy, 6);
  // With no slack the plain clamp would have pulled it in at once.
  expect(panBy(pulled, 0, 0, B, VP).cy).toBeLessThan(pulled.cy - 100 / pulled.scale);
});

test('a selection in sight above the card moves nothing; one under it comes up just clear of the card', () => {
  const c = cam();
  const margin = (30 * Math.sqrt(3) * c.scale) / 3;
  expect(keepInView(c, VP, tileBox('0,0'), B, { cover: CARD, margin })).toBe(c);
  // A tile low on the screen, under where the card lies.
  let key: string | null = null;
  for (let r = 0; r <= 9 && key === null; r += 1) {
    const t = tileBox(`0,${r}`);
    const hi = boardToScreen(c, VP, { x: t.maxX, y: t.maxY }).y;
    if (hi > VP.h - CARD.bottom + 10 && hi < VP.h) key = `0,${r}`;
  }
  expect(key).not.toBeNull();
  const box = tileBox(key!);
  const k = keepInView(c, VP, box, B, { cover: CARD, margin });
  // The least pan: it ends a margin above the card, and no side moves further than it must.
  const lo = boardToScreen(k, VP, { x: box.minX, y: box.minY });
  expect(lo.x).toBeGreaterThanOrEqual(margin - 1e-6);
  expect(boardToScreen(k, VP, { x: box.maxX, y: box.maxY }).y).toBeCloseTo(VP.h - CARD.bottom - margin, 4);
});

test('a turn report line is centred in the part no panel covers', () => {
  const c = cam();
  const p = hexToBoard('1,1');
  const n = centreOn(c, p, B, VP, CARD);
  const at = boardToScreen(n, VP, p);
  expect(at.x).toBeCloseTo(VP.w / 2, 4);
  expect(at.y).toBeCloseTo((VP.h - CARD.bottom) / 2, 4);
});
