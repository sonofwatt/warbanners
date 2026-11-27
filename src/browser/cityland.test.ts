/// <reference types="node" />
import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { newRecord } from '../app/record';
import type { MatchRecord } from '../app/record';
import { writeSave } from '../app/saves';
import { createMatch, hashState, isConnected, key, neighbors, parseKey } from '../engine';
import { addCity, setTile } from '../engine/testkit';
import { cameraStill, deselect, frames, openApp, tapTile } from './harness';

// While a city is selected, its land glows in the faction colour from its outer edge: half strength right at the
// edge, fading to nothing one tile in, in both looks; nothing else glows, and the glow goes with the selection. It
// never moves the board. The save is built from the engine: seed 7 with a level 2 Spartan city at 1,4, three tiles
// from the capital at -2,5 and joined to it by roads on -1,4, 0,3 and 1,3, everything round both explored. Set
// SHOT_DIR to save each city selected in each look.

const SECOND = '1,4';

function save(): [string, string][] {
  const state = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
  const city = addCity(state, 0, 1, 4, { level: 2 });
  for (const [q, r] of [[-1, 4], [0, 3], [1, 3]] as const) setTile(state, q, r, { road: true });
  expect(isConnected(state, city)).toBe(true);
  const p = state.players[0]!;
  p.explored = [...new Set([...p.explored, ...Object.keys(state.tiles).filter((k) => state.tiles[k]!.cityId !== null)])].sort();
  const settings = { seed: 7, factions: ['spartans', 'mongols'] as ['spartans', 'mongols'] };
  const base = newRecord('land', settings, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  const outcome = writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state);
  expect(outcome.saved).toBe(true);
  return [...map.entries()];
}

const camera = (page: Page) => page.locator('[data-camera="true"]').getAttribute('transform');
const glowing = (page: Page) => page.locator('[data-city-land]').evaluateAll((els) => els.map((e) => e.closest('[data-hex]')!.getAttribute('data-hex')!).sort());
const dist = (a: string, b: string): number => {
  const [q1, r1] = a.split(',').map(Number) as [number, number]; const [q2, r2] = b.split(',').map(Number) as [number, number];
  return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs(q1 + r1 - q2 - r2));
};

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
 * How strong the glow is near an outer edge and one tile in, read off the screen. A glowing tile with nothing on it
 * is picked whose neighbour across from one of its outer edges is land of the same city with no outer edge (the
 * city's middle). The board is pictured with the glow and without it, and at points a tenth of the way along that
 * edge's fade and just past its far end (in the middle tile) the change is set against the faction colour's distance
 * from the ground: 1 would be the faction colour itself.
 */
async function strength(page: Page): Promise<{ edge: number; inner: number }> {
  const tiles = await page.evaluate(() => [...document.querySelectorAll<SVGGElement>('[data-city-land]')].map((g) => {
    const hex = g.closest('[data-hex]')!.getAttribute('data-hex')!;
    const glow = g.querySelector<SVGGElement>('[data-city-glow]');
    return { hex, dirs: glow === null ? [] : glow.dataset.cityGlow!.split(',').map(Number), occupied: document.querySelector(`[data-unit][data-at="${hex}"]`) !== null };
  }));
  const byHex = new Map(tiles.map((t) => [t.hex, t]));
  let pick: { hex: string; d: number } | null = null;
  for (const t of tiles) {
    if (t.occupied || pick !== null) continue;
    for (const d of t.dirs) {
      const across = byHex.get(key(neighbors(parseKey(t.hex))[(d + 3) % 6]!));
      if (across !== undefined && across.dirs.length === 0) { pick = { hex: t.hex, d }; break; }
    }
  }
  expect(pick, 'a glowing tile beside the city\'s middle').not.toBeNull();
  const probe = await page.evaluate(({ hex, d }) => {
    const id = `land-${hex.replace(',', '_')}`;
    const grad = document.getElementById(`${id}-${d}`)!;
    const fill = document.querySelector<SVGPolygonElement>(`polygon[mask="url(#${id})"]`)!;
    const m = fill.getScreenCTM()!;
    const at = (t: number) => {
      const x = Number(grad.getAttribute('x1')) * (1 - t) + Number(grad.getAttribute('x2')) * t;
      const y = Number(grad.getAttribute('y1')) * (1 - t) + Number(grad.getAttribute('y2')) * t;
      return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
    };
    return { colour: fill.getAttribute('fill')!, edge: at(0.1), inner: at(1.2), dpr: window.devicePixelRatio };
  }, pick!);
  const shot = async () => (await page.screenshot()).toString('base64');
  const withGlow = await shot();
  await page.evaluate(() => document.querySelectorAll<SVGGElement>('[data-city-land]').forEach((e) => { e.style.display = 'none'; }));
  await frames(page);
  const without = await shot();
  await page.evaluate(() => document.querySelectorAll<SVGGElement>('[data-city-land]').forEach((e) => { e.style.display = ''; }));
  return page.evaluate(async ({ a, b, p }) => {
    const read = async (b64: string) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
      return (x: number, y: number) => g.getImageData(Math.round(x * p.dpr), Math.round(y * p.dpr), 1, 1).data;
    };
    const on = await read(a), off = await read(b);
    const hex = p.colour.replace('#', '');
    const col = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const alpha = (pt: { x: number; y: number }) => {
      const x = on(pt.x, pt.y), y = off(pt.x, pt.y);
      // The channel where the colour stands furthest from the ground says most about the blend.
      let best = 0, at = 0;
      for (let i = 0; i < 3; i++) { const span = Math.abs(col[i]! - y[i]!); if (span > best) { best = span; at = i; } }
      // Where the ground there is near the faction colour (a red roof), the bare change is used, against a mid span.
      if (best < 60) return Math.max(...[0, 1, 2].map((i) => Math.abs(x[i]! - y[i]!))) / 128;
      return Math.abs(x[at]! - y[at]!) / best;
    };
    return { edge: alpha(p.edge), inner: alpha(p.inner) };
  }, { a: withGlow, b: without, p: probe });
}

