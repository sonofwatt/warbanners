// Screenshots of the night lights (branch nightlights): a city's lit windows and their light on the ground, and the
// lanterns the units carry, at night, at dusk round 20 and at dawn round 15, in the 3D look and the SVG look, with
// units turned different ways round the Spartan capital (a Scout among them, who carries none). Run after `vite build`:
//   npx tsx scripts/nightlights-shots.ts [what] [out dir]
// what: all (default), 3d, svg, day, gif (frames of a unit walking and turning at night, for ffmpeg)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { createMatch, hashState } from '../src/engine';
import type { MatchSettings, MatchState, Tile, Unit, UnitTypeId } from '../src/engine';
import { cameraStill, deselect, frames, openApp, tapTile } from '../src/browser/harness';

const what = process.argv[2] ?? 'all';
const out = process.argv[3] ?? 'docs/superpowers/plans/shots/nightlights';
mkdirSync(out, { recursive: true });
const PHONE = { w: 412, h: 915 };
const DPR = 2.6;

const plain: Partial<Tile> = { harvested: false, road: false, village: false, treasure: false, resource: null, building: null };
// The Spartan capital (seed 7) and the open field round it.
const CAPITAL = '-2,5';
const FIELD = ['-2,4', '-1,4', '-1,3', '-3,5', '-3,6', '-2,6', '-1,5', '-3,4', '-2,3', '-4,5', '-4,6', '0,3', '0,4'];
// Units round the capital, and the moves that turn them different ways before the shot (from, to).
const FIGURES: { type: UnitTypeId; pos: string; hero?: boolean }[] = [
  { type: 'warrior', pos: '-2,4' },
  { type: 'horseman', pos: '-1,3' },
  { type: 'archer', pos: '-3,5' },
  { type: 'catapult', pos: '-1,5' },
  { type: 'scout', pos: '-3,4' },
  { type: 'spearman', pos: '-2,6' },
];
const MOVES: [string, string][] = [['-2,4', '-1,4'], ['-1,3', '-2,3'], ['-3,5', '-4,6'], ['-3,4', '-4,5'], ['-2,6', '-3,6']];

