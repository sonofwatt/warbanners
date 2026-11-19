import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { frames, openApp } from './harness';

// While a card that asks for an answer is up (the turn digest, a city's reward choice), the Hud behind it is
// dimmed and taps on it do nothing, as before the chrome was restyled; and the card itself stays clear of the
// Hud. Seed 7: building a mine on the Spartan capital's ore tile at -2,4 levels the city at once, so the reward
// choice opens on the first move of the match. The digest uses the same overlay.

async function tapAt(page: Page, x: number, y: number): Promise<void> {
  await page.touchscreen.tap(x, y);
  await frames(page);
}

async function centreOf(page: Page, id: string): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId(id).boundingBox();
  if (box === null) throw new Error(`${id} has no box`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function toReward(page: Page): Promise<void> {
  await page.getByTestId('new-match').tap();
  await page.getByTestId('start').tap();
  await page.getByTestId('ready').tap();
  await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
  await expect.poll(() => page.getByTestId('end-turn').isEnabled()).toBe(true);
  const tile = await page.locator('[data-centre="-2,4"]').boundingBox();
  if (tile === null) throw new Error('no ore tile');
  await tapAt(page, tile.x + tile.width / 2, tile.y + tile.height / 2);
  await page.getByTestId('cmd-build-mine').tap();
  await page.getByTestId('reward-0').waitFor();
  await page.waitForTimeout(250); // the overlay's fade
}

describe.runIf(process.env.BROWSER === '1')('a card that asks for an answer', () => {
  for (const [w, h] of [[412, 915], [568, 320]] as const) {
    test(`blocks the Hud behind it and stays clear of it at ${w} by ${h}`, async () => {
      const { page, close } = await openApp('?seed=7', { width: w, height: h });
      try {
        await page.getByTestId('new-match').waitFor();
        await toReward(page);
        const who = await page.getByTestId('who').textContent();

        // The card starts below the Hud.
        const hud = await page.locator('.hud').boundingBox();
        const card = await page.locator('.overlay > .sheet').boundingBox();
        expect(hud).not.toBeNull(); expect(card).not.toBeNull();
        expect(card!.y).toBeGreaterThanOrEqual(hud!.y + hud!.height - 0.5);

        for (const id of ['end-turn', 'open-tech', 'open-menu']) {
          const c = await centreOf(page, id);
          const top = await page.evaluate(([x, y, tid]) => {
            const el = document.elementFromPoint(x as number, y as number);
            return el?.closest(`[data-testid="${tid as string}"]`) !== null && el !== null;
          }, [c.x, c.y, id] as const);
          expect(top, `${id} is under the overlay`).toBe(false);
          await tapAt(page, c.x, c.y);
          await page.waitForTimeout(150);
          expect(await page.getByTestId('pass').count(), `tapping ${id} ended the turn`).toBe(0);
          expect(await page.locator('.tech-sheet, .menu').count(), `tapping ${id} opened a sheet`).toBe(0);
          expect(await page.getByTestId('reward-0').isVisible()).toBe(true);
          expect(await page.getByTestId('who').textContent()).toBe(who);
        }

        // Answering the card gives the Hud back.
        await page.getByTestId('reward-0').tap();
        await page.getByTestId('reward-0').waitFor({ state: 'detached' });
        await page.getByTestId('open-menu').tap();
        await page.locator('.menu').waitFor();
      } finally {
        await close();
      }
    }, 60000);
  }
});
