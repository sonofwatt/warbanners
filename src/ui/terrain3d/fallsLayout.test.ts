import { expect, test } from 'vitest';
import { anyInView, fallSpots, FRONT_EDGES, waterfallEdges } from './fallsLayout';
import type { GlMap, GlTile } from './input';

const tile = (terrain: GlTile['terrain'], p: Partial<GlTile> = {}): GlTile => ({ terrain, resource: null, building: null, village: false, treasure: false, road: false, city: false, ...p });

/** A radius 2 board, all field, with the given tiles replaced. */
function board(over: Record<string, GlTile>, fog: string[] = []): GlMap {
  const tiles: Record<string, GlTile> = {};
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) if (Math.abs(q + r) <= 2) tiles[`${q},${r}`] = tile('field');
  for (const k of fog) delete tiles[k];
  return { radius: 2, tiles: { ...tiles, ...over }, fog };
}

test('only the front edges can show a wall', () => {
  expect(FRONT_EDGES).toEqual([1, 2]);
});

test('water on the front rim pours over the edges that face off the board', () => {
  // 0,2 is on the bottom row: both its front neighbours (0,3 and -1,3) are off the board.
  const m = board({ '0,2': tile('water'), '2,0': tile('water'), '-2,2': tile('water') });
  expect(waterfallEdges(m, '0,2')).toEqual([1, 2]);
  // 2,0 is on the right rim: edge 1 (2,1) is off the board, edge 2 (1,1) is on it.
  expect(waterfallEdges(m, '2,0')).toEqual([1]);
  // -2,2 is the bottom left corner: edge 2 (-3,3) and edge 1 (-2,3) are both off.
  expect(waterfallEdges(m, '-2,2')).toEqual([1, 2]);
});

test('no fall inland, on land, on a back edge, on a city, or on a tile that is not drawn', () => {
  const m = board({ '0,0': tile('water'), '0,-2': tile('water'), '1,1': tile('field'), '-1,2': tile('water', { city: true }) });
  expect(waterfallEdges(m, '0,0'), 'inland water: its neighbours cover the wall').toEqual([]);
  expect(waterfallEdges(m, '0,-2'), 'the back rim faces away').toEqual([]);
  expect(waterfallEdges(m, '1,1'), 'land').toEqual([]);
  expect(waterfallEdges(m, '-1,2'), 'a city').toEqual([]);
  expect(waterfallEdges(m, '5,5'), 'not on the map').toEqual([]);
  // A fogged neighbour on the board still covers the wall.
  const fogged = board({ '1,0': tile('water') }, ['1,1']);
  expect(Object.keys(fogged.tiles)).not.toContain('1,1');
  expect(waterfallEdges(fogged, '1,0')).toEqual([]);
});

test('fall spots: one per edge, in a stable order, with a screen box below the lip', () => {
  const m = board({ '0,2': tile('water'), '2,0': tile('water') });
  const s = fallSpots(m);
  expect(s.map((f) => `${f.key}/${f.edge}`)).toEqual(['0,2/1', '0,2/2', '2,0/1']);
  for (const f of s) {
    expect(f.box.y1).toBeGreaterThan(f.box.y0 + 40);
    expect(f.n[1]).toBeGreaterThan(0); // toward the viewer
    expect(Math.hypot(f.a[0] - f.b[0], f.a[1] - f.b[1])).toBeCloseTo(30, 6);
  }
  expect(anyInView([s[0]!.box], { x0: s[0]!.box.x0 - 10, x1: s[0]!.box.x0 - 1, y0: s[0]!.box.y0, y1: s[0]!.box.y1 })).toBe(false);
  expect(anyInView([s[0]!.box], { x0: s[0]!.box.x0 - 10, x1: s[0]!.box.x0 + 1, y0: s[0]!.box.y0, y1: s[0]!.box.y1 })).toBe(true);
});

test('the water clock wraps seamlessly: every pattern and every mist puff repeats a whole number of times per period', async () => {
  const { FLOW_CELLS, FLOW_PERIOD, mistRate } = await import('./falls');
  for (const cells of Object.values(FLOW_CELLS)) {
    const n = cells * FLOW_PERIOD;
    expect(Math.abs(n - Math.round(n)), `${cells} cells a second`).toBeLessThan(1e-6);
  }
  for (let w = 0; w <= 1; w += 1 / 29) {
    const n = mistRate(w) * FLOW_PERIOD;
    expect(Math.abs(n - Math.round(n))).toBeLessThan(1e-9);
  }
});
