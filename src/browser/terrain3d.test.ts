import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { frames, openApp } from './harness';

// The 3D terrain option in a real browser (software WebGL): off by default with three.js never fetched, on from the
// match menu with the canvas drawing the board under the svg, and off again with the svg board back as it was.

async function toggle(page: Page): Promise<void> {
  await page.getByTestId('open-menu').tap();
  await page.getByTestId('toggle-terrain3d').tap();
  await page.getByTestId('close-sheet').tap();
  await frames(page);
}

/** What the canvas shows with the svg hidden: the share of pixels that are not the sea, and of those that are grass. */
async function canvasPixels(page: Page): Promise<{ land: number; grass: number }> {
  await page.locator('svg.board').evaluate((el) => { (el as SVGElement).style.visibility = 'hidden'; });
  await frames(page);
  const png = await page.getByTestId('board-slot').screenshot();
  await page.locator('svg.board').evaluate((el) => { (el as SVGElement).style.visibility = ''; });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0, land = 0, grass = 0;
    for (let i = 0; i < d.length; i += 4 * 5) {
      n++;
      const r = d[i]!, gr = d[i + 1]!, b = d[i + 2]!;
      if (Math.abs(r - 0x3e) + Math.abs(gr - 0x80) + Math.abs(b - 0xae) > 30) land++;
      if (gr > r + 25 && gr > b + 25) grass++;
    }
    return { land: land / n, grass: grass / n };
  }, png.toString('base64'));
}

describe.runIf(process.env.BROWSER === '1')('the 3D terrain option', () => {
  test('is off by default, draws the board on a canvas when turned on, and turns off again', async () => {
    const fetched: string[] = [];
    const { page, close } = await openApp('?seed=7', {
      width: 412, height: 780, webgl: true,
      beforeOpen: (c) => { c.on('request', (r) => { if (/terrain3d-[^/]*\.js/.test(r.url())) fetched.push(r.url()); }); },
    });
    try {
      await page.getByTestId('new-match').tap();
      await page.getByTestId('start').tap();
      await page.getByTestId('ready').tap();
      await page.getByTestId('match').waitFor();
      await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
      await frames(page);
      expect(await page.getByTestId('board-terrain').count(), 'no canvas by default').toBe(0);
      expect(fetched, 'three.js is not fetched while the option is off').toEqual([]);
      const svgTiles = await page.locator('[data-hex] polygon').count();
      const units = await page.locator('svg.board [data-unit]').count();
      expect(units).toBeGreaterThan(0);
      const figureNodes = await page.locator('svg.board [data-unit] .unit-body *').count();

      await page.getByTestId('open-menu').tap();
      expect(await page.getByTestId('toggle-terrain3d').getAttribute('aria-pressed')).toBe('false');
      await page.getByTestId('close-sheet').tap();
      await toggle(page);
      await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
      await frames(page);
      expect(fetched.length, 'the terrain chunk is fetched once the option is on').toBe(1);
      expect(await page.evaluate(() => localStorage.getItem('warbanners.terrain3d'))).toBe('1');
      expect(await page.locator('[data-hex] polygon').count(), 'the svg stops drawing tile bases').toBeLessThan(svgTiles / 2);
      const px = await canvasPixels(page);
      expect(px.land, 'the canvas draws the board').toBeGreaterThan(0.3);
      expect(px.grass, 'the canvas draws explored ground').toBeGreaterThan(0.01);
      // The unit figures move to their own canvas; the units' status stays svg, on a second svg above them.
      expect(await page.getByTestId('board-units3d').count()).toBe(1);
      expect(await page.locator('[data-testid=board-overlay] [data-unit]').count(), 'every unit keeps its svg status').toBe(units);
      expect(await page.locator('svg.board:not(.board-overlay) [data-unit]').count(), 'no unit is left on the tile svg').toBe(0);
      expect(await page.locator('[data-testid=board-overlay] [data-unit] .unit-body *').count(), 'the svg figure art is left out').toBeLessThan(figureNodes);

      await toggle(page);
      await page.getByTestId('board-terrain').waitFor({ state: 'detached' });
      await frames(page);
      expect(await page.evaluate(() => localStorage.getItem('warbanners.terrain3d'))).toBe('0');
      expect(await page.locator('svg.board').getAttribute('data-terrain3d')).toBeNull();
      expect(await page.locator('[data-hex] polygon').count(), 'the svg board is whole again').toBe(svgTiles);
      expect(await page.getByTestId('board-overlay').count()).toBe(0);
      expect(await page.locator('svg.board [data-unit] .unit-body *').count(), 'the svg figures are back as they were').toBe(figureNodes);
    } finally {
      await close();
    }
  }, 60_000); // software WebGL builds and draws the board on the CPU
});
