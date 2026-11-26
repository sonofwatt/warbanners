/// <reference types="node" />
import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { newRecord } from '../app/record';
import type { MatchRecord } from '../app/record';
import { writeSave } from '../app/saves';
import { createMatch, hashState, isConnected } from '../engine';
import { addCity, setTile } from '../engine/testkit';
import { cameraStill, deselect, frames, openApp, tapTile, uncoveredBox } from './harness';

// The 0.7.0 features together, in both looks at 412x915: the panels over the fixed-size board (steadycam), the war
// banners (warbanner), the 3D cities and borders (cities3d). With the capital (and its Scout) selected:
// - the Scout's war banner shows, in sight above the collapsed card, and is drawn on top of the 3D city (hiding it
//   changes the screen where it was);
// - the selection ring shows round the city tile, on top of the 3D city;
// - the city's land glows, and in 3D the svg draws no border line (the terrain scene draws them);
// - the city card's level badge (and, for the second city, the road badge) shows in the collapsed card.
// The save is seed 7 with a level 2 Spartan city at 1,4 joined to the capital at -2,5 by roads.

const CAPITAL = '-2,5';
const SECOND = '1,4';

function save(): [string, string][] {
  const state = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
  const city = addCity(state, 0, 1, 4, { level: 2 });
  for (const [q, r] of [[-1, 4], [0, 3], [1, 3]] as const) setTile(state, q, r, { road: true });
  expect(isConnected(state, city)).toBe(true);
  const p = state.players[0]!;
  p.explored = [...new Set([...p.explored, ...Object.keys(state.tiles).filter((k) => state.tiles[k]!.cityId !== null)])].sort();
  const settings = { seed: 7, factions: ['spartans', 'mongols'] as ['spartans', 'mongols'] };
  const base = newRecord('together', settings, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  const outcome = writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state);
  expect(outcome.saved).toBe(true);
  return [...map.entries()];
}

async function selectCity(page: Page, at: string): Promise<void> {
  await deselect(page);
  for (let i = 0; i < 3 && (await page.locator('.selection .city-panel').count()) === 0; i += 1) {
    await tapTile(page, at);
    await page.waitForTimeout(200);
    await cameraStill(page);
  }
  await page.locator('.selection .city-panel').waitFor();
  await frames(page);
}

/**
 * How much the screen changes at each point when the elements matching `sel` are hidden: the largest change of any
 * colour channel, per point. A part drawn on top of everything else changes the screen where it is.
 */
async function changeWhenHidden(page: Page, sel: string, points: { x: number; y: number }[]): Promise<number[]> {
  const shot = async () => (await page.screenshot()).toString('base64');
  const shown = await shot();
  await page.evaluate((s) => document.querySelectorAll<SVGElement>(s).forEach((e) => { e.style.display = 'none'; }), sel);
  await frames(page);
  const hidden = await shot();
  await page.evaluate((s) => document.querySelectorAll<SVGElement>(s).forEach((e) => { e.style.display = ''; }), sel);
  await frames(page);
  return page.evaluate(async ({ a, b, pts }) => {
    const read = async (b64: string) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
      return (x: number, y: number) => g.getImageData(Math.round(x * devicePixelRatio), Math.round(y * devicePixelRatio), 1, 1).data;
    };
    const on = await read(a), off = await read(b);
    return pts.map((p) => { const x = on(p.x, p.y), y = off(p.x, p.y); return Math.max(...[0, 1, 2].map((i) => Math.abs(x[i]! - y[i]!))); });
  }, { a: shown, b: hidden, pts: points });
}

