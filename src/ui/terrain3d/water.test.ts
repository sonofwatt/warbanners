// water3d: the clear water's bed and surface, and the fish under it.
import { expect, test } from 'vitest';
import { tilePieces } from './build';
import type { GlMap, GlTile } from './input';
import { edgeDist, parse, centre, WATER_Y } from './layout';
import { surfaceGeometry, fishGeometry } from './water';
import { BED_DEPTH, BED_MIN, FISH_HALF, FISH_MARGIN, FISH_PERIOD, fishAt, fishInside, fishPaths, fishPoint, fishSpots, fishTheta, openEdges, shallowEdges } from './waterLayout';

const bare: GlTile = { terrain: 'field', resource: null, harvested: false, building: null, village: false, treasure: false, road: false, city: false, town: null };
const water = (t: Partial<GlTile> = {}): GlTile => ({ ...bare, terrain: 'water', ...t });

/** A lake of seven water tiles round 0,0 (radius 4 board), fields round it, fish at the middle. */
function lake(): GlMap {
  const tiles: Record<string, GlTile> = {};
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) if (Math.abs(q + r) <= 3) tiles[`${q},${r}`] = { ...bare };
  for (const k of ['0,0', '1,0', '-1,0', '0,1', '0,-1', '1,-1', '-1,1']) tiles[k] = water();
  tiles['0,0'] = water({ resource: 'fish' });
  return { radius: 4, tiles, fog: [] };
}

test('the bed lies under the surface everywhere, never touching it, deepest in open water', () => {
  const map = lake();
  for (const k of ['0,0', '1,0', '-1,1']) {
    const g = tilePieces(map, k).ground;
    const pos = g.attributes.position!, info = g.attributes.aInfo!;
    let deepest = 0;
    for (let i = 0; i < pos.count; i++) {
      if (info.getY(i) > 0.5) continue; // walls
      const y = pos.getY(i);
      expect(y, k).toBeLessThanOrEqual(WATER_Y - BED_MIN * 0.9); // no z-fighting with the surface
      deepest = Math.max(deepest, WATER_Y - y);
    }
    expect(deepest, k).toBeGreaterThan(BED_DEPTH * 0.85);
  }
});

test('no walls between water tiles, so the bed runs on; walls stay toward land', () => {
  const map = lake();
  expect(openEdges(map, '0,0').sort()).toEqual([0, 1, 2, 3, 4, 5]);
  expect(shallowEdges(map, '0,0')).toEqual([]);
  const wallQuads = (k: string): number => {
    const info = tilePieces(map, k).ground.attributes.aInfo!;
    let n = 0;
    for (let i = 0; i < info.count; i++) if (info.getY(i) > 0.5) n++;
    return n / 4;
  };
  expect(wallQuads('0,0')).toBe(0);
  expect(wallQuads('1,0')).toBe(6 - openEdges(map, '1,0').length);
  expect(wallQuads('2,0')).toBe(6); // land keeps every wall
});

test('the bed meets its neighbour along a shared water edge', () => {
  const map = lake();
  // Sample the shared edge of 0,0 and 1,0 (edge 0 of 0,0) from both tiles' ground: equal heights at equal points.
  const heights = (k: string): Map<string, number> => {
    const g = tilePieces(map, k).ground, p = g.attributes.position!, info = g.attributes.aInfo!;
    const m = new Map<string, number>();
    for (let i = 0; i < p.count; i++) if (info.getY(i) < 0.5) m.set(`${p.getX(i).toFixed(2)},${p.getZ(i).toFixed(2)}`, p.getY(i));
    return m;
  };
  const a = heights('0,0'), b = heights('1,0');
  let shared = 0;
  for (const [pt, y] of a) { const yb = b.get(pt); if (yb !== undefined) { shared++; expect(Math.abs(y - yb)).toBeLessThan(0.02); } }
  expect(shared).toBeGreaterThan(5);
});

test('the surface is one flat hexagon a water tile, at the water height', () => {
  const map = lake();
  const g = surfaceGeometry(map);
  expect(g.index!.count / 3).toBe(7 * 6);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) expect(p.getY(i)).toBeCloseTo(WATER_Y, 5);
});

test('fish swim loops inside their tile, with their whole body, on every tile', () => {
  for (let q = -10; q <= 10; q++) {
    for (let r = -10; r <= 10; r++) {
      for (const faded of [false, true]) {
        for (const p of fishPaths(q, r, ((q * 7 + r * 13) % 4 + 4) % 4, faded)) {
          expect(fishInside(p)).toBe(true);
          // and the posed fish too, at many clock times
          for (let t = 0; t < FISH_PERIOD; t += 3.7) {
            const f = fishAt(p, t);
            expect(edgeDist(f.x, f.z)).toBeGreaterThan(FISH_MARGIN + FISH_HALF * p.size - 0.01);
            expect(f.y).toBeLessThan(WATER_Y - 1);
          }
        }
      }
    }
  }
});

