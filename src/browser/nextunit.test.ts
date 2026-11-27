import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { cameraStill, frames, openApp, tapTile, uncoveredBox } from './harness';

// Next unit, and the tile under a unit of your own. Seed 7: Player 1's Warrior (unit 0) stands on the capital at
// -2,5 and can move to -1,4; once it has moved it has nothing left to do this turn.

const SEED = '?seed=7';

type Rect = { x: number; y: number; width: number; height: number };

async function box(page: Page, selector: string): Promise<Rect> {
  const b = await page.locator(selector).first().boundingBox();
  if (b === null) throw new Error(`${selector} has no box`);
  return b;
}
const mid = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const inside = (r: Rect, slot: Rect): boolean =>
  r.x >= slot.x - 0.5 && r.y >= slot.y - 0.5 && r.x + r.width <= slot.x + slot.width + 0.5 && r.y + r.height <= slot.y + slot.height + 0.5;

/** Stat values in the open panel that a line break cuts inside a word, or that spill out of their box. */
function brokenStats(page: Page): Promise<string[]> {
  return page.evaluate(`(() => {
    const out = [];
    for (const dd of document.querySelectorAll('.selection .stat dd')) {
      const box = dd.closest('.stat').getBoundingClientRect();
      const text = dd.textContent ?? '';
      const node = dd.firstChild;
      if (node === null || node.nodeType !== 3) continue;
      let at = 0;
      for (const word of text.split(' ')) {
        const r = document.createRange();
        r.setStart(node, at); r.setEnd(node, at + word.length);
        const rects = [...r.getClientRects()].filter((q) => q.width > 0);
        if (rects.length !== 1) out.push(word + ' is broken');
        else if (rects[0].left < box.left - 0.5 || rects[0].right > box.right + 0.5) out.push(word + ' spills out');
        at += word.length + 1;
      }
    }
    return out;
  })()`);
}

async function intoMatch(width = 412, height = 915) {
  const app = await openApp(SEED, { width, height });
  const { page } = app;
  await page.getByTestId('new-match').tap();
  await page.getByTestId('start').tap();
  await page.getByTestId('ready').tap();
  await page.getByTestId('match').waitFor();
  await page.locator('[data-unit]').first().waitFor({ state: 'attached' });
  await frames(page);
  return app;
}

const nextEnabled = (page: Page): Promise<boolean> => page.getByTestId('next-unit').isEnabled();

