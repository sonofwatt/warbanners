import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { cameraStill, frames, openApp } from './harness';

// In portrait the selection card is pulled up from the bottom. It opens collapsed, showing only its top: the name,
// the actions and the numbers for a unit, the row of units to train for a city. Pulling it up (by its handle or its
// top) or tapping the handle shows the rest; pulling down or tapping again collapses it. The board never moves for
// any of it. A new selection opens collapsed again. Seed 7: Player 1's Scout (unit 0) stands on the capital at -2,5.

type Rect = { x: number; y: number; width: number; height: number };

async function box(page: Page, selector: string): Promise<Rect> {
  const b = await page.locator(selector).first().boundingBox();
  if (b === null) throw new Error(`${selector} has no box`);
  return b;
}
const mid = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const camera = (page: Page) => page.locator('[data-camera="true"]').getAttribute('transform');
const sheet = (page: Page) => page.getByTestId('selection');
const state = (page: Page) => sheet(page).getAttribute('data-sheet');
/** Whether every part of `selector` inside the card shows within the card's visible box. */
async function shows(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const card = document.querySelector('[data-testid="selection"]')!.getBoundingClientRect();
    const els = [...document.querySelectorAll(`[data-testid="selection"] ${sel}`)];
    return els.length > 0 && els.every((e) => {
      const r = e.getBoundingClientRect();
      return r.top >= card.top - 0.5 && r.bottom <= card.bottom + 0.5;
    });
  }, selector);
}
/** Whether all of `selector` inside the card lies below what the card shows. */
async function hidden(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const card = document.querySelector('[data-testid="selection"]')!.getBoundingClientRect();
    const els = [...document.querySelectorAll(`[data-testid="selection"] ${sel}`)];
    return els.length > 0 && els.every((e) => e.getBoundingClientRect().top >= card.bottom - 0.5);
  }, selector);
}
/** Waits until the card's height stops changing (its settle eases over about 200 ms). */
async function settled(page: Page): Promise<void> {
  await page.evaluate(`new Promise((done) => {
    let last = -1, same = 0, n = 0;
    function look() {
      const h = document.querySelector('[data-testid="selection"]')?.getBoundingClientRect().height ?? 0;
      same = h === last ? same + 1 : 0; last = h;
      if (same >= 4 || ++n > 240) done(); else requestAnimationFrame(look);
    }
    requestAnimationFrame(look);
  })`);
}
async function pull(page: Page, from: { x: number; y: number }, dy: number): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + dy, { steps: 12 });
  await page.mouse.up();
  await frames(page);
  await settled(page);
}

async function intoMatch(): Promise<Awaited<ReturnType<typeof openApp>>> {
  const app = await openApp('?seed=7', { width: 412, height: 915 });
  const { page } = app;
  await page.getByTestId('new-match').tap();
  await page.getByTestId('start').tap();
  await page.getByTestId('ready').tap();
  await page.getByTestId('match').waitFor();
  await page.locator('[data-unit]').first().waitFor({ state: 'attached' });
  await frames(page);
  await cameraStill(page);
  return app;
}
const SHOTS = process.env.SHOT_DIR;

