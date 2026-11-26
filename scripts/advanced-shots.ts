// Screenshots of the Advanced match options (branch advanced). Run after `vite build`:
//   npx tsx scripts/advanced-shots.ts <what> [out dir]
// what: setup (the new match screen with Advanced open), times (3D at Day, Dawn, Dusk, Night), weather (3D Cloudy,
//       Rain, Snow, stills), gifs (3D Rain and Snow GIFs at real pace, 20 fps on the page's held clock),
//       svg (the SVG look at Night, and Rain and Snow), chests (a Many-chests map, whole, in SVG and 3D).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { createMatch, hashState } from '../src/engine';
import type { MatchSettings, MatchState, Tile } from '../src/engine';
import { frames, openApp } from '../src/browser/harness';

const what = process.argv[2] ?? 'setup';
const out = process.argv[3] ?? 'docs/superpowers/plans/shots/advanced';
mkdirSync(out, { recursive: true });
const PHONE = { w: 412, h: 915 };
const DPR = 2.6;

const plain: Partial<Tile> = { harvested: false, road: false, village: false, treasure: false };
// Round the Spartan capital (-2,5): a mine with its lantern, a foundry's furnace, a lumber camp's smoke, a farm.
const DIORAMA: Record<string, Partial<Tile>> = {
  '-1,4': { ...plain, terrain: 'mountain', resource: 'ore', building: 'mine' },
  '-3,4': { ...plain, terrain: 'mountain', resource: 'ore', building: 'foundry' },
  '-3,5': { ...plain, terrain: 'forest', resource: 'game', building: 'lumberCamp' },
  '-2,4': { ...plain, terrain: 'field', resource: 'cropland', building: 'farm' },
  '-1,5': { ...plain, terrain: 'forest', resource: null, building: null },
};

