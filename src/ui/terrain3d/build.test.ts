import { Color } from 'three';
import { expect, test } from 'vitest';
import { PLAYER_COLOURS } from '../art/palette';
import { tilePieces } from './build';
import type { GlMap, GlTile } from './input';
import { RES_HARVESTED, RES_ID } from './layout';

const bare: GlTile = { terrain: 'field', resource: null, harvested: false, building: null, village: false, treasure: false, road: false, city: false, town: null };
const piecesOf = (t: Partial<GlTile>) => {
  const map: GlMap = { radius: 3, tiles: { '1,0': { ...bare, ...t } }, fog: [] };
  return tilePieces(map, '1,0');
};
const colours = (t: Partial<GlTile>): Float32Array => piecesOf(t).props!.attributes.color!.array as Float32Array;

// Fish swim on the figures' canvas (water.ts, water.test.ts), so the water tile's props are its bed's, unfaded.
test('every rules 8 resource has 3D props, and a harvested one is the same shape, faded', () => {
  for (const [terrain, resource] of [['mountain', 'jewels'], ['field', 'orchard'], ['field', 'cropland'], ['forest', 'game'], ['mountain', 'ore']] as const) {
    const fresh = piecesOf({ terrain, resource });
    const cut = piecesOf({ terrain, resource, harvested: true });
    expect(fresh.props, resource).not.toBeNull();
    expect(cut.props!.attributes.position!.count).toBe(fresh.props!.attributes.position!.count);
    expect(colours({ terrain, resource, harvested: true })).not.toEqual(colours({ terrain, resource }));
    // The ground carries the resource id, and the harvest flag on top of it.
    const id = (p: ReturnType<typeof piecesOf>) => p.ground.attributes.aTile!.getZ(0);
    expect(id(fresh)).toBe(RES_ID[resource]);
    expect(id(cut)).toBe(RES_ID[resource] + RES_HARVESTED);
  }
});

test('jewels are bright crystals with no grey rock under them', () => {
  const c = colours({ terrain: 'mountain', resource: 'jewels' });
  const ore = colours({ terrain: 'mountain', resource: 'ore' });
  const saturated = (a: Float32Array): number => {
    let n = 0;
    for (let i = 0; i < a.length; i += 3) if (Math.max(a[i]!, a[i + 1]!, a[i + 2]!) - Math.min(a[i]!, a[i + 1]!, a[i + 2]!) > 0.4) n++;
    return n;
  };
  expect(saturated(c)).toBeGreaterThan(saturated(ore) + 100);
});

// cities3d: the 3D cities, villages and mines, and what they cost.
const tris = (t: Partial<GlTile>): number => {
  const p = piecesOf(t).props;
  return p === null ? 0 : p.attributes.position!.count / 3;
};
const city = (level: number, faction: 'spartans' | 'mongols', capital = false, walls = false): Partial<GlTile> =>
  ({ city: true, town: { faction, level, capital, walls } });

test('a city is built in 3D and grows with its level; walls and the capital add to it', () => {
  for (const faction of ['spartans', 'mongols'] as const) {
    let last = 0;
    for (let level = 1; level <= 6; level++) {
      const n = tris(city(level, faction));
      expect(n, `${faction} ${level}`).toBeGreaterThan(last);
      last = n;
    }
    expect(tris(city(3, faction, false, true))).toBeGreaterThan(tris(city(3, faction)));
    expect(tris(city(3, faction, true))).toBeGreaterThan(tris(city(3, faction)));
    // Its roofs are in the owner's colour.
    const roof = new Color(PLAYER_COLOURS[faction].main); // as the parts store it (the renderer turns colour management off)
    const want = [roof.r, roof.g, roof.b];
    const c = colours(city(2, faction));
    let found = false;
    for (let i = 0; i < c.length && !found; i += 3) found = want.every((v, j) => Math.abs(c[i + j]! - v) < 1e-4);
    expect(found, faction).toBe(true);
  }
  // A city whose owner the svg could not draw stays bare.
  expect(piecesOf({ city: true, town: null }).props).toBeNull();
});

test('villages, mines and foundries have 3D props; the foundry adds its furnace to the mine', () => {
  expect(tris({ village: true })).toBeGreaterThan(0);
  expect(tris({ terrain: 'forest', village: true })).toBeGreaterThan(0);
  const mine = tris({ terrain: 'mountain', resource: 'ore', building: 'mine' });
  const foundry = tris({ terrain: 'mountain', resource: 'ore', building: 'foundry' });
  const peak = tris({ terrain: 'mountain' });
  expect(mine).toBeGreaterThan(peak);
  expect(foundry).toBeGreaterThan(mine * 0.9);
});

