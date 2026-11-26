// Screenshots of the 3D tile buildings and treasure chests (branch buildings3d). Run after `vite build`:
//   npx tsx scripts/buildings3d-shots.ts <what> [out dir] [build dir]
// what: sheet (every building and chest in 3D next to its svg, on its terrain, at the closest zoom),
//       board (a real board at the phone's default zoom, 412 x 915, in the 3D look, with buildings and treasures),
//       chest (the chest close up, in the middle and beside a unit),
//       claim (a unit claiming a chest: frames at 40 ms of the page's held clock, made into a GIF; needs ffmpeg).
// The build dir lets the same shots be taken of another build (the branch's start, for the before shots).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { createMatch, hashState } from '../src/engine';
import type { HexKey, MatchState, Tile } from '../src/engine';
import { frames, openApp } from '../src/browser/harness';
import { advance } from '../src/ui/board/BoardDemo';

const what = process.argv[2] ?? 'sheet';
const out = process.argv[3] ?? 'docs/superpowers/plans/shots/buildings3d';
const outDir = process.argv[4];
mkdirSync(out, { recursive: true });

function saveOf(state: MatchState, name: string): [string, string][] {
  const all = Object.keys(state.tiles).sort();
  for (const p of state.players) p.explored = all;
  const base = newRecord(name, { seed: 7, factions: ['spartans', 'mongols'] }, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state);
  return [...map.entries()];
}

const hexLen = ([q, r]: [number, number]): number => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
type Spot = { name: string; tile: Partial<Tile>; unit?: boolean; owned?: boolean };
const NB = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]] as const;

/** A board with the given showcase on tiles two apart, plain fields round each, and a unit on those that ask for one. */
function showcase(spots: Spot[]): { state: MatchState; keys: Map<string, HexKey> } {
  const state = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
  const taken = new Set([...state.cities.map((c) => c.pos), ...state.units.map((u) => u.pos)]);
  const near = (k: HexKey): boolean => [...taken].some((t) => {
    const [a, b] = k.split(',').map(Number) as [number, number];
    const [c, d] = t.split(',').map(Number) as [number, number];
    return (Math.abs(a - c) + Math.abs(b - d) + Math.abs(a + b - c - d)) / 2 <= 1;
  });
  const free = Object.keys(state.tiles)
    .map((k) => k.split(',').map(Number) as [number, number])
    .filter(([q, r]) => q % 2 === 0 && r % 2 === 0)
    .sort((a, b) => hexLen(a) - hexLen(b) || a[1] - b[1] || a[0] - b[0])
    .map(([q, r]) => `${q},${r}`)
    .filter((k) => !near(k));
  const cap = state.cities.find((c) => c.owner === 0)!;
  cap.radius = 30;
  const keys = new Map<string, HexKey>();
  for (const t of Object.values(state.tiles)) t.cityId = null;
  const mover = state.units.filter((u) => u.owner === 0);
  let used = 0;
  spots.forEach((s, i) => {
    const k = free[i];
    if (k === undefined) throw new Error(`no room for ${s.name}`);
    const [q, r] = k.split(',').map(Number) as [number, number];
    for (const [dq, dr] of NB) {
      const nk = `${q + dq},${r + dr}`;
      const nt = state.tiles[nk];
      if (nt !== undefined && !taken.has(nk)) state.tiles[nk] = { ...nt, terrain: 'field', resource: null, building: null, village: false, treasure: false, road: false };
    }
    const t = state.tiles[k]!;
    state.tiles[k] = { ...t, resource: null, building: null, harvested: false, road: false, village: false, treasure: false, cityId: s.owned === true ? cap.id : null, ...s.tile };
    if (s.unit === true) {
      const u = mover[used++];
      if (u !== undefined) Object.assign(u, { pos: k, enteredTurn: -1, fresh: false, moved: false, acted: false });
    }
    keys.set(s.name, k);
  });
  return { state, keys };
}

