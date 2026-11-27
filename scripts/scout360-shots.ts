// A 360 turntable of a 3D figure (contact sheet and GIF), stills at its side and back, its strike at four facings
// and its walk (GIFs and a sheet of key frames), and a stretch of board at game zoom. Drawn by scripts/scout360/sheet.ts
// through Vite's dev server in Chromium with software WebGL, the figure turned by the game's own facing.
// Run: [WEAR=4] npx tsx scripts/scout360-shots.ts [out dir] [tag] [unit type]   (needs ffmpeg)
// The tag names the files (scout360-<tag>-sheet.png, scout360-<tag>.gif, <tag>-yaw090.png ...), so a run before a
// change and one after can be set side by side.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { WEBGL_ARGS } from '../src/browser/harness';

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/scout-cloak';
const tag = process.argv[3] ?? 'after';
const type = process.argv[4] ?? 'scout';
mkdirSync(out, { recursive: true });

const SCALE = 6;
/** The box kept round the figure (board units about its tile centre). */
const BOX = { left: 27, right: 27, up: 38, down: 12 };
/** The turntable's steps (degrees) for the GIF, and the views on the contact sheet (two rows of four). */
const STEP = 15;
const SHEET = [0, 45, 90, 135, 180, 225, 270, 315];
/** The views kept as stills for a before and after: the front, a three-quarter view, the side and the back. */
const STILLS = [330, 30, 90, 180];
/** The strike's key moments (ms) for its sheet: rest, drawn back, the stab, the hold, coming back. */
const STRIKE_KEYS = [200, 340, 420, 500, 640];
const STRIKE_BOX = { left: 30, right: 30, up: 40, down: 14 };

type Win = {
  turntable(t: string, f: string, s: number): [number, number];
  turnTo(deg: number): void;
  strikeClip(t: string, f: string, s: number): { length: number; pairs: [number, number][] };
  walkClip(t: string, f: string, s: number): { length: number };
  clipFrame(t: number): void;
  board(s: number): void;
};
const ff = (args: string[]): void => { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]); };
const gif = (pattern: string, fps: number, to: string): void =>
  ff(['-framerate', String(fps), '-i', pattern, '-vf', 'split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0', to]);

/**
 * WEAR=n draws every figure at wear stage n (4 = broken: Gritty's rags), which the game never does on main: the dev
 * server swaps the figures' CLEAN wear for it as it serves parts.ts. Nothing in src changes.
 */