function stateOf(settings: MatchSettings, diorama: boolean): MatchState {
  const state = createMatch(settings);
  if (diorama) {
    for (const [k, t] of Object.entries(DIORAMA)) if (state.tiles[k]) state.tiles[k] = { ...state.tiles[k]!, ...t };
    state.cities[0]!.level = 4;
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

async function open(entries: [string, string][], motion = false, webgl = true): Promise<App> {
  const app = await openApp('', {
    width: PHONE.w, height: PHONE.h, webgl, scale: DPR,
    beforeOpen: (c) => { void c.addInitScript((items: [string, string][]) => { if (!sessionStorage.getItem('seeded')) { for (const [k, v] of items) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, entries); },
  });
  const { page } = app;
  if (!motion) await page.emulateMedia({ reducedMotion: 'reduce' });
  else { await page.clock.install(); await page.reload(); }
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

async function boardShot(settings: MatchSettings, file: string, opts: { webgl?: boolean; zoomSteps?: number; diorama?: boolean; at?: string } = {}): Promise<void> {
  const webgl = opts.webgl ?? true;
  const app = await open(saveOf(settings, stateOf(settings, opts.diorama ?? true), file), false, webgl);
  try {
    const { page } = app;
    if (webgl) await on3d(page);
    if (opts.zoomSteps) await zoom(page, opts.zoomSteps);
    await bring(page, opts.at ?? '-2,4', PHONE.w / 2, PHONE.h * 0.45);
    await page.waitForTimeout(400);
    await frames(page);
    await page.screenshot({ path: join(out, `${file}.png`) });
    if (webgl) console.log(file, await page.getByTestId('board-terrain').getAttribute('data-look'));
    console.log('wrote', file);
  } finally {
    await app.close();
  }
}

if (what === 'setup') {
  const app = await openApp('', { width: PHONE.w, height: PHONE.h, scale: DPR });
  try {
    const { page } = app;
    await page.getByTestId('new-match').tap();
    await page.screenshot({ path: join(out, 'setup-closed.png') });
    await page.getByTestId('advanced-toggle').tap();
    for (const id of ['chests-many', 'weather-random', 'time-night']) await page.getByTestId(id).tap();
    await page.screenshot({ path: join(out, 'setup-advanced-open.png') });
    const scroll = await page.evaluate(() => { const s = document.querySelector('.screen.setup')!; return { scroll: s.scrollHeight, client: s.clientHeight, width: document.documentElement.scrollWidth }; });
    console.log('setup sizes', scroll);
    await page.locator('.screen.setup').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.screenshot({ path: join(out, 'setup-advanced-open-scrolled.png') });
  } finally {
    await app.close();
  }
}

if (what === 'times') {
  for (const time of ['day', 'dawn', 'dusk', 'night'] as const) await boardShot(SETTINGS(time === 'day' ? {} : { time }), `3d-${time}`, { zoomSteps: 2 });
}

if (what === 'weather') {
  for (const weather of ['cloudy', 'rain', 'snow'] as const) await boardShot(SETTINGS({ weather }), `3d-${weather}`, { zoomSteps: 2 });
  await boardShot(SETTINGS({ weather: 'snow', time: 'night' }), '3d-snow-night', { zoomSteps: 2 });
  await boardShot(SETTINGS({ weather: 'rain', time: 'dusk' }), '3d-rain-dusk', { zoomSteps: 2 });
}

if (what === 'cloudy') await boardShot(SETTINGS({ weather: 'cloudy' }), '3d-cloudy', { zoomSteps: 2 });

if (what === 'svg') {
  await boardShot(SETTINGS({}), 'svg-day', { webgl: false, zoomSteps: 2 });
  await boardShot(SETTINGS({ time: 'night' }), 'svg-night', { webgl: false, zoomSteps: 2 });
  await boardShot(SETTINGS({ time: 'night', weather: 'rain' }), 'svg-night-rain', { webgl: false, zoomSteps: 2 });
  await boardShot(SETTINGS({ weather: 'snow' }), 'svg-snow', { webgl: false, zoomSteps: 2 });
  await boardShot(SETTINGS({ time: 'dusk' }), 'svg-dusk', { webgl: false, zoomSteps: 2 });
}

if (what === 'chests') {
  for (const [chests, file] of [['many', 'chests-many'], ['normal', 'chests-normal'], ['few', 'chests-few']] as const) {
    const s = SETTINGS(chests === 'normal' ? {} : { chests });
    await boardShot(s, `${file}-svg`, { webgl: false, zoomSteps: -6, diorama: false, at: '0,0' });
  }
  await boardShot(SETTINGS({ chests: 'many' }), 'chests-many-3d', { zoomSteps: -6, diorama: false, at: '0,0' });
}

if (what === 'gifs') {
  for (const weather of ['rain', 'snow'] as const) {
    const s = SETTINGS({ weather });
    const app = await open(saveOf(s, stateOf(s, true), `gif-${weather}`), true);
    try {
      const { page } = app;
      await on3d(page);
      await zoom(page, 3);
      await bring(page, '-2,4', PHONE.w / 2, PHONE.h * 0.45);
      const box = { x: 16, y: PHONE.h * 0.45 - 190, w: PHONE.w - 32, h: 380 };
      await page.mouse.move(5, PHONE.h - 5);
      await page.mouse.move(8, PHONE.h - 8);
      const tmp = mkdtempSync(join(tmpdir(), `${weather}-`));
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
      const n = 60; // three seconds at 20 fps
      for (let i = 0; i < n; i++) {
        await page.clock.runFor(50);
        await page.screenshot({ path: join(tmp, `f${String(i).padStart(4, '0')}.png`) });
      }
      const gif = join(out, `3d-${weather}.gif`);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '20', '-i', join(tmp, 'f%04d.png'),
        '-vf', `crop=${Math.round(box.w * DPR)}:${Math.round(box.h * DPR)}:${Math.round(box.x * DPR)}:${Math.round(box.y * DPR)},scale=420:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer`, gif]);
      console.log('wrote', gif);
    } finally {
      await app.close();
    }
  }
}
