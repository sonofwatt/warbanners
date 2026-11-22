import { describe, expect, test } from 'vitest';
import { frames, openApp, tapTile } from './harness';

// A city's card fits on the phone with nothing to scroll until a unit is picked; the picked unit's Train button
// then sits at the card's top right, with the other cards' actions. Seed 7: Player 1's capital is at -2,5.
// Set SHOT_DIR to save pictures.

const SIZES = [[430, 839], [390, 763], [412, 780], [360, 640]] as const;

describe.runIf(process.env.BROWSER === '1')('the city card', () => {
  for (const [w, h] of SIZES) {
    test(`${w}x${h}: fits unscrolled, and Train goes top right`, async () => {
      const { page, close } = await openApp('?seed=7', { width: w, height: h });
      try {
        await page.getByTestId('new-match').tap();
        await page.getByTestId('start').tap();
        await page.getByTestId('ready').tap();
        await page.getByTestId('match').waitFor();
        await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
        await frames(page);
        await page.keyboard.press('Escape');
        await frames(page);
        // The Scout stands on the capital: the first tap picks it, the second the city.
        for (let i = 0; i < 3 && (await page.locator('.shop').count()) === 0; i += 1) {
          await tapTile(page, '-2,5');
          await page.waitForTimeout(250);
        }
        await page.locator('.shop').waitFor();
        await frames(page);
        const box = page.locator('.selection');
        const fit = await box.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
        if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/city-${w}x${h}.png` });
        expect(fit.scroll, `nothing to scroll (${fit.scroll} in ${fit.client})`).toBeLessThanOrEqual(fit.client + 1);
        // Every card in the row is the same height as the tallest (the Krypteia Scout's two-line name).
        const heights = await page.locator('.shop-item').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
        expect(new Set(heights).size, `card heights ${heights.join(', ')}`).toBe(1);
        await page.locator('.shop-strip').evaluate((el) => { el.scrollLeft = el.scrollWidth; });
        if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/city-end-${w}x${h}.png` });
        await page.locator('.shop-strip').evaluate((el) => { el.scrollLeft = 0; });
        await page.getByTestId('shop-warrior').tap();
        const train = page.locator('.card-actions [data-testid="cmd-train-warrior"]');
        await train.waitFor();
        expect(await train.getAttribute('class')).toContain('primary');
        expect(await train.textContent()).toContain('Train');
        const near = await train.evaluate((el) => {
          const b = el.getBoundingClientRect(); const c = el.closest('.selection')!.getBoundingClientRect();
          return { top: b.top - c.top, right: c.right - b.right };
        });
        expect(near.top).toBeLessThan(40); expect(near.right).toBeLessThan(40);
        if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/city-picked-${w}x${h}.png` });
      } finally {
        await close();
      }
    }, 60_000);
  }
});
