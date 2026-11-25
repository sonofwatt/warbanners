import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { cameraStill, frames, openApp, uncoveredBox } from './harness';

// Selecting something opens a card that lies over the board (at the bottom in portrait, in the side column in
// landscape). The board's slot keeps its size, so the board stays exactly where the player put it, unless the
// selected tile would otherwise be hidden under the card: then it eases over the least distance that brings the tile
// (with its figure) a third of a tile clear of the card. Deselecting never moves it. Seed 7: Player 1's Scout
// (unit 0) stands on the capital at -2,5, near the bottom of the board. Set SHOT_DIR to save pictures.

const SEED = '?seed=7';
const HEX_W = 30 * Math.sqrt(3); // a tile's width in board units (R = 30, board/layout.ts)

type Rect = { x: number; y: number; width: number; height: number };

async function box(page: Page, selector: string): Promise<Rect> {
  const b = await page.locator(selector).first().boundingBox();
  if (b === null) throw new Error(`${selector} has no box`);
  return b;
}
const mid = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const slotBox = (page: Page) => box(page, '[data-testid="board-slot"]');
const camera = (page: Page) => page.locator('[data-camera="true"]').getAttribute('transform');
const scaleOf = (t: string | null): number => Number(/scale\(([\d.]+)\)/.exec(t ?? '')?.[1] ?? 'NaN');
/** The box round the selected tile and the figure standing on it. */
async function tileAndFigure(page: Page, key: string, unit: string): Promise<Rect> {
  const a = await box(page, `[data-hex="${key}"]`), b = await box(page, `[data-unit="${unit}"]`);
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 10 });
  await page.mouse.up();
  await frames(page);
}

/** Into Player 1's first turn, zoomed in on the capital, then dragged so the capital lands as near `place(slot)` as
 * the board's edges allow. */
async function intoMatch(width: number, height: number, place: (slot: Rect) => { x: number; y: number }) {
  const app = await openApp(SEED, { width, height });
  const { page } = app;
  await page.getByTestId('new-match').tap();
  await page.getByTestId('start').tap();
  await page.getByTestId('ready').tap();
  await page.getByTestId('match').waitFor();
  await page.locator('[data-unit]').first().waitFor({ state: 'attached' });
  await frames(page);
  const at = mid(await box(page, '[data-centre="-2,5"]'));
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(0, -400);
  await frames(page);
  const slot = await slotBox(page);
  const start = mid(await box(page, '[data-centre="-2,5"]'));
  const to = place(slot);
  await drag(page, { x: slot.x + slot.width / 2, y: slot.y + slot.height / 4 }, to.x - start.x, to.y - start.y);
  await cameraStill(page);
  return app;
}

async function tapAt(page: Page, at: { x: number; y: number }): Promise<void> {
  await page.touchscreen.tap(at.x, at.y);
  await frames(page);
  await cameraStill(page);
}