test('the fish loop seamlessly when the clock wraps, and hold still while it stands', () => {
  for (const p of fishPaths(2, -3, 1, false)) {
    for (const t of [0, 12.3, 57.05]) {
      const a = fishAt(p, t), b = fishAt(p, t + FISH_PERIOD), c = fishAt(p, t + 10 * FISH_PERIOD);
      expect(b.x).toBeCloseTo(a.x, 6); expect(b.z).toBeCloseTo(a.z, 6); expect(b.heading).toBeCloseTo(a.heading, 6);
      expect(c.x).toBeCloseTo(a.x, 6);
    }
    // A whole number of laps per period: the end of a period is the start.
    const [x0, z0] = fishPoint(p, fishTheta(p, 0)), [x1, z1] = fishPoint(p, fishTheta(p, FISH_PERIOD - 1e-9));
    expect(Math.hypot(x1 - x0, z1 - z0)).toBeLessThan(1e-4);
    expect(Number.isInteger(p.laps) && Number.isInteger(p.wag)).toBe(true);
    // The same clock gives the same pose: no other input moves a fish.
    expect(fishAt(p, 33)).toEqual(fishAt(p, 33));
  }
});

test('the fish turn smoothly: heading changes a little at a time', () => {
  for (const p of fishPaths(1, 4, 0, false)) {
    let last = fishAt(p, 0).heading;
    for (let t = 0.05; t < 30; t += 0.05) {
      const h = fishAt(p, t).heading;
      let d = Math.abs(h - last);
      if (d > Math.PI) d = 2 * Math.PI - d;
      expect(d).toBeLessThan(0.12); // under 2.4 radians a second at 20 fps
      last = h;
    }
  }
});

test('fish tiles have two or three fish; a harvested one has one, paler', () => {
  const map = lake();
  map.tiles['1,0'] = water({ resource: 'fish', harvested: true });
  const spots = fishSpots(map);
  expect(spots.map((s) => s.key)).toEqual(['0,0', '1,0']);
  expect(spots[0]!.paths.length).toBeGreaterThanOrEqual(2);
  expect(spots[1]!.paths.length).toBe(1);
  const g = fishGeometry(spots, map).fish;
  const col = g.attributes.color!, cen = g.attributes.aCentre!;
  // The harvested fish's orange is nearer the water's blue.
  let fresh = 0, cut = 0;
  const c10 = centre(...(Object.values(parse('1,0')) as [number, number]));
  for (let i = 0; i < col.count; i++) {
    const sat = col.getX(i) - col.getZ(i);
    if (Math.abs(cen.getX(i) - c10.x) < 0.01) cut = Math.max(cut, sat); else fresh = Math.max(fresh, sat);
  }
  expect(cut).toBeLessThan(fresh * 0.6);
  // Plain water has no fish at all.
  expect(fishSpots({ ...map, tiles: { '0,0': water() } })).toEqual([]);
});

test('fish no longer stand in the prop mesh; the bed has stones and weeds', () => {
  const map = lake();
  const props = tilePieces(map, '0,0').props!;
  const col = props.attributes.color!;
  for (let i = 0; i < col.count; i++) expect(col.getX(i) - col.getZ(i), 'no orange fish in the props').toBeLessThan(0.3);
  expect(col.count).toBeGreaterThan(0);
});

test('one fish mesh for the map, posed by the clock alone: a new time uploads no geometry', async () => {
  const { createFish } = await import('./water');
  const fish = createFish({ uTime: { value: 0 } }, true);
  const map = lake();
  fish.setMap(map, []);
  const s = fish.stats();
  expect(s.tiles).toBe(1);
  expect(s.fish).toBeGreaterThanOrEqual(2);
  const mesh = fish.group.children[0] as unknown as { geometry: { attributes: Record<string, { version: number }> } };
  const versions = Object.values(mesh.geometry.attributes).map((a) => a.version);
  fish.setTime(12.5);
  fish.setTime(FISH_PERIOD * 3 + 12.5);
  expect(fish.stats().time).toBeCloseTo(12.5, 6); // the clock wraps on the fish's period
  expect(Object.values(mesh.geometry.attributes).map((a) => a.version)).toEqual(versions);
  // The same map again rebuilds nothing.
  const geo = mesh.geometry;
  fish.setMap(map, []);
  expect(mesh.geometry).toBe(geo);
  fish.dispose();
});
