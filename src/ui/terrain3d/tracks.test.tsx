import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { HexKey, PlayerView, Tile } from '../../engine';
import { Road, Tracks } from '../art/features';
import { BoardTile } from '../board/Board';
import { hexToBoard } from '../board/layout';
import { buildScene } from '../board/scene';
import type { SceneTile } from '../board/scene';
import type { TrackLook } from '../board/tracks';
import { tilePieces } from './build';
import { tileCode } from './codes';
import { edge3d, glMapOf } from './input';
import type { GlMap, GlTile } from './input';
import { ROAD_HALF, roadDist, roadLinks } from './layout';

// tracks3d: the traffic marks reach the 3D ground and the svg, never water or a city, and a busy road widens.

const none = { level: 0, edges: 0 };
const look = (p: Partial<TrackLook>): TrackLook => ({ foot: none, hoof: none, wheel: none, path: 0, road: 0, ...p });
const EW = (1 << 0) | (1 << 3);
const tile = (p: Partial<Tile> = {}): Tile => ({
  terrain: 'field', resource: null, building: null, harvested: false, road: false, village: false, treasure: false, cityId: null, ...p,
});
const scene = (key: HexKey, t: Tile, p: Partial<SceneTile> = {}): SceneTile => ({
  kind: 'tile', key, at: hexToBoard(key), fog: false, tile: t, veiled: false, city: null, owner: null,
  borderEdges: [], cityEdges: null, roadLinks: [], mark: null, ready: false, occupied: false, ...p,
});
const html = (t: SceneTile, gl: boolean): string =>
  renderToStaticMarkup(<svg><BoardTile t={t} factions={['spartans', 'mongols']} viewer={0} gl={gl} /></svg>);

/** A view of a row of tiles, all seen, for buildScene. */
function viewOf(tiles: Record<HexKey, Tile>): PlayerView {
  return { player: 0, tiles, cities: [], units: [], visible: Object.keys(tiles) };
}

test('the scene carries each tile its tracks, never on water, and a road its wear at each link', () => {
  const tiles = { '0,0': tile({ road: true }), '1,0': tile({ road: true }), '2,0': tile({ terrain: 'water' }), '-1,0': tile() };
  const tracks = new Map<HexKey, TrackLook>([
    ['0,0', look({ foot: { level: 2, edges: EW }, road: 1 })], ['1,0', look({ road: 3 })], ['2,0', look({ foot: { level: 1, edges: EW } })],
  ]);
  const items = buildScene({ view: viewOf(tiles), radius: 3, marks: {}, selectedUnit: null, spentUnits: new Set(), tracks });
  const at = (k: HexKey): SceneTile => items.find((i): i is SceneTile => i.kind === 'tile' && i.key === k)!;
  expect(at('0,0').tracks?.foot.level).toBe(2);
  expect(at('0,0').roadLinks).toEqual([0]);
  expect(at('0,0').roadWear).toEqual([3]); // the busier of the two where they meet
  expect(at('1,0').roadWear).toEqual([3]);
  expect(at('2,0').tracks).toBeUndefined(); // water
  expect(at('-1,0').tracks).toBeUndefined();
  // Without tracks the scene is as before.
  const plain = buildScene({ view: viewOf(tiles), radius: 3, marks: {}, selectedUnit: null, spentUnits: new Set() });
  expect(plain.some((i) => i.kind === 'tile' && 'tracks' in i)).toBe(false);
});

test('the 3D map packs tracks in its own edge order, and they change the tile code', () => {
  expect([0, 1, 2, 3, 4, 5].map(edge3d)).toEqual([0, 5, 4, 3, 2, 1]);
  const t = scene('0,0', tile(), { tracks: look({ foot: { level: 1, edges: 1 << 1 }, hoof: { level: 3, edges: 1 << 0 }, path: 2 }) });
  const { map, key } = glMapOf([t], 3);
  const gl = map.tiles['0,0']!;
  expect(gl.tracks).toEqual({ masks: (1 << 5) + 64 * 1, levels: 1 + 4 * 3 + 64 * 2, road: 0, edges: 0 });
  const bare = glMapOf([scene('0,0', tile())], 3);
  expect(bare.map.tiles['0,0']!.tracks).toBeUndefined();
  expect(key).not.toBe(bare.key);
  // A city keeps its ground: no tracks.
  const city = { id: 1, owner: 0 as const, pos: '0,0', level: 1, capital: false } as unknown as SceneTile['city'];
  expect(glMapOf([{ ...t, city }], 3).map.tiles['0,0']!.tracks).toBeUndefined();
});

