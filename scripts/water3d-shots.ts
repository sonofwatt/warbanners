// Screenshots of the clear water, the swimming fish and the mountain ridges (branch water3d). Run after `vite build`:
//   npx tsx scripts/water3d-shots.ts <what> [out dir] [build dir]
// what: water (a lake with fish tiles, plain water, a harvested fish tile and a peak in front of one, at the phone's
//              size and close up), fish (a GIF of the fish swimming at real pace, 20 fps on the page's held clock),
//       ridges (a ridge of two, an L of three, two separate peaks, and a ridge with a mine and jewels on it).
// The build dir lets the same shots be taken of another build (the branch's start, for the before shots); NAME
// prefixes the files (before-).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { createMatch, hashState } from '../src/engine';
import type { HexKey, MatchState, Tile } from '../src/engine';
import { frames, openApp } from '../src/browser/harness';
import { ridgeChance } from '../src/ui/terrain3d/ridges';

const what = process.argv[2] ?? 'water';
const out = process.argv[3] ?? 'docs/superpowers/plans/shots/water3d';
const outDir = process.argv[4];
const name = (s: string): string => `${process.env.NAME ?? ''}${s}`;
mkdirSync(out, { recursive: true });

function saveOf(state: MatchState, title: string): [string, string][] {
  const all = Object.keys(state.tiles).sort();
  for (const p of state.players) p.explored = all;
  const base = newRecord(title, { seed: state.seed, factions: ['spartans', 'mongols'] }, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state);
  return [...map.entries()];
}

const hexLen = (q: number, r: number): number => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
const key = (q: number, r: number): HexKey => `${q},${r}`;
const plain: Partial<Tile> = { resource: null, building: null, harvested: false, road: false, village: false, treasure: false, cityId: null };

/**
 * A diorama: the tiles within `reach` of a centre set by `pattern` (offset to tile), fields elsewhere in reach, at the
 * first centre whose reach holds no city and no unit. Returns the state and the centre.
 */
function diorama(pattern: Record<string, Partial<Tile>>, reach: number, seed = 7): { state: MatchState; c: [number, number] } {
  const state = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
  state.seed = seed;
  const busy = new Set([...state.cities.map((c) => c.pos), ...state.units.map((u) => u.pos)]);
  const cands = Object.keys(state.tiles).map((k) => k.split(',').map(Number) as [number, number]).sort((a, b) => hexLen(...a) - hexLen(...b));
  for (const [cq, cr] of cands) {
    let ok = true;
    for (let dq = -reach - 1; dq <= reach + 1 && ok; dq++) {
      for (let dr = -reach - 1; dr <= reach + 1 && ok; dr++) {
        if (hexLen(dq, dr) > reach + 1) continue;
        const k = key(cq + dq, cr + dr);
        if (hexLen(dq, dr) <= reach && state.tiles[k] === undefined) ok = false;
        if (busy.has(k)) ok = false;
      }
    }
    if (!ok) continue;
    for (let dq = -reach; dq <= reach; dq++) {
      for (let dr = -reach; dr <= reach; dr++) {
        if (hexLen(dq, dr) > reach) continue;
        const k = key(cq + dq, cr + dr);
        const t = state.tiles[k]!;
        const forest = (dq * 3 + dr * 5 + 9) % 7 === 0;
        state.tiles[k] = { ...t, ...plain, terrain: forest ? 'forest' : 'field', ...pattern[`${dq},${dr}`] };
      }
    }
    return { state, c: [cq, cr] };
  }
  throw new Error('no room');
}

