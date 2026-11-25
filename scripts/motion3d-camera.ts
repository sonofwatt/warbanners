// The camera's dead zone in the real app, 3D look on, landscape phone: a move near the middle of the view leaves the
// view where it is; the same move after the board was dragged so the unit stands near the edge eases the view over.
// The page clock is taken over (Playwright's clock) right before each move, so the frames of the pan are caught at
// real pace (every 40 ms) however slowly software WebGL draws. Run after `vite build`:
// npx tsx scripts/motion3d-camera.ts [out dir]   (needs ffmpeg for the GIF)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { createMatch, hashState } from '../src/engine';
import { openApp } from '../src/browser/harness';

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/motion3d';
mkdirSync(out, { recursive: true });

// Seed 7, pass the phone: the first player's warrior (unit 0) stands on -2,5 and can move to -1,4.
const state = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
const base = newRecord('camera', { seed: 7, factions: ['spartans', 'mongols'] }, ['Ann', 'Ben'], 1_000_000);
const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
const map = new Map<string, string>();
writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state);
map.set('warbanners.terrain3d', '1');
const UNIT_AT = '-2,5', TO = '-1,4';

const camera = (page: Page): Promise<string> => page.evaluate(() => document.querySelector('[data-camera="true"]')?.getAttribute('transform') ?? '');
async function centre(page: Page, k: string): Promise<{ x: number; y: number }> {
  const b = await page.locator(`[data-centre="${k}"]`).boundingBox();
  if (b === null) throw new Error(`no tile ${k}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function run(name: string, drag: { x: number; y: number }): Promise<void> {
  const app = await openApp('', {
    width: 915, height: 412, webgl: true,
    beforeOpen: (c) => { void c.addInitScript((items: [string, string][]) => { for (const [k, v] of items) localStorage.setItem(k, v); }, [...map.entries()]); },
  });
  try {
    const { page } = app;
    await page.getByTestId('continue').tap();
    await page.getByTestId('ready').tap();
    await page.getByTestId('match').waitFor();
    await page.locator('[data-units3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
    await page.waitForTimeout(1200);
    // Zoom in on the warrior (the whole board fits the screen at the opening zoom, so there would be nothing to pan),
    // then drag the board so the warrior stands where this run wants it: `drag` is its x as a share of the screen.
    let p = await centre(page, UNIT_AT);
    await page.mouse.move(p.x, p.y);
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(150); }
    await page.waitForTimeout(600);
    p = await centre(page, UNIT_AT);
    const goal = { x: 915 * drag.x, y: 412 * drag.y };
    // A one-finger drag, as touch pointer events on the board.
    // (A string, so the bundler adds no helpers the page does not have.)
    await page.evaluate(`new Promise((done) => {
      const dx = ${goal.x - p.x}, dy = ${goal.y - p.y};
      const el = document.querySelector('[data-testid="board"]');
      const r = el.getBoundingClientRect();
      const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
      function ev(type, x, y) {
        el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
      }
      ev('pointerdown', x0, y0);
      let i = 0;
      function step() {
        i++;
        ev('pointermove', x0 + (dx * i) / 12, y0 + (dy * i) / 12);
        if (i < 12) setTimeout(step, 16);
        else { ev('pointerup', x0 + dx, y0 + dy); done(); }
      }
      setTimeout(step, 16);
    })`);
    await page.waitForTimeout(1000);
    console.log(name, 'drag by', goal.x - p.x, goal.y - p.y, 'unit now at', JSON.stringify(await centre(page, UNIT_AT)), await camera(page));
    const shoot = (file: string) => page.screenshot({ path: file });
    await shoot(join(out, `camera-${name}-before.png`));
    const before = await camera(page);
    // Hold the page's clock still; from here time moves only as runFor moves it.
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 200);
    const frames = mkdtempSync(join(tmpdir(), `camera-${name}-`));
    let n = 0;
    const tap = async (k: string): Promise<void> => { const p = await centre(page, k); await page.touchscreen.tap(p.x, p.y); };
    await shoot(join(frames, `f${String(n++).padStart(4, '0')}.png`));
    const log: string[] = [`${name}: before ${before}`];
    await tap(UNIT_AT);
    const sel: string[] = [];
    for (let i = 0; i < 15; i++) {
      await page.clock.runFor(40);
      await shoot(join(frames, `f${String(n++).padStart(4, '0')}.png`));
      sel.push(await camera(page));
    }
    log.push(`after selecting ${await camera(page)}; every 40 ms: ${[...new Set(sel)].join(' | ')}`);
    await tap(TO);
    // Each 40 ms of the pan and the walk.
    const mid: string[] = [];
    for (let i = 0; i < 30; i++) {
      await page.clock.runFor(40);
      await shoot(join(frames, `f${String(n++).padStart(4, '0')}.png`));
      mid.push(await camera(page));
      if (i === 4 || i === 8) await shoot(join(out, `camera-${name}-${String((i + 1) * 40).padStart(4, '0')}ms.png`));
    }
    log.push(`after the move ${await camera(page)}; the unit stands on ${await page.evaluate(() => document.querySelector('[data-unit="0"]')?.getAttribute('data-at') ?? '?')}`);
    log.push(`camera every 40 ms after the move: ${[...new Set(mid)].join(' | ')}`);
    await shoot(join(out, `camera-${name}-after.png`));
    const gif = join(out, `camera-${name}.gif`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '25', '-i', join(frames, 'f%04d.png'),
      '-vf', 'scale=560:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer', gif]);
    rmSync(frames, { recursive: true, force: true });
    console.log(log.join('\n'));
    console.log(gif);
  } finally {
    await app.close();
  }
}

// Near the middle of the slot that is left once the unit card opens on the right; and near its right edge.
await run('centre', { x: 0.3, y: 0.6 });
await run('edge', { x: 0.64, y: 0.6 });
