import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { HexKey, PlayerView, Tile } from '../../engine';
import { Road } from '../art/features';
import { BoardTile } from '../board/Board';
import { hexToBoard } from '../board/layout';
import { buildScene } from '../board/scene';
import type { SceneTile } from '../board/scene';
import { tilePieces } from './build';
import { tileCode } from './codes';
import { edge3d, glMapOf } from './input';
import type { GlMap, GlTile } from './input';
import { roadDist, roadLinks } from './layout';

// tracks3d: a busy road widens in both looks, with dead grass either side; a light road is drawn as before.

const tile = (p: Partial<Tile> = {}): Tile => ({
  terrain: 'field', resource: null, building: null, harvested: false, road: false, village: false, treasure: false, cityId: null, ...p,
});
const scene = (key: HexKey, t: Tile, p: Partial<SceneTile> = {}): SceneTile => ({
  kind: 'tile', key, at: hexToBoard(key), fog: false, tile: t, veiled: false, city: null, owner: null,
  borderEdges: [], cityEdges: null, roadLinks: [], mark: null, ready: false, occupied: false, ...p,
});
const html = (t: SceneTile, gl: boolean): string =>
  renderToStaticMarkup(<svg><BoardTile t={t} factions={['spartans', 'mongols']} viewer={0} gl={gl} /></svg>);
const viewOf = (tiles: Record<HexKey, Tile>): PlayerView => ({ player: 0, tiles, cities: [], units: [], visible: Object.keys(tiles) });

test('the scene gives a busy road its wear, and each link the busier wear of the two roads that meet there', () => {
  const tiles = { '0,0': tile({ road: true }), '1,0': tile({ road: true }), '2,0': tile({ road: true }), '-1,0': tile() };
  const roadWear = new Map<HexKey, number>([['0,0', 1], ['1,0', 3]]);
  const items = buildScene({ view: viewOf(tiles), radius: 3, marks: {}, selectedUnit: null, spentUnits: new Set(), roadWear });
  const at = (k: HexKey): SceneTile => items.find((i): i is SceneTile => i.kind === 'tile' && i.key === k)!;
  expect(at('0,0').roadLevel).toBe(1);
  expect(at('0,0').roadLinks).toEqual([0]);
  expect(at('0,0').roadWear).toEqual([3]);
  expect(at('1,0').roadWear).toEqual([3, 3]); // east to 2,0 (light), west to 0,0: both at its own 3
  expect(at('2,0').roadLevel).toBe(0); // light, but it meets a busy road
  expect(at('2,0').roadWear).toEqual([3]);
  expect('roadLevel' in at('-1,0')).toBe(false);
  // Without wear the scene is as before.
  const plain = buildScene({ view: viewOf(tiles), radius: 3, marks: {}, selectedUnit: null, spentUnits: new Set() });
  expect(plain.some((i) => i.kind === 'tile' && 'roadWear' in i)).toBe(false);
});

test('the 3D map packs the wear in its own edge order; it changes the tile code, not the neighbours\'', () => {
  expect([0, 1, 2, 3, 4, 5].map(edge3d)).toEqual([0, 5, 4, 3, 2, 1]);
  const t = scene('0,0', tile({ road: true }), { roadLinks: [0, 1], roadLevel: 2, roadWear: [3, 2] });
  const { map, key } = glMapOf([t], 3);
  expect(map.tiles['0,0']!.roadWear).toEqual({ road: 2, edges: 3 * 4 ** 0 + 2 * 4 ** 5 });
  const light = glMapOf([scene('0,0', tile({ road: true }), { roadLinks: [0, 1] })], 3);
  expect(light.map.tiles['0,0']!.roadWear).toBeUndefined();
  expect(key).not.toBe(light.key);
  const worn = map.tiles['0,0']!, plain = light.map.tiles['0,0']!;
  expect(tileCode(worn)).not.toBe(tileCode(plain));
  expect(tileCode(worn, false)).toBe(tileCode(plain, false));
  // A city keeps its ground.
  const city = { id: 1, owner: 0, pos: '0,0', level: 1, capital: false } as unknown as SceneTile['city'];
  expect(glMapOf([{ ...t, city }], 3).map.tiles['0,0']!.roadWear).toBeUndefined();
});

const bareGl: GlTile = { terrain: 'field', resource: null, harvested: false, building: null, village: false, treasure: false, road: false, city: false, town: null };
const road = (wear: number): GlMap => ({
  radius: 3, fog: [],
  tiles: { '0,0': { ...bareGl, road: true, ...(wear > 0 ? { roadWear: { road: wear, edges: wear } } : {}) }, '1,0': { ...bareGl, road: true } },
});
const wearAttr = (map: GlMap, k: HexKey): number[] => {
  const a = tilePieces(map, k).ground.attributes.aRoadWear!;
  return [a.getX(0), a.getY(0)];
};

test('the ground carries the road wear to the shader, on every vertex', () => {
  expect(wearAttr(road(3), '0,0')).toEqual([3, 3]);
  expect(wearAttr(road(0), '0,0')).toEqual([0, 0]);
  expect(wearAttr(road(3), '1,0')).toEqual([0, 0]);
  const g = tilePieces(road(3), '0,0').ground;
  expect(g.attributes.aRoadWear!.count).toBe(g.attributes.position!.count);
});

test('a busy road is wider in 3D and the props keep off it; a light road is as before', () => {
  const light = roadLinks(road(0), '0,0')!, busy = roadLinks(road(3), '0,0')!;
  expect([...light]).toEqual([...busy]);
  expect(light.wide).toBeUndefined();
  expect(busy.wide).toBeCloseTo(1.9, 5);
  expect(roadDist(light, 15, 6)).toBeCloseTo(6, 5);
  expect(roadDist(busy, 15, 6)).toBeLessThan(roadDist(light, 15, 6) - 2);
  const props = (m: GlMap): number => tilePieces(m, '0,0').props?.attributes.position!.count ?? 0;
  expect(props(road(3))).toBeLessThanOrEqual(props(road(0)));
});

test('the svg road: a light road as before, a busy one wider with dead grass, also with 3D off only', () => {
  const before = renderToStaticMarkup(<svg><Road links={[0, 3]} /></svg>);
  expect(renderToStaticMarkup(<svg><Road links={[0, 3]} wear={0} edgeWear={[0, 0]} /></svg>)).toBe(before);
  const busy = renderToStaticMarkup(<svg><Road links={[0, 3]} wear={2} edgeWear={[3, 2]} /></svg>);
  expect(busy).toContain('data-road-wear="2"');
  expect(busy).toContain('#C2B45C'); // dead grass
  const t = scene('0,0', tile({ road: true }), { roadLinks: [0], roadLevel: 2, roadWear: [3] });
  expect(html(t, false)).toContain('data-road-wear="2"');
  expect(html(t, true)).not.toContain('data-road-wear');
});
