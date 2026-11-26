// Clips and stills of the 3D figures' motion: walking, galloping, the trebuchet and camp on the move, and attacks
// (sword and block, a counter strike, spear, lance, bow, a rearing horse). Drawn by scripts/motion3d/sheet.ts on its
// own clock (real pace, 25 frames a second), through Vite's dev server in Chromium with software WebGL.
// Run: npx tsx scripts/motion3d-shots.ts [out dir] [clip names...]   (needs ffmpeg for the GIFs)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { WEBGL_ARGS } from '../src/browser/harness';

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/motion3d';
const only = process.argv.slice(3);
mkdirSync(out, { recursive: true });

/** The stills kept from each clip (ms), at the moments worth looking at. */
const STILLS: Record<string, number[]> = {
  walk: [280, 520, 640, 760],
  gallop: [360, 600, 760, 920],
  trebuchet: [600, 880, 1080],
  sword: [360, 400, 440, 520],
  counter: [440, 600, 680, 760],
  spear: [360, 440, 520],
  archer: [360, 440, 520, 560],
  lance: [360, 440, 520],
  rear: [360, 440, 480, 520],
};

const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const addr = server.httpServer?.address();
const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
const browser = await chromium.launch({ args: WEBGL_ARGS });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(e));
  await page.goto(`http://127.0.0.1:${port}/scripts/motion3d/sheet.html`);
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 60_000 });
  const names = await page.evaluate(() => (window as unknown as { motionClips(): string[] }).motionClips());
  for (const name of names) {
    if (only.length > 0 && !only.includes(name)) continue;
    const length = await page.evaluate((n) => (window as unknown as { motionClip(n: string, s: number): number }).motionClip(n, 3), name);
    const frames = mkdtempSync(join(tmpdir(), `motion3d-${name}-`));
    let n = 0;
    for (let t = 0; t <= length; t += 40) {
      await page.evaluate((tt) => (window as unknown as { motionFrame(t: number): void }).motionFrame(tt), t);
      const shot = await page.locator('#wrap').screenshot({ path: join(frames, `f${String(n).padStart(4, '0')}.png`) });
      void shot;
      for (const keep of STILLS[name] ?? []) {
        if (t === keep) await page.locator('#wrap').screenshot({ path: join(out, `${name}-${String(t).padStart(4, '0')}ms.png`) });
      }
      n++;
    }
    const gif = join(out, `${name}.gif`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '25', '-i', join(frames, 'f%04d.png'),
      '-vf', 'scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer', gif]);
    console.log(gif);
    rmSync(frames, { recursive: true, force: true });
  }
} finally {
  await browser.close();
  await server.close();
}
