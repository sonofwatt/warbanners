/// <reference types="node" />
import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { frames, openApp } from './harness';

// Player names and stats in a real browser: a named match against the Easy AI, resigned, shows both sides on the
// result, is counted once on the Stats screen across a reload, and the name is offered at the next setup.
// SHOT_DIR, when set, is where screenshots of the new screens are written.

const shot = async (page: Page, name: string): Promise<void> => {
  const dir = process.env.SHOT_DIR;
  if (dir !== undefined && dir !== '') await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
};
const tile = async (page: Page, key: string): Promise<string> => (await page.locator(`[data-testid="stat-${key}"] dd`).textContent()) ?? '';

describe.runIf(process.env.BROWSER === '1')('player stats', () => {
  test('a resigned match is on the result, counted once in Stats, and the name comes back at setup', async () => {
    const app = await openApp('?seed=7');
    try {
      const { page } = app;
      await page.getByTestId('new-match').tap();
      expect(await page.getByTestId('name-0').inputValue()).toBe('');
      await page.getByTestId('name-0').fill('Ana');
      await page.getByTestId('second-easy').tap();
      await page.getByTestId('start').tap();
      await page.getByTestId('match').waitFor();
      await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
      await frames(page);

      await page.getByTestId('open-menu').tap();
      await page.getByTestId('resign').tap();
      await page.getByTestId('resign-yes').tap();
      await page.getByTestId('winner').waitFor();
      const table = page.getByTestId('result-tally');
      await table.waitFor();
      expect(await table.textContent()).toContain('Ana');
      expect(await table.textContent()).toContain('Easy AI');
      // The score sheet: Ana's only (the AI gets none), its points add up to the total, and Easy AI is the factor.
      const sheet = page.getByTestId('score-sheet-0');
      await sheet.waitFor();
      expect(await page.getByTestId('score-sheet-1').count()).toBe(0);
      const points = (await sheet.getByTestId('score-points').allTextContents()).map(Number);
      const diff = Number((await sheet.getByTestId('score-difficulty').locator('td').textContent()) ?? 'NaN');
      expect(await sheet.getByTestId('score-difficulty').textContent()).toContain('Easy AI');
      expect(Number(await sheet.getByTestId('score-total').textContent())).toBe(Math.max(0, points.reduce((a, b) => a + b, 0) + diff));
      expect(await sheet.getByTestId('score-line-victory').textContent()).toContain('not this time');
      // The sheet makes the result taller than the phone: it must scroll from its top, the banner still reachable.
      expect(await page.locator('.trophy').evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
      await shot(page, 'result');
      await page.getByTestId('result-home').tap();

      await page.getByTestId('open-stats').tap();
      await page.getByTestId('stats').waitFor();
      expect(await tile(page, 'played')).toBe('1');
      expect(await tile(page, 'wins')).toBe('0');
      expect(await page.getByTestId('stats-recent-row').count()).toBe(1);
      expect(await page.getByTestId('stats-recent-row').textContent()).toContain('Lost against Easy AI');
      await page.getByTestId('stats-kind-pass').tap();
      expect(await page.getByTestId('stats-none').count()).toBe(1);
      await page.getByTestId('stats-kind-computer').tap();
      expect(await tile(page, 'played')).toBe('1');
      await shot(page, 'stats');

      // A reload and reopening Stats counts nothing again.
      await page.reload();
      await page.getByTestId('open-stats').tap();
      expect(await tile(page, 'played')).toBe('1');
      await page.getByTestId('stats-home').tap();

      await page.getByTestId('new-match').tap();
      expect(await page.getByTestId('name-0').inputValue()).toBe('Ana');
      await shot(page, 'setup');

      // Forgetting Ana from Stats empties it.
      await page.getByTestId('setup-back').tap();
      await page.getByTestId('open-stats').tap();
      await page.getByTestId('stats-forget').tap();
      await page.getByTestId('stats-forget-yes').tap();
      await page.getByTestId('stats-empty').waitFor();
    } finally {
      await app.close();
    }
  });
});
