// Screenshots of the rules 8 tiles (jewels, fish, harvested resources and the new buildings) in the 3D look, with the
// SVG look beside them as the reference. Run after `vite build`: npx tsx scripts/rules8-3d-shots.ts <out dir>
//
// The match is seed 7 with the land around the first player's capital rewritten into a showcase, saved as a
// pass-the-phone match: one shot of the whole showcase in each look, then a close crop of every showcase tile.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { createMatch, hashState } from '../src/engine';
import type { HexKey, Tile } from '../src/engine';
import { frames, openApp } from '../src/browser/harness';

type Show = { name: string; tile: Partial<Tile> };
// Ring one and two round the capital, in the order the offsets below walk them.
const SHOW: Show[] = [
  { name: 'jewels', tile: { terrain: 'mountain', resource: 'jewels' } },
  { name: 'fish', tile: { terrain: 'water', resource: 'fish' } },
  { name: 'harvested-orchard', tile: { terrain: 'field', resource: 'orchard', harvested: true } },
  { name: 'granary', tile: { terrain: 'field', resource: 'cropland', building: 'granary' } },
  { name: 'lumber-mill', tile: { terrain: 'forest', building: 'lumberMill' } },
  { name: 'foundry', tile: { terrain: 'mountain', resource: 'ore', building: 'foundry' } },
  { name: 'jewels-harvested', tile: { terrain: 'mountain', resource: 'jewels', harvested: true } },
  { name: 'water', tile: { terrain: 'water' } },
  { name: 'fish-harvested', tile: { terrain: 'water', resource: 'fish', harvested: true } },
  { name: 'water-2', tile: { terrain: 'water' } },
  { name: 'orchard-building', tile: { terrain: 'field', resource: 'orchard', building: 'orchard' } },
  { name: 'plantation', tile: { terrain: 'field', resource: 'orchard', building: 'plantation' } },
  { name: 'harvested-cropland', tile: { terrain: 'field', resource: 'cropland', harvested: true } },
  { name: 'harvested-game', tile: { terrain: 'forest', resource: 'game', harvested: true } },
  { name: 'game', tile: { terrain: 'forest', resource: 'game' } },
  { name: 'harvested-ore', tile: { terrain: 'mountain', resource: 'ore', harvested: true } },
  { name: 'ore', tile: { terrain: 'mountain', resource: 'ore' } },
  { name: 'orchard', tile: { terrain: 'field', resource: 'orchard' } },
];
const RING1: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const RING2: [number, number][] = [[2, 0], [2, -1], [2, -2], [1, -2], [0, -2], [-1, -1], [-2, 0], [-2, 1], [-2, 2], [-1, 2], [0, 2], [1, 1]];

function showcase(): { entries: [string, string][]; keys: Map<string, HexKey> } {
  const state = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
  const cap = state.cities.find((c) => c.owner === state.current)!;
  const [cq, cr] = cap.pos.split(',').map(Number) as [number, number];
  const keys = new Map<string, HexKey>();
  [...RING1, ...RING2].forEach(([dq, dr], i) => {
    const show = SHOW[i];
    const k = `${cq + dq},${cr + dr}`;
    const t = state.tiles[k];
    if (show === undefined || t === undefined || t.cityId !== null && state.cities.some((c) => c.pos === k)) return;
    state.tiles[k] = { ...t, resource: null, building: null, harvested: false, road: false, village: false, treasure: false, ...show.tile };
    keys.set(show.name, k);
  });
  state.units = state.units.filter((u) => ![...keys.values()].includes(u.pos));
  const all = Object.keys(state.tiles).sort();
  for (const p of state.players) p.explored = all;
  const base = newRecord('rules8-3d', { seed: 7, factions: ['spartans', 'mongols'] }, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state);
  return { entries: [...map.entries()], keys };
}

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/rules8-3d';
mkdirSync(out, { recursive: true });
const { entries, keys } = showcase();

const app = await openApp('', {
  width: 915, height: 412, webgl: true,
  beforeOpen: (c) => { void c.addInitScript((items: [string, string][]) => { for (const [k, v] of items) localStorage.setItem(k, v); }, entries); },
});
try {
  const { page } = app;
  const toggle = async (): Promise<void> => {
    await page.getByTestId('open-menu').tap();
    await page.getByTestId('toggle-terrain3d').tap();
    await page.getByTestId('close-sheet').tap();
    await frames(page);
  };
  await page.getByTestId('continue').tap();
  await page.getByTestId('ready').tap();
  await page.getByTestId('match').waitFor();
  await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
  await page.keyboard.press('Escape');
  // Zoom in on the showcase: the middle of the board slot toward the capital.
  const centreOf = async (k: HexKey) => {
    const b = await page.locator(`[data-centre="${k}"]`).boundingBox();
    return b === null ? null : { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const mid = await centreOf(keys.get('jewels')!);
  if (mid !== null) {
    await page.mouse.move(mid.x, mid.y);
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -120); await frames(page); }
  }
  await page.waitForTimeout(400);
  const shoot = async (look: string): Promise<void> => {
    await frames(page);
    await page.screenshot({ path: join(out, `showcase-${look}.png`) });
    const a = await centreOf(keys.get('jewels')!), b = await centreOf(keys.get('fish')!);
    const step = a !== null && b !== null ? Math.hypot(a.x - b.x, a.y - b.y) : 60;
    for (const [name, k] of keys) {
      if (name.startsWith('water')) continue;
      const c = await centreOf(k);
      if (c === null) continue;
      const w = step * 1.5, h = step * 1.6;
      await page.screenshot({ path: join(out, `${name}-${look}.png`), clip: { x: c.x - w / 2, y: c.y - h * 0.62, width: w, height: h } });
    }
  };
  await shoot('svg');
  await toggle();
  await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
  await page.waitForTimeout(600);
  await shoot('3d');
  await toggle(); // leave the device as it was
  console.log('wrote', out);
} finally {
  await app.close();
}
