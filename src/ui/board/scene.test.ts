import { expect, test } from 'vitest';
import { createMatch, playerView } from '../../engine';
import { hexToBoard } from './layout';
import { buildScene, pick } from './scene';
import type { SceneInput, SceneItem, SceneTile, SceneUnit } from './scene';

const s = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
const input = (over: Partial<SceneInput> = {}): SceneInput => ({
  view: playerView(s, 0),
  radius: s.radius,
  marks: {},
  selectedUnit: null,
  spentUnits: new Set(),
  ...over,
});
const tiles = (items: SceneItem[]) => items.filter((i): i is SceneTile => i.kind === 'tile');
const units = (items: SceneItem[]) => items.filter((i): i is SceneUnit => i.kind === 'unit');

test('one tile per hex, unexplored ones are fog and carry nothing', () => {
  const t = tiles(buildScene(input()));
  expect(t).toHaveLength(127);
  const explored = new Set(s.players[0]!.explored);
  for (const x of t) {
    expect(x.fog).toBe(!explored.has(x.key));
    if (x.fog) {
      expect(x.tile).toBeNull();
      expect(x.city).toBeNull();
      expect(x.owner).toBeNull();
      expect(x.borderEdges).toEqual([]);
    }
  }
});

test('the opening shows only my own unit and my capital', () => {
  const items = buildScene(input());
  expect(units(items).map((u) => u.unit.owner)).toEqual([0]);
  const cap = tiles(items).find((t) => t.city !== null)!;
  expect(cap.key).toBe('-2,5');
  expect(cap.owner).toBe(0);
});

test('the items are back to front and a unit follows its tile', () => {
  const items = buildScene(input());
  for (let i = 1; i < items.length; i++) {
    expect(items[i]!.at.y).toBeGreaterThanOrEqual(items[i - 1]!.at.y - 1e-9);
  }
  const u = items.findIndex((i) => i.kind === 'unit');
  const t = items.findIndex((i) => i.kind === 'tile' && i.key === (items[u] as SceneUnit).unit.pos);
  expect(t).toBeLessThan(u);
});

test('territory has a closed border', () => {
  const t = tiles(buildScene(input()));
  const owned = t.filter((x) => x.owner === 0);
  expect(owned).toHaveLength(7);
  expect(owned.reduce((n, x) => n + x.borderEdges.length, 0)).toBe(18); // the outline of a radius 1 hexagon
  expect(t.find((x) => x.key === '-2,5')!.borderEdges).toEqual([]);
});

test('a tile seen once and then left is veiled, not fogged', () => {
  const view = playerView(s, 0);
  const one = view.visible[0]!;
  const t = tiles(buildScene(input({ view: { ...view, visible: view.visible.filter((k) => k !== one) } })));
  expect(t.find((x) => x.key === one)!.veiled).toBe(true);
  expect(t.find((x) => x.key === one)!.fog).toBe(false);
});

test('marks, selection and spent flags pass through', () => {
  const me = s.units.find((u) => u.owner === 0)!;
  const items = buildScene(input({ marks: { '-2,4': 'move' }, selectedUnit: me.id, spentUnits: new Set([me.id]) }));
  expect(tiles(items).find((t) => t.key === '-2,4')!.mark).toBe('move');
  expect(units(items)[0]).toMatchObject({ selected: true, spent: true, mine: true });
});

test('picking: the figure wins over the tile behind it, the tile wins elsewhere, off the board is nothing', () => {
  const items = buildScene(input());
  const me = units(items)[0]!;
  expect(pick(items, { x: me.at.x, y: me.at.y - 25 }, 6)).toEqual({ unit: me.unit.id, hex: me.unit.pos });
  expect(pick(items, hexToBoard('0,0'), 6)).toEqual({ unit: null, hex: '0,0' });
  expect(pick(items, { x: 5000, y: 5000 }, 6)).toEqual({ unit: null, hex: null });
});

test('a tile knows whether a unit stands on it', () => {
  const t = tiles(buildScene(input()));
  const occupied = t.filter((x) => x.occupied).map((x) => x.key);
  expect(occupied).toEqual(playerView(s, 0).units.map((u) => u.pos));
});
