// GIFs of the spear jab and the couched lance in the 3D look (and a sword swing to compare), at two facings, and a
// contact sheet of the jab's key frames for each spear unit. Drawn by scripts/spearjab/sheet.ts on its own clock
// (real pace, 50 frames a second), through Vite's dev server in Chromium with software WebGL.
// Run: npx tsx scripts/spearjab-shots.ts [out dir] [clip names...]   (needs ffmpeg)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { WEBGL_ARGS } from '../src/browser/harness';

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/spearjab';
const only = process.argv.slice(3);
mkdirSync(out, { recursive: true });

const SCALE = 3;
const STEP_MS = 20;
const START = 300;
const STRIKE_MS = 450;
/** The jab's key phases for the contact sheet: rest, drawn back, driving, the hit, the hold, pulling back, near rest. */
const KEYS = [0, 0.15, 0.22, 0.3, 0.42, 0.62, 0.85];
/** The box round an attacker kept for the contact sheet (board units, about its tile centre). */
const BOX = { left: 34, right: 70, up: 62, down: 22 };

type Win = { jabClip(n: string, s: number): { length: number; pairs: { a: [number, number] }[] }; jabFrame(t: number): void; jabClips(): string[] };

const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const addr = server.httpServer?.address();
const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
const browser = await chromium.launch({ args: WEBGL_ARGS });
const tmp = mkdtempSync(join(tmpdir(), 'spearjab-'));
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(e));
  await page.goto(`http://127.0.0.1:${port}/scripts/spearjab/sheet.html`);
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 60_000 });
  const names = await page.evaluate(() => (window as unknown as Win).jabClips());
  const rows: string[] = [];
  for (const name of names) {
    if (only.length > 0 && !only.includes(name)) continue;
    const c = await page.evaluate(([n, s]) => (window as unknown as Win).jabClip(n as string, s as number), [name, SCALE] as const);
    const frames = join(tmp, name);
    mkdirSync(frames);
    const keyAt = new Map(KEYS.map((k, i) => [Math.round((START + k * STRIKE_MS) / STEP_MS) * STEP_MS, i]));
    const keys: string[] = [];
    let n = 0;
    for (let t = 0; t <= c.length; t += STEP_MS) {
      await page.evaluate((tt) => (window as unknown as Win).jabFrame(tt), t);
      await page.locator('#wrap').screenshot({ path: join(frames, `f${String(n).padStart(4, '0')}.png`) });
      const k = keyAt.get(t);
      if (k !== undefined && name !== 'warrior') {
        // Both facings of the attacker at this phase, side by side.
        for (const [j, p] of c.pairs.entries()) {
          const clip = { x: p.a[0] - BOX.left * SCALE, y: p.a[1] - BOX.up * SCALE, width: (BOX.left + BOX.right) * SCALE, height: (BOX.up + BOX.down) * SCALE };
          if (j === 1) { clip.x = p.a[0] - BOX.right * SCALE; }
          const f = join(frames, `k${k}-${j}.png`);
          await page.screenshot({ path: f, clip });
          keys.push(f);
        }
      }
      n++;
    }
    const gif = join(out, `${name}.gif`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(1000 / STEP_MS), '-i', join(frames, 'f%04d.png'),
      '-vf', 'split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', gif]);
    console.log(gif);
    if (keys.length > 0) {
      // One row per facing: the key phases left to right.
      for (const j of [0, 1]) {
        const row = join(tmp, `${name}-row${j}.png`);
        const ins = KEYS.flatMap((_, k) => ['-i', join(frames, `k${k}-${j}.png`)]);
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...ins, '-filter_complex', `${KEYS.map((_, k) => `[${k}:v]`).join('')}hstack=inputs=${KEYS.length}`, row]);
        rows.push(row);
      }
      const own = join(out, `${name}-keys.png`);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', rows.at(-2)!, '-i', rows.at(-1)!, '-filter_complex', '[0:v][1:v]vstack=inputs=2', own]);
      console.log(own);
    }
  }
  if (rows.length > 0 && only.length === 0) {
    const sheet = join(out, 'jab-key-frames.png');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...rows.flatMap((r) => ['-i', r]), '-filter_complex', `${rows.map((_, i) => `[${i}:v]`).join('')}vstack=inputs=${rows.length}`, sheet]);
    console.log(sheet);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
  await browser.close();
  await server.close();
}
