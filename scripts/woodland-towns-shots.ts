// rules 11: screenshots of the Woodland Nations' 3D cities by level and their tile buildings, made from
// scripts/cities3d-shots.ts with the first player on the Woodland Nations. Run after `vite build`:
//   npx tsx scripts/woodland-towns-shots.ts sheet [out dir] [build dir]
// what: sheet (every city level, both factions, capitals, walls, villages; close crops composed into sheets),
//       mine (the mine and foundry close up, and frames of the lantern's flicker for a GIF),
//       board (a real board at the phone's default zoom, 412 x 915, in the 3D look),
//       border (a territory border passing behind a mountain, 412 x 915).
// The build dir lets the same shots be taken of another build (main, for the before shots).
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { createMatch, hashState } from '../src/engine';
import type { City, HexKey, MatchState, Tile } from '../src/engine';
import { frames, openApp } from '../src/browser/harness';
import { advance } from '../src/ui/board/BoardDemo';

const what = process.argv[2] ?? 'sheet';
const out = process.argv[3] ?? 'docs/superpowers/plans/shots/woodland-towns';
const outDir = process.argv[4];
mkdirSync(out, { recursive: true });

function saveOf(state: MatchState, name: string): [string, string][] {
  const all = Object.keys(state.tiles).sort();
  for (const p of state.players) p.explored = all;
  const base = newRecord(name, { seed: 7, factions: ['woodland', 'mongols'] }, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state);
  return [...map.entries()];
}

const hexLen = ([q, r]: [number, number]): number => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
type Spot = { name: string; tile: Partial<Tile>; city?: Partial<City> };

/** A board with the given showcase on tiles two apart, everything else cleared round them. */
function showcase(spots: Spot[], opts: { borders?: boolean; clearAround?: boolean } = {}): { entries: [string, string][]; keys: Map<string, HexKey> } {
  const state = createMatch({ seed: 7, factions: ['woodland', 'mongols'] });
  const taken = new Set([...state.cities.map((c) => c.pos), ...state.units.map((u) => u.pos)]);
  const near = (k: HexKey): boolean => [...taken].some((t) => {
    const [a, b] = k.split(',').map(Number) as [number, number];
    const [c, d] = t.split(',').map(Number) as [number, number];
    return (Math.abs(a - c) + Math.abs(b - d) + Math.abs(a + b - c - d)) / 2 <= 1;
  });
  const free = Object.keys(state.tiles)
    .map((k) => k.split(',').map(Number) as [number, number])
    .filter(([q, r]) => q % 2 === 0 && r % 2 === 0)
    // Nearest the middle of the map first, so the showcase stays together; then by rows.
    .sort((a, b) => hexLen(a) - hexLen(b) || a[1] - b[1] || a[0] - b[0])
    .map(([q, r]) => `${q},${r}`)
    .filter((k) => !near(k));
  // The first player sees the whole showcase (no veil): its capital's sight reaches over the map.
  state.cities.find((c) => c.owner === 0)!.radius = 30;
  const keys = new Map<string, HexKey>();
  let id = Math.max(...state.cities.map((c) => c.id)) + 1;
  if (opts.borders !== true) for (const t of Object.values(state.tiles)) t.cityId = null;
  const woodLand: HexKey[] = [];
  spots.forEach((s, i) => {
    const k = free[i];
    if (k === undefined) throw new Error(`no room for ${s.name}`);
    const t = state.tiles[k]!;
    state.tiles[k] = { ...t, resource: null, building: null, harvested: false, road: false, village: false, treasure: false, cityId: null, ...s.tile };
    if (s.city !== undefined) {
      const c: City = {
        id: id++, pos: k, owner: 0, capital: false, level: 1, growth: 0, radius: 1, walls: false, market: false,
        incomeBonus: 0, capacityBonus: 0, pendingRewards: [], linked: true, ...s.city,
      };
      state.cities.push(c);
      state.tiles[k]!.cityId = c.id;
    }
    keys.set(s.name, k);
    if (s.name.startsWith('build-')) woodLand.push(k);
    if (opts.clearAround === true) {
      // Plain fields round it, so nothing in front hides the close-up.
      const [q, r] = k.split(',').map(Number) as [number, number];
      for (const [dq, dr] of [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]] as const) {
        const nk = `${q + dq},${r + dr}`;
        const nt = state.tiles[nk];
        if (nt !== undefined && !taken.has(nk)) state.tiles[nk] = { ...nt, terrain: 'field', resource: null, building: null, village: false, treasure: false, road: false };
      }
    }
  });
  // The buildings stand on the first Woodland city's land, so they take the Woodland look.
  const home = state.cities.find((c) => c.owner === 0)!;
  for (const k of woodLand) state.tiles[k]!.cityId = home.id;
  return { entries: saveOf(state, 'woodland-towns'), keys };
}