describe.runIf(process.env.BROWSER === '1')('0.7.0 together: panels, war banners, 3D cities', () => {
  for (const look of ['svg', '3d'] as const) {
    test(`412x915 ${look}: banner, ring, glow and badges with a city selected`, async () => {
      const entries = save();
      const { page, close } = await openApp('', {
        width: 412, height: 915, webgl: look === '3d',
        beforeOpen: (c) => {
          void c.addInitScript((items: [string, string][]) => {
            try { for (const [k, v] of items) if (localStorage.getItem(k) === null) localStorage.setItem(k, v); } catch { /* Continue is missing then */ }
          }, entries);
        },
      });
      try {
        await page.getByTestId('continue').tap();
        await page.getByTestId('ready').tap();
        await page.getByTestId('match').waitFor();
        await page.locator('[data-unit]').first().waitFor({ state: 'attached' });
        if (look === '3d') {
          await page.getByTestId('open-menu').tap();
          await page.getByTestId('toggle-terrain3d').tap();
          await page.getByTestId('close-sheet').tap();
          await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
        }
        await frames(page);
        await cameraStill(page);

        // Borders: in 3D they are in the terrain scene, so the svg draws no border line; in the svg look it does.
        const borderLines = await page.locator(`svg.board line[stroke-width="2.4"][stroke-linecap="round"]`).count();
        if (look === '3d') expect(borderLines, '3D: no svg border lines').toBe(0);
        else expect(borderLines, 'svg: border lines').toBeGreaterThan(0);

        // The Scout on the capital: a war banner (no pips of old), in sight above the collapsed card.
        await tapTile(page, CAPITAL);
        await page.locator('.selection .unit-panel').waitFor();
        await cameraStill(page);
        expect(await page.getByTestId('selection').getAttribute('data-sheet')).toBe('collapsed');
        const banner = page.locator(`[data-unit][data-at="${CAPITAL}"] [data-banner]`);
        await expect.poll(() => banner.count()).toBe(1);
        const free = await uncoveredBox(page);
        const bb = (await banner.boundingBox())!;
        expect(bb.y, 'the banner is below the top of the board').toBeGreaterThanOrEqual(free.y);
        expect(bb.y + bb.height, 'the banner is clear of the card').toBeLessThanOrEqual(free.y + free.height);

        // The capital itself (a second tap): glow, ring, banner, badge.
        await selectCity(page, CAPITAL);
        expect(await page.getByTestId('selection').getAttribute('data-sheet')).toBe('collapsed');
        expect(await page.locator('[data-city-land]').count(), 'the land glows').toBeGreaterThan(0);
        expect(await page.locator(`[data-hex="${CAPITAL}"] [data-mark="selected"]`).count(), 'the ring').toBe(1);
        expect(await page.getByTestId('city-level').isVisible(), 'city-level').toBe(true);
        expect(await page.getByTestId('city-connected').count(), 'never on a capital').toBe(0);

        // The banner is on top: hiding it changes the screen at its middle.
        const b2 = (await banner.boundingBox())!;
        const [atBanner] = await changeWhenHidden(page, `[data-unit][data-at="${CAPITAL}"] [data-banner]`, [{ x: b2.x + b2.width / 2, y: b2.y + b2.height / 2 }]);
        expect(atBanner, 'the banner shows over the city').toBeGreaterThan(40);

        // The ring is on top: hiding it changes the screen on its left and right sides, at mid height (clear of the
        // figure). Read from the layout box, which carries any css transform on the tile.
        const corners = await page.evaluate((hex) => {
          const r = document.querySelector(`[data-hex="${hex}"] [data-mark="selected"] polygon[fill="none"]`)!.getBoundingClientRect();
          return [{ x: r.left, y: r.top + r.height / 2 }, { x: r.right, y: r.top + r.height / 2 }];
        }, CAPITAL);
        const atRing = await changeWhenHidden(page, `[data-hex="${CAPITAL}"] [data-mark="selected"]`, corners);
        for (const d of atRing) expect(d, 'the ring shows over the city').toBeGreaterThan(40);
        if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/together-capital-${look}-412x915.png` });

        // The second city: the road badge and the level badge in the collapsed card.
        await selectCity(page, SECOND);
        expect(await page.getByTestId('city-connected').isVisible(), 'city-connected').toBe(true);
        expect(await page.getByTestId('city-level').isVisible(), 'city-level').toBe(true);
        expect(await page.locator(`[data-hex="${SECOND}"] [data-city-land]`).count()).toBe(1);
      } finally {
        await close();
      }
    }, 180_000);
  }
});
