// Screenshots of the time of day's light (branch advanced): dawn and dusk changing over the match, the figures' cast
// shadows by day and night (a hunkered hoplite, a mounted knight and horse archer), mist and smoke at night, and the
// SVG board at dawn. Run after `vite build`:
//   npx tsx scripts/light3d-shots.ts [what] [out dir]
// what: all (default), rounds, units, smoke, svg
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { createMatch, hashState } from '../src/engine';
import type { MatchSettings, MatchState, Tile, Unit, UnitTypeId } from '../src/engine';
import { frames, openApp } from '../src/browser/harness';

const what = process.argv[2] ?? 'all';
const out = process.argv[3] ?? 'docs/superpowers/plans/shots/advanced/light';
mkdirSync(out, { recursive: true });
const PHONE = { w: 412, h: 915 };
const DPR = 2.6;

const plain: Partial<Tile> = { harvested: false, road: false, village: false, treasure: false };
// Round the Spartan capital (-2,5): a mine, a foundry, a lumber camp's smoke, a farm, open fields for the figures.
const DIORAMA: Record<string, Partial<Tile>> = {
  '-1,4': { ...plain, terrain: 'mountain', resource: 'ore', building: 'mine' },
  '-3,4': { ...plain, terrain: 'mountain', resource: 'ore', building: 'foundry' },
  '-3,5': { ...plain, terrain: 'forest', resource: 'game', building: 'lumberCamp' },
  '-2,4': { ...plain, terrain: 'field', resource: null, building: null },
  '-1,3': { ...plain, terrain: 'field', resource: null, building: null },
  '-2,3': { ...plain, terrain: 'field', resource: null, building: null },
  '-3,3': { ...plain, terrain: 'field', resource: null, building: null },
  '-1,5': { ...plain, terrain: 'field', resource: null, building: null },
};
// The figures: a knight (mounted), a hunkered hoplite, an archer, and a Mongol horse archer (mounted) facing them.
const FIGURES: { type: UnitTypeId; owner: 0 | 1; pos: string; hunkered?: boolean }[] = [
  { type: 'knight', owner: 0, pos: '-2,4' },
  { type: 'hoplite', owner: 0, pos: '-1,5', hunkered: true },
  { type: 'archer', owner: 0, pos: '-3,3' },
  { type: 'horseArcher', owner: 1, pos: '-1,3' },
  { type: 'swordsman', owner: 1, pos: '-2,3' },
];

function stateOf(settings: MatchSettings, round: number, units: boolean): MatchState {
  const state = createMatch(settings);
  for (const [k, t] of Object.entries(DIORAMA)) if (state.tiles[k]) state.tiles[k] = { ...state.tiles[k]!, ...t };
  state.cities[0]!.level = 4;
  // The round both players share is stamp / 2 + 1 (app/record.ts roundOf); an even stamp keeps the first player to move.
  state.stamp = 2 * (round - 1);
  if (units) {
    const proto = state.units[0]!;
    for (const f of FIGURES) {
      const u: Unit = { ...proto, id: state.nextUnitId++, type: f.type, owner: f.owner, pos: f.pos, hunkered: f.hunkered === true, home: null, moved: false, acted: false };
      state.units.push(u);
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

async function boardShot(settings: MatchSettings, round: number, file: string, opts: { webgl?: boolean; zoomSteps?: number; at?: string; units?: boolean } = {}): Promise<void> {
  const webgl = opts.webgl ?? true;
  const app = await open(saveOf(settings, stateOf(settings, round, opts.units ?? true), file), webgl);
  try {
    const { page } = app;
    if (webgl) await on3d(page);
    if (opts.zoomSteps) await zoom(page, opts.zoomSteps);
    await bring(page, opts.at ?? '-2,4', PHONE.w / 2, PHONE.h * 0.45);
    await page.waitForTimeout(400);
    await frames(page);
    await page.screenshot({ path: join(out, `${file}.png`) });
    console.log('wrote', file, webgl ? await page.getByTestId('board-terrain').getAttribute('data-look') : 'svg', `round ${round}`);
  } finally {
    await app.close();
  }
}

if (what === 'all' || what === 'rounds') {
  for (const time of ['dawn', 'dusk'] as const) {
    for (const round of [1, 15, 30]) await boardShot(SETTINGS({ time }), round, `3d-${time}-round${round}`, { zoomSteps: 2 });
  }
}
if (what === 'all' || what === 'units') {
  await boardShot(SETTINGS({}), 1, '3d-day-units', { zoomSteps: 4 });
  await boardShot(SETTINGS({ time: 'night' }), 1, '3d-night-units', { zoomSteps: 4 });
  await boardShot(SETTINGS({ time: 'dawn' }), 8, '3d-dawn-round8-units', { zoomSteps: 4 });
  await boardShot(SETTINGS({ time: 'dusk' }), 22, '3d-dusk-round22-units', { zoomSteps: 4 });
}
if (what === 'all' || what === 'smoke') {
  await boardShot(SETTINGS({ time: 'night' }), 1, '3d-night-smoke', { zoomSteps: 4, at: '-3,4', units: false });
  await boardShot(SETTINGS({}), 1, '3d-day-smoke', { zoomSteps: 4, at: '-3,4', units: false });
}
if (what === 'all' || what === 'svg') {
  await boardShot(SETTINGS({ time: 'dawn' }), 15, 'svg-dawn-round15', { webgl: false, zoomSteps: 2 });
}