describe.runIf(process.env.BROWSER === '1')('the pull-up selection card', () => {
  test('a unit: collapsed shows its numbers and actions, not its traits; the handle and a pull open and close it; the board never moves', async () => {
    const { page, close } = await intoMatch();
    try {
      await page.touchscreen.tap(...Object.values(mid(await box(page, '[data-unit="0"]'))) as [number, number]);
      await page.locator('.selection .unit-panel').waitFor();
      await settled(page);
      await cameraStill(page);
      const cam = await camera(page);
      expect(await state(page)).toBe('collapsed');
      const handle = page.getByTestId('sheet-handle');
      expect(await handle.getAttribute('aria-expanded')).toBe('false');
      expect(await shows(page, '.card-head h2')).toBe(true);
      expect(await shows(page, '.stats')).toBe(true);
      expect(await shows(page, '.commands')).toBe(true);
      expect(await hidden(page, '.traits')).toBe(true);
      expect(await hidden(page, '.blurb')).toBe(true);
      const collapsed = await box(page, '[data-testid="selection"]');
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/unit-collapsed-412x915.png` });

      // A tap on the handle opens it, the whole card in sight; another closes it.
      await handle.tap();
      await settled(page);
      expect(await state(page)).toBe('expanded');
      expect(await handle.getAttribute('aria-expanded')).toBe('true');
      expect(await shows(page, '.traits')).toBe(true);
      const open = await box(page, '[data-testid="selection"]');
      expect(open.height).toBeGreaterThan(collapsed.height + 40);
      expect(open.height).toBeLessThanOrEqual(915 * 0.7 + 1);
      expect(await camera(page), 'opening never moves the board').toBe(cam);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/unit-expanded-412x915.png` });
      await handle.tap();
      await settled(page);
      expect(await state(page)).toBe('collapsed');
      expect(await camera(page), 'closing never moves the board').toBe(cam);

      // A pull up by the card's top (its name) opens it; a pull down by the handle closes it.
      await pull(page, mid(await box(page, '.selection .card-head h2')), -260);
      expect(await state(page)).toBe('expanded');
      expect(await camera(page)).toBe(cam);
      await pull(page, mid(await box(page, '[data-testid="sheet-handle"]')), 260);
      expect(await state(page)).toBe('collapsed');
      expect(await camera(page)).toBe(cam);
      // A pull down from collapsed does nothing: the card and the selection stay.
      await pull(page, mid(await box(page, '[data-testid="sheet-handle"]')), 200);
      expect(await state(page)).toBe('collapsed');
      expect(await page.locator('.selection .unit-panel').count()).toBe(1);
      expect((await box(page, '[data-testid="selection"]')).height).toBeCloseTo(collapsed.height, 0);
      expect(await camera(page)).toBe(cam);

      // The keyboard: the handle is a button.
      await handle.focus();
      await page.keyboard.press('Enter');
      await settled(page);
      expect(await state(page)).toBe('expanded');
      await page.keyboard.press('Space');
      await settled(page);
      expect(await state(page)).toBe('collapsed');

      await settled(page);
      expect(await state(page)).toBe('collapsed');
    } finally {
      await close();
    }
  }, 90_000);

  test('the capital: collapsed shows the row of units to train, not the city numbers; pulled up shows them', async () => {
    const { page, close } = await intoMatch();
    try {
      // The Scout stands on the capital: the first tap picks it, the second the city.
      for (let i = 0; i < 3 && (await page.locator('.selection .shop').count()) === 0; i += 1) {
        const at = mid(await box(page, '[data-centre="-2,5"]'));
        await page.touchscreen.tap(at.x, at.y);
        await page.waitForTimeout(250);
        await cameraStill(page);
      }
      await page.locator('.selection .shop').waitFor();
      await settled(page);
      await cameraStill(page);
      expect(await state(page)).toBe('collapsed');
      expect(await shows(page, '.shop-strip')).toBe(true);
      expect(await hidden(page, '.card-more .stats')).toBe(true);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/capital-collapsed-412x915.png` });
      // Picking a unit in the row while collapsed puts its Train button in the head, in sight.
      await page.getByTestId('shop-warrior').tap();
      await page.locator('.card-actions [data-testid="cmd-train-warrior"]').waitFor();
      expect(await shows(page, '.card-actions')).toBe(true);
      await settled(page);
      await cameraStill(page);
      const cam = await camera(page);
      await pull(page, mid(await box(page, '.selection .card-head h2')), -300);
      expect(await state(page)).toBe('expanded');
      expect(await shows(page, '.card-more .stats')).toBe(true);
      expect(await camera(page)).toBe(cam);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/capital-expanded-412x915.png` });
      // The card never stays pulled up for the next selection: a tap on the board above it (the sea or fog there
      // deselects), then the Scout again, opens collapsed. The turn buttons come back while nothing is selected.
      const slot = await box(page, '[data-testid="board-slot"]');
      await page.touchscreen.tap(slot.x + 20, slot.y + 20);
      await expect.poll(() => page.locator('.selection').count()).toBe(0);
      await page.getByTestId('action-bar').waitFor();
      await page.getByTestId('next-unit').tap();
      await page.locator('.selection .unit-panel').waitFor();
      await settled(page);
      expect(await state(page)).toBe('collapsed');
      expect(await page.getByTestId('sheet-handle').getAttribute('aria-expanded')).toBe('false');
    } finally {
      await close();
    }
  }, 90_000);

  test('landscape keeps the whole side column, with no handle', async () => {
    const app = await openApp('?seed=7', { width: 915, height: 412 });
    const { page, close } = app;
    try {
      await page.getByTestId('new-match').tap();
      await page.getByTestId('start').tap();
      await page.getByTestId('ready').tap();
      await page.getByTestId('match').waitFor();
      await page.locator('[data-unit]').first().waitFor({ state: 'attached' });
      await cameraStill(page);
      await page.touchscreen.tap(...Object.values(mid(await box(page, '[data-unit="0"]'))) as [number, number]);
      await page.locator('.selection .unit-panel').waitFor();
      expect(await state(page)).toBe('side');
      expect(await page.getByTestId('sheet-handle').count()).toBe(0);
      const slot = await box(page, '[data-testid="board-slot"]');
      const card = await box(page, '[data-testid="selection"]');
      expect(card.y).toBeCloseTo(slot.y, 0);
      expect(card.y + card.height).toBeCloseTo(slot.y + slot.height, 0);
      expect(card.x + card.width).toBeCloseTo(slot.x + slot.width, 0);
    } finally {
      await close();
    }
  }, 60_000);
});
