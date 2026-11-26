// The unit emblem proposal (src/ui/art/emblems.tsx), drawn three ways for David to judge:
//   emblems-sheet.png  all 17 at about 160 px, by group, in a faction colour per group (shared ones in a neutral blue);
//   emblems-gold.png   the same in gold on black;
//   skycaller-crown.png  the Sky Caller's feather crown, full and small form, large, at badge size and at 3x;
//   banner-sizes.png   two ways onto the war banner, on a unit on grass, at the board's opening zoom on a phone
//                      (64 css px a tile, as scripts/warbanner-sheet.ts) and at 3x that.
// Run: npx tsx scripts/emblems-sheets.ts [out dir]
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement as h } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { UNITS } from '../src/engine';
import type { FactionId, UnitTypeId } from '../src/engine';
import { BANNER_H, BANNER_MID, PIP_H, PLATE, WarBanner } from '../src/ui/art/banner';
import { Emblem, EMBLEM_R, GOLD_PAINT, emblemPaint } from '../src/ui/art/emblems';
import type { EmblemPaint } from '../src/ui/art/emblems';
import { FIGURES } from '../src/ui/art/factionUnits';
import { ACCENT, playerColour } from '../src/ui/art/palette';
import { TileBase } from '../src/ui/art/tiles';
import { T } from '../src/ui/text';

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/emblems';
mkdirSync(out, { recursive: true });
const css = readFileSync('src/ui/theme.css', 'utf8').split('\n').filter((l) => l.startsWith('.unit-shade')).join('\n');

const NEUTRAL = { main: '#5B7FA6', dark: '#3B5A7E' };
const GROUPS: { title: string; faction: FactionId | null; types: [UnitTypeId, string][] }[] = [
  {
    title: 'Shared', faction: null, types: [
      ['warrior', 'Bearded head in a round cap; hand axe'],
      ['spearman', 'Open pointed helmet with cheek guards; broad spear point'],
      ['swordsman', 'Legionary helmet, upright crest, neck guard; short sword'],
      ['defender', 'Round helmet behind a tall curved scutum'],
      ['archer', 'Peaked cap with a long feather; drawn bow and arrow'],
      ['horseman', 'Horse head and mane breaking the top; spear'],
      ['knight', 'Flat-topped great helm, eye slit, plume; lance and pennant'],
      ['catapult', 'Throwing arm and stone over the frame; spoked wheel'],
      ['sellsword', 'Kettle hat over a scarred face; sword across a coin stack'],
    ],
  },
  {
    title: 'Spartans', faction: 'spartans', types: [
      ['hoplite', 'Corinthian helmet, horsehair crest; round shield with lambda'],
      ['kingsGuard', 'Helmet with a coronet in profile; heater shield with a crown'],
      ['piper', 'Laurel wreath; the twin pipes of an aulos'],
      ['scout', 'Pointed hood, shadowed face, one eye lit; dagger point down'],
    ],
  },
  {
    title: 'Mongols', faction: 'mongols', types: [
      ['horseArcher', 'Horse head with plume and throat tassel; recurve bow'],
      ['khansGuard', 'Spiked steppe helmet, fur brim, mail neck guard; horsetail standard'],
      ['skyCaller', 'Fan of five feathers, fringe over the eyes; staff with ribbons and a bolt'],
      ['camp', 'Felt tent roof and smoke ring; campfire'],
    ],
  },
];

const svg = (type: UnitTypeId, paint: EmblemPaint, px: number, small = false): string =>
  renderToStaticMarkup(h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: px, height: px, viewBox: '-54 -56 108 108' }, h(Emblem, { type, paint, small })));

function sheet(gold: boolean): string {
  const bg = gold ? '#0B0A09' : '#EFE8DA';
  const fg = gold ? '#E9D9B4' : '#2A2520';
  const sub = gold ? '#A89A80' : '#6A6156';
  const groups = GROUPS.map((g) => {
    const paint = gold ? GOLD_PAINT : emblemPaint(g.faction === null ? NEUTRAL : playerColour(g.faction));
    const cells = g.types.map(([t, what]) => `<div class="cell">${svg(t, paint, 160)}<b>${T.unit[t].name}</b><span>${what}</span></div>`).join('');
    return `<h2>${g.title}</h2><div class="row">${cells}</div>`;
  }).join('');
  return `<!doctype html><html><head><style>
    body{margin:0;padding:20px 24px;background:${bg};color:${fg};font-family:sans-serif;width:1060px}
    h1{font-size:20px;margin:0 0 4px} h2{font-size:16px;margin:18px 0 6px;border-bottom:1px solid ${sub}55;padding-bottom:4px}
    .row{display:flex;flex-wrap:wrap;gap:6px 10px} .cell{width:200px;display:flex;flex-direction:column;align-items:center;text-align:center}
    b{font-size:14px;margin-top:2px} span{font-size:11.5px;color:${sub};line-height:1.3;min-height:30px}
    </style></head><body><h1>Unit emblems${gold ? ', gold on black' : ''}</h1>${groups}</body></html>`;
}