describe.runIf(process.env.BROWSER === '1')('the selected city\'s land', () => {
  for (const look of ['svg', '3d'] as const) {
    test(`412x915 ${look}: the glow on each selected city's land only, half strength at the edge, none a tile in, gone after`, async () => {
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
        // Held still: the glow is read off two screenshots, so a flickering bonfire or a swaying lantern between them
        // would read as glow.
        await page.emulateMedia({ reducedMotion: 'reduce' });
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
        expect(await glowing(page), 'nothing selected').toEqual([]);
        await tapTile(page, '-2,5'); // the Scout
        await page.locator('.selection .unit-panel').waitFor();
        expect(await glowing(page), 'a unit selected').toEqual([]);

        const lands: Record<string, string[]> = {};
        for (const [at, name] of [['-2,5', 'capital'], [SECOND, 'second']] as const) {
          await selectCity(page, at);
          const cam = await camera(page);
          const land = await glowing(page);
          lands[at] = land;
          expect(land, `${name}: its tiles glow`).toContain(at);
          for (const k of land) expect(dist(k, at), `${name}: ${k} is its land`).toBeLessThanOrEqual(2);
          // No line: the glow is a fill through a mask.
          expect(await page.locator('[data-city-land] line').count()).toBe(0);
          const s = await strength(page);
          expect(s.edge, `${name}: near the edge`).toBeGreaterThan(0.3);
          expect(s.edge, `${name}: near the edge`).toBeLessThanOrEqual(0.53);
          expect(s.inner, `${name}: a tile in`).toBeLessThan(0.08);
          if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/land-${name}-${look}-412x915.png` });
          await frames(page);
          expect(await camera(page), `${name}: the glow moves nothing`).toBe(cam);
        }
        // Each city glows alone: the two lands share no tile.
        expect(lands['-2,5']!.filter((k) => lands[SECOND]!.includes(k))).toEqual([]);
        await deselect(page);
        await expect.poll(() => glowing(page)).toEqual([]);
      } finally {
        await close();
      }
    }, 180_000);
  }
});
