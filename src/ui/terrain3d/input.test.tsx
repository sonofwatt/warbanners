import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { City, HexKey, Terrain, Tile } from '../../engine';
import { BuildingMark, CityMark, ResourceMark, Road, TerrainFeature, Treasure, Village } from '../art/features';
import { playerColour } from '../art/palette';
import { Border, groundFor, Highlight, ReadyGlow, TileBase } from '../art/tiles';
import { BoardTile } from '../board/Board';
import { hexToBoard } from '../board/layout';
import type { SceneTile } from '../board/scene';
import { GL_RESOURCE, GL_TERRAIN, glMapOf, svgLayers } from './input';

const tile = (p: Partial<Tile> = {}): Tile => ({
  terrain: 'field', resource: null, building: null, harvested: false, road: false, village: false, treasure: false, cityId: null, ...p,
});
const scene = (key: HexKey, t: Tile | null, p: Partial<SceneTile> = {}): SceneTile => ({
  kind: 'tile', key, at: hexToBoard(key), fog: t === null, tile: t, veiled: false, city: null, owner: null,
  borderEdges: [], roadLinks: [], mark: null, ready: false, occupied: false, ...p,
});
const html = (t: SceneTile, gl: boolean): string =>
  renderToStaticMarkup(<svg><BoardTile t={t} factions={['spartans', 'mongols']} viewer={0} gl={gl} /></svg>);
const part = (el: React.ReactElement): string => renderToStaticMarkup(el).replace(/^<g>|<\/g>$/g, '');

test('with the option off every layer is drawn, as today', () => {
  expect(svgLayers({ fog: false, tile: tile() }, false)).toEqual({ base: true, road: true, feature: true, resource: true });
  expect(svgLayers({ fog: true, tile: null }, false)).toEqual({ base: true, road: true, feature: true, resource: true });
});

test('with the option on the svg drops the ground, road, terrain feature and resource, and nothing else', () => {
  const t = scene('1,0', tile({ terrain: 'mountain', resource: 'ore', road: true, treasure: false }), {
    roadLinks: [0], owner: 0, borderEdges: [0, 1], mark: 'attack', ready: true,
  });
  const off = html(t, false);
  const on = html(t, true);
  const base = part(<TileBase ground={groundFor(t.tile!, false)} />);
  const road = part(<Road links={[0]} />);
  const peak = part(<TerrainFeature terrain="mountain" variant={1} />).slice(0, 120); // (7q + 13r) mod 3 for 1,0
  const ore = part(<ResourceMark resource="ore" />);
  for (const covered of [base, road, peak, ore]) {
    expect(off).toContain(covered);
    expect(on).not.toContain(covered);
  }
  for (const kept of [part(<Border edges={[0, 1]} colour={playerColour('spartans').main} />), part(<Highlight mark="attack" />), part(<ReadyGlow />)]) {
    expect(off).toContain(kept);
    expect(on).toContain(kept);
  }
});

test('cities, villages, buildings and treasures stay in the svg with the option on', () => {
  const city: City = {
    id: 1, pos: '0,0', owner: 0, capital: true, level: 2, growth: 0, radius: 1, walls: false, market: false,
    incomeBonus: 0, capacityBonus: 0, pendingRewards: [], linked: true,
  };
  const cityHtml = html(scene('0,0', tile(), { city, owner: 0 }), true);
  expect(cityHtml).toContain(part(<CityMark faction="spartans" colour={playerColour('spartans')} level={2} capital walls={false} pending={false} />).slice(0, 200));
  expect(html(scene('2,0', tile({ village: true })), true)).toContain(part(<Village />));
  expect(html(scene('2,1', tile({ building: 'farm', resource: 'cropland' })), true)).toContain(part(<BuildingMark building="farm" />));
  const treasure = html(scene('3,0', tile({ terrain: 'mountain', treasure: true })), true);
  expect(treasure).toContain(part(<Treasure />));
  expect(treasure).not.toContain(part(<TerrainFeature terrain="mountain" variant={0} />).slice(0, 120));
});

test('a fogged tile leaves its blank base to the terrain, which draws today\'s fog, and keeps its marks', () => {
  const fog = scene('4,0', null, { mark: 'move' });
  const off = html(fog, false);
  const on = html(fog, true);
  expect(off).toContain(part(<TileBase ground="fog" />));
  expect(on).not.toContain(part(<TileBase ground="fog" />));
  expect(on).toContain('data-fog="true"');
  expect(on).toContain(part(<Highlight mark="move" />));
});

test('the terrain map carries no detail of fogged tiles, and every terrain and resource has 3D art', () => {
  const items = [scene('0,0', tile({ terrain: 'forest', resource: 'game' }), { veiled: true }), scene('1,0', null)];
  const { map, veiled } = glMapOf(items, 3);
  expect(map.fog).toEqual(['1,0']);
  expect(Object.keys(map.tiles)).toEqual(['0,0']);
  expect(veiled).toEqual(['0,0']);
  for (const t of ['field', 'forest', 'mountain', 'water'] as const) expect(GL_TERRAIN.has(t)).toBe(true);
  for (const r of ['orchard', 'cropland', 'game', 'ore', 'jewels', 'fish'] as const) expect(GL_RESOURCE.has(r)).toBe(true);
});

test('a veil change keeps the map signature, so it only repaints', () => {
  const a = glMapOf([scene('0,0', tile(), { veiled: false })], 3);
  const b = glMapOf([scene('0,0', tile(), { veiled: true })], 3);
  expect(a.key).toBe(b.key);
  expect(a.veilKey).not.toBe(b.veilKey);
  const c = glMapOf([scene('0,0', tile({ road: true }))], 3);
  expect(c.key).not.toBe(a.key);
});

test('rules 8: jewels, fish and harvested resources go to the 3D look, never drawn twice; every new building stays in the svg', () => {
  for (const [terrain, resource] of [['mountain', 'jewels'], ['water', 'fish']] as const) {
    for (const harvested of [false, true]) {
      const t = scene('1,0', tile({ terrain, resource, harvested }));
      const mark = part(<ResourceMark resource={resource} harvested={harvested} />);
      expect(html(t, false)).toContain(mark);
      expect(html(t, true)).not.toContain(mark);
      expect(svgLayers(t, true).resource).toBe(false);
    }
  }
  const terrains = { farm: 'field', lumberCamp: 'forest', mine: 'mountain', market: 'field', orchard: 'field', plantation: 'field', lumberMill: 'forest', foundry: 'mountain', granary: 'field' } as const;
  for (const [building, terrain] of Object.entries(terrains) as [keyof typeof terrains, Terrain][]) {
    const on = html(scene('2,1', tile({ terrain, building })), true);
    expect(on, building).toContain(part(<BuildingMark building={building} />));
  }
});

test('a harvest changes the map signature, so the tile is rebuilt faded', () => {
  const a = glMapOf([scene('0,0', tile({ resource: 'orchard' }))], 3);
  const b = glMapOf([scene('0,0', tile({ resource: 'orchard', harvested: true }))], 3);
  expect(b.map.tiles['0,0']!.harvested).toBe(true);
  expect(b.key).not.toBe(a.key);
});