async function open(entries: [string, string][], width: number, height: number, scale?: number, motion = false) {
  const app = await openApp('', {
    width, height, webgl: true, ...(outDir !== undefined ? { outDir } : {}), ...(scale !== undefined ? { scale } : {}),
    beforeOpen: (c) => { void c.addInitScript((items: [string, string][]) => { for (const [k, v] of items) localStorage.setItem(k, v); }, entries); },
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
type Page = Awaited<ReturnType<typeof openApp>>['page'];
async function on3d(page: Page): Promise<void> {
  await page.getByTestId('open-menu').tap();
  await page.getByTestId('toggle-terrain3d').tap();
  await page.getByTestId('close-sheet').tap();
  await frames(page);
  await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
  await page.waitForTimeout(800);
  await frames(page);
}
async function centreOf(page: Page, k: HexKey): Promise<{ x: number; y: number } | null> {
  const b = await page.locator(`[data-centre="${k}"]`).boundingBox();
  return b === null ? null : { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function bring(page: Page, k: HexKey, x: number, y: number): Promise<void> {
  for (let i = 0; i < 5; i++) {
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
/** px per board unit now, from two neighbouring tile centres. */
async function unit(page: Page, q: number, r: number): Promise<number> {
  const a = (await centreOf(page, key(q, r)))!, b = (await centreOf(page, key(q + 1, r)))!;
  return (b.x - a.x) / 52;
}
function crop(src: string, dst: string, box: { x: number; y: number; w: number; h: number }, dpr: number): void {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', `crop=${Math.round(box.w * dpr)}:${Math.round(box.h * dpr)}:${Math.round(box.x * dpr)}:${Math.round(box.y * dpr)}`, dst]);
}

// The lake: seven water tiles, three with fish (one harvested), a peak and a forest in front of the harvested one.
const LAKE: Record<string, Partial<Tile>> = {
  '0,0': { terrain: 'water', resource: 'fish' }, '1,-1': { terrain: 'water', resource: 'fish' },
  '-1,1': { terrain: 'water', resource: 'fish', harvested: true },
  '1,0': { terrain: 'water' }, '-1,0': { terrain: 'water' }, '0,-1': { terrain: 'water' }, '0,1': { terrain: 'water' },
  '-1,2': { terrain: 'mountain' }, '-2,2': { terrain: 'forest' }, '2,-1': { terrain: 'water' },
};

if (what === 'water' || what === 'fish') {
  const { state, c: [cq, cr] } = diorama(LAKE, 3);
  const motion = what === 'fish';
  const phone = { w: 412, h: 915 };
  const DPR = motion ? 3 : 2.6;
  const app = await open(saveOf(state, 'water'), phone.w, phone.h, DPR, motion);
  try {
    const { page } = app;
    await on3d(page);
    await bring(page, key(cq, cr), phone.w / 2, phone.h / 2);
    if (!motion) {
      await page.screenshot({ path: join(out, name('lake-phone.png')) });
      await zoom(page, 4);
      await bring(page, key(cq, cr), phone.w / 2, phone.h / 2);
      const u = await unit(page, cq, cr);
      const full = join(out, name('lake-close-full.png'));
      await page.screenshot({ path: full });
      const c = (await centreOf(page, key(cq, cr)))!;
      crop(full, join(out, name('lake-close.png')), { x: c.x - 80 * u, y: c.y - 64 * u, w: 160 * u, h: 128 * u }, DPR);
      crop(full, join(out, name('fish-tile-close.png')), { x: c.x - 30 * u, y: c.y - 26 * u, w: 60 * u, h: 48 * u }, DPR);
      const hv = (await centreOf(page, key(cq - 1, cr + 1)))!;
      crop(full, join(out, name('fish-harvested-and-peak-close.png')), { x: hv.x - 40 * u, y: hv.y - 30 * u, w: 80 * u, h: 72 * u }, DPR);
      console.log('wrote water shots');
    } else {
      await zoom(page, 4);
      await bring(page, key(cq, cr), phone.w / 2, phone.h / 2);
      const u = await unit(page, cq, cr);
      const c = (await centreOf(page, key(cq, cr)))!;
      const box = { x: c.x - 56 * u, y: c.y - 44 * u, w: 112 * u, h: 80 * u };
      await page.mouse.move(5, phone.h - 5);
      await page.mouse.move(8, phone.h - 8);
      const tmp = mkdtempSync(join(tmpdir(), 'fish-'));
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
      const n = 100; // five seconds at 20 fps
      for (let i = 0; i < n; i++) {
        await page.clock.runFor(50);
        const f = join(tmp, `f${String(i).padStart(4, '0')}.png`);
        await page.screenshot({ path: f });
        if (i % 25 === 0) crop(f, join(out, `fish-swim-${String(i * 50).padStart(4, '0')}ms.png`), box, DPR);
      }
      const gif = join(out, 'fish-swim.gif');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '20', '-i', join(tmp, 'f%04d.png'),
        '-vf', `crop=${Math.round(box.w * DPR)}:${Math.round(box.h * DPR)}:${Math.round(box.x * DPR)}:${Math.round(box.y * DPR)},scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=bayer`, gif]);
      console.log('wrote', gif);
    }
  } finally {
    await app.close();
  }
}

// The ranges: a ridge of two (left, back), an L of three (right, back: a diagonal join to an ore tile), two separate
// peaks (left, front) and a ridge with a mine and jewels on it (front). The seed is the first that rolls those joins.
const RANGE: Record<string, Partial<Tile>> = {
  '-2,-1': { terrain: 'mountain' }, '-1,-1': { terrain: 'mountain' },
  '1,-1': { terrain: 'mountain' }, '2,-1': { terrain: 'mountain' }, '1,0': { terrain: 'mountain', resource: 'ore' },
  '-2,1': { terrain: 'mountain' }, '-1,1': { terrain: 'mountain' },
  '0,2': { terrain: 'mountain', resource: 'ore', building: 'mine' }, '1,2': { terrain: 'mountain', resource: 'jewels' },
};
const JOINED: [string, string][] = [['-2,-1', '-1,-1'], ['1,-1', '2,-1'], ['1,-1', '1,0'], ['0,2', '1,2']];
const APART: [string, string][] = [['-2,1', '-1,1']];

if (what === 'ridges') {
  const first = diorama(RANGE, 3);
  const [cq, cr] = first.c;
  const at = (o: string): HexKey => { const [dq, dr] = o.split(',').map(Number) as [number, number]; return key(cq + dq, cr + dr); };
  let seed = 0;
  while (!(JOINED.every(([a, b]) => ridgeChance(at(a), at(b), seed)) && APART.every(([a, b]) => !ridgeChance(at(a), at(b), seed)))) seed++;
  const { state } = diorama(RANGE, 3, seed);
  console.log('seed', seed, 'centre', cq, cr);
  const phone = { w: 412, h: 915 };
  const DPR = 2.6;
  const app = await open(saveOf(state, 'ridges'), phone.w, phone.h, DPR);
  try {
    const { page } = app;
    await on3d(page);
    await bring(page, key(cq, cr), phone.w / 2, phone.h / 2);
    await page.screenshot({ path: join(out, name('ridges-phone.png')) });
    await zoom(page, 3);
    const shots: [string, string, number, number][] = [['ridge-two', '-1.5,-1', 70, 56], ['ridge-three', '1.5,-0.5', 76, 70], ['separate-peaks', '-1.5,1', 70, 56], ['ridge-mine-jewels', '0.5,2', 76, 60]];
    for (const [file, o, w, h] of shots) {
      const [dq, dr] = o.split(',').map(Number) as [number, number];
      const tq = Math.round(cq + dq), tr = Math.round(cr + dr);
      await bring(page, key(tq, tr), phone.w / 2, phone.h / 2);
      const u = await unit(page, tq, tr);
      const c0 = (await centreOf(page, key(tq, tr)))!;
      // The group's middle, from the tile's centre: half a tile over for fractional offsets.
      const mx = c0.x + ((cq + dq - tq) * 52 + (cr + dr - tr) * 26) * u, my = c0.y + (cr + dr - tr) * 45 * 0.62 * u;
      const full = join(out, name(`${file}-full.png`));
      await page.screenshot({ path: full });
      crop(full, join(out, name(`${file}.png`)), { x: mx - w * u, y: my - h * 1.1 * u, w: 2 * w * u, h: 1.75 * h * u }, DPR);
    }
    console.log('wrote ridge shots');
  } finally {
    await app.close();
  }
}
