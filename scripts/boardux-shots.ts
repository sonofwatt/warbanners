// Shots of a selected city's land glow in both looks (branch boardux). Run against a build dir:
//   GITHUB_PAGES_BASE=/warbanners/ npx tsx scripts/boardux-shots.ts <build dir> <name> [out dir]
// Writes <out>/<name>.png, <name>-3d.png and a zoomed crop of each (<name>-zoom.png, <name>-3d-zoom.png).
import { mkdirSync } from 'node:fs';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { createMatch, hashState } from '../src/engine';
import { cameraStill, deselect, frames, openApp, tapTile } from '../src/browser/harness';

const outDir = process.argv[2];
const name = process.argv[3] ?? 'city-fade';
const out = process.argv[4] ?? 'docs/superpowers/plans/shots/boardux';
mkdirSync(out, { recursive: true });

function save(): [string, string][] {
  const state = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
  const p = state.players[0]!;
  p.explored = [...new Set([...p.explored, ...Object.keys(state.tiles).filter((k) => state.tiles[k]!.cityId !== null)])].sort();
  const base = newRecord('land', { seed: 7, factions: ['spartans', 'mongols'] }, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state);
  return [...map.entries()];
}

for (const look of ['svg', '3d'] as const) {
  const entries = save();
  const { page, close } = await openApp('', {
    width: 412, height: 915, webgl: look === '3d', ...(outDir !== undefined ? { outDir } : {}),
    beforeOpen: (c) => { void c.addInitScript((items: [string, string][]) => { for (const [k, v] of items) if (localStorage.getItem(k) === null) localStorage.setItem(k, v); }, entries); },
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
    await frames(page); await cameraStill(page);
    await deselect(page);
    for (let i = 0; i < 3 && (await page.locator('.selection .city-panel').count()) === 0; i += 1) {
      await tapTile(page, '-2,5'); await page.waitForTimeout(300); await cameraStill(page);
    }
    await page.locator('.selection .city-panel').waitFor();
    await page.waitForTimeout(800); await frames(page);
    await page.screenshot({ path: `${out}/${name}${look === "svg" ? "" : "-3d"}.png` });
    const b = await page.locator('[data-centre="-2,5"]').boundingBox();
    if (b !== null) {
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      await page.screenshot({ path: `${out}/${name}${look === "svg" ? "" : "-3d"}-zoom.png`, clip: { x: Math.max(0, cx - 110), y: Math.max(0, cy - 110), width: 220, height: 220 } });
    }
  } finally { await close(); }
}
