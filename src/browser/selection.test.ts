import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { cameraStill, frames, openApp } from './harness';

// Selecting something opens a panel that takes room from the board (below it in portrait, beside it in
// landscape). The board must stay where the player put it while the selection is near the middle of what is left
// (the dead zone, the middle 60 percent of the slot each way), and otherwise ease over only as far as it must to
// bring the selection into that zone. Seed 7: Player 1's Warrior (unit 0) stands on the capital at -2,5, near the
// bottom of the board. Set SHOT_DIR to save a picture of each case once the panel is open.

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
/** The dead zone: the middle 60 percent of the slot each way. */
const zoneOf = (s: Rect): Rect => ({ x: s.x + s.width * 0.2, y: s.y + s.height * 0.2, width: s.width * 0.6, height: s.height * 0.6 });
/** A tile's ground (what the camera follows): its hex's width, and the hex's depth on the tilted board. */
async function ground(page: Page, key: string): Promise<Rect> {
  const c = mid(await box(page, `[data-centre="${key}"]`));
  const t = await page.locator('[data-camera="true"]').getAttribute('transform') ?? '';
  const scale = Number(/scale\(([\d.]+)\)/.exec(t)?.[1] ?? 'NaN');
  const w = 30 * Math.sqrt(3) * scale, h = 2 * 30 * 0.62 * scale; // R = 30, SQUASH = 0.62 (board/layout.ts)
  return { x: c.x - w / 2, y: c.y - h / 2, width: w, height: h };
}

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
  await frames(page);
  await cameraStill(page);
  const after = await Promise.all(watch.map((w) => box(page, w)));
  const slot = await slotBox(page);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${shot}.png` });
  return { slotBefore, slot, before, after, moved: Math.max(...before.map((b, i) => dist(b, after[i]!))) };
}

describe.runIf(process.env.BROWSER === '1')('the board when a selection panel opens', () => {
  for (const [w, h] of [[360, 640], [915, 412]] as const) {
    const portrait = w < h;

    test(`${w}x${h}: selecting a tile near the middle of the slot moves nothing`, async () => {
      // Player 2's first turn at the opening zoom. A first tap opens the panel (the view may ease the first tile in);
      // then a second explored tile whose ground lies in the dead zone of the slot that is left is selected.
      const { page, close } = await intoMatch(w, h, (s) => ({ x: s.x + s.width * 0.5, y: s.y + s.height * 0.4 }), false, true);
      try {
        const keys = await page.locator('[data-hex]:not([data-fog])').evaluateAll((els) => els.map((e) => e.getAttribute('data-hex')!));
        const first = keys.find((k) => k !== '-2,5')!;
        await selectAt(page, mid(await box(page, `[data-centre="${first}"]`)), [`[data-centre="${first}"]`], `first-${w}x${h}`);
        const zone = zoneOf(await slotBox(page));
        let best: string | null = null;
        for (const key of keys) {
          if (key === first || key === '-2,5') continue;
          if (inside(await ground(page, key), zone)) { best = key; break; }
        }
        expect(best).not.toBeNull();
        const key = best!;
        const r = await selectAt(page, mid(await box(page, `[data-centre="${key}"]`)), [`[data-centre="${key}"]`, `[data-centre="${first}"]`], `clear-${w}x${h}`);
        expect(await page.locator(`[data-hex="${key}"] [data-mark="selected"]`).count()).toBe(1);
        expect(r.moved).toBeLessThanOrEqual(1);
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
        // The board moved, but only as far as it had to: the unit's ground now lies in the dead zone of the slot that
        // is left, its edge nearest the panel on the zone's edge (or short of it, where the board's own edge stops the
        // view first).
        expect(r.moved).toBeGreaterThan(0);
        const g = await ground(page, '-2,5');
        const zone = zoneOf(r.slot);
        const far = portrait ? g.y + g.height : g.x + g.width;
        const edge = portrait ? zone.y + zone.height : zone.x + zone.width;
        expect(far).toBeLessThanOrEqual(edge + 1);
        if (!portrait) expect(edge - far).toBeLessThan(2);
      } finally {
        await close();
      }
    }, 60_000);
  }
});
