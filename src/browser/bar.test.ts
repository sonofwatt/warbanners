import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { T } from '../ui/text';
import { cameraStill, frames, openApp, tapTile } from './harness';

// The turn buttons sit in a bar along the bottom of the screen: Tech, Next unit (with how many units can still act)
// and End turn, each the shape of End turn. A selection's card takes the bar's place, and deselecting brings it back,
// neither moving the board. End turn stays neutral while a unit can act and lights up once none can. The Menu button
// sits at the far left of the top bar, before the player's name. Seed 7: Player 1's Scout (unit 0) on the capital
// at -2,5 can move to 0,3, its whole move. Set SHOT_DIR to save pictures.

type Rect = { x: number; y: number; width: number; height: number };
async function box(page: Page, selector: string): Promise<Rect> {
  const b = await page.locator(selector).first().boundingBox();
  if (b === null) throw new Error(`${selector} has no box`);
  return b;
}
const camera = (page: Page) => page.locator('[data-camera="true"]').getAttribute('transform');
const SHOTS = process.env.SHOT_DIR;

async function intoMatch(width = 412, height = 915) {
  const app = await openApp('?seed=7', { width, height });
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

describe.runIf(process.env.BROWSER === '1')('the bar of turn buttons', () => {
  test('412x915: Tech, Next unit with its count, End turn; Menu left of the name; the card swaps with it and the board stays', async () => {
    const { page, close } = await intoMatch();
    try {
      const bar = page.getByTestId('action-bar');
      await bar.waitFor();
      // Nothing in the top bar but the Menu button.
      expect(await page.locator('.hud [data-testid="end-turn"], .hud [data-testid="next-unit"], .hud [data-testid="open-tech"]').count()).toBe(0);
      const menu = await box(page, '[data-testid="open-menu"]'), who = await box(page, '[data-testid="who"]');
      expect(menu.x + menu.width).toBeLessThanOrEqual(who.x);
      expect(menu.x).toBeLessThan(20);
      // The three buttons in one row along the bottom, Tech, Next unit, End turn, thumb sized, with their words.
      const ids = ['open-tech', 'next-unit', 'end-turn'];
      const boxes = await Promise.all(ids.map((id) => box(page, `[data-testid="action-bar"] [data-testid="${id}"]`)));
      for (const b of boxes) { expect(b.height).toBeGreaterThanOrEqual(48); expect(b.y + b.height).toBeGreaterThan(915 - 80); }
      expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x); expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x);
      expect(Math.abs(boxes[0]!.y - boxes[2]!.y)).toBeLessThan(1);
      expect(await page.getByTestId('open-tech').textContent()).toContain(T.ui.techs);
      expect(await page.getByTestId('next-unit').textContent()).toContain(T.ui.nextUnit);
      expect(await page.getByTestId('units-to-act').textContent()).toBe('1');
      expect(await page.getByTestId('end-turn').textContent()).toBe(T.ui.endTurn);
      // Each label fits its button on one line.
      const fits = await page.locator('[data-testid="action-bar"] button').evaluateAll((els) => els.every((e) => {
        const b = e.getBoundingClientRect();
        const label = e.querySelector('.bar-label') ?? e;
        const l = label.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(label);
        const lines = range.getClientRects().length;
        return l.left >= b.left - 0.5 && l.right <= b.right + 0.5 && lines <= 1;
      }));
      expect(fits).toBe(true);
      if (SHOTS) {
        await page.screenshot({ path: `${SHOTS}/bar-nothing-selected-412x915.png` });
        await page.screenshot({ path: `${SHOTS}/topbar-412x915.png`, clip: { x: 0, y: 0, width: 412, height: 110 } });
      }

      // Select the Scout: its card takes the bar's place. Once it is in sight, the swap moves nothing.
      await tapTile(page, '-2,5');
      await page.locator('.selection .unit-panel').waitFor();
      await expect.poll(() => bar.count()).toBe(0);
      await cameraStill(page);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/unit-selected-card-412x915.png` });
      const cam = await camera(page);
      // Unit, city, nothing: the bar comes back; then the Scout again: the card again. The board never moves.
      await tapTile(page, '-2,5');
      await page.locator('.selection .city-panel').waitFor();
      await cameraStill(page);
      const camCity = await camera(page); // the city's taller top may bring the tile up once
      await tapTile(page, '-2,5');
      await page.getByTestId('action-bar').waitFor();
      expect(await page.locator('.selection').count()).toBe(0);
      await cameraStill(page);
      expect(await camera(page), 'the bar coming back never moves the board').toBe(camCity);
      await tapTile(page, '-2,5');
      await page.locator('.selection .unit-panel').waitFor();
      await cameraStill(page);
      expect(await camera(page), 'the card replacing the bar moves nothing when the unit is in sight').toBe(camCity);
      expect(cam).not.toBeNull();
    } finally {
      await close();
    }
  }, 90_000);

  test('412x915: End turn is neutral while a unit can act, and lights up once none can', async () => {
    const { page, close } = await intoMatch();
    try {
      const end = page.getByTestId('end-turn');
      await expect.poll(() => end.isEnabled()).toBe(true);
      await page.waitForTimeout(300); // its colour eases over from the greyed look of the first moment
      const look = () => end.evaluate((el) => ({ cls: el.className, bg: getComputedStyle(el).backgroundColor }));
      const tech = await page.getByTestId('open-tech').evaluate((el) => getComputedStyle(el).backgroundColor);
      const before = await look();
      expect(before.cls).toContain('paper');
      expect(before.cls).not.toContain('player');
      expect(before.bg, 'the same beige as Tech').toBe(tech);
      // The Scout's whole move: no unit is left to act.
      await tapTile(page, '-2,5');
      await page.locator('.selection .unit-panel').waitFor();
      await tapTile(page, '0,3');
      await expect.poll(() => page.locator('[data-unit="0"]').getAttribute('data-at')).toBe('0,3');
      await page.getByTestId('action-bar').waitFor();
      await expect.poll(() => page.getByTestId('units-to-act').count()).toBe(0);
      await page.waitForTimeout(300); // the colour eases over about 200 ms
      const after = await look();
      expect(after.cls).toContain('player');
      expect(after.bg).not.toBe(tech);
      expect(await end.isEnabled()).toBe(true);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/bar-end-turn-ready-412x915.png` });
    } finally {
      await close();
    }
  }, 90_000);
});
