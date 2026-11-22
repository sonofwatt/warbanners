import { describe, expect, test } from 'vitest';
import { frames, openApp, tapTile } from './harness';

// A build button that waits only on a tech opens the tech tree at that tech. Seed 7: the Field at -1,5, beside
// Player 1's capital, offers Build Farm, which needs Farming. Set SHOT_DIR to save a picture of the sheet.

describe.runIf(process.env.BROWSER === '1')('a locked command opens the tech tree', () => {
  for (const [w, h] of [[412, 780], [915, 412]] as const) {
    test(`${w}x${h}: tapping Build Farm before Farming opens the tech sheet at Farming`, async () => {
      const { page, close } = await openApp('?seed=7', { width: w, height: h });
      try {
        await page.getByTestId('new-match').tap();
        await page.getByTestId('start').tap();
        await page.getByTestId('ready').tap();
        await page.getByTestId('match').waitFor();
        await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
        await frames(page);
        // The phone's own bars match what they touch: the status bar the top bar's paper, the bottom inset the sea.
        const bars = await page.evaluate(() => ({
          theme: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
          body: getComputedStyle(document.body).backgroundImage,
        }));
        expect(bars.theme).toBe('#FFF8E8');
        expect(bars.body).toContain('rgb(255, 248, 232)'); expect(bars.body).toContain('rgb(62, 128, 174)');
        // The turn opens with the Scout selected, and -1,5 is a tile it could move to: let it go first.
        await page.keyboard.press('Escape');
        await frames(page);
        await tapTile(page, '-1,5');
        // The tap opens the tile's card and nothing more, though in portrait the card opens under the finger.
        await page.waitForTimeout(300);
        expect(await page.locator('.tech-sheet').count(), 'the tap did not also press Build Farm').toBe(0);
        const farm = page.getByTestId('cmd-build-farm');
        await farm.waitFor();
        expect(await farm.isEnabled()).toBe(true);
        await farm.tap();
        const row = page.getByTestId('tech-farming');
        await row.waitFor();
        await frames(page);
        expect(await row.getAttribute('class')).toContain('focus');
        expect(await row.isVisible()).toBe(true);
        const inView = await row.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= window.innerHeight;
        });
        expect(inView, 'the ringed tech is on screen').toBe(true);
        // Only the sheet scrolled: the app's frame did not, so the top bar is still whole.
        const frame = await page.evaluate(() => [document.scrollingElement?.scrollTop ?? 0, document.querySelector('.app')?.scrollTop ?? 0]);
        expect(frame).toEqual([0, 0]);
        if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/techlink-${w}x${h}.png` });
        // Opened from the bar, the sheet rings nothing.
        await page.getByTestId('close-sheet').tap();
        await page.getByTestId('open-tech').tap();
        await row.waitFor();
        expect(await page.locator('.tech-sheet li.focus').count()).toBe(0);
      } finally {
        await close();
      }
    }, 60_000);
  }
});