describe.runIf(process.env.BROWSER === '1')('the board when something is selected', () => {
  for (const [w, h] of [[412, 915], [915, 412]] as const) {
    const portrait = w < h;

    test(`${w}x${h}: selecting and deselecting a unit, then its city, in sight leaves the camera and the slot as they were`, async () => {
      const { page, close } = await intoMatch(w, h, (s) => ({ x: s.x + s.width * 0.4, y: s.y + s.height * 0.35 }));
      try {
        const slot = await slotBox(page);
        // The capital sits near the board's foot, so the drag may stop short and the first selections may bring it
        // out from under the card: the Scout's card, then the city's (whose top, its row of units, is taller). From
        // then on it is in sight, and nothing moves the board.
        await tapAt(page, mid(await box(page, '[data-centre="-2,5"]')));
        await page.locator('.selection .unit-panel').waitFor();
        await tapAt(page, mid(await box(page, '[data-centre="-2,5"]')));
        await page.locator('.selection .city-panel').waitFor();
        await cameraStill(page);
        const cam = await camera(page);
        expect(await slotBox(page), 'the slot keeps its size').toEqual(slot);
        const at = mid(await box(page, '[data-centre="-2,5"]'));
        // Nothing, the Scout, the city, nothing: each tap on the same tile.
        await tapAt(page, at);
        await expect.poll(() => page.locator('.selection').count()).toBe(0);
        await cameraStill(page);
        expect(await camera(page), 'deselecting').toBe(cam);
        expect(await slotBox(page)).toEqual(slot);
        await tapAt(page, at);
        await page.locator('.selection .unit-panel').waitFor();
        await cameraStill(page);
        if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/in-sight-${w}x${h}.png` });
        expect(await camera(page), 'selecting the unit in sight').toBe(cam);
        expect(await slotBox(page)).toEqual(slot);
        await tapAt(page, at);
        await page.locator('.selection .city-panel').waitFor();
        await cameraStill(page);
        expect(await camera(page), 'selecting the city in sight').toBe(cam);
        await tapAt(page, at);
        await expect.poll(() => page.locator('.selection').count()).toBe(0);
        await cameraStill(page);
        expect(await camera(page), 'deselecting again').toBe(cam);
        expect(await slotBox(page)).toEqual(slot);
      } finally {
        await close();
      }
    }, 60_000);

    test(`${w}x${h}: a unit where the card lands is brought just clear of it, and deselecting leaves the view there`, async () => {
      // Low in a portrait slot, right in a landscape one: where the card will lie.
      const place = (s: Rect) => (portrait ? { x: s.x + s.width * 0.4, y: s.y + s.height - 70 } : { x: s.x + s.width - 90, y: s.y + s.height * 0.5 });
      const { page, close } = await intoMatch(w, h, place);
      try {
        const slot = await slotBox(page);
        const before = await camera(page);
        await tapAt(page, mid(await box(page, '[data-unit="0"]')));
        await page.locator('.selection .unit-panel').waitFor();
        await cameraStill(page);
        if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/brought-in-${w}x${h}.png` });
        const after = await camera(page);
        expect(after, 'the view moved').not.toBe(before);
        expect(await slotBox(page), 'the slot keeps its size').toEqual(slot);
        const free = await uncoveredBox(page);
        const margin = (HEX_W * scaleOf(after)) / 3;
        const t = await tileAndFigure(page, '-2,5', '0');
        // Wholly in the uncovered part, about a third of a tile clear of the card, and no further (the least pan).
        if (portrait) {
          const gap = free.y + free.height - (t.y + t.height);
          expect(gap).toBeGreaterThanOrEqual(margin - 8);
          expect(gap).toBeLessThanOrEqual(margin + 8);
        } else {
          const gap = free.x + free.width - (t.x + t.width);
          expect(gap).toBeGreaterThanOrEqual(margin - 8);
          expect(gap).toBeLessThanOrEqual(margin + 8);
        }
        expect(t.y).toBeGreaterThanOrEqual(free.y); expect(t.x).toBeGreaterThanOrEqual(free.x);
        // Deselect with a tap on fog (no tile to select): the card goes, the view stays.
        const fog = await page.locator('[data-fog="true"] [data-centre]').evaluateAll((els, f) => els.map((e) => e.getBoundingClientRect())
          .map((b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 }))
          .find((p) => p.x > f.x + 20 && p.x < f.x + f.width - 20 && p.y > f.y + 20 && p.y < f.y + f.height - 20), free);
        expect(fog).toBeDefined();
        await tapAt(page, fog!);
        await expect.poll(() => page.locator('.selection').count()).toBe(0);
        await cameraStill(page);
        expect(await camera(page), 'deselecting never pans').toBe(after);
      } finally {
        await close();
      }
    }, 60_000);
  }

  test('412x915 in the 3D look: select and deselect neither resize nor re-create the canvases, nor move the camera', async () => {
    const app = await openApp(SEED, { width: 412, height: 915, webgl: true });
    const { page, close } = app;
    try {
      await page.getByTestId('new-match').tap();
      await page.getByTestId('start').tap();
      await page.getByTestId('ready').tap();
      await page.getByTestId('match').waitFor();
      await page.locator('[data-unit]').first().waitFor({ state: 'attached' });
      await page.getByTestId('open-menu').tap();
      await page.getByTestId('toggle-terrain3d').tap();
      await page.getByTestId('close-sheet').tap();
      await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
      await frames(page);
      await cameraStill(page);
      // Mark each canvas, so a new one would show; note its drawing size.
      const canvases = () => page.evaluate(() => [...document.querySelectorAll('canvas.board-terrain')].map((c) => {
        const el = c as HTMLCanvasElement & { probe?: number };
        return { probe: el.probe ?? null, w: el.width, h: el.height };
      }));
      await page.evaluate(() => { document.querySelectorAll('canvas.board-terrain').forEach((c, i) => { (c as HTMLCanvasElement & { probe?: number }).probe = i + 1; }); });
      const before = await canvases();
      expect(before.length).toBe(2);
      const cam = await camera(page);
      const slot = await slotBox(page);
      // The first selection may bring the Scout out from under the card (it stands near the board's foot); then
      // deselecting and selecting it again move nothing.
      const at = () => box(page, '[data-centre="-2,5"]').then(mid);
      await tapAt(page, await at());
      await page.locator('.selection .unit-panel').waitFor();
      await cameraStill(page);
      expect(await canvases()).toEqual(before);
      const placed = await camera(page);
      const fog = await page.locator('[data-fog="true"] [data-centre]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect())
        .map((b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })).find((p) => p.y > 150 && p.y < 500 && p.x > 30 && p.x < 380));
      expect(fog).toBeDefined();
      await tapAt(page, fog!);
      await expect.poll(() => page.locator('.selection').count()).toBe(0);
      await cameraStill(page);
      expect(await camera(page)).toBe(placed);
      expect(await canvases()).toEqual(before);
      await tapAt(page, await at());
      await page.locator('.selection .unit-panel').waitFor();
      await cameraStill(page);
      expect(await camera(page)).toBe(placed);
      expect(await canvases()).toEqual(before);
      expect(await slotBox(page)).toEqual(slot);
      expect(cam).not.toBeNull();
    } finally {
      await close();
    }
  }, 120_000);

  test('412x915: taps on the card never reach the board; taps above it work as before', async () => {
    const { page, close } = await intoMatch(412, 915, (s) => ({ x: s.x + s.width * 0.4, y: s.y + s.height * 0.35 }));
    try {
      await tapAt(page, mid(await box(page, '[data-unit="0"]')));
      await page.locator('.selection .unit-panel').waitFor();
      const cam = await camera(page);
      // A tap on the card's numbers, over where the board runs on under the card: nothing on the board changes.
      const stat = await box(page, '.selection .stat');
      await tapAt(page, mid(stat));
      expect(await page.locator('.selection .unit-panel').count()).toBe(1);
      expect(await page.locator('[data-hex="-2,5"] [data-mark="selected"]').count()).toBe(1);
      expect(await camera(page)).toBe(cam);
      // A drag on the card does not pan the board.
      await drag(page, mid(stat), -120, 0);
      await cameraStill(page);
      expect(await camera(page)).toBe(cam);
      // A tap on the board above the card still selects what is there (the city under the Scout).
      await tapAt(page, mid(await box(page, '[data-centre="-2,5"]')));
      await page.locator('.selection .city-panel').waitFor();
    } finally {
      await close();
    }
  }, 60_000);
});