const wearStage = Number(process.env.WEAR ?? 0);
const CLEAN_LINE = 'export const CLEAN: Wear = { stage: 0, blood: 0 };';
const wearPlugin = {
  name: 'figure-wear',
  enforce: 'pre' as const,
  transform(code: string, id: string): string | null {
    if (wearStage === 0 || !id.endsWith('/units/parts.ts')) return null;
    if (!code.includes(CLEAN_LINE)) throw new Error('parts.ts no longer declares CLEAN as expected');
    return code.replace(CLEAN_LINE, `export const CLEAN: Wear = { stage: ${wearStage}, blood: 0 };`);
  },
};
const server = await createServer({ logLevel: 'silent', plugins: [wearPlugin], server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const addr = server.httpServer?.address();
const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
const browser = await chromium.launch({ args: WEBGL_ARGS });
const tmp = mkdtempSync(join(tmpdir(), 'scout360-'));
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(e));
  page.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/scripts/scout360/sheet.html`);
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 60_000 });

  // The turntable.
  const c = await page.evaluate(([t, s]) => (window as unknown as Win).turntable(t as string, 'spartans', s as number), [type, SCALE] as const);
  const clip = { x: c[0] - BOX.left * SCALE, y: c[1] - BOX.up * SCALE, width: (BOX.left + BOX.right) * SCALE, height: (BOX.up + BOX.down) * SCALE };
  const turn = join(tmp, 'turn');
  mkdirSync(turn);
  const shot = async (deg: number, path: string): Promise<void> => {
    await page.evaluate((d) => (window as unknown as Win).turnTo(d), deg);
    await page.screenshot({ path, clip });
  };
  for (let d = 0, n = 0; d < 360; d += STEP, n++) await shot(d, join(turn, `f${String(n).padStart(3, '0')}.png`));
  const at = (deg: number): string => join(turn, `f${String(deg / STEP).padStart(3, '0')}.png`);
  gif(join(turn, 'f%03d.png'), 10, join(out, `scout360-${tag}.gif`));
  const row = (degs: number[], to: string): void => ff([...degs.flatMap((d) => ['-i', at(d)]), '-filter_complex', `${degs.map((_, i) => `[${i}:v]`).join('')}hstack=inputs=${degs.length}`, to]);
  row(SHEET.slice(0, 4), join(tmp, 'r0.png'));
  row(SHEET.slice(4), join(tmp, 'r1.png'));
  ff(['-i', join(tmp, 'r0.png'), '-i', join(tmp, 'r1.png'), '-filter_complex', '[0:v][1:v]vstack=inputs=2', join(out, `scout360-${tag}-sheet.png`)]);
  for (const d of STILLS) ff(['-i', at(d), join(out, `${tag}-yaw${String(d).padStart(3, '0')}.png`)]);
  console.log(join(out, `scout360-${tag}-sheet.png`));

  // The strike at four facings: a GIF, and a sheet of its key moments (a row per facing).
  const sc = await page.evaluate(([t, s]) => (window as unknown as Win).strikeClip(t as string, 'spartans', s as number), [type, 3] as const);
  const sf = join(tmp, 'strike');
  mkdirSync(sf);
  const rows: string[] = [];
  const keys = new Map(STRIKE_KEYS.map((k, i) => [k, i]));
  for (let t = 0, n = 0; t <= sc.length; t += 20, n++) {
    await page.evaluate((tt) => (window as unknown as Win).clipFrame(tt), t);
    await page.locator('#wrap').screenshot({ path: join(sf, `f${String(n).padStart(4, '0')}.png`) });
    const k = keys.get(t);
    if (k !== undefined) {
      for (const [j, p] of sc.pairs.entries()) {
        await page.screenshot({ path: join(sf, `k${j}-${k}.png`), clip: { x: p[0] - STRIKE_BOX.left * 3, y: p[1] - STRIKE_BOX.up * 3, width: (STRIKE_BOX.left + STRIKE_BOX.right) * 3, height: (STRIKE_BOX.up + STRIKE_BOX.down) * 3 } });
      }
    }
  }
  gif(join(sf, 'f%04d.png'), 50, join(out, `${type}-strike-${tag}.gif`));
  for (const j of sc.pairs.keys()) {
    const r = join(sf, `row${j}.png`);
    ff([...STRIKE_KEYS.flatMap((_, k) => ['-i', join(sf, `k${j}-${k}.png`)]), '-filter_complex', `${STRIKE_KEYS.map((_, k) => `[${k}:v]`).join('')}hstack=inputs=${STRIKE_KEYS.length}`, r]);
    rows.push(r);
  }
  ff([...rows.flatMap((r) => ['-i', r]), '-filter_complex', `${rows.map((_, i) => `[${i}:v]`).join('')}vstack=inputs=${rows.length}`, join(out, `${type}-strike-${tag}-keys.png`)]);
  console.log(join(out, `${type}-strike-${tag}-keys.png`));

  // The walk round a loop.
  const wc = await page.evaluate(([t, s]) => (window as unknown as Win).walkClip(t as string, 'spartans', s as number), [type, 4] as const);
  const wf = join(tmp, 'walk');
  mkdirSync(wf);
  for (let t = 0, n = 0; t <= wc.length; t += 40, n++) {
    await page.evaluate((tt) => (window as unknown as Win).clipFrame(tt), t);
    await page.locator('#wrap').screenshot({ path: join(wf, `f${String(n).padStart(4, '0')}.png`) });
  }
  gif(join(wf, 'f%04d.png'), 25, join(out, `${type}-walk-${tag}.gif`));
  console.log(join(out, `${type}-walk-${tag}.gif`));

  // A stretch of board at game zoom.
  await page.evaluate((s) => (window as unknown as Win).board(s), 2.5);
  await page.locator('#wrap').screenshot({ path: join(out, tag === 'after' ? 'board-scout.png' : `board-scout-${tag}.png`) });
} finally {
  rmSync(tmp, { recursive: true, force: true });
  await browser.close();
  await server.close();
}
