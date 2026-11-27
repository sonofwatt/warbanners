// Screenshots of the village (branch village): the tile card of a selected village and of a treasure chest, the 3D
// village close up with its bonfire by day, at dawn round 15, at dusk round 20 and at night, and the SVG village by
// day and at night. Run after `vite build`:
//   npx tsx scripts/village-shots.ts [what] [out dir]
// what: all (default), card, 3d, svg
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { createMatch, hashState } from '../src/engine';
import type { MatchSettings, MatchState, Tile, Unit, UnitTypeId } from '../src/engine';
import { frames, openApp, tapTile } from '../src/browser/harness';

const what = process.argv[2] ?? 'all';
const out = process.argv[3] ?? 'docs/superpowers/plans/shots/village';
mkdirSync(out, { recursive: true });
const PHONE = { w: 412, h: 915 };
const DPR = 2.6;

const plain: Partial<Tile> = { harvested: false, road: false, village: false, treasure: false, resource: null, building: null };
// Near the Spartan capital (-2,5): a village on open field, a treasure chest beside it, a forest behind.
const VILLAGE = '-2,3';
const CHEST = '-3,3';
const DIORAMA: Record<string, Partial<Tile>> = {
  [VILLAGE]: { ...plain, terrain: 'field', village: true },
  [CHEST]: { ...plain, terrain: 'field', treasure: true },
  '-1,3': { ...plain, terrain: 'field' },
  '-2,4': { ...plain, terrain: 'field' },
  '-1,2': { ...plain, terrain: 'forest' },
  '-2,2': { ...plain, terrain: 'field' },
};
// Two figures beside the village, to show the fire's light on their sides.
const FIGURES: { type: UnitTypeId; owner: 0 | 1; pos: string }[] = [
  { type: 'warrior', owner: 0, pos: '-2,4' },
  { type: 'archer', owner: 1, pos: '-1,3' },
];

function stateOf(settings: MatchSettings, round: number, units: boolean): MatchState {
  const state = createMatch(settings);
  for (const [k, t] of Object.entries(DIORAMA)) if (state.tiles[k]) state.tiles[k] = { ...state.tiles[k]!, ...t };
  // The round both players share is stamp / 2 + 1 (app/record.ts roundOf); an even stamp keeps the first player to move.
  state.stamp = 2 * (round - 1);
  if (units) {
    const proto = state.units[0]!;
    for (const f of FIGURES) {
      state.units.push({ ...proto, id: state.nextUnitId++, type: f.type, owner: f.owner, pos: f.pos, hunkered: false, home: null, moved: false, acted: false } satisfies Unit);
    }
  }
  const all = Object.keys(state.tiles).sort();
  for (const p of state.players) p.explored = all;
  return state;
}

function saveOf(settings: MatchSettings, state: MatchState, id: string): [string, string][] {
  const base = newRecord(id, settings, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state);
  return [...map.entries()];
}

type App = Awaited<ReturnType<typeof openApp>>;
type Page = App['page'];

async function open(entries: [string, string][], webgl: boolean): Promise<App> {
  const app = await openApp('', {
    width: PHONE.w, height: PHONE.h, webgl, scale: DPR,
    beforeOpen: (c) => { void c.addInitScript((items: [string, string][]) => { if (!sessionStorage.getItem('seeded')) { for (const [k, v] of items) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, entries); },
  });
  const { page } = app;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  page.setDefaultTimeout(120_000);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('page:', m.text().slice(0, 400)); });
  await page.getByTestId('continue').tap();
  await page.getByTestId('ready').tap();
  await page.getByTestId('match').waitFor();
  await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
  await page.keyboard.press('Escape');
  return app;
}

async function on3d(page: Page): Promise<void> {
  await page.getByTestId('open-menu').tap();
  await page.getByTestId('toggle-terrain3d').tap();
  await page.getByTestId('close-sheet').tap();
  await frames(page);
  await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
  await page.waitForTimeout(900);
  await frames(page);
}

async function zoom(page: Page, steps: number): Promise<void> {
  const box = await page.getByTestId('board-slot').boundingBox();
  if (box === null) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < Math.abs(steps); i++) { await page.mouse.wheel(0, steps > 0 ? -120 : 120); await frames(page); }
  await page.waitForTimeout(300);
}

async function bring(page: Page, k: string, x: number, y: number): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const b = await page.locator(`[data-centre="${k}"]`).boundingBox();
    if (b === null) return;
    const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    if (Math.hypot(c.x - x, c.y - y) < 3) return;
    const sx = Math.min(Math.max(c.x, 40), x * 2 - 40), sy = Math.min(Math.max(c.y, 140), y * 2 - 40);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + (x - c.x) / 2, sy + (y - c.y) / 2, { steps: 4 });
    await page.mouse.move(sx + (x - c.x), sy + (y - c.y), { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    await frames(page);
  }
}

const SETTINGS = (over: Partial<MatchSettings>): MatchSettings => ({ seed: 7, factions: ['spartans', 'mongols'], ...over });

async function shot(settings: MatchSettings, round: number, file: string, opts: { webgl?: boolean; zoomSteps?: number; select?: string } = {}): Promise<void> {
  const webgl = opts.webgl ?? true;
  const app = await open(saveOf(settings, stateOf(settings, round, opts.select === undefined), file), webgl);
  try {
    const { page } = app;
    if (webgl) await on3d(page);
    if (opts.zoomSteps) await zoom(page, opts.zoomSteps);
    await bring(page, opts.select ?? VILLAGE, PHONE.w / 2, PHONE.h * 0.42);
    if (opts.select !== undefined) {
      await tapTile(page, opts.select);
      await page.getByTestId('selection').waitFor();
      await page.waitForTimeout(500);
      console.log(file, 'card:', (await page.locator('.tile-panel').innerText()).replace(/\s+/g, ' '));
    }
    await page.waitForTimeout(400);
    await frames(page);
    await page.screenshot({ path: join(out, `${file}.png`) });
    console.log('wrote', file, webgl ? await page.getByTestId('board-terrain').getAttribute('data-look') : 'svg', `round ${round}`);
  } finally {
    await app.close();
  }
}

if (what === 'all' || what === 'card') {
  await shot(SETTINGS({}), 1, 'card-village', { zoomSteps: 2, select: VILLAGE });
  await shot(SETTINGS({}), 1, 'card-chest', { zoomSteps: 2, select: CHEST });
}
if (what === 'all' || what === '3d') {
  await shot(SETTINGS({}), 1, '3d-day', { zoomSteps: 8 });
  await shot(SETTINGS({ time: 'dawn' }), 15, '3d-dawn-round15', { zoomSteps: 8 });
  await shot(SETTINGS({ time: 'dusk' }), 20, '3d-dusk-round20', { zoomSteps: 8 });
  await shot(SETTINGS({ time: 'night' }), 1, '3d-night', { zoomSteps: 8 });
}
if (what === 'all' || what === 'svg') {
  await shot(SETTINGS({}), 1, 'svg-day', { webgl: false, zoomSteps: 8 });
  await shot(SETTINGS({ time: 'night' }), 1, 'svg-night', { webgl: false, zoomSteps: 8 });
}
