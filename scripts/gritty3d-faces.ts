// Close-ups of the Gritty bare faces, for face work: for each type, front and three-quarter, clean (or broken, for a
// helmed unit whose face shows only then), bleeding, and healed with the scar.
//
// Run: npx tsx scripts/gritty3d-faces.ts <out dir> <name>.png <type[:dy[:stage]]>...
//   dy     how far up the close-up looks (default -21 for a standing man; about -26 for a rider)
//   stage  the wear stage of the clean and scarred cells (default 0; use 4 for a face hidden behind a helm until broken)
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { WEBGL_ARGS } from '../src/browser/harness';

const out = process.argv[2] ?? '.';
const name = process.argv[3] ?? 'faces.png';
const specs = process.argv.slice(4).map((s) => {
  const [type, dy, stage] = s.split(':');
  return { type: type!, dy: Number(dy ?? -21), stage: Number(stage ?? 0) as 0 | 4 };
});
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
  for (const [i, s] of specs.entries()) {
    const fig = (n: string, wear: object, aim = false) => ({ type: s.type, faction: 'spartans', gritty: true, wear, name: n, ...(aim ? { aim: [-4, 30] } : {}) });
    const cells = [
      fig(`${s.type}, front`, { stage: s.stage, blood: 0, scarred: false }, true), fig('three-quarter', { stage: s.stage, blood: 0, scarred: false }),
      fig('bleeding, front', { stage: 4, blood: 2, scarred: false }, true),
      fig('scarred, front', { stage: s.stage === 4 ? 1 : s.stage, blood: 0, scarred: true }, true), fig('scarred', { stage: s.stage === 4 ? 1 : s.stage, blood: 0, scarred: true }),
    ];
    await page.evaluate(([c, o]) => (window as unknown as { grittySheet(c: unknown, s: number, p: number, o: unknown): void }).grittySheet(c, 36, 5, o), [cells, { cellW: 14, rowH: 16, dy: s.dy }] as const);
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const file = join(out, specs.length > 1 ? name.replace(/\.png$/, `-${i}-${s.type}.png`) : name);
    await page.locator('#wrap').screenshot({ path: file });
    console.log(file);
  }
} finally {
  await browser.close();
  await server.close();
}