async function open(entries: [string, string][], width: number, height: number, scale?: number) {
  const app = await openApp('', {
    width, height, webgl: true, ...(outDir !== undefined ? { outDir } : {}), ...(scale !== undefined ? { scale } : {}),
    beforeOpen: (c) => { void c.addInitScript((items: [string, string][]) => { for (const [k, v] of items) localStorage.setItem(k, v); }, entries); },
  });
  const { page } = app;
  // Stills are taken with reduced motion, so the board is not redrawing 20 times a second under SwiftShader while the
  // screenshot waits for a frame; the flicker frames turn motion back on.
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
type Page = Awaited<ReturnType<typeof openApp>>['page'];
async function toggle(page: Page): Promise<void> {
  await page.getByTestId('open-menu').tap();
  await page.getByTestId('toggle-terrain3d').tap();
  await page.getByTestId('close-sheet').tap();
  await frames(page);
}
async function on3d(page: Page): Promise<void> {
  await toggle(page);
  await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
  await page.waitForTimeout(800);
  await frames(page);
}
async function centreOf(page: Page, k: HexKey): Promise<{ x: number; y: number } | null> {
  const b = await page.locator(`[data-centre="${k}"]`).boundingBox();
  return b === null ? null : { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
/** Drag the board so tile k sits at (x, y) on screen. */
async function bring(page: Page, k: HexKey, x: number, y: number): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const c = await centreOf(page, k);
    if (c === null) return;
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
async function zoom(page: Page, steps: number): Promise<void> {
  const box = await page.getByTestId('board-slot').boundingBox();
  if (box === null) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < Math.abs(steps); i++) { await page.mouse.wheel(0, steps > 0 ? -120 : 120); await frames(page); }
  await page.waitForTimeout(300);
}

/** Lay crops out on a labelled sheet, drawn by the browser itself. */
async function sheet(page: Page, file: string, title: string, rows: { label: string; cells: { label: string; png: string }[] }[]): Promise<void> {
  const img = (p: string): string => `data:image/png;base64,${readFileSync(p).toString('base64')}`;
  const html = `<html><body style="margin:0;background:#2b3a48;font:600 15px system-ui;color:#f3ead6;padding:14px">
<div style="font-size:20px;margin:0 0 10px 4px">${title}</div>
${rows.map((r) => `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px">
<div style="width:110px;padding-top:8px">${r.label}</div>
${r.cells.map((c) => `<figure style="margin:0;text-align:center"><img src="${img(c.png)}" style="width:190px;display:block;border-radius:6px"><figcaption style="margin-top:3px">${c.label}</figcaption></figure>`).join('')}
</div>`).join('')}</body></html>`;
  const sheetPage = await page.context().newPage();
  await sheetPage.setViewportSize({ width: 140 + 198 * Math.max(...rows.map((r) => r.cells.length)) + 20, height: 400 });
  await sheetPage.setContent(html);
  await sheetPage.screenshot({ path: file, fullPage: true });
  await sheetPage.close();
}

if (what === 'sheet') {
  const levels = [1, 2, 3, 4, 5, 6];
  const spots: Spot[] = [];
  for (const walls of [false, true]) for (const level of levels) spots.push({ name: `w-l${level}${walls ? '-walls' : ''}`, tile: { terrain: 'field' }, city: { owner: 0, level, walls } });
  spots.push({ name: 'w-capital', tile: { terrain: 'field' }, city: { owner: 0, level: 3, capital: true } });
  const builds = [['farm', 'field', 'cropland'], ['granary', 'field', 'cropland'], ['orchard', 'field', 'orchard'], ['plantation', 'field', 'orchard'],
    ['lumberCamp', 'forest', null], ['lumberMill', 'forest', null], ['market', 'field', null]] as const;
  for (const [b, terrain, resource] of builds) spots.push({ name: `build-${b}`, tile: { terrain, building: b, resource } });
  const { entries, keys } = showcase(spots);
  const W = 1900, H = 1800;
  const app = await open(entries, W, H, 2);
  try {
    const { page } = app;
    await on3d(page);
    await zoom(page, 3);
    const files = new Map<string, string>();
    for (const [name, k] of keys) {
      const c = await centreOf(page, k);
      if (c === null) continue;
      const step = 150;
      const file = join(out, `crop-${name}.png`);
      await page.screenshot({ path: file, clip: { x: c.x - step * 0.75, y: c.y - step * 1.0, width: step * 1.5, height: step * 1.5 } });
      files.set(name, file);
    }
    const cell = (label: string, n: string) => ({ label, png: files.get(n)! });
    await sheet(page, join(out, 'sheet-woodland-3d.png'), 'Woodland Nations, 3D look', [
      { label: 'Cities', cells: levels.map((l) => cell(`level ${l}`, `w-l${l}`)) },
      { label: 'With walls', cells: [...levels.slice(0, 3).map((l) => cell(`level ${l}`, `w-l${l}-walls`)), cell('capital (3)', 'w-capital')] },
      { label: 'Buildings', cells: builds.slice(0, 4).map(([b]) => cell(b, `build-${b}`)) },
      { label: '', cells: builds.slice(4).map(([b]) => cell(b, `build-${b}`)) },
    ]);
    console.log('wrote sheet');
  } finally {
    await app.close();
  }
}
