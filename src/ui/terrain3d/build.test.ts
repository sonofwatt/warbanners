import { expect, test } from 'vitest';
import { tilePieces } from './build';
import type { GlMap, GlTile } from './input';
import { RES_HARVESTED, RES_ID } from './layout';

const bare: GlTile = { terrain: 'field', resource: null, harvested: false, building: null, village: false, treasure: false, road: false, city: false };
const piecesOf = (t: Partial<GlTile>) => {
  const map: GlMap = { radius: 3, tiles: { '1,0': { ...bare, ...t } }, fog: [] };
  return tilePieces(map, '1,0');
};
const colours = (t: Partial<GlTile>): Float32Array => piecesOf(t).props!.attributes.color!.array as Float32Array;

test('every rules 8 resource has 3D props, and a harvested one is the same shape, faded', () => {
  for (const [terrain, resource] of [['mountain', 'jewels'], ['water', 'fish'], ['field', 'orchard'], ['field', 'cropland'], ['forest', 'game'], ['mountain', 'ore']] as const) {
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
