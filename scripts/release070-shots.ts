// Integration shots for the 0.7.0 release (steadycam + warbanner + cities3d), 412 x 915, in the svg and the 3D look.
// Run after `GITHUB_PAGES_BASE=/warbanners/ npx vite build`:
//   GITHUB_PAGES_BASE=/warbanners/ npx tsx scripts/release070-shots.ts [out dir]
// For each look: the mid-game board with nothing selected (the bottom bar), a unit selected (the collapsed card),
// a city selected (its land glow and the card's badges), and a close crop of the bottom bar.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { createMatch, hashState } from '../src/engine';
import type { MatchState } from '../src/engine';
import { cameraStill, deselect, frames, openApp, tapTile } from '../src/browser/harness';
import { advance } from '../src/ui/board/BoardDemo';

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/release070';
mkdirSync(out, { recursive: true });

function saveOf(state: MatchState): [string, string][] {
  const base = newRecord('release070', { seed: 7, factions: ['spartans', 'mongols'] }, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state);
  return [...map.entries()];
}

const state = advance(createMatch({ seed: 7, factions: ['spartans', 'mongols'] }), 12);
const me = state.current;
const cities = state.cities.filter((c) => c.owner === me).sort((a, b) => b.level - a.level);
const city = cities.find((c) => !c.capital) ?? cities[0]!;
const unit = state.units.find((u) => u.owner === me && state.tiles[u.pos]!.cityId === null) ?? state.units.find((u) => u.owner === me)!;
console.log('player', me, 'city', city.pos, 'level', city.level, 'unit', unit.type, unit.pos);

for (const look of ['svg', '3d'] as const) {
  const app = await openApp('', {
    width: 412, height: 915, webgl: look === '3d',
    beforeOpen: (c) => { void c.addInitScript((items: [string, string][]) => { for (const [k, v] of items) localStorage.setItem(k, v); }, saveOf(state)); },
  });
  const { page } = app;
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    page.setDefaultTimeout(120_000);
    await page.getByTestId('continue').tap();
    await page.getByTestId('ready').tap();
    await page.getByTestId('match').waitFor();
    await page.locator('[data-unit]').first().waitFor({ state: 'attached' });
    if (look === '3d') {
      await page.getByTestId('open-menu').tap();
      await page.getByTestId('toggle-terrain3d').tap();
      await page.getByTestId('close-sheet').tap();
      await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
      await page.waitForTimeout(800);
    }
    const shot = async (name: string, p: Page = page): Promise<void> => {
      await cameraStill(p);
      await frames(p);
      await p.screenshot({ path: join(out, `${name}-${look}-412x915.png`) });
      console.log('wrote', name, look);
    };
    await shot('board');
    const bar = await page.getByTestId('action-bar').boundingBox();
    if (bar !== null) await page.screenshot({ path: join(out, `bar-${look}-412x915.png`), clip: { x: 0, y: Math.max(0, bar.y - 60), width: 412, height: bar.height + 60 } });

    await tapTile(page, unit.pos);
    await page.locator('.selection .unit-panel').waitFor();
    await shot('unit-selected');

    await deselect(page);
    for (let i = 0; i < 3 && (await page.locator('.selection .city-panel').count()) === 0; i += 1) {
      await tapTile(page, city.pos);
      await page.waitForTimeout(200);
    }
    await page.locator('.selection .city-panel').waitFor();
    await shot('city-selected');
  } finally {
    await app.close();
  }
}
