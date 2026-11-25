// The svg look's hunker, before and after: every unit type on a tile, standing and hunkered, drawn the way the
// board draws a unit (Board.tsx UnitViewOf: the crouch group round the figure, then the status plate with its hunker
// mark), with the crouch rules taken from theme.css, at the board's default zoom on a phone (64 css pixels a tile,
// device pixel ratio 2.6) and close up. `before` leaves the crouch out (main today: the mark only).
// Run: npx tsx scripts/hunker3d-svg.ts [out dir]
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement as h } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { UNITS } from '../src/engine';
import type { UnitTypeId } from '../src/engine';
import { FIGURES } from '../src/ui/art/factionUnits';
import { ACCENT, playerColour } from '../src/ui/art/palette';
import { TileBase } from '../src/ui/art/tiles';
import { StatusOverlay } from '../src/ui/art/units';

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/hunker3d';
mkdirSync(out, { recursive: true });

// The crouch rules exactly as the app has them (not the reduced-motion block).
const css = readFileSync('src/ui/theme.css', 'utf8').split('\n').filter((l) => l.startsWith('.unit-crouch')).join('\n');

const types = Object.keys(UNITS) as UnitTypeId[];
const W = 104, HH = 86;
function cell(type: UnitTypeId, i: number, hunkered: boolean, crouch: boolean): ReactElement {
  const f = i % 2 === 0 ? 'spartans' : 'mongols';
  return h('g', { transform: `translate(${(hunkered ? 1 : 0) * 54} 0)`, key: `${type}${hunkered}` },
    h(TileBase, { ground: 'grass' } as never),
    h('g', { className: crouch && hunkered ? 'unit-crouch hunkered' : 'unit-crouch' },
      FIGURES[type]({ colour: playerColour(f), accent: ACCENT[f] })),
    h(StatusOverlay, { hp: 10, maxHp: 10, spent: false, fresh: false, taunted: false, blinded: false, hunkered }));
}
function sheet(crouch: boolean, scale: number): string {
  const per = 6, rows = Math.ceil(types.length / per);
  const vw = per * W, vh = rows * HH;
  const svg = h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: vw * scale, height: vh * scale, viewBox: `-30 -50 ${vw} ${vh}` },
    types.map((t, i) => h('g', { key: t, transform: `translate(${(i % per) * W} ${Math.floor(i / per) * HH})` },
      cell(t, i, false, crouch), cell(t, i, true, crouch),
      h('text', { x: 27, y: 28, fontSize: 6, textAnchor: 'middle', fill: '#1b2414' }, t))));
  return `<!doctype html><html><head><style>html,body{margin:0;background:#6f8f4e}${css}</style></head><body>${renderToStaticMarkup(svg)}</body></html>`;
}

const browser = await chromium.launch();
try {
  for (const [name, scale] of [['board', 64 / 52], ['close', 4]] as const) {
    for (const crouch of [false, true]) {
      const page = await browser.newPage({ deviceScaleFactor: name === 'board' ? 2.6 : 1, viewport: { width: 2600, height: 1400 } });
      await page.setContent(sheet(crouch, scale));
      const path = join(out, `svg-${crouch ? 'after' : 'before'}-${name}.png`);
      await page.locator('svg').screenshot({ path });
      console.log(path);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
