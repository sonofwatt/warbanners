// water3d: mountain ridges.
import { expect, test } from 'vitest';
import { tilePieces } from './build';
import type { GlMap, GlTile } from './input';
import { tileSetup } from './layout';
import { RIDGE_CHANCE, ridgeAnchors, ridgeChance, ridgeEdges, ridgeHalves, ridgeRoll } from './ridges';

const bare: GlTile = { terrain: 'field', resource: null, harvested: false, building: null, village: false, treasure: false, road: false, city: false, town: null };
const mountain = (t: Partial<GlTile> = {}): GlTile => ({ ...bare, terrain: 'mountain', ...t });

function board(m: Record<string, GlTile>, seed: number): GlMap {
  const tiles: Record<string, GlTile> = {};
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) if (Math.abs(q + r) <= 3) tiles[`${q},${r}`] = { ...bare };
  return { radius: 3, tiles: { ...tiles, ...m }, fog: [], seed };
}
/** The first seed that joins (or parts) every pair asked. */
function seedFor(join: [string, string][], apart: [string, string][] = []): number {
  for (let s = 0; ; s++) if (join.every(([a, b]) => ridgeChance(a, b, s)) && apart.every(([a, b]) => !ridgeChance(a, b, s))) return s;
}

test('the choice is the same whichever tile asks, every time, and about 30 percent of pairs', () => {
  let joined = 0, n = 0;
  for (let seed = 0; seed < 40; seed++) {
    for (let q = -8; q <= 8; q++) {
      for (let r = -8; r <= 8; r++) {
        const a = `${q},${r}`, b = `${q + 1},${r}`, c = `${q},${r + 1}`;
        for (const o of [b, c]) {
          expect(ridgeRoll(a, o, seed)).toBe(ridgeRoll(o, a, seed));
          expect(ridgeChance(a, o, seed)).toBe(ridgeChance(a, o, seed));
          if (ridgeChance(a, o, seed)) joined++;
          n++;
        }
      }
    }
  }
  expect(Math.abs(joined / n - RIDGE_CHANCE)).toBeLessThan(0.01);
  // Another seed makes other choices.
  let differ = 0;
  for (let q = 0; q < 200; q++) if (ridgeChance(`${q},0`, `${q + 1},0`, 1) !== ridgeChance(`${q},0`, `${q + 1},0`, 2)) differ++;
  expect(differ).toBeGreaterThan(40);
});

test('only touching mountains join; both tiles agree on the join and meet at one crossing', () => {
  const seed = seedFor([['0,0', '1,0'], ['0,0', '0,1']]);
  const map = board({ '0,0': mountain(), '1,0': mountain(), '0,1': mountain(), '-1,0': { ...bare, terrain: 'forest' } }, seed);
  expect(ridgeEdges(map, '0,0').sort()).toEqual([0, 1]);
  expect(ridgeEdges(map, '1,0')).toContain(3);
  expect(ridgeEdges(map, '0,1')).toContain(4);
  expect(ridgeEdges(map, '-1,0')).toEqual([]);
  for (const [k, e, nk, ne] of [['0,0', 0, '1,0', 3], ['0,0', 1, '0,1', 4]] as const) {
    const a = ridgeHalves(map, k).find((h) => h.edge === e)!, b = ridgeHalves(map, nk).find((h) => h.edge === ne)!;
    expect(a.sections.at(-1)).toEqual(b.sections.at(-1)); // the very same crossing section
    expect(a.sections.at(-1)!.h).toBeGreaterThan(8); // a saddle, not a gap
    // Each half starts at its own tile's main peak, which stands well up on the ridge.
    expect(a.sections[0]!.h).toBeGreaterThan(a.sections.at(-1)!.h);
    expect(b.sections[0]!.h).toBeGreaterThan(b.sections.at(-1)!.h);
  }
  // A city on a mountain tile is not a mountain to the look.
  const city = board({ '0,0': mountain(), '1,0': mountain({ city: true }) }, seed);
  expect(ridgeEdges(city, '0,0')).toEqual([]);
});

test('a ridge leaves every tile its content: the same peaks and props, and the crest keeps clear of them', () => {
  const contents: Partial<GlTile>[] = [
    { resource: 'ore' }, { resource: 'jewels' }, { resource: 'ore', building: 'mine' }, { resource: 'ore', building: 'foundry' }, { treasure: true },
  ];
  for (const c of contents) {
    for (const [nk, e] of [['1,0', 0], ['0,1', 1], ['-1,1', 2], ['-1,0', 3], ['0,-1', 4], ['1,-1', 5]] as const) {
      const seed = seedFor([['0,0', nk]]);
      const joined = board({ '0,0': mountain(c), [nk]: mountain(c) }, seed);
      const alone = board({ '0,0': mountain(c) }, seed);
      const s = tileSetup(joined, '0,0'), s0 = tileSetup(alone, '0,0');
      expect(s.ridges.map((h) => h.edge)).toEqual([e]);
      expect(s.peaks).toEqual(s0.peaks);
      expect(s.props).toEqual(s0.props);
      expect(s.chest).toEqual(s0.chest);
      expect(s.works).toEqual(s0.works);
      // Every section's foot stays off what stands on either tile.
      const anchors = [...ridgeAnchors(joined.tiles['0,0']!, 0, 0), ...ridgeAnchors(joined.tiles[nk]!, ...(nk.split(',').map(Number) as [number, number]))];
      for (const half of [...s.ridges, ...ridgeHalves(joined, nk)]) {
        for (const sec of half.sections) {
          for (const a of anchors) {
            const d = a.hx === undefined ? Math.hypot(sec.x - a.x, sec.z - a.z) - a.rad
              : Math.hypot(Math.max(0, Math.abs(sec.x - a.x) - a.hx), Math.max(0, Math.abs(sec.z - a.z) - (a.hz ?? 0))) - a.rad;
            expect(d - sec.w, `${JSON.stringify(c)} edge ${e}`).toBeGreaterThanOrEqual(1.49);
          }
        }
      }
    }
  }
});

test('a ridge is drawn as rock between the peaks, and costs a few hundred triangles a pair', () => {
  const seed = seedFor([['0,0', '1,0']]);
  const tris = (m: GlMap, k: string): number => tilePieces(m, k).props!.attributes.position!.count / 3;
  const joined = board({ '0,0': mountain(), '1,0': mountain() }, seed);
  const apart = board({ '0,0': mountain(), '1,0': mountain() }, seedFor([], [['0,0', '1,0']]));
  const extra = tris(joined, '0,0') + tris(joined, '1,0') - tris(apart, '0,0') - tris(apart, '1,0');
  expect(extra).toBeGreaterThan(100);
  expect(extra).toBeLessThan(700);
  // Not joined: just as before, two separate mountains.
  expect(tileSetup(apart, '0,0').ridges).toEqual([]);
});