async function open(entries: [string, string][], width: number, height: number, scale?: number, motion = false) {
  const app = await openApp('', {
    width, height, webgl: true, ...(outDir !== undefined ? { outDir } : {}), ...(scale !== undefined ? { scale } : {}),
    beforeOpen: (c) => { void c.addInitScript((items: [string, string][]) => { for (const [k, v] of items) localStorage.setItem(k, v); }, entries); },
  });
  const { page } = app;
  if (!motion) await page.emulateMedia({ reducedMotion: 'reduce' });
  // The claim's frames are taken on the page's own clock, held and stepped; it is taken over before the app starts,
  // so every timer and frame the app reads runs on it from the first.
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

async function sheet(page: Page, file: string, title: string, rows: { label: string; cells: { label: string; png: string }[] }[], w = 190): Promise<void> {
  const img = (p: string): string => `data:image/png;base64,${readFileSync(p).toString('base64')}`;
  const html = `<html><body style="margin:0;background:#2b3a48;font:600 15px system-ui;color:#f3ead6;padding:14px">
<div style="font-size:20px;margin:0 0 10px 4px">${title}</div>
${rows.map((r) => `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px">
<div style="width:130px;padding-top:8px">${r.label}</div>
${r.cells.map((c) => `<figure style="margin:0;text-align:center"><img src="${img(c.png)}" style="width:${w}px;display:block;border-radius:6px"><figcaption style="margin-top:3px">${c.label}</figcaption></figure>`).join('')}
</div>`).join('')}</body></html>`;
  const sheetPage = await page.context().newPage();
  await sheetPage.setViewportSize({ width: 160 + (w + 8) * Math.max(...rows.map((r) => r.cells.length)) + 20, height: 400 });
  await sheetPage.setContent(html);
  await sheetPage.screenshot({ path: file, fullPage: true });
  await sheetPage.close();
}

const BUILDINGS: [string, string, Spot[]][] = [
  ['Farm', 'farm', [{ name: 'farm', tile: { terrain: 'field', resource: 'cropland', building: 'farm' } }]],
  ['Granary (farm upgrade)', 'granary', [{ name: 'granary', tile: { terrain: 'field', resource: 'cropland', building: 'granary' } }]],
  ['Orchard', 'orchard', [{ name: 'orchard', tile: { terrain: 'field', resource: 'orchard', building: 'orchard' } }]],
  ['Plantation (orchard upgrade)', 'plantation', [{ name: 'plantation', tile: { terrain: 'field', resource: 'orchard', building: 'plantation' } }]],
  ['Lumber camp', 'lumberCamp', [{ name: 'lumberCamp', tile: { terrain: 'forest', resource: 'game', building: 'lumberCamp' } }]],
  ['Lumber mill (camp upgrade)', 'lumberMill', [{ name: 'lumberMill', tile: { terrain: 'forest', resource: 'game', building: 'lumberMill' } }]],
  ['Market (Spartan land)', 'market', [{ name: 'market', tile: { terrain: 'field', building: 'market' }, owned: true }]],
  ['Mine', 'mine', [{ name: 'mine', tile: { terrain: 'mountain', resource: 'ore', building: 'mine' } }]],
  ['Foundry (mine upgrade)', 'foundry', [{ name: 'foundry', tile: { terrain: 'mountain', resource: 'ore', building: 'foundry' } }]],
  ['Treasure, field', 'chest-field', [{ name: 'chest-field', tile: { terrain: 'field', treasure: true } }]],
  ['Treasure, forest', 'chest-forest', [{ name: 'chest-forest', tile: { terrain: 'forest', treasure: true } }]],
  ['Treasure, mountain', 'chest-mountain', [{ name: 'chest-mountain', tile: { terrain: 'mountain', treasure: true } }]],
  ['Treasure, beside a unit', 'chest-beside', [{ name: 'chest-beside', tile: { terrain: 'field', treasure: true }, unit: true }]],
  ['Farm on harvested cropland', 'farm-harvested', [{ name: 'farm-harvested', tile: { terrain: 'field', resource: 'cropland', harvested: true, building: 'farm' } }]],
  ['Camp in a harvested forest', 'camp-harvested', [{ name: 'camp-harvested', tile: { terrain: 'forest', resource: 'game', harvested: true, building: 'lumberCamp' } }]],
];

if (what === 'sheet') {
  const { state, keys } = showcase(BUILDINGS.flatMap(([, , s]) => s));
  const W = 2000, H = 1900;
  const app = await open(saveOf(state, 'buildings3d'), W, H, 2);
  try {
    const { page } = app;
    const files = new Map<string, string>();
    for (const look of ['svg', '3d']) {
      if (look === '3d') await on3d(page);
      await zoom(page, 3);
      for (const [name, k] of keys) {
        const c = await centreOf(page, k);
        if (c === null) continue;
        const step = 150;
        const file = join(out, 'crops', `${name}-${look}.png`);
        mkdirSync(join(out, 'crops'), { recursive: true });
        await page.screenshot({ path: file, clip: { x: c.x - step * 0.6, y: c.y - step * 0.85, width: step * 1.2, height: step * 1.2 } });
        files.set(`${name}-${look}`, file);
      }
      if (look === 'svg') await zoom(page, -3);
    }
    const rows = BUILDINGS.map(([label, name]) => ({ label, cells: [{ label: 'svg', png: files.get(`${name}-svg`)! }, { label: '3D', png: files.get(`${name}-3d`)! }] }));
    const half = Math.ceil(rows.length / 2);
    await sheet(page, join(out, 'sheet-buildings.png'), 'Tile buildings and treasure: svg and 3D, closest zoom', rows.slice(0, half), 210);
    await sheet(page, join(out, 'sheet-buildings-2.png'), 'Tile buildings and treasure: svg and 3D, closest zoom (2)', rows.slice(half), 210);
    console.log('wrote sheets');
  } finally {
    await app.close();
  }
}

/** A real board, twelve turns in, with the first player's land given every building and two treasures in sight. */
function realBoard(): MatchState {
  const state = advance(createMatch({ seed: 7, factions: ['spartans', 'mongols'] }), 12);
  const cap = state.cities.find((c) => c.owner === state.current && c.capital) ?? state.cities.find((c) => c.owner === state.current)!;
  const [cq, cr] = cap.pos.split(',').map(Number) as [number, number];
  const ring = (n: number): HexKey[] => Object.keys(state.tiles).filter((k) => {
    const [q, r] = k.split(',').map(Number) as [number, number];
    return hexLen([q - cq, r - cr]) === n;
  }).sort();
  const want: [Tile['terrain'], Tile['building']][] = [
    ['field', 'farm'], ['field', 'market'], ['forest', 'lumberMill'], ['field', 'orchard'], ['field', 'granary'], ['forest', 'lumberCamp'], ['field', 'plantation'],
  ];
  const units = new Set(state.units.map((u) => u.pos));
  const cities = new Set(state.cities.map((c) => c.pos));
  const free = [...ring(1), ...ring(2)].filter((k) => !units.has(k) && !cities.has(k) && !state.tiles[k]!.village);
  want.forEach(([terrain, building], i) => {
    const k = free[i];
    if (k === undefined) return;
    state.tiles[k] = { ...state.tiles[k]!, terrain, building, resource: null, treasure: false, village: false, cityId: cap.id };
  });
  const far = ring(3).filter((k) => !units.has(k) && !cities.has(k) && state.tiles[k]!.building === null && !state.tiles[k]!.village);
  for (const k of far.slice(2, 4)) state.tiles[k] = { ...state.tiles[k]!, treasure: true, terrain: k === far[2] ? 'field' : 'forest', resource: null };
  return state;
}

if (what === 'board') {
  const name = process.env.NAME ?? 'board';
  const app = await open(saveOf(realBoard(), 'board'), 412, 915);
  try {
    const { page } = app;
    await on3d(page);
    await page.screenshot({ path: join(out, `${name}.png`) });
    console.log('wrote', name);
  } finally {
    await app.close();
  }
}

if (what === 'chest' || what === 'claim') {
  const { state, keys } = showcase([
    { name: 'chest', tile: { terrain: 'field', treasure: true } },
    { name: 'claim', tile: { terrain: 'field', treasure: true }, unit: true },
  ]);
  const W = 700, H = 800;
  const DPR = what === 'claim' ? 4 : 2;
  const app = await open(saveOf(state, 'chest'), W, H, DPR, what === 'claim');
  try {
    const { page } = app;
    await on3d(page);
    const Z = 4;
    await zoom(page, Z);
    if (what === 'chest') {
      for (const name of ['chest', 'claim']) {
        const k = keys.get(name)!;
        await bring(page, k, W / 2, H / 2 + 80);
        const c = (await centreOf(page, k))!;
        const s = 170;
        await page.screenshot({ path: join(out, `chest-${name === 'chest' ? 'middle' : 'beside'}-3d.png`), clip: { x: c.x - s * 0.55, y: c.y - s * 0.8, width: s * 1.1, height: s * 1.05 } });
      }
      await toggle(page);
      for (const name of ['chest', 'claim']) {
        const k = keys.get(name)!;
        const c = (await centreOf(page, k))!;
        const s = 170;
        await page.screenshot({ path: join(out, `chest-${name === 'chest' ? 'middle' : 'beside'}-svg.png`), clip: { x: c.x - s * 0.55, y: c.y - s * 0.8, width: s * 1.1, height: s * 1.05 } });
      }
    } else {
      const k = keys.get('claim')!;
      await zoom(page, 3);
      await bring(page, k, W / 2, H / 2 + 40);
      const unit = state.units.find((u) => u.pos === k)!;
      const c = (await centreOf(page, k))!;
      await page.locator(`[data-unit="${unit.id}"]`).first().dispatchEvent('pointerdown').catch(() => {});
      await page.touchscreen.tap(c.x, c.y);
      await page.getByTestId('cmd-claimTreasure').waitFor();
      // The card has opened; let the view settle, then bring the tile back to the middle.
      await page.waitForTimeout(800);
      await bring(page, k, W / 2 - 60, H / 2 + 40);
      const tmp = mkdtempSync(join(tmpdir(), 'claim-'));
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 200));
      // Let anything still easing (a zoom, a pan) finish on the held clock before measuring.
      for (let i = 0; i < 40; i++) await page.clock.runFor(50);
      const [q, r] = k.split(',').map(Number) as [number, number];
      const at = async (): Promise<{ x: number; y: number; u: number }> => {
        const c0 = (await centreOf(page, k))!, n0 = (await centreOf(page, `${q + 1},${r}`))!;
        return { ...c0, u: (n0.x - c0.x) / 52 }; // u: px per board unit
      };
      const start = await at();
      let n = 0;
      const shoot = async (): Promise<void> => { await page.screenshot({ path: join(tmp, `f${String(n++).padStart(4, '0')}.png`) }); };
      for (let i = 0; i < 6; i++) { await page.clock.runFor(40); await shoot(); }
      // The claim closes the card, so the board slides back into the taller slot while the chest opens.
      await page.getByTestId('cmd-claimTreasure').tap();
      for (let i = 0; i < 30; i++) { await page.clock.runFor(40); await shoot(); }
      const end = await at();
      // One crop for every frame: round the unit and its chest (which stands 16 units to its right) at both ends.
      const u = start.u, s = 74 * u;
      const x0 = Math.min(start.x, end.x) + 8 * u - s * 0.5, y0 = Math.min(start.y, end.y) - s * 0.55;
      const clip = { x: x0, y: y0, width: s + Math.abs(end.x - start.x), height: s * 0.8 + Math.abs(end.y - start.y) };
      // Whole screens are taken and cropped afterwards: a clipped screenshot lays the long page out again, which moves
      // the board under the open card.
      const crop = (dpr: number, c = clip): string => `crop=${Math.round(c.width * dpr)}:${Math.round(c.height * dpr)}:${Math.round(c.x * dpr)}:${Math.round(c.y * dpr)}`;
      // And a close-up of the chest alone, at the board's place after the card has closed (the opening plays there).
      const near = { x: end.x + 16 * u - 14 * u, y: end.y - 22 * u, width: 28 * u, height: 28 * u };
      if (process.env.DEBUG === '1') console.log(JSON.stringify({ start, end, clip }));
      for (const i of [0, 3, 5, 7, 9, 11, 14, 18, 22]) {
        // Frame 6 + i is (i + 1) * 40 ms after the tap.
        const f = join(tmp, `f${String(6 + i).padStart(4, '0')}.png`), ms = String((i + 1) * 40).padStart(4, '0');
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', f, '-vf', `${crop(DPR)},scale=iw/2:-1`, join(out, `claim-${ms}ms.png`)]);
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', f, '-vf', crop(DPR, near), join(out, `claim-closeup-${ms}ms.png`)]);
      }
      const gif = join(out, 'claim.gif');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '25', '-i', join(tmp, 'f%04d.png'),
        '-vf', `${crop(DPR)},scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer`, gif]);
      // The close-up from the tap on (the card closing slides the board before that).
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '25', '-start_number', '6', '-i', join(tmp, 'f%04d.png'),
        '-vf', `${crop(DPR, near)},scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer`, join(out, 'claim-closeup.gif')]);
      console.log('wrote', gif);
    }
  } finally {
    await app.close();
  }
}