describe.runIf(process.env.BROWSER === '1')('Next unit and the tile under a unit', () => {
  test('Next unit selects a unit that can act, and greys once none can', async () => {
    const { page, close } = await intoMatch();
    try {
      await expect.poll(() => nextEnabled(page)).toBe(true);
      await page.getByTestId('next-unit').tap();
      await page.locator('.selection .unit-panel').waitFor();
      expect(await page.locator('[data-hex="-2,5"] [data-mark="selected"]').count()).toBe(1);
      await expect.poll(() => page.locator('[data-mark="move"]').count()).toBeGreaterThan(0);

      await tapTile(page, '0,3');                   // the starting Scout's whole move, into the fog
      await expect.poll(() => page.locator('[data-unit="0"]').getAttribute('data-at')).toBe('0,3');
      await expect.poll(() => page.getByTestId('units-to-act').count()).toBe(0);
      expect(await nextEnabled(page)).toBe(false);
    } finally {
      await close();
    }
  });

  test('Next unit brings a unit that is out of sight into view, and moves nothing when it is in sight', async () => {
    // A short landscape phone, so the zoomed board is much taller than its slot.
    const { page, close } = await intoMatch(568, 320);
    try {
      await expect.poll(() => nextEnabled(page)).toBe(true);
      // The board's slot keeps its size when Next unit selects the Warrior (its card lies over the board where the
      // bar of turn buttons was): only Next unit itself can bring it into view.
      const slot = await box(page, '[data-testid="board-slot"]');
      // Zoom in on the Warrior, then drag the board down until the Warrior (near the board's foot) is off the slot.
      const at = mid(await box(page, '[data-centre="-2,5"]'));
      await page.mouse.move(at.x, at.y);
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, -400);
        await frames(page);
      }
      for (let i = 0; i < 6; i++) {
        const from = { x: slot.x + slot.width / 2, y: slot.y + 40 };
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(from.x, from.y + slot.height - 80, { steps: 10 });
        await page.mouse.up();
        await frames(page);
      }
      expect(inside(await box(page, '[data-centre="-2,5"]'), await uncoveredBox(page))).toBe(false);
      await page.getByTestId('next-unit').tap();
      await page.locator('.selection .unit-panel').waitFor();
      await cameraStill(page); // the view eases over
      const shown = await box(page, '[data-centre="-2,5"]');
      // In sight: in the part of the board the side column leaves uncovered.
      expect(inside(shown, await uncoveredBox(page))).toBe(true);

      // Already in sight: deselect (the tile cycles the Warrior, the city, nothing), which brings the bar of turn
      // buttons back, then another tap (the same unit, the only one) leaves the board where it is.
      await tapTile(page, '-2,5');
      await page.locator('.selection .city-panel').waitFor();
      await tapTile(page, '-2,5');
      await expect.poll(() => page.locator('.selection').count()).toBe(0);
      await page.getByTestId('next-unit').tap();
      await page.locator('.selection .unit-panel').waitFor();
      await cameraStill(page);
      const again = await box(page, '[data-centre="-2,5"]');
      expect(Math.hypot(again.x - shown.x, again.y - shown.y)).toBeLessThan(0.5);
    } finally {
      await close();
    }
  });

  test.each([[360, 640], [412, 915]])('at %i by %i a second tap on my unit\'s tile opens the tile panel, a third closes it, and no stat value breaks inside a word', async (width, height) => {
    const { page, close } = await intoMatch(width, height);
    try {
      await tapTile(page, '-2,5');
      await tapTile(page, '-1,4');
      await expect.poll(() => page.locator('[data-unit="0"]').getAttribute('data-at')).toBe('-1,4');
      await page.waitForTimeout(300);
      await page.locator('.selection .unit-panel').waitFor();   // the Scout has movement left, so it stays selected
      expect(await brokenStats(page)).toEqual([]);
      await tapTile(page, '-1,4');
      await page.locator('.selection .tile-panel').waitFor();
      expect(await page.locator('.selection .unit-panel').count()).toBe(0);
      expect(await brokenStats(page)).toEqual([]);   // Cropland, on the tile the Scout moved to
      await tapTile(page, '-1,4');
      await expect.poll(() => page.locator('.selection').count()).toBe(0);
      await tapTile(page, '-2,5');   // the capital, now free
      await page.locator('.selection .city-panel').waitFor();
      expect(await brokenStats(page)).toEqual([]);
    } finally {
      await close();
    }
  });
  test('with the tech menu open, Tech closes it, and Next unit and End turn close it and then act', async () => {
    const { page, close } = await intoMatch();
    try {
      const sheet = page.locator('.tech-sheet');
      await expect.poll(() => nextEnabled(page)).toBe(true);        // the turn's short lock has passed
      await page.getByTestId('open-tech').tap();
      await sheet.waitFor();
      await page.getByTestId('open-tech').tap();                    // toggles it shut
      await sheet.waitFor({ state: 'detached' });

      await page.getByTestId('open-tech').tap();
      await sheet.waitFor();
      expect(await nextEnabled(page)).toBe(true);                   // still pressable under the open menu
      await page.getByTestId('next-unit').tap();
      await sheet.waitFor({ state: 'detached' });
      await page.locator('.selection .unit-panel').waitFor();       // and it did its job

      await tapTile(page, '-2,5'); await tapTile(page, '-2,5');     // back to no selection, bar returns
      await page.getByTestId('open-tech').waitFor();
      await page.getByTestId('open-tech').tap();
      await sheet.waitFor();
      await expect.poll(() => page.getByTestId('end-turn').isEnabled()).toBe(true);
      await page.getByTestId('end-turn').tap();
      await sheet.waitFor({ state: 'detached' });
      await page.getByTestId('ready').waitFor();                    // the turn ended: the next player's curtain
    } finally {
      await close();
    }
  });
}, 120_000);
