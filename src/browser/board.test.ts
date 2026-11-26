import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { cameraStill, frames, openApp } from './harness';

async function centreOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox();
  if (box === null) throw new Error(`${selector} has no box`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function lastTap(page: Page): Promise<string> {
  return (await page.getByTestId('last-tap').textContent()) ?? '';
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
  await page.mouse.up();
  await frames(page);
}

describe.runIf(process.env.BROWSER === '1')('the board in a browser', () => {
  test('tapping a tile reports that tile, before and after a zoom and a pan', async () => {
    const { page, close } = await openApp('?board=7');
    try {
      await page.locator('[data-centre="-2,4"]').waitFor({ state: 'attached' });
      await frames(page);
      const a = await centreOf(page, '[data-centre="-2,4"]');
      await page.touchscreen.tap(a.x, a.y);
      await expect.poll(() => lastTap(page)).toBe('hex -2,4');

      await page.mouse.move(206, 457);
      await page.mouse.wheel(0, -120);
      await frames(page);
      await page.mouse.wheel(0, -120);
      await frames(page);
      await drag(page, { x: 206, y: 600 }, 80, 0);

      const b = await centreOf(page, '[data-centre="-1,4"]');
      expect(b.x).toBeGreaterThan(0);
      expect(b.x).toBeLessThan(412);
      expect(b.y).toBeGreaterThan(0);
      expect(b.y).toBeLessThan(915);
      await page.touchscreen.tap(b.x, b.y);
      await expect.poll(() => lastTap(page)).toBe('hex -1,4');
    } finally {
      await close();
    }
  });

  test('a drag does not count as a tap, and the page never scrolls', async () => {
    const { page, close } = await openApp('?board=7');
    try {
      await page.locator('[data-centre="-2,4"]').waitFor({ state: 'attached' });
      await frames(page);
      const before = await lastTap(page);
      const camera = page.locator('[data-camera]');
      const t0 = await camera.getAttribute('transform');
      await drag(page, { x: 200, y: 500 }, 80, 0);
      expect(await lastTap(page)).toBe(before);
      expect(await camera.getAttribute('transform')).not.toBe(t0);
      const scroll = await page.evaluate(() => ({
        x: window.scrollX, y: window.scrollY,
        docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
        vw: window.innerWidth, vh: window.innerHeight,
      }));
      expect(scroll.x).toBe(0);
      expect(scroll.y).toBe(0);
      expect(scroll.docW).toBe(scroll.vw);
      expect(scroll.docH).toBe(scroll.vh);
    } finally {
      await close();
    }
  });

  test('rotating keeps the board on screen', async () => {
    const { page, close } = await openApp('?board=7');
    try {
      await page.locator('[data-hex="-2,5"]').waitFor({ state: 'attached' });
      await frames(page);
      await page.setViewportSize({ width: 915, height: 412 });
      await frames(page);
      // The view eases to its new place after a rotation.
      await cameraStill(page);
      const box = await page.locator('[data-hex="-2,5"]').boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(915);
      expect(box!.y + box!.height).toBeLessThanOrEqual(412);
    } finally {
      await close();
    }
  });

  test('a finger whose capture was lost does not leave taps stuck', async () => {
    const { page, close } = await openApp('?board=7');
    try {
      await page.locator('[data-centre="-2,4"]').waitFor({ state: 'attached' });
      await frames(page);
      // A pointer goes down and the board loses it without an up or a cancel (it lifted off the board).
      await page.evaluate(() => {
        const svg = document.querySelector('[data-camera]')!.closest('svg')!;
        const at = { clientX: 100, clientY: 400, bubbles: true, pointerType: 'touch' };
        svg.dispatchEvent(new PointerEvent('pointerdown', { ...at, pointerId: 77 }));
        svg.dispatchEvent(new PointerEvent('lostpointercapture', { ...at, pointerId: 77 }));
      });
      const a = await centreOf(page, '[data-centre="-2,4"]');
      await page.touchscreen.tap(a.x, a.y);
      await expect.poll(() => lastTap(page)).toBe('hex -2,4');
    } finally {
      await close();
    }
  });
}, 60_000);
