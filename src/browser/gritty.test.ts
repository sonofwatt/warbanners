import { describe, expect, test } from 'vitest';
import { openApp } from './harness';

// Settings on Home in a real browser: Gritty is chosen, applies at once, survives a reload, and the board draws the
// dark grounds. Bright stays the default on a fresh phone.

describe.runIf(process.env.BROWSER === '1')('gritty art style', () => {
  test('Settings switches the art style and the phone keeps it', async () => {
    const app = await openApp('?seed=7');
    try {
      const { page } = app;
      const art = (): Promise<string | null> => page.evaluate(() => document.documentElement.getAttribute('data-art'));
      const bodyBg = (): Promise<string> => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await page.getByTestId('new-match').waitFor();
      expect(await art()).toBeNull();
      const brightBg = await bodyBg();

      await page.getByTestId('open-settings').tap();
      await page.getByTestId('settings').waitFor();
      expect(await page.getByTestId('art-bright').getAttribute('aria-pressed')).toBe('true');
      await page.getByTestId('art-gritty').tap();
      expect(await page.getByTestId('art-gritty').getAttribute('aria-pressed')).toBe('true');
      expect(await art()).toBe('gritty');
      expect(await bodyBg()).not.toBe(brightBg);
      await page.getByTestId('settings-done').tap();
      await page.getByTestId('settings').waitFor({ state: 'detached' });

      await page.reload();
      await page.getByTestId('new-match').waitFor();
      expect(await art()).toBe('gritty');

      // The board's grass is Gritty's (palette GROUND_GRITTY), not Bright's.
      await page.getByTestId('new-match').tap();
      await page.getByTestId('start').tap();
      await page.getByTestId('ready').tap();
      await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
      const fills = await page.evaluate(() => [...document.querySelectorAll('polygon')].map((p) => p.getAttribute('fill')));
      expect(fills).toContain('#5A6B4C');
      expect(fills).not.toContain('#A9D975');
    } finally {
      await app.close();
    }
  }, 60_000);
});