// ---- the banner mock-ups ----

const PIP_W = 3.4, PIP_GAP = 0.8, INSET = 0.9, END = 2.8, NOTCH = 2.4, EDGE = 0.8;
const pipCount = (maxHp: number): number => Math.max(1, Math.ceil(maxHp / 5));

/** A flag from x `l` to `r` round the banner's middle, with a swallowtail on the right; `round` rounds the left end. */
function flag(l: number, r: number, round: boolean): string {
  const t = BANNER_MID - BANNER_H / 2, b = BANNER_MID + BANNER_H / 2, c = round ? 1.4 : 0;
  return `M ${l + c} ${t} L ${r} ${t} L ${r - NOTCH} ${BANNER_MID} L ${r} ${b} L ${l + c} ${b} Q ${l} ${b} ${l} ${b - c} L ${l} ${t + c} Q ${l} ${t} ${l + c} ${t} Z`;
}
function pips(x: number, maxHp: number, hp: number): ReactElement[] {
  const n = pipCount(maxHp), full = Math.ceil(hp / 5);
  const y = BANNER_MID - PIP_H / 2;
  const w = n * PIP_W + (n - 1) * PIP_GAP;
  return [
    h('rect', { key: 'plate', x, y: y - INSET, width: w + 2 * INSET, height: PIP_H + 2 * INSET, rx: 1.2, fill: PLATE }),
    ...Array.from({ length: n }, (_, i) => h('rect', { key: i, x: x + INSET + i * (PIP_W + PIP_GAP), y, width: PIP_W, height: PIP_H, rx: 0.8, fill: i < full ? '#7BD957' : '#5E5A52' })),
  ];
}
const pipsW = (maxHp: number): number => pipCount(maxHp) * (PIP_W + PIP_GAP) - PIP_GAP + 2 * INSET;

/** Option A: a round badge 1.6 times the banner's height over its left end, the banner running out to the right. */
function optionA(type: UnitTypeId, colour: { main: string; dark: string }, small: boolean, hp: number): ReactElement {
  const maxHp = UNITS[type].hp;
  const d = 1.6 * BANNER_H;
  const s = d / (2 * EMBLEM_R);
  const body = d / 2 + 1 + pipsW(maxHp) + END;
  const left = -(body + d / 2) / 2 + d / 2;
  const cx = left;
  const r = left + body;
  return h('g', null,
    h('path', { d: flag(left - EDGE, r + EDGE, false), fill: colour.dark }),
    h('path', { d: flag(left, r, false), fill: colour.main }),
    ...pips(left + d / 2 + 1, maxHp, hp),
    h('g', { transform: `translate(${cx} ${BANNER_MID + 0.4}) scale(${s})` }, h(Emblem, { type, paint: emblemPaint(colour), small })));
}

/** Option B: the emblem in today's glyph slot, the disc as tall as the banner. */
function optionB(type: UnitTypeId, colour: { main: string; dark: string }, small: boolean, hp: number): ReactElement {
  const maxHp = UNITS[type].hp;
  const slot = 9.6;
  const w = slot + pipsW(maxHp) + END;
  const left = -w / 2, right = w / 2;
  const s = (BANNER_H - 0.6) / (2 * EMBLEM_R);
  return h('g', null,
    h('path', { d: flag(left - EDGE, right + EDGE, true), fill: colour.dark }),
    h('path', { d: flag(left, right, true), fill: colour.main }),
    ...pips(left + slot, maxHp, hp),
    h('g', { transform: `translate(${left + slot / 2 + 0.2} ${BANNER_MID + 0.3}) scale(${s})` }, h(Emblem, { type, paint: emblemPaint(colour), small })));
}

