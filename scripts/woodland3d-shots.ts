// Shots of the Woodland Nations' 3D figures (rules 11), standing and hunkered, close up and at the board's scale on a
// phone, in their own colour and in a Spartan player's. Drawn by scripts/hunker3d/sheet.ts through Vite's dev server
// in Chromium with software WebGL.
// Run: npx tsx scripts/woodland3d-shots.ts [out dir]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { WEBGL_ARGS } from '../src/browser/harness';

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/woodland3d';
mkdirSync(out, { recursive: true });
const BOARD = (64 / 52) * 2.6;
const CLOSE = 6;
const TYPES = ['skirmisher', 'woodlandHunter', 'warChief', 'smokeKeeper', 'trapper'];

type W = Window & { hunkerSheet(cells: unknown[], scale: number, perRow: number): void };

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
  for (const faction of ['woodland', 'spartans']) {
    const cells = TYPES.map((type) => ({ type, faction, name: type }));
    await page.evaluate(([c, s]) => (window as unknown as W).hunkerSheet(c as unknown[], s as number, 5), [cells, CLOSE] as const);
    await shoot(join(out, `${faction}-close.png`));
  }
  const cells = TYPES.map((type, i) => ({ type, faction: i % 2 === 0 ? 'woodland' : 'mongols', name: type }));
  await page.evaluate(([c, s]) => (window as unknown as W).hunkerSheet(c as unknown[], s as number, 5), [cells, BOARD] as const);
  await shoot(join(out, 'board.png'));
} finally {
  await browser.close();
  await server.close();
}
