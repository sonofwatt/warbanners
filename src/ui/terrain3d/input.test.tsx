import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { City, HexKey, Terrain, Tile } from '../../engine';
import { BuildingMark, CityMark, PendingStar, ResourceMark, Road, TerrainFeature, Treasure, Village } from '../art/features';
import { playerColour } from '../art/palette';
import { Border, borderLines, groundFor, Highlight, ReadyGlow, TileBase } from '../art/tiles';
import { BoardTile } from '../board/Board';
import { hexToBoard } from '../board/layout';
import type { SceneTile } from '../board/scene';
import { GL_BUILDING, GL_RESOURCE, GL_TERRAIN, glMapOf, svgLayers } from './input';

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
  const all = { base: true, road: true, feature: true, resource: true, town: true, village: true, building: true, border: true, treasure: true };
  expect(svgLayers({ fog: false, tile: tile() }, false)).toEqual(all);
  expect(svgLayers({ fog: true, tile: null }, false)).toEqual(all);
});

test('with the option on the svg drops the ground, road, terrain feature, resource and border, and keeps the marks', () => {
  const t = scene('1,0', tile({ terrain: 'mountain', resource: 'ore', road: true, treasure: false }), {
    roadLinks: [0], owner: 0, borderEdges: [0, 1], mark: 'attack', ready: true,
  });
  const off = html(t, false);
  const on = html(t, true);
  const base = part(<TileBase ground={groundFor(t.tile!, false)} />);
  const road = part(<Road links={[0]} />);
  const peak = part(<TerrainFeature terrain="mountain" variant={1} />).slice(0, 120); // (7q + 13r) mod 3 for 1,0
  const ore = part(<ResourceMark resource="ore" />);
  const border = part(<Border edges={[0, 1]} colour={playerColour('spartans').main} />);
  for (const covered of [base, road, peak, ore, border]) {
    expect(off).toContain(covered);
    expect(on).not.toContain(covered);
  }
  for (const kept of [part(<Highlight mark="attack" />), part(<ReadyGlow />)]) {
    expect(off).toContain(kept);
    expect(on).toContain(kept);
  }
});

test('cities and villages go to the 3D look, drawn once; the reward star stays in the svg', () => {
  const city: City = {
    id: 1, pos: '0,0', owner: 0, capital: true, level: 2, growth: 0, radius: 1, walls: true, market: false,
    incomeBonus: 0, capacityBonus: 0, pendingRewards: [], linked: true,
  };
  const cityMark = (pending: boolean): string => part(<CityMark faction="spartans" colour={playerColour('spartans')} level={2} capital walls pending={pending} />);
  const star = part(<PendingStar />);
  // Off: the svg city with everything; on: none of it, except the star when a reward waits.
  expect(html(scene('0,0', tile(), { city, owner: 0 }), false)).toContain(cityMark(false));
  const on = html(scene('0,0', tile(), { city, owner: 0 }), true);
  expect(on).not.toContain(cityMark(false).slice(0, 200));
  expect(on).not.toContain(star);
  const waiting = { ...city, pendingRewards: [3] };
  expect(html(scene('0,0', tile(), { city: waiting, owner: 0 }), false)).toContain(cityMark(true));
  const onWaiting = html(scene('0,0', tile(), { city: waiting, owner: 0 }), true);
  expect(onWaiting).toContain(star);
  expect(onWaiting.split('<polygon').length).toBe(star.split('<polygon').length); // the star alone
  // What the 3D map carries for that city: everything the svg city showed.
  const { map } = glMapOf([scene('0,0', tile(), { city, owner: 0 })], 3, ['spartans', 'mongols']);
  expect(map.tiles['0,0']!.town).toEqual({ faction: 'spartans', level: 2, capital: true, walls: true });
  expect(svgLayers({ fog: false, tile: tile(), city }, true).town).toBe(false);
  // Villages.
  expect(html(scene('2,0', tile({ village: true })), false)).toContain(part(<Village />));
  expect(html(scene('2,0', tile({ village: true })), true)).not.toContain(part(<Village />));
  expect(glMapOf([scene('2,0', tile({ village: true }))], 3).map.tiles['2,0']!.village).toBe(true);
});

test('buildings3d: every building and the treasure chest go to the 3D look, each drawn exactly once', () => {
  // A farm: in the svg with the option off, in 3D (and not the svg) with it on.
  const farm = scene('2,1', tile({ building: 'farm', resource: 'cropland' }));
  expect(html(farm, false)).toContain(part(<BuildingMark building="farm" />));
  expect(html(farm, true)).not.toContain(part(<BuildingMark building="farm" />));
  expect(glMapOf([farm], 3).map.tiles['2,1']!.building).toBe('farm');
  // The chest, in the middle and beside a unit, on every terrain: never in the svg with the option on, always on the
  // 3D map; the terrain under it goes to 3D as before.
  for (const terrain of ['field', 'forest', 'mountain'] as const) {
    for (const occupied of [false, true]) {
      const t = scene('3,0', tile({ terrain, treasure: true }), { occupied });
      const off = html(t, false);
      const on = html(t, true);
      expect(off, `${terrain} ${occupied}`).toContain(part(<Treasure />));
      expect(off).toContain(`data-treasure="${occupied ? 'beside' : 'centre'}"`);
      expect(on, `${terrain} ${occupied}`).not.toContain(part(<Treasure />));
      expect(on).not.toContain('data-treasure');
      const g = glMapOf([t], 3).map.tiles['3,0']!;
      expect(g.treasure).toBe(true);
      expect(g.beside).toBe(occupied);
    }
  }
  expect(html(scene('3,0', tile({ terrain: 'mountain', treasure: true })), true)).not.toContain(part(<TerrainFeature terrain="mountain" variant={0} />).slice(0, 120));
  // A treasure under a building or a village is hidden in both looks (the svg draws the building), never lost twice.
  expect(html(scene('3,0', tile({ treasure: true, building: 'farm' })), false)).not.toContain(part(<Treasure />));
});

