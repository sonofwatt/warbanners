// Shots of Gritty's 3D Hoplite (the detailed toon) and Catapult, rendered by the real units renderer in Chromium: each
// large, broken, every wear stage in a row, beside the Bright figures, the Hoplite's head close up and its crouch.
// Run: npx tsx scripts/hoplite3d-shots.ts <out dir>
// (The phone-size board in Gritty is shot by scripts/hoplite3d-board.ts, which needs `npx vite build` first.)
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { WEBGL_ARGS } from '../src/browser/harness';

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/hoplite3d';
mkdirSync(out, { recursive: true });

type W = { stage: 0 | 1 | 2 | 3 | 4; blood: 0 | 1 | 2; scarred: boolean };
const w = (stage: W['stage'], blood: W['blood'] = 0, scarred = false): W => ({ stage, blood, scarred });
const hop = (name: string, wear: W, faction: 'spartans' | 'mongols' = 'spartans', gritty = true, hunkered = false) => ({ type: 'hoplite', faction, gritty, wear, name, hunkered });

const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const addr = server.httpServer?.address();
const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
const browser = await chromium.launch({ args: WEBGL_ARGS });
try {
  const page = await browser.newPage({ viewport: { width: 3000, height: 1600 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(e));
  page.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/scripts/hoplite3d/sheet.html`);
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 60_000 });
  const run = async (name: string, cells: unknown[], scale: number, perRow: number, o: unknown = {}): Promise<void> => {
    await page.evaluate(([c, s, p, oo]) => (window as unknown as { hopliteSheet(c: unknown, s: number, p: number, o: unknown): void }).hopliteSheet(c, s as number, p as number, oo), [cells, scale, perRow, o] as const);
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await page.locator('#wrap').screenshot({ path: join(out, name) });
    console.log(join(out, name));
  };
  // Gritty's Hoplite (the detailed toon): large, broken, its stages, its head close up, beside the Bright one.
  await run('k-detailed-toon-large.png', [hop('', w(0))], 14, 1, { cellW: 46, rowH: 72 });
  await run('k2-detailed-toon-broken.png', [hop('', w(4, 2))], 14, 1, { cellW: 46, rowH: 72 });
  await run('k3-detailed-toon-stages.png', [
    hop('clean', w(0)), hop('scuffed', w(1)), hop('dented', w(2)), hop('battered', w(3)), hop('battered + blood', w(3, 1)),
    hop('broken + blood', w(4, 1)), hop('broken + more blood', w(4, 2)), hop('healed, scarred', w(1, 0, true)), hop('scarred, wounded again', w(3, 1, true)),
  ], 4.2, 9, { cellW: 40, rowH: 76 });
  await run('k5-helmet-close.png', [
    { ...hop('front', w(0)), aim: [-4, 30] }, hop('three-quarter', w(0)), { ...hop('broken, front', w(4, 2)), aim: [-4, 30] }, hop('scarred', w(1, 0, true)),
  ], 22, 4, { cellW: 22, rowH: 24, dy: -21 });
  await run('g-bright-vs-gritty-hoplite.png', [hop('Bright', w(0), 'spartans', false), hop('Gritty', w(0)), hop('Bright, broken', w(4, 2), 'spartans', false), hop('Gritty, broken', w(4, 2))], 7, 2, { cellW: 44, rowH: 74 });
  await run('e-sides-and-crouch.png', [
    hop('Spartans', w(0)), hop('Mongols', w(0), 'mongols'), hop('hunkered', w(0), 'spartans', true, true), hop('broken, hunkered', w(4, 2), 'mongols', true, true),
  ], 6, 4, { cellW: 40, rowH: 76 });
  await run('f-phone-scale.png', [
    hop('', w(0)), hop('', w(2), 'mongols'), hop('', w(4, 2)), { type: 'warrior', faction: 'mongols', gritty: true, wear: w(3, 1), name: '' }, { type: 'archer', faction: 'spartans', gritty: true, wear: w(1), name: '' },
  ], 1.6, 5, { cellW: 30, rowH: 70 });
  // The Catapult.
  const cat = (name: string, wear: W, faction: 'spartans' | 'mongols' = 'spartans', gritty = true) => ({ type: 'catapult', faction, gritty, wear, name });
  await run('h-gritty-catapult-large.png', [cat('', w(0))], 15, 1, { cellW: 46, rowH: 46 });
  await run('h2-catapult-broken-large.png', [cat('', w(4, 2))], 15, 1, { cellW: 46, rowH: 46 });
  await run('i-catapult-stages.png', [
    cat('clean', w(0)), cat('scuffed', w(1)), cat('dented', w(2)), cat('battered', w(3)), cat('battered + fire', w(3, 1)),
    cat('broken + fire', w(4, 1)), cat('broken + more fire', w(4, 2)), cat('mended (scarred)', w(1, 0, true)), cat('mended, hit again', w(3, 1, true)),
  ], 4.4, 9, { cellW: 46, rowH: 56 });
  await run('j-catapult-bright-vs-gritty.png', [cat('Bright (toon)', w(0), 'spartans', false), cat('Gritty', w(0))], 7, 2, { cellW: 52, rowH: 72, bright: true });
} finally {
  await browser.close();
  await server.close();
}
