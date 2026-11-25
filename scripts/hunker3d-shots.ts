// Shots of the 3D figures' hunker crouch: every unit type standing and hunkered, at the board's scale on a phone and
// close up, and clips (GIF and stills) of a hoplite hunkering and standing up again and of a block from the crouch.
// Drawn by scripts/hunker3d/sheet.ts through Vite's dev server in Chromium with software WebGL.
// Run: npx tsx scripts/hunker3d-shots.ts [out dir] [only: sheets | clips]   (needs ffmpeg for the GIFs)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { WEBGL_ARGS } from '../src/browser/harness';
import { ALL_TYPES } from '../src/ui/terrain3d/units/figures';

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/hunker3d';
const only = process.argv[3];
mkdirSync(out, { recursive: true });

/**
 * Pixels per board unit: a match opens with a tile 64 css pixels wide (camera.ts DEFAULT_TILE_PX, a tile is 52 board
 * units), drawn at the device pixel ratio of a phone (about 2.6), so about 3.2 device pixels per board unit.
 */
const BOARD = (64 / 52) * 2.6;
const CLOSE = 6;

type W = Window & {
  hunkerSheet(cells: unknown[], scale: number, perRow: number): void;
  hunkerClip(scale: number, types: string[]): number;
  blockClip(scale: number): number;
  hunkerFrame(t: number): void;
};

const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const addr = server.httpServer?.address();
const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
const browser = await chromium.launch({ args: WEBGL_ARGS });
try {
  const page = await browser.newPage({ viewport: { width: 4000, height: 2400 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(e));
  await page.goto(`http://127.0.0.1:${port}/scripts/hunker3d/sheet.html`);
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 60_000 });
  const shoot = async (path: string): Promise<void> => {
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await page.locator('#wrap').screenshot({ path });
    console.log(path);
  };
  const cells = ALL_TYPES.map((type, i) => ({ type, faction: i % 2 === 0 ? 'spartans' : 'mongols', name: type }));
  const heroes = [
    { type: 'kingsGuard', faction: 'spartans', hero: true, name: "king's guard (hero)" },
    { type: 'khansGuard', faction: 'mongols', hero: true, name: "khan's guard (hero)" },
    { type: 'hoplite', faction: 'spartans', hero: true, name: 'hoplite (hero)' },
    { type: 'archer', faction: 'mongols', hero: true, name: 'archer (hero)' },
  ];
  if (only === undefined || only === 'sheets') {
    await page.evaluate(([c, s]) => (window as unknown as W).hunkerSheet(c as unknown[], s as number, 6), [cells, BOARD] as const);
    await shoot(join(out, 'all-types-board.png'));
    await page.evaluate(([c, s]) => (window as unknown as W).hunkerSheet(c as unknown[], s as number, 6), [cells, CLOSE] as const);
    await shoot(join(out, 'all-types-close.png'));
    await page.evaluate(([c, s]) => (window as unknown as W).hunkerSheet(c as unknown[], s as number, 4), [heroes, CLOSE] as const);
    await shoot(join(out, 'heroes-close.png'));
  }
  if (only === undefined || only === 'clips') {
    const clips: [string, () => Promise<number>, number[]][] = [
      ['hoplite', () => page.evaluate((s) => (window as unknown as W).hunkerClip(s, ['hoplite']), CLOSE), [280, 480, 1200, 1720, 2000]],
      ['line', () => page.evaluate((s) => (window as unknown as W).hunkerClip(s, ['hoplite', 'archer', 'knight', 'swordsman', 'catapult']), BOARD), [280, 1200]],
      ['block', () => page.evaluate((s) => (window as unknown as W).blockClip(s), CLOSE), [400, 560, 640, 800, 1400, 2000]],
    ];
    for (const [name, start, stills] of clips) {
      const length = await start();
      const frames = mkdtempSync(join(tmpdir(), `hunker3d-${name}-`));
      let n = 0;
      for (let t = 0; t <= length; t += 40) {
        await page.evaluate((tt) => (window as unknown as W).hunkerFrame(tt), t);
        await page.locator('#wrap').screenshot({ path: join(frames, `f${String(n).padStart(4, '0')}.png`) });
        if (stills.includes(t)) await page.locator('#wrap').screenshot({ path: join(out, `clip-${name}-${String(t).padStart(4, '0')}ms.png`) });
        n++;
      }
      const gif = join(out, `clip-${name}.gif`);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '25', '-i', join(frames, 'f%04d.png'),
        '-vf', 'scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer', gif]);
      console.log(gif);
      rmSync(frames, { recursive: true, force: true });
    }
  }
} finally {
  await browser.close();
  await server.close();
}
