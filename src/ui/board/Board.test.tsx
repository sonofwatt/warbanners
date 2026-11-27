import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { applyAction, createMatch, playerView } from '../../engine';
import { addCity, addUnit, blankMatch } from '../../engine/testkit';
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

test('a spent own unit is drawn darker with its banner, never see-through; a fresh one is not', () => {
  const me = s.units.find((u) => u.owner === 0)!;
  const spent = unitMarkup(draw({ spentUnits: new Set([me.id]) }), me.id);
  const fresh = unitMarkup(draw(), me.id);
  // The figure and the banner both take the shade (theme.css .unit-shade.spent); nothing has an opacity.
  expect((spent.match(/class="unit-shade spent"/g) ?? []).length).toBe(2);
  expect(fresh).not.toContain('unit-shade spent');
  expect((fresh.match(/class="unit-shade"/g) ?? []).length).toBe(2);
  for (const h of [spent, fresh]) expect(h).not.toMatch(/ opacity="/);
  const crouch = groupAt(spent, spent.indexOf('<g class="unit-crouch'));
  expect(crouch).toContain('unit-shade spent');
});

test('an enemy unit is never darkened, even in the spent set', () => {
  const view = structuredClone(playerView(s, 0));
  const me = view.units[0]!;
  const enemy: Unit = { ...structuredClone(me), id: 97, owner: 1, pos: '-1,4' };
  const html = unitMarkup(draw({ view: { ...view, units: [...view.units, enemy] }, spentUnits: new Set([97]) }), 97);
  expect(html).not.toContain('unit-shade spent');
});

test('my own hidden unit is opaque and carries the slashed eye; an enemy hidden unit shows no eye', () => {
  const view = playerView(s, 0);
  const me = view.units[0]!;
  const scout: Unit = { ...me, id: 99, type: 'scout', pos: '-2,4' };
  const theirs: Unit = { ...me, id: 96, owner: 1, type: 'scout', pos: '-1,4' };
  const warrior: Unit = { ...me, id: 95, type: 'warrior', pos: '-3,5' };
  const html = draw({ view: { ...view, units: [...view.units, scout, theirs, warrior] }, spentUnits: new Set([99]) });
  const mine = unitMarkup(html, 99);
  expect(mine).not.toMatch(/ opacity="/);
  expect(mine).toContain('data-hidden-eye');
  // Spent and hidden: darker, and the eye.
  expect(mine).toContain('unit-shade spent');
  expect(unitMarkup(html, 96)).not.toContain('data-hidden-eye');
  expect(unitMarkup(html, 95)).not.toContain('data-hidden-eye');
});

test('every unit has a war banner with its type\'s glyph, in its owner\'s colour', () => {
  const view = structuredClone(playerView(s, 0));
  const me = view.units[0]!;
  const extra: Unit[] = [
    { ...structuredClone(me), id: 90, type: 'archer', pos: '-1,4' },
    { ...structuredClone(me), id: 91, owner: 1, type: 'knight', pos: '-3,5' },
  ];
  const html = draw({ view: { ...view, units: [...view.units, ...extra] } });
  for (const u of [me, ...extra]) {
    const m = unitMarkup(html, u.id);
    expect(m).toContain(`data-banner="${u.type}"`);
    expect(m).toContain(`data-glyph="${u.type}"`);
    expect(m).toContain(u.owner === 0 ? '#B3261E' : '#2D6DB5');
  }
  // The banner is outside the crouch: only the figure sinks.
  const m = unitMarkup(html, 90);
  expect(groupAt(m, m.indexOf('<g class="unit-crouch'))).not.toContain('data-banner');
});

test('the capital is drawn as a city in the owner\'s colour, with a closed border around it', () => {
  const cap = tileMarkup(draw(), '-2,5');
  expect(cap).toContain('#B3261E'); // the Spartan red
  const html = draw();
  expect((html.match(/<line[^>]*stroke="#B3261E"[^>]*stroke-width="2.4"/g) ?? []).length).toBeGreaterThanOrEqual(18);
});

// rules 7: a taken capital is an ordinary city, and the capital marker moves to the loser's new capital.
test('the capital marker follows a moved capital', () => {
  const m = blankMatch({ radius: 6 });
  addCity(m, 0, -2, 5, { capital: true });
  const old = addCity(m, 1, 2, -5, { capital: true });
  const next = addCity(m, 1, 4, -2, { level: 2 });
  const w = addUnit(m, 'warrior', 0, 2, -5);
  const r = applyAction(m, { type: 'capture', unit: w.id });
  if (!r.ok) throw new Error(r.reason);
  const view = playerView(r.state, 1);
  const marks = (v: PlayerView): string => draw({ view: v });
  const flag = (v: PlayerView, id: number, capital: boolean): PlayerView =>
    ({ ...v, cities: v.cities.map((c) => (c.id === id ? { ...c, capital } : c)) });
  expect(view.cities.find((c) => c.id === next.id)!.capital).toBe(true);
  expect(tileMarkup(marks(view), next.pos)).toBe(tileMarkup(marks(flag(view, next.id, true)), next.pos));
  expect(tileMarkup(marks(view), next.pos)).not.toBe(tileMarkup(marks(flag(view, next.id, false)), next.pos));
  expect(tileMarkup(marks(view), old.pos)).toBe(tileMarkup(marks(flag(view, old.id, false)), old.pos));
  expect(tileMarkup(marks(view), old.pos)).not.toBe(tileMarkup(marks(flag(view, old.id, true)), old.pos));
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

/** The markup of one unit's group. */
function unitMarkup(html: string, id: number): string {
  return groupAt(html, html.lastIndexOf('<g', html.indexOf(`data-unit="${id}"`)));
}

test('a hero carries the mark and a gold-edged banner, and a plain unit does not', () => {
  const view = structuredClone(playerView(s, 0));
  const me = view.units[0]!;
  const plain: Unit = { ...structuredClone(me), id: 98, pos: '-1,4' };
  me.heroTraits = ['fierce', 'tireless'];
  const html = draw({ view: { ...view, units: [...view.units, plain] } });
  expect((html.match(/data-hero-mark/g) ?? []).length).toBe(1);
  expect(unitMarkup(html, me.id)).toContain('data-hero-mark');
  expect(unitMarkup(html, 98)).not.toContain('data-hero-mark');
  expect(unitMarkup(html, me.id)).toContain('data-hero-banner');
  expect(unitMarkup(html, 98)).not.toContain('data-hero-banner');
  // Inside the body, so a lunge carries it.
  const body = unitMarkup(html, me.id);
  expect(groupAt(body, body.indexOf('<g class="unit-body"'))).toContain('data-hero-mark');
  // One trait is not yet a hero.
  me.heroTraits = ['fierce'];
  expect(draw({ view })).not.toContain('data-hero-mark');
});

test('a carried draught shows its badge', () => {
  const view = structuredClone(playerView(s, 0));
  expect(draw({ view })).not.toContain('data-item=');
  view.units[0]!.item = 'draught';
  const body = unitMarkup(draw({ view }), view.units[0]!.id);
  expect(groupAt(body, body.indexOf('<g class="unit-body"'))).toContain('data-item="draught"');
});

test('pips follow maxHpOf', () => {
  const view = structuredClone(playerView(s, 0));
  const me: Unit = { ...view.units[0]!, type: 'warrior' };
  const pips = (u: Unit): { full: number; all: number } => {
    const m = unitMarkup(draw({ view: { ...view, units: [u] } }), u.id);
    return { full: (m.match(/data-pip="full"/g) ?? []).length, all: (m.match(/data-pip=/g) ?? []).length };
  };
  expect(pips({ ...me, hp: 10 })).toEqual({ full: 2, all: 2 });
  // A Fierce Warrior at 12/12: three pips, all full.
  expect(pips({ ...me, hp: 12, heroTraits: ['fierce'] })).toEqual({ full: 3, all: 3 });
});

test('a ready tile glows gold under its selection mark, and only ready tiles glow', () => {
  const k = s.units.find((u) => u.owner === 0)!.pos;
  const both = tileMarkup(draw({ ready: new Set([k]), marks: { [k]: 'selected' } }), k);
  expect(both).toContain('data-ready="true"');
  expect(both.indexOf('data-ready="true"')).toBeLessThan(both.indexOf('data-mark="selected"'));
  expect(tileMarkup(draw({ ready: new Set([k]) }), k)).toContain('class="ready-glow"');
  expect(draw()).not.toContain('data-ready');
});

test('after dark a city\'s windows light up over the grade, and a unit with a lantern has a glow at its feet; a Scout has none', () => {
  const view = structuredClone(playerView(s, 0));
  const city = '-2,5';
  const at = (look?: { weather: 'clear'; time: 'day' | 'dawn' | 'dusk' | 'night' }, round = 1): string => renderToStaticMarkup(
    <Board items={buildScene(input({ view }))} radius={6} factions={['spartans', 'mongols']} focus="-2,5" onTap={() => {}} look={look} round={round} />,
  );
  expect(tileMarkup(at(), city)).not.toContain('data-city-lights');
  const night = tileMarkup(at({ weather: 'clear', time: 'night' }), city);
  expect(night).toContain('data-city-lights="1.00"');
  expect(night.indexOf('data-city-lights')).toBeGreaterThan(night.lastIndexOf('class="grade"'));
  const dusk = Number(tileMarkup(at({ weather: 'clear', time: 'dusk' }, 20), city).match(/data-city-lights="([\d.]+)"/)![1]);
  expect(dusk).toBeGreaterThan(0.3); expect(dusk).toBeLessThan(1);
  // The units: the Scout (hidden) carries no lantern; a warrior does, lit only after dark.
  const me = view.units[0]!;
  expect(me.type).toBe('scout');
  expect(unitMarkup(at({ weather: 'clear', time: 'night' }), me.id)).not.toContain('data-lantern-glow');
  view.units[0] = { ...me, type: 'warrior' };
  expect(unitMarkup(at({ weather: 'clear', time: 'night' }), me.id)).toContain('data-lantern-glow="1.00"');
  expect(unitMarkup(at(), me.id)).not.toContain('data-lantern-glow');
});

test('a hunkered unit crouches in the svg look and keeps its hunker mark; a plain one stands', () => {
  const view = structuredClone(playerView(s, 0));
  const me = view.units[0]!;
  const standing = unitMarkup(draw({ view }), me.id);
  expect(standing).toContain('class="unit-crouch"');
  expect(standing).not.toContain('unit-crouch hunkered');
  view.units[0] = { ...me, hunkered: true };
  const html = unitMarkup(draw({ view }), me.id);
  expect(html).toContain('class="unit-crouch hunkered"');
  expect(html).toContain('data-hunker-mark');
  // The banner and its mark stay outside the crouch: only the figure sinks.
  const crouch = groupAt(html, html.indexOf('<g class="unit-crouch hunkered"'));
  expect(crouch).not.toContain('data-hunker-mark');
  // The banner drops with the head instead: it is placed behind the crouched head.
  const place = (m: string): string => /data-banner-place="svg" style="transform:([^"]*)"/.exec(m)![1]!;
  expect(place(html)).not.toBe(place(standing));
  expect(groupAt(html, html.lastIndexOf('<g', html.indexOf('data-banner-place')))).toContain('data-hunker-mark');
});

test('a village\'s bonfire lights the svg board after dark: a warm glow over the grade at night, weaker at dawn, none by day', () => {
  const view = structuredClone(playerView(s, 0));
  const k = s.players[0]!.explored.find((x) => view.tiles[x]?.terrain === 'field' && view.tiles[x]?.cityId === null && !s.units.some((u) => u.pos === x))!;
  view.tiles[k] = { ...view.tiles[k]!, village: true, resource: null, building: null, treasure: false };
  const at = (look?: { weather: 'clear'; time: 'day' | 'dawn' | 'dusk' | 'night' }, round = 1): string => tileMarkup(renderToStaticMarkup(
    <Board items={buildScene(input({ view }))} radius={6} factions={['spartans', 'mongols']} focus="-2,5" onTap={() => {}} look={look} round={round} />,
  ), k);
  const day = at();
  expect(day).toContain('data-bonfire="true"');
  expect(day).not.toContain('data-fire-glow');
  const night = at({ weather: 'clear', time: 'night' });
  expect(night).toContain('data-fire-glow="1.00"');
  // The glow is drawn after the grade, so the grade never darkens it.
  expect(night.indexOf('data-fire-glow')).toBeGreaterThan(night.lastIndexOf('class="grade"'));
  const dawn = Number(at({ weather: 'clear', time: 'dawn' }, 15).match(/data-fire-glow="([\d.]+)"/)![1]);
  expect(dawn).toBeGreaterThan(0.3); expect(dawn).toBeLessThan(0.9);
  expect(at({ weather: 'clear', time: 'dawn' }, 30)).not.toContain('data-fire-glow');
  // A plain field has no fire to light it.
  const plain = s.players[0]!.explored.find((x) => x !== k && view.tiles[x]?.terrain === 'field' && !view.tiles[x]?.village && view.tiles[x]?.cityId === null)!;
  expect(tileMarkup(renderToStaticMarkup(
    <Board items={buildScene(input({ view }))} radius={6} factions={['spartans', 'mongols']} focus="-2,5" onTap={() => {}} look={{ weather: 'clear', time: 'night' }} />,
  ), plain)).not.toContain('data-fire-glow');
});
