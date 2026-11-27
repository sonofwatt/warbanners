// Shots of one unit type's Gritty 3D figure, rendered by the real units renderer in Chromium through Vite's dev
// server (scripts/gritty3d/sheet.ts draws them on a plain overcast ground).
//
// Run: npx tsx scripts/gritty3d-shots.ts <out dir> [type] [prefix] [closeDy] [faction]
//   type     a unit type (default hoplite), as in src/engine data (hoplite, catapult, warrior, horseArcher, ...)
//   prefix   the file names' prefix (default the type)
//   closeDy  how far up the close-up looks, in board units (default -21: a standing man's head; try -8 for a
//            catapult or a horse's back, -26 for a rider's head)
//   faction  spartans or mongols (default spartans; use mongols for the Mongol units)
// Writes, into <out dir>:
//   <prefix>-large.png         the figure large, clean, three-quarter view
//   <prefix>2-broken.png       the figure large, broken with the most blood
//   <prefix>3-stages.png       every wear look in a row: clean, scuffed, dented, battered, battered + blood, broken +
//                              blood, broken + more blood, healed and scarred, scarred and wounded again
//   <prefix>5-close.png        close up, each turned to face the viewer and then in its three-quarter rest: clean,
//                              broken and bleeding, healed and scarred
//   <prefix>6-bright-vs-gritty.png  the Bright figure beside the Gritty one, clean and broken
//   <prefix>7-sides-crouch.png both sides' colours, and the crouch, clean and broken
//   <prefix>8-phone.png        a row at phone scale beside two toon figures
// The phone-size board is shot by scripts/gritty3d-board.ts (it needs `npx vite build` first).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { WEBGL_ARGS } from '../src/browser/harness';

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/gritty3d';
const type = process.argv[3] ?? 'hoplite';
const prefix = process.argv[4] ?? type;
const closeDy = Number(process.argv[5] ?? -21);
const own = (process.argv[6] ?? 'spartans') as 'spartans' | 'mongols';
const other = own === 'spartans' ? 'mongols' : 'spartans';
mkdirSync(out, { recursive: true });

type W = { stage: 0 | 1 | 2 | 3 | 4; blood: 0 | 1 | 2; scarred: boolean };
const w = (stage: W['stage'], blood: W['blood'] = 0, scarred = false): W => ({ stage, blood, scarred });
const fig = (name: string, wear: W, faction: 'spartans' | 'mongols' = own, gritty = true, hunkered = false) => ({ type, faction, gritty, wear, name, hunkered });
/** Turned to face the viewer, as an attack turns a figure toward a target below it. */
const facing = <T extends object>(c: T): T & { aim: [number, number] } => ({ ...c, aim: [-4, 30] });

const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const addr = server.httpServer?.address();
const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
const browser = await chromium.launch({ args: WEBGL_ARGS });
try {
  const page = await browser.newPage({ viewport: { width: 3000, height: 1600 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(e));
  page.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/scripts/gritty3d/sheet.html`);
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 60_000 });
  const run = async (name: string, cells: unknown[], scale: number, perRow: number, o: unknown = {}): Promise<void> => {
    await page.evaluate(([c, s, p, oo]) => (window as unknown as { grittySheet(c: unknown, s: number, p: number, o: unknown): void }).grittySheet(c, s as number, p as number, oo), [cells, scale, perRow, o] as const);
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await page.locator('#wrap').screenshot({ path: join(out, name) });
    console.log(join(out, name));
  };
  await run(`${prefix}-large.png`, [fig('', w(0))], 14, 1, { cellW: 54, rowH: 72 });
  await run(`${prefix}2-broken.png`, [fig('', w(4, 2))], 14, 1, { cellW: 54, rowH: 72 });
  await run(`${prefix}3-stages.png`, [
    fig('clean', w(0)), fig('scuffed', w(1)), fig('dented', w(2)), fig('battered', w(3)), fig('battered + blood', w(3, 1)),
    fig('broken + blood', w(4, 1)), fig('broken + more blood', w(4, 2)), fig('healed, scarred', w(1, 0, true)), fig('scarred, wounded again', w(3, 1, true)),
  ], 4.2, 9, { cellW: 44, rowH: 76 });
  await run(`${prefix}5-close.png`, [
    facing(fig('clean, front', w(0))), fig('clean', w(0)), facing(fig('broken, front', w(4, 2))), fig('broken, bleeding', w(4, 2)),
    facing(fig('scarred, front', w(1, 0, true))), fig('healed, scarred', w(1, 0, true)),
  ], 20, 6, { cellW: 22, rowH: 26, dy: closeDy });
  await run(`${prefix}6-bright-vs-gritty.png`, [fig('Bright', w(0), own, false), fig('Gritty', w(0)), fig('Bright, broken', w(4, 2), own, false), fig('Gritty, broken', w(4, 2))], 7, 2, { cellW: 48, rowH: 74 });
  await run(`${prefix}7-sides-crouch.png`, [
    fig(own, w(0)), fig(other, w(0), other), fig('hunkered', w(0), own, true, true), fig('broken, hunkered', w(4, 2), other, true, true),
  ], 6, 4, { cellW: 44, rowH: 76 });
  await run(`${prefix}8-phone.png`, [
    fig('', w(0)), fig('', w(2), other), fig('', w(4, 2)), { type: 'warrior', faction: other, gritty: true, wear: w(3, 1), name: '' }, { type: 'archer', faction: own, gritty: true, wear: w(1), name: '' },
  ], 1.6, 5, { cellW: 34, rowH: 70 });
} finally {
  await browser.close();
  await server.close();
}
