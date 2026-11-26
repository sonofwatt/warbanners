// Screenshots of the traffic tracks (branch tracks3d). Run after `vite build`:
//   npx tsx scripts/tracks3d-shots.ts <what> [out dir]
// what: sheet (the developer page ?tracks=3d and ?tracks=svg: footprints, hoof prints and wheel ruts at each wear step,
//              the trodden path and a road from light to busy, whole and close up),
//       match (a seeded AI against AI match, played by the engine here, saved early (round 8) and late (round 45) as
//              a pass-the-phone match and resumed: the phone's view in 3D and SVG).
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
import { tracksOf } from '../src/ui/board/tracks';
import type { TrackLook } from '../src/ui/board/tracks';

const what = process.argv[2] ?? 'sheet';
const out = process.argv[3] ?? 'docs/superpowers/plans/shots/tracks3d';
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
    const app = await openApp(`?tracks=${look}`, { width: phone.w, height: phone.h, webgl: true, scale: DPR });
    try {
      const { page } = app;
      await page.emulateMedia({ reducedMotion: 'reduce' });
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('page:', m.text().slice(0, 400)); });
      await page.getByTestId('tracks-sheet').waitFor();
      await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
      await settle(page, look === '3d');
      await page.screenshot({ path: join(out, `sheet-${look}-phone.png`) });
      await zoom(page, 2);
      await bring(page, '0,1', phone.w / 2, phone.h / 2);
      await settle(page, look === '3d');
      const full = join(out, `sheet-${look}-close-full.png`);
      await page.screenshot({ path: full });
      const a = (await centreOf(page, '0,0'))!, b = (await centreOf(page, '1,0'))!;
      const u = (b.x - a.x) / 52;
      // The kinds' rows (footprints, hoof prints, wheel ruts), the path row and the road row.
      const top = (await centreOf(page, '0,-3'))!, path = (await centreOf(page, '-2,3'))!, road = (await centreOf(page, '-3,5'))!;
      crop(full, join(out, `sheet-${look}-kinds.png`), { x: Math.max(0, a.x - 160 * u), y: Math.max(0, top.y - 34 * u), w: Math.min(phone.w, 320 * u), h: 245 * u }, DPR);
      crop(full, join(out, `sheet-${look}-path-and-road.png`), { x: Math.max(0, a.x - 175 * u), y: Math.max(0, path.y - 30 * u), w: Math.min(phone.w, 350 * u), h: Math.min(phone.h - (path.y - 30 * u), road.y - path.y + 64 * u) }, DPR);
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
  const turnsAt = (n: number): number => { let e = 0; for (let i = 0; i < played.actions.length; i++) if (played.actions[i]!.type === 'endTurn' && ++e === n) return i + 1; return played.actions.length; };
  const stages = [{ name: 'early', actions: played.actions.slice(0, turnsAt(16)) }, { name: 'late', actions: played.actions }];
  const DPR = 2.6;
  const notes: string[] = [];
  for (const st of stages) {
    const state = replay(settings, st.actions);
    const viewer = state.current;
    const looks = tracksOf(settings, st.actions, viewer);
    const explored = new Set(state.players[viewer]!.explored);
    // The shots look where the ground shows: the busiest road, and the most worn ground, with the fewest figures on and
    // around them.
    const crowd = (k: HexKey): number => {
      const [q, r] = k.split(',').map(Number) as [number, number];
      return state.units.filter((u) => { const [a, b] = u.pos.split(',').map(Number) as [number, number]; return (Math.abs(a - q) + Math.abs(b - r) + Math.abs(a + b - q - r)) / 2 <= 1; }).length;
    };
    const roads = [...looks.entries()].filter(([k]) => explored.has(k) && state.tiles[k]?.road === true && !state.cities.some((c) => c.pos === k))
      .sort((a, b) => b[1].road - a[1].road || crowd(a[0]) - crowd(b[0]));
    const busiest = roads[0]?.[0];
    const worn = (l: TrackLook): number => l.path * 3 + l.foot.level + l.hoof.level + l.wheel.level;
    const heavy = [...looks.entries()].filter(([k]) => explored.has(k) && state.tiles[k]?.road !== true && !state.cities.some((c) => c.pos === k))
      .sort((a, b) => (worn(b[1]) - crowd(b[0]) * 2) - (worn(a[1]) - crowd(a[0]) * 2));
    notes.push(`${st.name}: ${st.actions.length} actions, round ${Math.floor(state.stamp / 2) + 1}, viewer ${viewer}, ${looks.size} tiles with tracks, busiest road ${busiest ?? 'none'} (wear ${roads[0]?.[1].road ?? 0}), most worn off-road ${heavy[0]?.[0]} (path ${heavy[0]?.[1].path})`);
    for (const look of ['3d', 'svg'] as const) {
      const entries = saveOf(settings, st.actions, `tracks-${st.name}`);
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
        // The tracks replay in slices after the match opens.
        await page.waitForTimeout(4000);
        await frames(page);
        await page.screenshot({ path: join(out, `${st.name}-${look}-phone.png`) });
        const focuses: [string, HexKey | undefined][] = st.name === 'late' ? [['road', busiest], ['paths', heavy[0]?.[0]]] : [['tracks', heavy[0]?.[0]]];
        let zoomed = false;
        for (const [label, focus] of focuses) {
          if (focus === undefined) continue;
          notes.push(`${st.name} ${look} ${label}: centred on ${focus}`);
          if (!zoomed) {
            await bring(page, focus, phone.w / 2, phone.h / 2);
            await page.screenshot({ path: join(out, `${st.name}-${look}-phone-${label}.png`) });
            await zoom(page, 3);
            zoomed = true;
          }
          await bring(page, focus, phone.w / 2, phone.h / 2);
          await page.waitForTimeout(600);
          await frames(page);
          const full = join(out, `${st.name}-${look}-close-${label}-full.png`);
          await page.screenshot({ path: full });
          crop(full, join(out, `${st.name}-${look}-close-${label}.png`), { x: 0, y: phone.h / 2 - 220, w: phone.w, h: 440 }, DPR);
          rmSync(full);
        }
        console.log('wrote', st.name, look);
      } finally {
        await app.close();
      }
    }
  }
  writeFileSync(join(out, 'match-notes.txt'), `${notes.join('\n')}\n`);
  console.log(notes.join('\n'));
}
