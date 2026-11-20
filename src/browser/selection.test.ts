import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { frames, openApp } from './harness';

// Selecting something opens a panel that takes room from the board (below it in portrait, beside it in
// landscape). The board must stay where the player put it, and move only as far as it must to keep the
// selection in sight. Seed 7: Player 1's Warrior (unit 0) stands on the capital at -2,5, near the bottom of the
// board. Set SHOT_DIR to save a picture of each case once the panel is open.

const SEED = '?seed=7';

type Rect = { x: number; y: number; width: number; height: number };

async function box(page: Page, selector: string): Promise<Rect> {
  const b = await page.locator(selector).first().boundingBox();
  if (b === null) throw new Error(`${selector} has no box`);
  return b;
}
const mid = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const dist = (a: Rect, b: Rect): number => Math.hypot(mid(a).x - mid(b).x, mid(a).y - mid(b).y);
const inside = (r: Rect, slot: Rect): boolean =>
  r.x >= slot.x - 0.5 && r.y >= slot.y - 0.5 && r.x + r.width <= slot.x + slot.width + 0.5 && r.y + r.height <= slot.y + slot.height + 0.5;
const slotBox = (page: Page) => box(page, '[data-testid="board-slot"]');

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 10 });
  await page.mouse.up();
  await frames(page);
}

/** Into Player 1's first turn (or Player 2's, when `second`), zoomed in on the anchor tile unless told not to (so
 * the board is larger than the slot both ways), then dragged so the anchor lands as near `place(slot)` as the
 * board's edges allow. The anchor is the Warrior's capital, or Player 2's own first unit. */
async function intoMatch(width: number, height: number, place: (slot: Rect) => { x: number; y: number }, zoom = true, second = false) {
  const app = await openApp(SEED, { width, height });
  const { page } = app;
  await page.getByTestId('new-match').tap();
  await page.getByTestId('start').tap();
  await page.getByTestId('ready').tap();
  await page.getByTestId('match').waitFor();
  if (second) {
    await expect.poll(() => page.getByTestId('end-turn').isEnabled()).toBe(true);
    await page.getByTestId('end-turn').tap();
    await page.getByTestId('ready').tap();
    await page.getByTestId('match').waitFor();
  }
  await page.locator('[data-unit]').first().waitFor({ state: 'attached' });
  await frames(page);
  // The tile the drag places: the Warrior's capital, or Player 2's own first unit.
  const anchor = second ? await page.locator('[data-unit]').first().getAttribute('data-at') : '-2,5';
  const at = mid(await box(page, `[data-centre="${anchor}"]`));
  if (zoom) {
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, -400);
    await frames(page);
  }
  const slot = await slotBox(page);
  const start = mid(await box(page, `[data-centre="${anchor}"]`));
  const to = place(slot);
  await drag(page, { x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 }, to.x - start.x, to.y - start.y);
  return app;
}

