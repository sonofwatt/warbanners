// Shots of the 3D unit figures' facing: a sheet per unit (rest and the six hex directions of a move), a sheet of
// every unit type, and a clip of moves, an attack, a trebuchet's throw and a hunker as frames and a GIF.
// Run: npx tsx scripts/facing3d-shots.ts <out dir>   (needs ffmpeg for the GIF)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { WEBGL_ARGS } from '../src/browser/harness';
import { ALL_TYPES } from '../src/ui/terrain3d/units/figures';

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/facing3d';
mkdirSync(out, { recursive: true });

type Row = { type: string; faction: 'spartans' | 'mongols'; hero?: boolean; name: string };
const ROWS: Record<string, Row> = {
  footman: { type: 'hoplite', faction: 'spartans', name: 'hoplite' },
  warrior: { type: 'warrior', faction: 'mongols', name: 'warrior' },
  archer: { type: 'archer', faction: 'mongols', name: 'archer' },
  mounted: { type: 'knight', faction: 'spartans', name: 'knight' },
  horseArcher: { type: 'horseArcher', faction: 'mongols', name: 'horse archer' },
  trebuchet: { type: 'catapult', faction: 'spartans', name: 'trebuchet' },
  hero: { type: 'kingsGuard', faction: 'spartans', hero: true, name: "king's guard (hero)" },
  champion: { type: 'khansGuard', faction: 'mongols', hero: true, name: "khan's guard (hero)" },
};

const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const addr = server.httpServer?.address();
const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
const browser = await chromium.launch({ args: WEBGL_ARGS });
try {
  const page = await browser.newPage({ viewport: { width: 2900, height: 1500 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(e));
  await page.goto(`http://127.0.0.1:${port}/scripts/facing3d/sheet.html`);
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 60_000 });
  const shoot = async (name: string): Promise<void> => {
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await page.locator('#wrap').screenshot({ path: join(out, name) });
    console.log(join(out, name));
  };
  for (const [name, row] of Object.entries(ROWS)) {
    await page.evaluate((r) => (window as unknown as { facingSheet(rows: unknown[], s: number): void }).facingSheet([r], 3.2), row);
    await shoot(`facing-${name}.png`);
  }
  const all = ALL_TYPES.map((type, i) => ({ type, faction: i % 2 === 0 ? 'spartans' : 'mongols', name: type }));
  await page.evaluate((r) => (window as unknown as { facingSheet(rows: unknown[], s: number): void }).facingSheet(r, 1.3), all);
  await shoot('facing-all-types.png');

  // The clip, frame by frame at 25 frames a second.
  const frames = mkdtempSync(join(tmpdir(), 'facing3d-'));
  const length = await page.evaluate(() => (window as unknown as { facingClip(s: number): number }).facingClip(2.4));
  let n = 0;
  for (let t = 0; t <= length; t += 40) {
    await page.evaluate((tt) => (window as unknown as { facingFrame(t: number): void }).facingFrame(tt), t);
    await page.locator('#wrap').screenshot({ path: join(frames, `f${String(n).padStart(4, '0')}.png`) });
    for (const keep of [280, 1000, 1680, 2120, 2640, 2800, 3520, 4280]) {
      if (t === keep) await page.locator('#wrap').screenshot({ path: join(out, `clip-${String(t).padStart(4, '0')}ms.png`) });
    }
    n++;
  }
  const gif = join(out, 'facing-clip.gif');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '25', '-i', join(frames, 'f%04d.png'),
    '-vf', 'scale=560:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer', gif]);
  console.log(gif);
  rmSync(frames, { recursive: true, force: true });
} finally {
  await browser.close();
  await server.close();
}
