import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { createMatch, playerView } from '../../engine';
import type { PlayerView, Unit } from '../../engine';
import { Board } from './Board';
import { boardBounds } from './layout';
import { buildScene } from './scene';
import type { SceneInput } from './scene';

const s = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
const input = (over: Partial<SceneInput> = {}): SceneInput => ({
  view: playerView(s, 0), radius: 6, marks: {}, selectedUnit: null, spentUnits: new Set(), ...over,
});
const draw = (over: Partial<SceneInput> = {}): string =>
  renderToStaticMarkup(
    <Board items={buildScene(input(over))} radius={6} factions={['spartans', 'mongols']} focus="-2,5" onTap={() => {}} />,
  );

/** The markup of one `<g data-hex="k">` group, up to the next tile or unit group. */
function tileMarkup(html: string, k: string): string {
  const start = html.indexOf(`data-hex="${k}"`);
  const rest = html.slice(start + 1);
  const next = rest.search(/data-hex=|data-unit=/);
  return next < 0 ? rest : rest.slice(0, next);
}

test('the board draws every tile and visible unit, and no fog tile leaks terrain', () => {
  const html = draw();
  expect((html.match(/data-hex=/g) ?? []).length).toBe(127);
  expect((html.match(/data-unit=/g) ?? []).length).toBe(1);
  expect((html.match(/data-fog="true"/g) ?? []).length).toBe(127 - s.players[0]!.explored.length);
  // Apart from where it is and an optional mark, a fog tile's markup is the same for every fog tile.
  expectFogTilesAlike();
});

/** The balanced `<g ...>...</g>` element that starts at `from` in the markup. */
function groupAt(html: string, from: number): string {
  const tag = /<g[\s>]|<\/g>/g;
  tag.lastIndex = from;
  let depth = 0;
  for (let m = tag.exec(html); m !== null; m = tag.exec(html)) {
    depth += m[0] === '</g>' ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index + 4);
  }
  throw new Error('unbalanced markup');
}

/** Every fog tile is drawn the same as every other, whatever lies under it. */
function expectFogTilesAlike(): void {
  const fog = buildScene(input()).filter((it) => it.kind === 'tile' && it.fog).map((it) => (it.kind === 'tile' ? it.key : ''));
  expect(fog.length).toBeGreaterThan(50);
  // Marks on a few fog tiles, so the mark overlay is the one thing allowed to differ.
  const html = draw({ marks: { [fog[0]!]: 'move', [fog[1]!]: 'attack' } });
  const bare = (k: string): string => {
    let g = groupAt(html, html.indexOf(`<g data-hex="${k}"`));
    const mark = g.indexOf('<g data-mark=');
    if (mark >= 0) g = g.slice(0, mark) + g.slice(mark + groupAt(g, mark).length);
    return g
      .replace(` data-hex="${k}"`, '')
      .replace(` data-centre="${k}"`, '')
      .replace(/^<g([^>]*?) transform="translate\([-\d.]+ [-\d.]+\)"/, '<g$1');
  };
  const first = bare(fog[0]!);
  expect(first).toContain('data-fog="true"');
  for (const k of fog) expect(bare(k), k).toBe(first);
}

test('every tile has a tap target at its centre, and the svg is touch-action none', () => {
  const html = draw();
  expect((html.match(/data-centre=/g) ?? []).length).toBe(127);
  expect(html).toMatch(/<svg[^>]*touch-action:none/);
});

test('before measuring, the camera opens on the focus as if the screen were 412 by 915, centred top to bottom', () => {
  const html = draw();
  const m = /<g data-camera="true" transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)"/.exec(html);
  expect(m).not.toBeNull();
  const [tx, ty, sc] = [Number(m![1]), Number(m![2]), Number(m![3])];
  // The focus tile's centre lands in the middle of a 412 by 915 screen left to right. The board is
  // shorter than 915 px at this zoom, so it is centred top to bottom instead: its middle, halfway
  // between its top (-220) and its bottom (195), lands in the middle.
  const fx = 30 * Math.sqrt(3) * (-2 + 5 / 2);
  const b = boardBounds(6);
  expect(tx + fx * sc).toBeCloseTo(206, 0);
  expect(ty + ((b.minY + b.maxY) / 2) * sc).toBeCloseTo(457.5, 0);
});

test('a mark on a fog tile is drawn, and nothing else of that tile but its fog', () => {
  const fogKey = Object.keys(playerView(s, 0).tiles).includes('0,0') ? '6,-6' : '0,0';
  const plain = tileMarkup(draw(), fogKey);
  const marked = tileMarkup(draw({ marks: { [fogKey]: 'move' } }), fogKey);
  expect(plain).toContain('data-fog="true"');
  expect(marked.length).toBeGreaterThan(plain.length);
  expect(marked).toContain('data-mark="move"');
});

test('a spent own unit is dimmed to 55%, a fresh one is not', () => {
  const me = s.units.find((u) => u.owner === 0)!;
  expect(draw({ spentUnits: new Set([me.id]) })).toContain('opacity="0.55"');
  expect(draw()).not.toContain('opacity="0.55"');
});

test('my own hidden unit is drawn at 70%', () => {
  const view = playerView(s, 0);
  const me = view.units[0]!;
  const scout: Unit = { ...me, id: 99, type: 'scout', pos: '-2,4' };
  const withScout: PlayerView = { ...view, units: [...view.units, scout] };
  const html = draw({ view: withScout });
  expect(html).toMatch(/data-unit="99"[^>]*>(<g[^>]*>)*?<g opacity="0.7"/);
});

test('the capital is drawn as a city in the owner\'s colour, with a closed border around it', () => {
  const cap = tileMarkup(draw(), '-2,5');
  expect(cap).toContain('#B3261E'); // the Spartan red
  const html = draw();
  expect((html.match(/<line[^>]*stroke="#B3261E"[^>]*stroke-width="2.4"/g) ?? []).length).toBeGreaterThanOrEqual(18);
});

test('a veiled tile is dimmed whole: its ground and everything standing on it, but not a unit on it', () => {
  const view = playerView(s, 0);
  const me = view.units[0]!;
  const html = draw({ view: { ...view, visible: [] } });
  const k = Object.keys(view.tiles).find((x) => view.tiles[x]!.terrain === 'forest' || view.tiles[x]!.terrain === 'mountain')!;
  const tile = tileMarkup(html, k);
  const shade = tile.indexOf('<g class="veil"');
  expect(shade).toBeGreaterThan(0);
  // The shade repeats the tile's ground and its feature, drawn over them.
  const art = tile.slice(tile.indexOf('>') + 1, shade);
  expect(art.length).toBeGreaterThan(200);
  expect(tile.slice(shade)).toContain(art);
  expect(tileMarkup(html, me.pos)).toContain('<g class="veil"');
  const unit = html.slice(html.indexOf(`data-unit="${me.id}"`));
  expect(unit.slice(0, unit.search(/data-hex=|$/))).not.toContain('class="veil"');
});

test('a treasure under a unit is drawn beside the figure, so the unit never hides what it waits on', () => {
  const view = structuredClone(playerView(s, 0));
  const k = '-1,4';                                         // explored, not a city, field
  view.tiles[k]!.treasure = true;
  const alone = tileMarkup(draw({ view }), k);
  expect(alone).toContain('data-treasure="centre"');
  view.units[0]!.pos = k;
  const under = tileMarkup(draw({ view }), k);
  expect(under).toContain('data-treasure="beside"');
  expect(under).not.toContain('data-treasure="centre"');
});
