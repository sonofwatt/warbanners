import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { cameraStill, deselect, frames, openApp, tapTile } from './harness';

// While a city is selected its land is outlined, fainter than the faction border, in both looks; nothing else is,
// and the outline goes with the selection. It never moves the board. Seed 7: Player 1's Scout stands on the capital
// at -2,5, whose land is the tiles round it. Set SHOT_DIR to save a picture of the capital selected in each look.

const camera = (page: Page) => page.locator('[data-camera="true"]').getAttribute('transform');
const outlined = (page: Page) => page.locator('[data-city-land]').evaluateAll((els) => els.map((e) => e.closest('[data-hex]')!.getAttribute('data-hex')!));
const dist = (a: string, b: string): number => {
  const [q1, r1] = a.split(',').map(Number) as [number, number]; const [q2, r2] = b.split(',').map(Number) as [number, number];
  return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs(q1 + r1 - q2 - r2));
};

async function intoMatch(webgl: boolean) {
  const app = await openApp('?seed=7', { width: 412, height: 915, webgl });
  const { page } = app;
  await page.getByTestId('new-match').tap();
  await page.getByTestId('start').tap();
  await page.getByTestId('ready').tap();
  await page.getByTestId('match').waitFor();
  await page.locator('[data-unit]').first().waitFor({ state: 'attached' });
  if (webgl) {
    await page.getByTestId('open-menu').tap();
    await page.getByTestId('toggle-terrain3d').tap();
    await page.getByTestId('close-sheet').tap();
    await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
  }
  await frames(page);
  await cameraStill(page);
  return app;
}

describe.runIf(process.env.BROWSER === '1')('the selected city\'s land', () => {
  for (const look of ['svg', '3d'] as const) {
    test(`412x915 ${look}: outlined while the capital is selected, only its land, gone after`, async () => {
      const { page, close } = await intoMatch(look === '3d');
      try {
        expect(await outlined(page), 'nothing selected').toEqual([]);
        await tapTile(page, '-2,5'); // the Scout
        await page.locator('.selection .unit-panel').waitFor();
        expect(await outlined(page), 'a unit selected').toEqual([]);
        await cameraStill(page);
        await tapTile(page, '-2,5'); // the city under it
        await page.locator('.selection .city-panel').waitFor();
        await cameraStill(page);
        const cam = await camera(page);
        const land = await outlined(page);
        expect(land).toContain('-2,5');
        expect(land.length).toBeGreaterThan(1);
        for (const k of land) expect(dist(k, '-2,5'), k).toBeLessThanOrEqual(2);
        // Fainter than the border: thinner, and see-through.
        const line = await page.locator('[data-city-land] line').first().evaluate((el) => ({
          width: Number(el.getAttribute('stroke-width')), opacity: Number(el.closest('g[opacity]')?.getAttribute('opacity') ?? '1'),
        }));
        expect(line.width).toBeLessThan(2.4); expect(line.opacity).toBeLessThan(1);
        if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/capital-land-${look}-412x915.png` });
        // The outline itself moves nothing.
        await frames(page);
        expect(await camera(page)).toBe(cam);
        await deselect(page);
        await expect.poll(() => outlined(page)).toEqual([]);
      } finally {
        await close();
      }
    }, 120_000);
  }
});
