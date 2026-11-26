// Screenshots of busy roads widening (branch tracks3d). Run after `vite build`:
//   npx tsx scripts/roads3d-shots.ts <what> [out dir]
// what: sheet (the developer page ?roads=3d and ?roads=svg: roads from light to the busiest, over fields and through
//              forest, and a road at one step all along; whole and close up),
//       match (a seeded AI against AI match, played by the engine here for 45 rounds, saved as a pass-the-phone match
//              and resumed: the phone's view in 3D and SVG, then the busiest road in view and close up).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { runMatch } from '../src/ai/sim';
import { hashState, replay } from '../src/engine';
import type { Action, HexKey, MatchSettings } from '../src/engine';
import { frames, openApp } from '../src/browser/harness';
import { roadWearOf } from '../src/ui/board/roadWear';

const what = process.argv[2] ?? 'sheet';
const out = process.argv[3] ?? 'docs/superpowers/plans/shots/roads3d';
mkdirSync(out, { recursive: true });
const phone = { w: 412, h: 915 };
type Page = Awaited<ReturnType<typeof openApp>>['page'];

function crop(src: string, dst: string, box: { x: number; y: number; w: number; h: number }, dpr: number): void {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', `crop=${Math.round(box.w * dpr)}:${Math.round(box.h * dpr)}:${Math.round(box.x * dpr)}:${Math.round(box.y * dpr)}`, dst]);
}
async function centreOf(page: Page, k: HexKey): Promise<{ x: number; y: number } | null> {
  const b = await page.locator(`[data-centre="${k}"]`).boundingBox();
  return b === null ? null : { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function zoom(page: Page, steps: number): Promise<void> {
  const box = await page.locator('main').first().boundingBox();
  if (box === null) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < Math.abs(steps); i++) { await page.mouse.wheel(0, steps > 0 ? -120 : 120); await frames(page); }
  await page.waitForTimeout(300);
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
async function settle(page: Page, look3d: boolean): Promise<void> {
  if (look3d) await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
  await page.waitForTimeout(900);
  await frames(page);
}

if (what === 'sheet') {
  const DPR = 3;
  for (const look of ['3d', 'svg'] as const) {
    const app = await openApp(`?roads=${look}`, { width: phone.w, height: phone.h, webgl: true, scale: DPR });
    try {
      const { page } = app;
      await page.emulateMedia({ reducedMotion: 'reduce' });
      page.on('console', (m) => { if (m.type() === 'error') console.log('page:', m.text().slice(0, 400)); });
      await page.getByTestId('road-sheet').waitFor();
      await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
      await settle(page, look === '3d');
      await page.screenshot({ path: join(out, `sheet-${look}-phone.png`) });
      await zoom(page, 2);
      await bring(page, '0,0', phone.w / 2, phone.h / 2);
      await settle(page, look === '3d');
      const full = join(out, `sheet-${look}-close-full.png`);
      await page.screenshot({ path: full });
      const a = (await centreOf(page, '0,0'))!, b = (await centreOf(page, '1,0'))!;
      const u = (b.x - a.x) / 52;
      // The two rising roads (rows -3 and 0), then the road at step 2 (row 3).
      const top = (await centreOf(page, '1,-3'))!, cross = (await centreOf(page, '-2,4'))!;
      crop(full, join(out, `sheet-${look}-rising.png`), { x: 0, y: Math.max(0, top.y - 30 * u), w: phone.w, h: Math.min(phone.h - Math.max(0, top.y - 30 * u), a.y - top.y + 60 * u) }, DPR);
      crop(full, join(out, `sheet-${look}-even.png`), { x: 0, y: Math.max(0, a.y + 20 * u), w: phone.w, h: Math.min(phone.h - (a.y + 20 * u), cross.y - a.y + 30 * u) }, DPR);
      rmSync(full);
      console.log('wrote sheet', look);
    } finally {
      await app.close();
    }
  }
}

async function on3d(page: Page): Promise<void> {
  await page.getByTestId('open-menu').tap();
  await page.getByTestId('toggle-terrain3d').tap();
  await page.getByTestId('close-sheet').tap();
  await frames(page);
  await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
}

/** A pass-the-phone save of the match after `actions`, as the app writes one. */
function saveOf(settings: MatchSettings, actions: Action[], title: string): [string, string][] {
  const state = replay(settings, actions);
  const base = newRecord(title, settings, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, actions, snapshot: { count: actions.length, hash: hashState(state), state } };
  const map = new Map<string, string>();
  const res = writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state);
  if (!res.saved) throw new Error('save failed');
  return [...map.entries()];
}

if (what === 'match') {
  const seed = Number(process.env.SEED ?? 5);
  const settings: MatchSettings = { seed, factions: ['spartans', 'mongols'] };
  const played = runMatch({ seed, factions: settings.factions, seats: [{ level: 'normal' }, { level: 'normal' }], maxRounds: 45 });
  if (played.winner !== null) throw new Error(`seed ${seed} ended early`);
  const actions = played.actions;
  const state = replay(settings, actions);
  const viewer = state.current;
  const wear = roadWearOf(settings, actions, viewer);
  // The busiest road, with the fewest figures on and around it, so its ground shows.
  const crowd = (k: HexKey): number => {
    const [q, r] = k.split(',').map(Number) as [number, number];
    return state.units.filter((u) => { const [a, b] = u.pos.split(',').map(Number) as [number, number]; return (Math.abs(a - q) + Math.abs(b - r) + Math.abs(a + b - q - r)) / 2 <= 1; }).length;
  };
  const roads = [...wear.entries()].sort((a, b) => b[1] - a[1] || crowd(a[0]) - crowd(b[0]));
  const focus = roads[0]?.[0];
  const steps = [1, 2, 3].map((n) => [...wear.values()].filter((w) => w === n).length);
  const notes = [`seed ${seed}, ${actions.length} actions, round ${Math.floor(state.stamp / 2) + 1}, viewer ${viewer}`,
    `busy roads the viewer sees: step 1 ${steps[0]}, step 2 ${steps[1]}, step 3 ${steps[2]}`, `close-ups centred on ${focus} (step ${roads[0]?.[1]}, ${focus === undefined ? 0 : crowd(focus)} figures on and around it)`];
  const DPR = 2.6;
  for (const look of ['3d', 'svg'] as const) {
    const entries = saveOf(settings, actions, 'roads-late');
    const app = await openApp('', {
      width: phone.w, height: phone.h, webgl: true, scale: DPR,
      beforeOpen: (c) => { void c.addInitScript((items: [string, string][]) => { for (const [k, v] of items) localStorage.setItem(k, v); }, entries); },
    });
    try {
      const { page } = app;
      await page.emulateMedia({ reducedMotion: 'reduce' });
      page.setDefaultTimeout(120_000);
      page.on('console', (m) => { if (m.type() === 'error') console.log('page:', m.text().slice(0, 400)); });
      await page.getByTestId('continue').tap();
      await page.getByTestId('ready').tap();
      await page.getByTestId('match').waitFor();
      await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
      await page.keyboard.press('Escape');
      if (look === '3d') await on3d(page);
      // The wear is replayed in slices after the match opens.
      await page.waitForTimeout(4000);
      await frames(page);
      await page.screenshot({ path: join(out, `late-${look}-phone.png`) });
      if (focus !== undefined) {
        await bring(page, focus, phone.w / 2, phone.h / 2);
        await page.screenshot({ path: join(out, `late-${look}-phone-road.png`) });
        await zoom(page, 3);
        await bring(page, focus, phone.w / 2, phone.h / 2);
        await page.waitForTimeout(600);
        await frames(page);
        const full = join(out, `late-${look}-close-full.png`);
        await page.screenshot({ path: full });
        crop(full, join(out, `late-${look}-close-road.png`), { x: 0, y: phone.h / 2 - 220, w: phone.w, h: 440 }, DPR);
        rmSync(full);
      }
      console.log('wrote late', look);
    } finally {
      await app.close();
    }
  }
  writeFileSync(join(out, 'match-notes.txt'), `${notes.join('\n')}\n`);
  console.log(notes.join('\n'));
}