/** Taps at `at`, waits for the panel and the camera, and reports where `watch` (a selector) went. */
async function selectAt(page: Page, at: { x: number; y: number }, watch: string[], shot: string) {
  const slotBefore = await slotBox(page);
  const before = await Promise.all(watch.map((w) => box(page, w)));
  await page.touchscreen.tap(at.x, at.y);
  await page.locator('.selection').waitFor();
  await page.locator('[data-mark="selected"]').first().waitFor({ state: 'attached' });
  await frames(page); await frames(page);
  const after = await Promise.all(watch.map((w) => box(page, w)));
  const slot = await slotBox(page);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${shot}.png` });
  return { slotBefore, slot, before, after, moved: Math.max(...before.map((b, i) => dist(b, after[i]!))) };
}

describe.runIf(process.env.BROWSER === '1')('the board when a selection panel opens', () => {
  for (const [w, h] of [[360, 640], [915, 412]] as const) {
    const portrait = w < h;

    test(`${w}x${h}: selecting a tile that the panel leaves clear moves nothing`, async () => {
      // Player 2's first turn at the opening zoom: their capital is near the top of the board, so what they have
      // explored stands clear of where the panel will be. A pan, then the explored tile farthest from the panel.
      const { page, close } = await intoMatch(w, h, (s) => ({ x: s.x + s.width * 0.25, y: s.y + s.height * 0.25 }), false, true);
      try {
        const keys = await page.locator('[data-hex]:not([data-fog])').evaluateAll((els) => els.map((e) => e.getAttribute('data-hex')!));
        // Only a tile wholly in view, with room above it for what keepInView keeps (a figure's height).
        const s = await slotBox(page);
        const room = { x: s.x + 12, y: s.y + 50, width: s.width - 24, height: s.height - 62 };
        let best: { key: string; r: Rect } | null = null;
        for (const key of keys) {
          if (key === '-2,5' || !inside(await box(page, `[data-hex="${key}"]`), room)) continue;
          const r = await box(page, `[data-centre="${key}"]`);
          const far = (x: Rect) => (portrait ? x.y : x.x);
          if (best === null || far(r) < far(best.r)) best = { key, r };
        }
        expect(best).not.toBeNull();
        const key = best!.key;
        const r = await selectAt(page, mid(best!.r), [`[data-centre="${key}"]`, '[data-centre="-2,5"]'], `clear-${w}x${h}`);
        expect(await page.locator(`[data-hex="${key}"] [data-mark="selected"]`).count()).toBe(1);
        expect(r.slot.width * r.slot.height).toBeLessThan(r.slotBefore.width * r.slotBefore.height);
        expect(r.moved).toBeLessThanOrEqual(1);
        expect(inside(await box(page, `[data-hex="${key}"]`), r.slot)).toBe(true);
      } finally {
        await close();
      }
    }, 60_000);

    test(`${w}x${h}: a unit where the panel lands is brought just into sight, not further`, async () => {
      // Low in a portrait slot, right in a landscape one: where the panel will be.
      const place = (s: Rect) => (portrait ? { x: s.x + s.width * 0.4, y: s.y + s.height - 60 } : { x: s.x + s.width - 80, y: s.y + s.height * 0.5 });
      const { page, close } = await intoMatch(w, h, place);
      try {
        const unit = mid(await box(page, '[data-unit="0"]'));
        const tileBefore = await box(page, '[data-hex="-2,5"]');
        const r = await selectAt(page, unit, ['[data-centre="-2,5"]', '[data-centre="0,0"]'], `panel-${w}x${h}`);
        expect(await page.locator('[data-hex="-2,5"] [data-mark="selected"]').count()).toBe(1);
        // Before the panel opened, the Scout's tile reached past where the slot now ends.
        expect(inside(tileBefore, r.slot)).toBe(false);
        // Now its tile and its figure are wholly in the slot.
        expect(inside(await box(page, '[data-hex="-2,5"]'), r.slot)).toBe(true);
        expect(inside(await box(page, '[data-unit="0"]'), r.slot)).toBe(true);
        // The board moved, but only as far as it had to: the marked tile nearest the panel (the unit's or one
        // it can move to) now ends just inside the slot, no more than a tile's side wall and a small margin short.
        // The starting Krypteia Scout moves 2, so in portrait its nearest marks are on the board's last row, where
        // the camera stops at the board's edge and a mark's outline may overhang the slot by a few pixels.
        expect(r.moved).toBeGreaterThan(0);
        const marks = await page.locator('[data-mark]').evaluateAll((els) => els.map((e) => {
          const b = e.getBoundingClientRect();
          return { right: b.right, bottom: b.bottom };
        }));
        const reach = portrait ? Math.max(...marks.map((m) => m.bottom)) : Math.max(...marks.map((m) => m.right));
        const edge = portrait ? r.slot.y + r.slot.height : r.slot.x + r.slot.width;
        expect(reach).toBeLessThanOrEqual(edge + 4);
        expect(edge - reach).toBeLessThan(56);
      } finally {
        await close();
      }
    }, 60_000);
  }
});
