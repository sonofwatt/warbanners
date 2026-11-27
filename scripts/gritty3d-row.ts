// A row sheet of Gritty 3D figures side by side at one scale, rendered by the real units renderer in Chromium through
// Vite's dev server (scripts/gritty3d/sheet.ts draws them on a plain overcast ground).
//
// Run: npx tsx scripts/gritty3d-row.ts <out dir> [name] [cells] [scale] [perRow] [dy]
//   name    the file (default all-units-row.png)
//   cells   default: every unit type with a Gritty figure, clean, each in its own side's colour (the shared ones in
//           the Spartans', the horseman in the Mongols', whose start unit he is). Or a comma-separated list of
//           type[:faction[:stage[:blood[:scarred]]]], e.g. archer:mongols:4:2,scout::1:0:s
//   scale   pixels per board unit (default 3.2); perRow (default all in one row); dy: how far up it looks (default 0)
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { WEBGL_ARGS } from '../src/browser/harness';

type Faction = 'spartans' | 'mongols';
type W = { stage: 0 | 1 | 2 | 3 | 4; blood: 0 | 1 | 2; scarred: boolean };
interface Cell { type: string; faction: Faction; gritty: true; wear: W; name: string }

/** Every Gritty figure, Spartans' own first, then the shared ones, then the Mongols' own. */
const ALL: readonly [string, Faction, string][] = [
  ['hoplite', 'spartans', 'Hoplite'], ['kingsGuard', 'spartans', "King's Guard"], ['piper', 'spartans', 'Piper'], ['scout', 'spartans', 'Scout'],
  ['warrior', 'spartans', 'Warrior'], ['spearman', 'spartans', 'Spearman'], ['swordsman', 'spartans', 'Swordsman'], ['defender', 'spartans', 'Defender'],
  ['sellsword', 'spartans', 'Sellsword'], ['archer', 'spartans', 'Archer'], ['catapult', 'spartans', 'Catapult'], ['knight', 'spartans', 'Knight'],
  ['horseman', 'mongols', 'Horseman'], ['horseArcher', 'mongols', 'Horse archer'], ['khansGuard', 'mongols', "Khan's Guard"],
  ['skyCaller', 'mongols', 'Sky caller'], ['camp', 'mongols', 'Camp'],
];

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/gritty3d';
const name = process.argv[3] ?? 'all-units-row.png';
const spec = process.argv[4] ?? '';
const scale = Number(process.argv[5] ?? 3.2);
const dy = Number(process.argv[7] ?? 0);
const cells: Cell[] = spec === ''
  ? ALL.map(([type, faction, label]) => ({ type, faction, gritty: true, wear: { stage: 0, blood: 0, scarred: false }, name: label }))
  : spec.split(',').map((c) => {
    const [type, f, st, bl, sc] = c.split(':');
    const faction: Faction = f === 'mongols' ? 'mongols' : 'spartans';
    const wear: W = { stage: Number(st ?? 0) as W['stage'], blood: Number(bl ?? 0) as W['blood'], scarred: sc === 's' };
    return { type: type!, faction, gritty: true, wear, name: `${type} ${faction === 'mongols' ? 'M' : 'S'}${st ? ` ${st}/${bl ?? 0}${sc === 's' ? 's' : ''}` : ''}` };
  });
const perRow = Number(process.argv[6] ?? cells.length);
mkdirSync(out, { recursive: true });

const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const addr = server.httpServer?.address();
const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
const browser = await chromium.launch({ args: WEBGL_ARGS });
try {
  const page = await browser.newPage({ viewport: { width: 4000, height: 2400 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(e));
  page.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/scripts/gritty3d/sheet.html`);
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 60_000 });
  await page.evaluate(([c, s, p, oo]) => (window as unknown as { grittySheet(c: unknown, s: number, p: number, o: unknown): void }).grittySheet(c, s as number, p as number, oo), [cells, scale, perRow, { cellW: 40, rowH: 62, dy }] as const);
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.locator('#wrap').screenshot({ path: join(out, name) });
  console.log(join(out, name));
} finally {
  await browser.close();
  await server.close();
}