const MONGOL: UnitTypeId[] = ['horseArcher', 'khansGuard', 'skyCaller', 'camp'];
const BANNER_TYPES: UnitTypeId[] = ['hoplite', 'archer', 'horseArcher', 'catapult', 'kingsGuard', 'camp', 'knight', 'scout'];
const COLS: [string, (t: UnitTypeId, c: { main: string; dark: string }, hp: number) => ReactElement][] = [
  ['in game', (t, c, hp) => h(WarBanner, { type: t, colour: c, hp, maxHp: UNITS[t].hp, spent: false, fresh: false, taunted: false, blinded: false })],
  ['A full', (t, c, hp) => optionA(t, c, false, hp)],
  ['A small', (t, c, hp) => optionA(t, c, true, hp)],
  ['B full', (t, c, hp) => optionB(t, c, false, hp)],
  ['B small', (t, c, hp) => optionB(t, c, true, hp)],
];

function unitCell(t: UnitTypeId, draw: (t: UnitTypeId, c: { main: string; dark: string }, hp: number) => ReactElement, scale: number): string {
  const f: FactionId = MONGOL.includes(t) ? 'mongols' : 'spartans';
  const colour = playerColour(f);
  const hp = Math.max(1, UNITS[t].hp - 5);
  const W = 66, H = 70;
  return renderToStaticMarkup(h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: W * scale, height: H * scale, viewBox: `-33 -58 ${W} ${H}` },
    h(TileBase, { ground: 'grass' } as never),
    h('g', { className: 'unit-shade' }, FIGURES[t]({ colour, accent: ACCENT[f] })),
    draw(t, colour, hp)));
}

function sizes(): string {
  const panel = (scale: number, title: string): string => {
    const head = COLS.map(([n]) => `<th>${n}</th>`).join('');
    const rows = BANNER_TYPES.map((t) => `<tr><td class="n">${T.unit[t].name}</td>${COLS.map(([, d]) => `<td>${unitCell(t, d, scale)}</td>`).join('')}</tr>`).join('');
    return `<h2>${title}</h2><table><tr><th></th>${head}</tr>${rows}</table>`;
  };
  const S = 64 / 52;
  return `<!doctype html><html><head><style>
    body{margin:0;padding:16px;background:#2E3A26;color:#F2EEDF;font-family:sans-serif;display:flex;gap:28px;align-items:flex-start}
    ${css}
    h2{font-size:15px;margin:0 0 8px} table{border-collapse:collapse;background:#6f8f4e} th{font-size:12px;padding:4px 6px;background:#2E3A26}
    td{padding:0} td.n{font-size:12px;padding:0 8px;background:#2E3A26;white-space:nowrap}
    .note{font-size:12px;max-width:260px;line-height:1.4;color:#D8D2BE}
    </style></head><body>
    <div>${panel(S, 'True size: the board at its opening zoom on a phone (64 css px a tile)')}
    <p class="note">This panel is at 1 css px per image pixel. On the phone each css px is about 2.6 device pixels, so it looks sharper there but no bigger.</p></div>
    <div>${panel(3 * S, '3x zoom of the same')}</div></body></html>`;
}

/** The Sky Caller alone: full form in Mongol blue and gold, the small form large, at true badge size and at 3x. */
function skyCaller(): string {
  const blue = emblemPaint(playerColour('mongols'));
  const badge = BANNER_H * 1.3 * (64 / 52) * (108 / 68);
  return `<!doctype html><html><head><style>
    body{margin:0;padding:16px 20px;background:#EFE8DA;color:#2A2520;font-family:sans-serif;width:860px}
    h1{font-size:18px;margin:0 0 10px} .row{display:flex;gap:16px;align-items:center} .green{background:#6f8f4e;color:#F2EEDF;padding:10px 14px;border-radius:6px;margin-top:10px}
    span{font-size:12px}
    </style></head><body><h1>Sky Caller: feather crown and ribbon staff</h1>
    <div class="row">${svg('skyCaller', blue, 200)}${svg('skyCaller', GOLD_PAINT, 200)}<span>full form, Mongol blue and gold</span></div>
    <div class="row green"><span>small form:</span>${svg('skyCaller', blue, 160, true)}<span>badge, true size:</span>${svg('skyCaller', blue, Math.round(badge), true)}<span>3x:</span>${svg('skyCaller', blue, Math.round(3 * badge), true)}</div>
    </body></html>`;
}

const browser = await chromium.launch();
try {
  for (const [name, html] of [['emblems-sheet', sheet(false)], ['emblems-gold', sheet(true)], ['skycaller-crown', skyCaller()], ['banner-sizes', sizes()]] as const) {
    const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1100, height: 800 } });
    await page.setContent(html);
    await page.waitForTimeout(300);
    const path = join(out, `${name}.png`);
    await page.screenshot({ path, fullPage: true });
    console.log(path);
    await page.close();
  }
} finally {
  await browser.close();
}