function stateOf(settings: MatchSettings, round: number): MatchState {
  const state = createMatch(settings);
  for (const k of FIELD) if (state.tiles[k]) state.tiles[k] = { ...state.tiles[k]!, ...plain, terrain: 'field' };
  state.stamp = 2 * (round - 1);
  const proto = state.units.find((u) => u.owner === 0)!;
  state.units = state.units.filter((u) => u.owner !== 0 || u.pos !== CAPITAL);
  for (const f of FIGURES) {
    state.units.push({ ...proto, id: state.nextUnitId++, type: f.type, owner: 0, pos: f.pos, hp: 10, hunkered: false, home: null, moved: false, acted: false } satisfies Unit);
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

async function open(entries: [string, string][], webgl: boolean, reduced = true, scale = DPR): Promise<App> {
  const app = await openApp('', {
    width: PHONE.w, height: PHONE.h, webgl, scale,
    beforeOpen: (c) => { void c.addInitScript((items: [string, string][]) => { if (!sessionStorage.getItem('seeded')) { for (const [k, v] of items) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, entries); },
  });
  const { page } = app;
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  page.setDefaultTimeout(120_000);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('page:', m.text().slice(0, 600)); });
  page.on('pageerror', (e) => console.log('page error:', e.message.slice(0, 600)));
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

async function move(page: Page, from: string, to: string): Promise<void> {
  await deselect(page);
  await tapTile(page, from);
  await page.waitForTimeout(250);
  await tapTile(page, to);
  await page.waitForTimeout(700);
  await cameraStill(page);
  const at = await page.locator('[data-unit]').evaluateAll((els) => els.map((e) => e.getAttribute('data-at')));
  if (!at.includes(to)) console.log(`move ${from} to ${to} did not happen; units at ${at.join(' ')}`);
  await deselect(page);
}

const SETTINGS = (over: Partial<MatchSettings>): MatchSettings => ({ seed: 7, factions: ['spartans', 'mongols'], ...over });
const AIM = { x: PHONE.w / 2, y: PHONE.h * 0.45 };

async function shot(settings: MatchSettings, round: number, file: string, webgl: boolean): Promise<void> {
  const app = await open(saveOf(settings, stateOf(settings, round), file), webgl);
  try {
    const { page } = app;
    if (webgl) await on3d(page);
    await zoom(page, 7);
    await bring(page, CAPITAL, AIM.x, AIM.y);
    for (const [a, b] of MOVES) await move(page, a, b);
    await bring(page, CAPITAL, AIM.x, AIM.y);
    await page.waitForTimeout(500);
    await frames(page);
    await page.screenshot({ path: join(out, `${file}.png`) });
    console.log('wrote', file, webgl ? await page.getByTestId('board-terrain').getAttribute('data-look') : 'svg', `round ${round}`);
  } finally {
    await app.close();
  }
}

// A unit walking and turning at night: the screen's frames, as the compositor makes them (a DevTools screencast, at
// DPR 1.5 so software WebGL keeps up), while the horseman rides one tile right, then one down and to the left. The
// frames go to <out>/walk; ffmpeg makes the GIF.
async function walk(): Promise<void> {
  const settings = SETTINGS({ time: 'night' });
  const app = await open(saveOf(settings, stateOf(settings, 1), 'walk'), true, false, 1.5);
  try {
    const { page } = app;
    await on3d(page);
    await zoom(page, 7);
    await bring(page, '-1,3', AIM.x, AIM.y);
    const dir = join(out, 'walk');
    mkdirSync(dir, { recursive: true });
    const cdp = await page.context().newCDPSession(page);
    let n = 0;
    cdp.on('Page.screencastFrame', (f: { data: string; sessionId: number }) => {
      writeFileSync(join(dir, `f${String(n++).padStart(4, '0')}.png`), Buffer.from(f.data, 'base64'));
      void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await page.waitForTimeout(500);
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: Math.round(PHONE.w * 1.5), maxHeight: Math.round(PHONE.h * 1.5) });
    const legs: [string, string][] = [['-1,3', '0,3'], ['0,3', '-1,4']];
    for (const [a, b] of legs) {
      await tapTile(page, a);
      await page.waitForTimeout(300);
      await tapTile(page, b);
      await page.waitForTimeout(1600);
      const at = await page.locator('[data-unit]').evaluateAll((els) => els.map((e) => e.getAttribute('data-at')));
      console.log(`leg ${a} to ${b}: ${at.includes(b) ? 'moved' : 'did not move'}, ${n} frames so far`);
      await deselect(page);
    }
    await cdp.send('Page.stopScreencast');
    console.log('wrote', n, 'frames to', dir);
  } finally {
    await app.close();
  }
}

if (what === 'night') await shot(SETTINGS({ time: 'night' }), 1, '3d-night', true);
if (what === 'all' || what === '3d') {
  await shot(SETTINGS({ time: 'night' }), 1, '3d-night', true);
  await shot(SETTINGS({ time: 'dusk' }), 20, '3d-dusk-round20', true);
  await shot(SETTINGS({ time: 'dawn' }), 15, '3d-dawn-round15', true);
}
if (what === 'day') await shot(SETTINGS({}), 1, '3d-day', true);
if (what === 'all' || what === 'svg') {
  await shot(SETTINGS({ time: 'night' }), 1, 'svg-night', false);
  await shot(SETTINGS({ time: 'dusk' }), 20, 'svg-dusk-round20', false);
  await shot(SETTINGS({ time: 'dawn' }), 15, 'svg-dawn-round15', false);
}
if (what === 'all' || what === 'gif') await walk();
