// One unit's Gritty figure turned four ways (toward the viewer, the far side, away, and its rest pose), close up, to
// check every side of a figure for parts poking through each other.
//
// Run: npx tsx scripts/gritty3d-turns.ts <out dir> <name>.png <type> [dy] [scale] [stage] [blood]
//   dy     how far up the shot looks (default -12); scale its zoom (default 22); stage and blood the wear (default 0)
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { WEBGL_ARGS } from '../src/browser/harness';

const [out = '.', name = 'turns.png', type = 'knight'] = process.argv.slice(2, 5);
const dy = Number(process.argv[5] ?? -12), scale = Number(process.argv[6] ?? 22);
const wear = { stage: Number(process.argv[7] ?? 0), blood: Number(process.argv[8] ?? 0), scarred: false };
mkdirSync(out, { recursive: true });

const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const addr = server.httpServer?.address();
const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
const browser = await chromium.launch({ args: WEBGL_ARGS });
try {
  const page = await browser.newPage({ viewport: { width: 3000, height: 1600 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(e));
  await page.goto(`http://127.0.0.1:${port}/scripts/gritty3d/sheet.html`);
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 60_000 });
  const fig = (n: string, aim?: [number, number]) => ({ type, faction: 'spartans', gritty: true, wear, name: n, ...(aim ? { aim } : {}) });
  const cells = [fig('toward', [-4, 30]), fig('far side', [30, 0]), fig('away', [4, -30]), fig('rest')];
  await page.evaluate(([c, s, o]) => (window as unknown as { grittySheet(c: unknown, s: number, p: number, o: unknown): void }).grittySheet(c, s as number, 4, o), [cells, scale, { cellW: 30, rowH: 40, dy }] as const);
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.locator('#wrap').screenshot({ path: join(out, name) });
  console.log(join(out, name));
} finally {
  await browser.close();
  await server.close();
}
