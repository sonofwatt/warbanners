// The war banners on a crowded board, in the svg look and the 3D look, at 412 x 915: a saved pass-the-phone match
// (seed 7) with Spartan and Mongol units packed round the Spartan capital: riders, a catapult, a king's guard, a hero,
// hunkered units of each kind beside standing ones of the same type. For each look a shot at the opening zoom and a
// crop of the units zoomed in; with DUMP=1, each unit alone close up too (unit-<look>-<n>-<type>.png). Run after
// `vite build` (or give the folder of another build, to shoot it as it was):
// npx tsx scripts/emblems-crowded-shots.ts [out dir] [name prefix] [built app dir]
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { createMatch, freshDeeds, hashState, UNITS } from '../src/engine';
import type { HexKey, MatchState, PlayerId, Unit, UnitTypeId } from '../src/engine';
import { frames, openApp } from '../src/browser/harness';

// Scripts reach the engine only through its index (src/boundaries.test.ts): a unit ready to act, from the data.
function addUnit(s: MatchState, type: UnitTypeId, owner: PlayerId, q: number, r: number, patch?: Partial<Unit>): Unit {
  const u: Unit = {
    id: s.nextUnitId++, type, owner, pos: `${q},${r}`, hp: UNITS[type].hp, mp: 2 * UNITS[type].move, bonusMp: 0,
    attacks: UNITS[type].atk === 0 ? 0 : 1, home: null, enteredTurn: 0, moved: false, acted: false, rested: false,
    taunted: false, blinded: false, lure: null, fresh: false, deeds: freshDeeds(), heroTraits: [], item: null,
    hunkered: false, momentum: 0, turnEnded: false, itemTurn: null, ...patch,
  };
  s.units.push(u);
  return u;
}

const H: Partial<Unit> = { hunkered: true };
type Place = [UnitTypeId, 0 | 1, number, number, Partial<Unit>];
// Offsets from the Spartan capital.
const PLACES: Place[] = [
  ['hoplite', 0, 0, 0, { heroTraits: ['fierce', 'tireless'], hp: 17 }],
  ['knight', 0, 1, -1, {}],
  ['catapult', 0, 1, 0, {}],
  ['defender', 0, 0, -1, H],
  ['archer', 0, -1, 0, { hp: 6 }],
  ['spearman', 0, -1, 1, H],
  ['spearman', 0, -2, 1, {}],
  ['kingsGuard', 0, 0, 1, {}],
  ['swordsman', 0, 2, -1, { hp: 8, item: 'draught' }],
  ['horseman', 1, 2, -2, { hp: 6 }],
  ['khansGuard', 1, 1, -2, H],
  ['khansGuard', 1, 3, -2, {}],
  ['skyCaller', 1, 0, -2, {}],
  ['horseArcher', 1, -1, -1, H],
  ['horseArcher', 1, 3, -1, {}],
  ['camp', 1, 2, 0, { hp: 9 }],
];

// LAYOUT=hunker: pairs of one type standing and hunkered, side by side.
const PAIRS: UnitTypeId[] = ['hoplite', 'knight', 'skyCaller', 'spearman', 'khansGuard', 'catapult'];
const HUNKER: Place[] = PAIRS.flatMap((t, i): Place[] => {
  const owner = t === 'skyCaller' || t === 'khansGuard' ? 1 : 0;
  const q = -2 + 2 * (i % 3) + Math.floor(i / 3), r = -2 * Math.floor(i / 3);
  return [[t, owner, q, r, {}], [t, owner, q + 1, r, H]];
});

