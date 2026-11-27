// GIFs of the treasure chests' twinkle (branch chestshine): two shut chests near the Spartan capital, one on open
// field and one in front of a forest's grove, in the 3D and the SVG looks, by day and at night, at the game's own
// zoom. Each GIF is a run of screenshots of the board round the chests at 20 fps: the 3D look on the page's held
// clock (its ambient loop runs on it), the SVG look at the real pace (its CSS animation keeps the browser's own time).
// Run after `vite build`:
//   npx tsx scripts/chestshine-shots.ts [what] [out dir]
// what: all (default), 3d, svg
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { createMatch, hashState } from '../src/engine';
import type { MatchSettings, MatchState, Tile } from '../src/engine';
import { frames, openApp } from '../src/browser/harness';

const what = process.argv[2] ?? 'all';
const out = process.argv[3] ?? 'docs/superpowers/plans/shots/chestshine';
mkdirSync(out, { recursive: true });
const PHONE = { w: 412, h: 915 };
const DPR = 2;
const FRAMES = Number(process.env.FRAMES ?? "64");
const ZOOM = Number(process.env.ZOOM ?? '0'); // wheel steps in from the game's starting zoom

const plain: Partial<Tile> = { harvested: false, road: false, village: false, treasure: false, resource: null, building: null };
const CHEST = '-3,3';
const DIORAMA: Record<string, Partial<Tile>> = {
  [CHEST]: { ...plain, terrain: 'field', treasure: true },
  '-1,2': { ...plain, terrain: 'forest', treasure: true },
  '-2,3': { ...plain, terrain: 'field', village: true },
  '-2,4': { ...plain, terrain: 'field' },
  '-1,3': { ...plain, terrain: 'field' },
};

function stateOf(settings: MatchSettings): MatchState {
  const state = createMatch(settings);
  for (const [k, t] of Object.entries(DIORAMA)) if (state.tiles[k]) state.tiles[k] = { ...state.tiles[k]!, ...t };
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
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  if (webgl) { await page.clock.install(); await page.reload(); }
  page.setDefaultTimeout(120_000);
  page.on('console', (m) => { if (m.type() === 'error') console.log('page:', m.text().slice(0, 400)); });
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

async function gif(settings: MatchSettings, file: string, webgl: boolean): Promise<void> {
  const app = await open(saveOf(settings, stateOf(settings), file), webgl);
  const tmp = mkdtempSync(join(tmpdir(), 'chestshine-'));
  try {
    const { page } = app;
    if (webgl) await on3d(page);
    if (ZOOM) await zoom(page, ZOOM);
    const at = { x: PHONE.w / 2, y: PHONE.h * 0.42 };
    await bring(page, CHEST, at.x, at.y);
    await page.waitForTimeout(700); // the motion eases back in after the pan
    if (process.env.FULL) await page.screenshot({ path: join(out, `${file}-full.png`) });
    // The board may not pan all the way: frame the chest where it ended up.
    const cb = (await page.locator(`[data-centre="${CHEST}"]`).boundingBox())!;
    const cx = cb.x + cb.width / 2, cy = cb.y + cb.height / 2;
    const clip = { x: Math.max(0, cx - 90), y: cy - 80, width: 200, height: 140 };
    const t0 = Date.now();
    const n = webgl ? 120 : FRAMES; // six seconds of the held clock in 3D
    if (webgl) await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    for (let i = 0; i < n; i++) {
      if (webgl) await page.clock.runFor(50);
      await page.screenshot({ path: join(tmp, `f${String(i).padStart(3, '0')}.png`), clip });
      if (!webgl) await page.waitForTimeout(40);
    }
    const fps = webgl ? 20 : n / ((Date.now() - t0) / 1000);
    const dest = join(out, `${file}.gif`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', fps.toFixed(2), '-i', join(tmp, 'f%03d.png'),
      '-vf', 'split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a', '-loop', '0', dest]);
    execFileSync('cp', [join(tmp, 'f000.png'), join(out, `${file}-first.png`)]);
    console.log('wrote', dest, `${fps.toFixed(1)} fps`, webgl ? await page.getByTestId('board-terrain').getAttribute('data-look') : 'svg');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    await app.close();
  }
}

const SETTINGS = (over: Partial<MatchSettings>): MatchSettings => ({ seed: 7, factions: ['spartans', 'mongols'], ...over });
if (what === 'all' || what === '3d') {
  await gif(SETTINGS({}), '3d-day', true);
  await gif(SETTINGS({ time: 'night' }), '3d-night', true);
}
if (what === 'all' || what === 'svg') {
  await gif(SETTINGS({}), 'svg-day', false);
  await gif(SETTINGS({ time: 'night' }), 'svg-night', false);
}
