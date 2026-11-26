import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { frames, openApp } from './harness';

// The new match screen's Advanced section in a real browser: closed at first, it opens in place; the choices reach
// the match's settings (and its save), the map's chests, and the board's look, in SVG and in 3D.

interface SavedSettings { seed: number; factions: string[]; chests?: string; weather?: string; time?: string }

async function savedSettings(page: Page): Promise<SavedSettings[]> {
  return page.evaluate(() => {
    const out: SavedSettings[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      const v = localStorage.getItem(k) ?? '';
      if (!v.includes('"settings"')) continue;
      try {
        const o = JSON.parse(v) as { settings?: SavedSettings; record?: { settings?: SavedSettings } };
        const s = o.settings ?? o.record?.settings;
        if (s) out.push(s);
      } catch { /* not a save */ }
    }
    return out;
  });
}

async function intoMatch(page: Page): Promise<void> {
  await page.getByTestId('start').tap();
  await page.getByTestId('ready').tap();
  await page.getByTestId('match').waitFor();
  await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
  await frames(page);
}

async function pick(page: Page, picks: string[]): Promise<void> {
  await page.getByTestId('advanced-toggle').tap();
  for (const p of picks) await page.getByTestId(p).tap();
}

/** The mean brightness (0 to 1) of what the 3D canvas draws, the svg hidden. */
async function canvasLuma(page: Page): Promise<number> {
  await page.locator('svg.board').evaluate((el) => { (el as SVGElement).style.visibility = 'hidden'; });
  await page.locator('svg.board-overlay').evaluate((el) => { (el as SVGElement).style.visibility = 'hidden'; });
  await frames(page);
  const png = await page.getByTestId('board-slot').screenshot();
  await page.locator('svg.board').evaluate((el) => { (el as SVGElement).style.visibility = ''; });
  await page.locator('svg.board-overlay').evaluate((el) => { (el as SVGElement).style.visibility = ''; });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) { sum += (0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!) / 255; n++; }
    return sum / n;
  }, png.toString('base64'));
}

async function on3d(page: Page): Promise<void> {
  await page.getByTestId('open-menu').tap();
  await page.getByTestId('toggle-terrain3d').tap();
  await page.getByTestId('close-sheet').tap();
  await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
  await page.waitForTimeout(500);
  await frames(page);
}

describe.runIf(process.env.BROWSER === '1')('the Advanced match options', () => {
  test('closed at first, open in place, the choices reach the match, its save and the SVG board', async () => {
    const { page, close } = await openApp('?seed=7');
    try {
      await page.getByTestId('new-match').tap();
      const toggle = page.getByTestId('advanced-toggle');
      expect(await toggle.getAttribute('aria-expanded')).toBe('false');
      expect(await page.getByTestId('advanced-body').count()).toBe(0);
      await toggle.tap();
      expect(await toggle.getAttribute('aria-expanded')).toBe('true');
      expect(await toggle.getAttribute('aria-controls')).toBe(await page.getByTestId('advanced-body').getAttribute('id'));
      // The defaults are today's game.
      for (const id of ['chests-normal', 'weather-clear', 'time-day']) expect(await page.getByTestId(id).getAttribute('aria-checked')).toBe('true');
      // It fits the phone: nothing sticks out sideways, and the choices are tappable.
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(412);
      for (const id of ['chests-many', 'weather-random', 'time-random']) {
        const b = await page.getByTestId(id).boundingBox();
        expect(b!.height).toBeGreaterThanOrEqual(44);
        expect(b!.x + b!.width).toBeLessThanOrEqual(412);
      }
      await toggle.tap();
      expect(await page.getByTestId('advanced-body').count()).toBe(0);
      await toggle.tap();
      for (const id of ['chests-many', 'weather-rain', 'time-night']) await page.getByTestId(id).tap();
      expect(await page.getByTestId('chests-many').getAttribute('aria-checked')).toBe('true');
      expect(await page.getByTestId('chests-normal').getAttribute('aria-checked')).toBe('false');
      await intoMatch(page);
      const board = page.getByTestId('board');
      expect(await board.getAttribute('data-time')).toBe('night');
      expect(await board.getAttribute('data-weather')).toBe('rain');
      expect(await page.locator('svg.board .grade').count()).toBeGreaterThan(20);
      expect(await page.locator('svg.board .wx').count()).toBeGreaterThan(5);
      expect(await page.locator('#wx-rain').count()).toBe(1);
      expect(await page.getByTestId('board-slot').getAttribute('data-sea')).toBe('night');
      // Marks and units are drawn outside the grade, so they keep their full colour.
      expect(await page.locator('svg.board .grade [data-mark], svg.board .grade [data-unit]').count()).toBe(0);
      const saved = await savedSettings(page);
      expect(saved).toContainEqual({ seed: 7, factions: ['spartans', 'mongols'], chests: 'many', weather: 'rain', time: 'night' });
    } finally {
      await close();
    }
  }, 90_000);

  test('a default match is today\'s: no advanced fields saved, no grade, no weather', async () => {
    const { page, close } = await openApp('?seed=7');
    try {
      await page.getByTestId('new-match').tap();
      await intoMatch(page);
      expect(await page.getByTestId('board').getAttribute('data-time')).toBe('day');
      expect(await page.locator('svg.board .grade, svg.board .wx').count()).toBe(0);
      expect(await page.getByTestId('board-slot').getAttribute('data-sea')).toBeNull();
      expect(await savedSettings(page)).toContainEqual({ seed: 7, factions: ['spartans', 'mongols'] });
    } finally {
      await close();
    }
  }, 60_000);

  test('in 3D, night darkens the board and rain falls in the ambient loop', async () => {
    const { page, close } = await openApp('?seed=7', { webgl: true });
    try {
      await page.getByTestId('new-match').tap();
      await intoMatch(page);
      await on3d(page);
      const terrain = page.getByTestId('board-terrain');
      expect(await terrain.getAttribute('data-look')).toBe('clear day 0');
      const day = await canvasLuma(page);
      await page.getByTestId('open-menu').tap();
      await page.getByTestId('go-home').tap();
      await page.getByTestId('new-match').tap();
      await pick(page, ['weather-rain', 'time-night']);
      await intoMatch(page);
      await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
      await page.waitForTimeout(500);
      await frames(page);
      expect(await page.getByTestId('board-terrain').getAttribute('data-look')).toMatch(/^rain night \d+$/);
      const night = await canvasLuma(page);
      expect(night).toBeLessThan(day * 0.75);
      // The rain moves: two shots of the figures' canvas a moment apart differ.
      const a = await page.getByTestId('board-units3d').screenshot();
      await page.waitForTimeout(300);
      const b = await page.getByTestId('board-units3d').screenshot();
      expect(a.equals(b)).toBe(false);
    } finally {
      await close();
    }
  }, 120_000);
});