const bareGl: GlTile = { terrain: 'field', resource: null, harvested: false, building: null, village: false, treasure: false, road: false, city: false, town: null };
const trackAttr = (map: GlMap, k: HexKey): number[] => {
  const a = tilePieces(map, k).ground.attributes.aTrack!;
  return [a.getX(0), a.getY(0), a.getZ(0), a.getW(0)];
};

test('the ground carries the tracks to the shader; water carries none', () => {
  const tracks = { masks: 9, levels: 3, road: 0, edges: 0 };
  const map: GlMap = { radius: 3, tiles: { '0,0': { ...bareGl, tracks }, '1,0': { ...bareGl, terrain: 'water', tracks } }, fog: [] };
  expect(trackAttr(map, '0,0')).toEqual([9, 3, 0, 0]);
  expect(trackAttr(map, '1,0')).toEqual([0, 0, 0, 0]);
  const plain: GlMap = { radius: 3, tiles: { '0,0': bareGl }, fog: [] };
  expect(trackAttr(plain, '0,0')).toEqual([0, 0, 0, 0]);
  // Every vertex of the merged ground has it (the walls too), so the tile pieces merge.
  const g = tilePieces(map, '0,0').ground;
  expect(g.attributes.aTrack!.count).toBe(g.attributes.position!.count);
});

test('a busy road is wider in 3D, and the props keep off all of it', () => {
  const road = (wear: number): GlMap => ({
    radius: 3, fog: [],
    tiles: { '0,0': { ...bareGl, road: true, tracks: { masks: 0, levels: 0, road: wear, edges: wear } }, '1,0': { ...bareGl, road: true } },
  });
  const light = roadLinks(road(0), '0,0')!, busy = roadLinks(road(3), '0,0')!;
  expect([...light]).toEqual([...busy]);
  expect(busy.wide).toBeCloseTo(1.9, 5);
  expect(roadDist(busy, 15, 6)).toBeLessThan(roadDist(light, 15, 6) - 2);
  // A light road is exactly as before.
  expect(roadDist(light, 15, 6)).toBeCloseTo(6, 5);
  expect(trackAttr(road(3), '0,0')).toEqual([0, 0, 3, 3]);
  expect(ROAD_HALF).toBeGreaterThan(0);
});

test('the svg draws faint tracks with 3D off and leaves them to the 3D ground with it on', () => {
  const t = scene('0,0', tile(), { tracks: look({ foot: { level: 1, edges: EW }, hoof: { level: 2, edges: 1 << 2 }, wheel: { level: 3, edges: EW }, path: 1 }) });
  const svg = html(t, false);
  for (const kind of ['foot', 'hoof', 'wheel', 'path']) expect(svg).toContain(`data-tracks="${kind}"`);
  expect(html(t, true)).not.toContain('data-tracks');
  // Faint: every kind's group is well under half strength.
  for (const m of svg.matchAll(/data-tracks="\w+" opacity="([\d.]+)"/g)) expect(Number(m[1])).toBeLessThan(0.5);
  expect(renderToStaticMarkup(<svg><Tracks tracks={look({})} /></svg>)).toBe('<svg></svg>');
});

test('the svg road: a light road as before, a busy one wider with dead grass', () => {
  const before = renderToStaticMarkup(<svg><Road links={[0, 3]} /></svg>);
  expect(renderToStaticMarkup(<svg><Road links={[0, 3]} wear={0} edgeWear={[0, 0]} /></svg>)).toBe(before);
  const busy = renderToStaticMarkup(<svg><Road links={[0, 3]} wear={2} edgeWear={[3, 2]} /></svg>);
  expect(busy).toContain('data-road-wear="2"');
  expect(busy).toContain('#C2B45C'); // dead grass
  const t = scene('0,0', tile({ road: true }), { roadLinks: [0], tracks: look({ road: 2 }), roadWear: [3] });
  expect(html(t, false)).toContain('data-road-wear="2"');
});

test('a neighbour reads nothing of a tile\'s tracks, so a step rebuilds that tile alone', () => {
  const plain = { ...bareGl, road: true };
  const worn = { ...plain, tracks: { masks: 9, levels: 3, road: 2, edges: 2 } };
  expect(tileCode(worn)).not.toBe(tileCode(plain));
  expect(tileCode(worn, false)).toBe(tileCode(plain, false));
});
