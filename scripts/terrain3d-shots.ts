// Screenshots of a match with the 3D terrain off and on, at a portrait and a landscape phone size.
// Run after `vite build`: npx tsx scripts/terrain3d-shots.ts <out dir>
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { createMatch, hashState } from '../src/engine';
import { frames, openApp } from '../src/browser/harness';
import { advance } from '../src/ui/board/BoardDemo';

/** Seed 7 after a dozen turns of fixed moves, with the whole map explored, saved as a pass-the-phone match. */
function exploredSave(): [string, string][] {
  const state = advance(createMatch({ seed: 7, factions: ['spartans', 'mongols'] }), 12);
  const all = Object.keys(state.tiles).sort();
  for (const p of state.players) p.explored = all;
  const base = newRecord('shots', { seed: 7, factions: ['spartans', 'mongols'] }, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state);
  return [...map.entries()];
}

const out = process.argv[2] ?? 'docs/superpowers/plans/2026-11-24-webgl-terrain-shots';
mkdirSync(out, { recursive: true });
const SIZES = [{ name: 'portrait', width: 412, height: 780 }, { name: 'landscape', width: 915, height: 412 }];

async function toggle(page: Awaited<ReturnType<typeof openApp>>['page']): Promise<void> {
  await page.getByTestId('open-menu').tap();
  await page.getByTestId('toggle-terrain3d').tap();
  await page.getByTestId('close-sheet').tap();
  await frames(page);
}

for (const s of SIZES) {
  const { page, close } = await openApp('?seed=7', { width: s.width, height: s.height, webgl: true });
  try {
    await page.getByTestId('new-match').tap();
    await page.getByTestId('start').tap();
    await page.getByTestId('ready').tap();
    await page.getByTestId('match').waitFor();
    await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
    await page.waitForTimeout(400);
    await frames(page);
    await page.screenshot({ path: join(out, `${s.name}-off.png`) });
    await toggle(page);
    await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
    await page.waitForTimeout(300);
    await frames(page);
    await page.screenshot({ path: join(out, `${s.name}-on.png`) });
    // Zoomed in, the units and borders must still sit on their tiles.
    const box = await page.getByTestId('board-slot').boundingBox();
    if (box !== null) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -120); await frames(page); }
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, `${s.name}-on-zoomed.png`) });
    await toggle(page);
    await page.locator('[data-testid="board-terrain"]').waitFor({ state: 'detached' });
    await frames(page);
    await page.screenshot({ path: join(out, `${s.name}-off-zoomed.png`) });
    console.log('wrote', s.name);
  } finally {
    await close();
  }
  // Later in a match: the whole map explored, most of it veiled, roads and buildings on it.
  const entries = exploredSave();
  const later = await openApp('', {
    width: s.width, height: s.height, webgl: true,
    beforeOpen: (c) => { void c.addInitScript((items: [string, string][]) => { for (const [k, v] of items) localStorage.setItem(k, v); }, entries); },
  });
  try {
    const { page } = later;
    await page.getByTestId('continue').tap();
    await page.getByTestId('ready').tap();
    await page.getByTestId('match').waitFor();
    await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, `${s.name}-later-off.png`) });
    await toggle(page);
    await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
    await page.waitForTimeout(300);
    await frames(page);
    await page.screenshot({ path: join(out, `${s.name}-later-on.png`) });
    await toggle(page); // leave the device as it was
    console.log('wrote', s.name, 'later');
  } finally {
    await later.close();
  }
}