test('what the cities, villages and mines cost in triangles stays small', () => {
  // The numbers the report gives. A whole board has at most a few dozen of these tiles.
  const field = tris({});
  expect(tris(city(6, 'spartans', true, true))).toBeLessThan(5000);
  expect(tris(city(6, 'mongols', true, true))).toBeLessThan(5000);
  expect(tris({ terrain: 'mountain', resource: 'ore', building: 'foundry' })).toBeLessThan(peakOnly() + 1500);
  expect(field).toBeGreaterThanOrEqual(0);
});
function peakOnly(): number { return tris({ terrain: 'mountain' }); }

// buildings3d: the tile buildings and the treasure chest.
const has = (c: Float32Array, hex: string): boolean => {
  const col = new Color(hex);
  for (let i = 0; i < c.length; i += 3) if (Math.abs(c[i]! - col.r) < 1e-4 && Math.abs(c[i + 1]! - col.g) < 1e-4 && Math.abs(c[i + 2]! - col.b) < 1e-4) return true;
  return false;
};
const ON = { farm: 'field', granary: 'field', orchard: 'field', plantation: 'field', market: 'field', lumberCamp: 'forest', lumberMill: 'forest' } as const;

test('every tile building is built in 3D, and each upgrade is a clear step up from what it replaces', () => {
  for (const [building, terrain] of Object.entries(ON) as [keyof typeof ON, 'field' | 'forest'][]) {
    expect(tris({ terrain, building }), building).toBeGreaterThan(tris({ terrain }) + 200);
  }
  for (const [from, to, terrain] of [['farm', 'granary', 'field'], ['orchard', 'plantation', 'field'], ['lumberCamp', 'lumberMill', 'forest']] as const) {
    expect(tris({ terrain, building: to }), to).toBeGreaterThan(tris({ terrain, building: from }) * 1.15);
  }
});

test('a market\'s awnings are in its owner\'s colour; without an owner they keep the svg\'s yellow', () => {
  for (const faction of ['spartans', 'mongols'] as const) {
    expect(has(colours({ building: 'market', owner: faction }), PLAYER_COLOURS[faction].main), faction).toBe(true);
  }
  expect(has(colours({ building: 'market', owner: null }), '#F2B705')).toBe(true);
  expect(has(colours({ building: 'market', owner: null }), PLAYER_COLOURS.spartans.main)).toBe(false);
});

test('a building replaces its resource, harvested or not: the same building either way, no faded resource beside it', () => {
  for (const [building, resource, terrain] of [['farm', 'cropland', 'field'], ['orchard', 'orchard', 'field'], ['lumberCamp', 'game', 'forest']] as const) {
    expect(tris({ terrain, building, resource, harvested: true }), building).toBe(tris({ terrain, building, resource }));
    expect(colours({ terrain, building, resource, harvested: true })).toEqual(colours({ terrain, building, resource }));
    expect(piecesOf({ terrain, building, resource }).ground.attributes.aTile!.getZ(0)).toBe(RES_ID.none);
  }
});

test('the treasure chest is drawn in 3D on every land terrain, beside a unit as well, and only where the svg would draw it', () => {
  for (const terrain of ['field', 'forest', 'mountain'] as const) {
    expect(tris({ terrain, treasure: true }), terrain).toBeGreaterThan(tris({ terrain }) + 60);
    expect(has(colours({ terrain, treasure: true }), '#E7B53C'), terrain).toBe(true); // its gold bands
  }
  expect(tris({ treasure: true, beside: true })).toBe(tris({ treasure: true }));
  expect(has(colours({ treasure: true, building: 'farm' }), '#E7B53C')).toBe(false);
  expect(has(colours({ treasure: true, village: true }), '#E7B53C')).toBe(false);
});

test('what the tile buildings and the chest cost in triangles stays small', () => {
  for (const [building, terrain] of Object.entries(ON) as [keyof typeof ON, 'field' | 'forest'][]) {
    expect(tris({ terrain, building }), building).toBeLessThan(1600);
  }
  expect(tris({ treasure: true }) - tris({})).toBeLessThan(400);
});