function match(): [string, string][] {
  const state = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
  const cap = state.cities.find((c) => c.owner === 0)!;
  const [cq, cr] = cap.pos.split(',').map(Number) as [number, number];
  state.units = [];
  for (const [type, owner, dq, dr, patch] of process.env.LAYOUT === 'hunker' ? HUNKER : PLACES) {
    const k: HexKey = `${cq + dq},${cr + dr}`;
    const t = state.tiles[k];
    if (t === undefined) continue;
    if (t.terrain !== 'field' && t.terrain !== 'forest') state.tiles[k] = { ...t, terrain: 'field', resource: null };
    addUnit(state, type, owner, cq + dq, cr + dr, patch);
  }
  const all = Object.keys(state.tiles).sort();
  for (const p of state.players) p.explored = all;
  const base = newRecord('crowded', { seed: 7, factions: ['spartans', 'mongols'] }, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state);
  return [...map.entries()];
}

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/emblems';
const name = process.argv[3] ?? 'crowded-after';
const outDir = process.argv[4];
mkdirSync(out, { recursive: true });
const entries = match();
const tmp = mkdtempSync(join(tmpdir(), 'crowded-'));
const app = await openApp('', {
  width: 412, height: 915, webgl: true, ...(outDir !== undefined ? { outDir } : {}),
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
  await page.waitForTimeout(500);
  const zoomIn = async (): Promise<void> => {
    // Toward the middle of the units.
    const boxes = await page.locator('[data-unit]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }));
    const mx = boxes.reduce((a, b) => a + b[0]!, 0) / boxes.length, my = boxes.reduce((a, b) => a + b[1]!, 0) / boxes.length;
    await page.mouse.move(mx, my);
    for (let i = 0; i < Number(process.env.ZOOM ?? 4); i++) { await page.mouse.wheel(0, -120); await frames(page); }
    await page.waitForTimeout(500);
  };
  /** A crop of the zoomed shot round every unit, in device pixels. */
  const crop = async (from: string, to: string): Promise<void> => {
    const boxes = await page.locator('[data-unit]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
    const k = 2.6;
    const vis = boxes.filter((b) => b[2]! > 0 && b[0]! < 412 && b[3]! > 0 && b[1]! < 915);
    const x0 = Math.max(0, Math.min(...vis.map((b) => b[0]!)) - 6), y0 = Math.max(0, Math.min(...vis.map((b) => b[1]!)) - 6);
    const x1 = Math.min(412, Math.max(...vis.map((b) => b[2]!)) + 6), y1 = Math.min(915, Math.max(...vis.map((b) => b[3]!)) + 6);
    const [cx, cy, cw, ch] = [x0, y0, x1 - x0, y1 - y0].map((v) => Math.round(v * k));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', from, '-vf', `crop=${cw}:${ch}:${cx}:${cy}`, to]);
    console.log(to);
  };
  /** With DUMP=1: each unit alone, close up (its banner and the figure under it; the others' banners hidden). */
  const each = async (look: string): Promise<void> => {
    if (process.env.DUMP !== '1') return;
    const n = await page.locator('[data-unit]').count();
    for (let i = 0; i < n; i++) {
      const box = await page.evaluate(`(() => {
        const all = [...document.querySelectorAll('[data-unit]')];
        for (const u of all) u.style.visibility = u === all[${i}] ? '' : 'hidden';
        const r = all[${i}].getBoundingClientRect();
        // Down to the feet: in the 3D look the svg unit is only its banner.
        const g = all[${i}].querySelector('[data-glyph]').getBoundingClientRect();
        return [g.left - g.width * 0.8, g.top - 4, g.width * 3.4, Math.max(r.bottom, g.bottom + g.width * 2.8) - g.top + 4];
      })()`) as number[];
      const type = await page.locator('[data-unit]').nth(i).locator('[data-banner]').getAttribute('data-banner');
      if (box[0]! < 0 || box[1]! < 0 || box[0]! + box[2]! > 412 || box[1]! + box[3]! > 915) continue;
      await page.screenshot({ path: join(out, `unit-${look}-${i}-${type}.png`), clip: { x: box[0]!, y: box[1]!, width: box[2]!, height: box[3]! } });
    }
    await page.evaluate(`(() => { for (const u of document.querySelectorAll('[data-unit]')) u.style.visibility = ''; })()`);
  };
  const shot = async (file: string): Promise<string> => { const p = file.startsWith(tmp) ? file : join(out, file); await page.screenshot({ path: p }); return p; };
  console.log(await shot(`${name}-svg.png`));
  await toggle();
  await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
  await page.waitForTimeout(1000);
  console.log(await shot(`${name}-3d.png`));
  await zoomIn();
  await crop(await shot(join(tmp, '3d.png')), join(out, `${name}-3d-crop.png`));
  await each('3d');
  await toggle();
  await page.waitForTimeout(800);
  await crop(await shot(join(tmp, 'svg.png')), join(out, `${name}-svg-crop.png`));
  await each('svg');
} finally {
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
}