test('buildings3d: a market carries its land\'s owner for its awnings; other tiles do not, so a border move never rebuilds them', () => {
  const owned = (building: Tile['building'], owner: number | null) => glMapOf([scene('0,0', tile({ building }), { owner })], 3, ['spartans', 'mongols']);
  expect(owned('market', 1).map.tiles['0,0']!.owner).toBe('mongols');
  expect(owned('market', null).map.tiles['0,0']!.owner).toBe(null);
  expect(owned('market', 0).key).not.toBe(owned('market', 1).key);
  expect(owned('farm', 0).map.tiles['0,0']!.owner).toBe(null);
  // The farm tile itself is the same; only the border (drawn on its own) tells the owner.
  const a = owned('farm', 0).key.split('|')[1], b = owned('farm', 1).key.split('|')[1];
  expect(a).toBe(b);
  // A unit stepping onto a chest moves the chest beside it: the tile's code changes, so it is rebuilt.
  const t = tile({ treasure: true });
  expect(glMapOf([scene('0,0', t, { occupied: true })], 3).key).not.toBe(glMapOf([scene('0,0', t)], 3).key);
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

test('rules 8: jewels, fish and harvested resources go to the 3D look, never drawn twice; every building goes to 3D', () => {
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
    const off = html(scene('2,1', tile({ terrain, building })), false);
    const mark = part(<BuildingMark building={building} />);
    expect(off, building).toContain(mark);
    if (GL_BUILDING.has(building)) expect(on, building).not.toContain(mark);
    else expect(on, building).toContain(mark);
  }
});

test('a harvest changes the map signature, so the tile is rebuilt faded', () => {
  const a = glMapOf([scene('0,0', tile({ resource: 'orchard' }))], 3);
  const b = glMapOf([scene('0,0', tile({ resource: 'orchard', harvested: true }))], 3);
  expect(b.map.tiles['0,0']!.harvested).toBe(true);
  expect(b.key).not.toBe(a.key);
});

test('buildings3d: the 3D look draws every building', () => {
  expect([...GL_BUILDING].sort()).toEqual(['farm', 'foundry', 'granary', 'lumberCamp', 'lumberMill', 'market', 'mine', 'orchard', 'plantation']);
});

test('borders go to the 3D map with their owner\'s colour, and a change of border changes the map signature', () => {
  const a = glMapOf([scene('0,0', tile(), { owner: 1, borderEdges: [0, 2] })], 3, ['spartans', 'mongols']);
  expect(a.map.borders).toEqual([{
    key: '0,0', edges: [0, 2], colour: playerColour('mongols').main,
    lines: borderLines([0, 2]).map(({ a: p, b: q }) => [p.x, p.y, q.x, q.y]), // exactly the svg Border's lines
  }]);
  const b = glMapOf([scene('0,0', tile(), { owner: 1, borderEdges: [0] })], 3, ['spartans', 'mongols']);
  expect(b.key).not.toBe(a.key);
  expect(glMapOf([scene('0,0', tile(), { owner: null, borderEdges: [] })], 3, ['spartans', 'mongols']).map.borders).toEqual([]);
  // The svg still draws the border with the option off, and not with it on.
  const t = scene('0,0', tile(), { owner: 1, borderEdges: [0, 2] });
  const line = part(<Border edges={[0, 2]} colour={playerColour('mongols').main} />);
  expect(html(t, false)).toContain(line);
  expect(html(t, true)).not.toContain(line);
});

test('a city level, walls or owner change changes the map signature, so the city is rebuilt', () => {
  const city: City = {
    id: 1, pos: '0,0', owner: 0, capital: false, level: 2, growth: 0, radius: 1, walls: false, market: false,
    incomeBonus: 0, capacityBonus: 0, pendingRewards: [], linked: true,
  };
  const key = (c: City) => glMapOf([scene('0,0', tile(), { city: c, owner: c.owner })], 3, ['spartans', 'mongols']).key;
  const base = key(city);
  for (const c of [{ ...city, level: 3 }, { ...city, walls: true }, { ...city, owner: 1 }, { ...city, capital: true }]) expect(key(c)).not.toBe(base);
  expect(key({ ...city, growth: 2 })).toBe(base); // what the 3D does not show does not rebuild it
});

test('buildings3d: with the option on, nothing that stands on a tile is left to the svg (only the marks and overlays)', () => {
  const terrains = ['field', 'forest', 'mountain', 'water'] as const;
  const resources = [null, 'orchard', 'cropland', 'game', 'ore', 'jewels', 'fish'] as const;
  const buildings = [null, 'farm', 'lumberCamp', 'mine', 'market', 'orchard', 'plantation', 'lumberMill', 'foundry', 'granary'] as const;
  for (const terrain of terrains) {
    for (const resource of resources) {
      for (const building of buildings) {
        for (const extra of [{}, { village: true }, { treasure: true }, { road: true, harvested: true }]) {
          const layers = svgLayers({ fog: false, tile: tile({ terrain, resource, building, ...extra }) }, true);
          expect(Object.values(layers).some(Boolean), `${terrain} ${resource} ${building} ${JSON.stringify(extra)}`).toBe(false);
        }
      }
    }
  }
});
