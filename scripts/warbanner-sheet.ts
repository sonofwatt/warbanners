// The war banner of every unit type, drawn as the board draws a unit (Board.tsx UnitViewOf: the figure in its shade
// group, then the banner with its marks and the item badge), with the shade rules taken from theme.css. One row per
// type: Spartans at full health, Mongols damaged, a hero, spent, and for the scout its hidden eye (fresh and spent).
// A last row shows the marks round a banner. Close up (4 px a board unit) and at the board's opening zoom on a phone
// (64 css px a tile, device pixel ratio 2.6).
// Run: npx tsx scripts/warbanner-sheet.ts [out dir]
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement as h } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { UNITS } from '../src/engine';
import type { FactionId, ItemId, UnitTypeId } from '../src/engine';
import { WarBanner } from '../src/ui/art/banner';
import { FIGURES } from '../src/ui/art/factionUnits';
import { HeroMark, ItemBadge, itemBadgeX } from '../src/ui/art/hero';
import { ACCENT, playerColour } from '../src/ui/art/palette';
import { TileBase } from '../src/ui/art/tiles';

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/warbanner';
mkdirSync(out, { recursive: true });
const css = readFileSync('src/ui/theme.css', 'utf8').split('\n').filter((l) => l.startsWith('.unit-shade')).join('\n');

interface Cell { type: UnitTypeId; f: FactionId; hp?: number; hero?: boolean; spent?: boolean; hidden?: boolean; fresh?: boolean; taunted?: boolean; blinded?: boolean; hunkered?: boolean; item?: ItemId; label: string }
function unit(c: Cell): ReactElement {
  const maxHp = UNITS[c.type].hp;
  const colour = playerColour(c.f);
  const shade = c.spent === true ? 'unit-shade spent' : 'unit-shade';
  return h('g', null,
    h(TileBase, { ground: 'grass' } as never),
    h('g', { className: shade }, c.hero === true ? h(HeroMark, { accent: ACCENT[c.f] }) : null, FIGURES[c.type]({ colour, accent: ACCENT[c.f] })),
    h(WarBanner, {
      type: c.type, colour, hp: c.hp ?? maxHp, maxHp, spent: c.spent === true, fresh: c.fresh === true, taunted: c.taunted === true,
      blinded: c.blinded === true, hunkered: c.hunkered, hero: c.hero, hidden: c.hidden,
    }),
    c.item !== undefined ? h('g', { transform: `translate(${itemBadgeX(maxHp, c.fresh === true || c.hunkered === true, c.hidden === true)} 0)` }, h(ItemBadge, { item: c.item })) : null,
    h('text', { x: 0, y: 26, fontSize: 5.5, textAnchor: 'middle', fill: '#1b2414', fontFamily: 'sans-serif' }, c.label));
}

const types = Object.keys(UNITS) as UnitTypeId[];
const rows: Cell[][] = types.map((t) => {
  const own: FactionId = t === 'khansGuard' || t === 'skyCaller' || t === 'camp' || t === 'horseArcher' ? 'mongols' : 'spartans';
  const other: FactionId = own === 'spartans' ? 'mongols' : 'spartans';
  const hp = UNITS[t].hp;
  const row: Cell[] = [
    { type: t, f: own, label: `${t}` },
    { type: t, f: other, hp: Math.max(1, Math.round(hp * 0.45)), label: 'damaged' },
    { type: t, f: own, hero: true, label: 'hero' },
    { type: t, f: own, spent: true, hp: Math.max(1, hp - 5), label: 'spent' },
  ];
  if (t === 'scout') row.push({ type: t, f: own, hidden: true, label: 'hidden' }, { type: t, f: own, hidden: true, spent: true, label: 'hidden, spent' });
  return row;
});
rows.push([
  { type: 'spearman', f: 'spartans', taunted: true, blinded: true, label: 'taunted, blinded' },
  { type: 'archer', f: 'mongols', fresh: true, label: 'new' },
  { type: 'hoplite', f: 'spartans', hunkered: true, hp: 9, label: 'hunkered' },
  { type: 'defender', f: 'spartans', hero: true, item: 'draught', fresh: true, label: 'hero, draught, new' },
  { type: 'warrior', f: 'mongols', item: 'draught', spent: true, label: 'draught, spent' },
]);

const W = 84, HH = 84;
function sheet(scale: number): string {
  const per = 6;
  const vw = per * W, vh = rows.length * HH;
  const svg = h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: vw * scale, height: vh * scale, viewBox: `-42 -56 ${vw} ${vh}` },
    rows.map((r, j) => h('g', { key: j, transform: `translate(0 ${j * HH})` }, r.map((c, i) => h('g', { key: i, transform: `translate(${i * W} 0)` }, unit(c))))));
  return `<!doctype html><html><head><style>html,body{margin:0;background:#6f8f4e}${css}</style></head><body>${renderToStaticMarkup(svg)}</body></html>`;
}

const browser = await chromium.launch();
try {
  for (const [name, scale, dpr] of [['close', 4, 1], ['board', 64 / 52, 2.6]] as const) {
    const page = await browser.newPage({ deviceScaleFactor: dpr, viewport: { width: 2100, height: 1400 } });
    await page.setContent(sheet(scale));
    await page.waitForTimeout(400);
    const path = join(out, `banners-${name}.png`);
    await page.locator('svg').screenshot({ path });
    console.log(path);
    await page.close();
  }
} finally {
  await browser.close();
}
