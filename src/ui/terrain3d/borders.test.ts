import { GreaterDepth, LessEqualDepth } from 'three';
import type { Mesh, ShaderMaterial } from 'three';
import { expect, test } from 'vitest';
import { BORDER_WIDTH, borderLines } from '../art/tiles';
import { borderStrips, createBorders, HIDDEN_ALPHA, STRIP_WIDTH } from './borders';
import type { GlMap, GlTile } from './input';
import { centre, heightFn, SQUASH, tileSetup } from './layout';

const bare: GlTile = { terrain: 'field', resource: null, harvested: false, building: null, village: false, treasure: false, road: false, city: false, town: null };
const map = (terrain: GlTile['terrain'], edges: number[], colour = '#B3261E'): GlMap => ({
  radius: 3, fog: [],
  tiles: { '1,0': { ...bare, terrain }, '0,0': { ...bare, terrain: 'mountain' } },
  borders: [{ key: '1,0', edges, colour, lines: borderLines(edges).map(({ a, b }) => [a.x, a.y, b.x, b.y] as [number, number, number, number]) }],
});

/** Distance from p to the segment a-b. */
const segDist = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
};

test('on screen each strip is the svg border line: the same segments, the same width, round caps', () => {
  expect(STRIP_WIDTH).toBe(BORDER_WIDTH);
  for (const edges of [[0], [0, 1], [2, 3, 4], [0, 1, 2, 3, 4, 5]]) {
    const [s] = borderStrips(map('field', edges));
    const lines = borderLines(edges);
    const c = centre(1, 0);
    let far = 0;
    const near = new Set<number>();
    for (let i = 0; i < s!.tris.length; i += 3) {
      // A strip corner in board space, round the tile centre (the strips are built in board space).
      const p = { x: s!.tris[i]! - c.x, y: s!.tris[i + 1]! - c.z * SQUASH };
      const d = lines.map((l) => segDist(p, l.a, l.b));
      const best = Math.min(...d);
      far = Math.max(far, best);
      near.add(d.indexOf(best));
    }
    expect(far).toBeLessThanOrEqual(BORDER_WIDTH / 2 + 1e-6); // never wider than the svg's stroke
    expect(near.size).toBe(lines.length); // every line is drawn
  }
});

test('the strips lie just above the ground, mountains and hills included', () => {
  for (const terrain of ['field', 'mountain', 'forest'] as const) {
    const m = map(terrain, [0, 1, 2, 3, 4, 5]);
    const [s] = borderStrips(m);
    const h = heightFn(tileSetup(m, '1,0'));
    const c = centre(1, 0);
    for (let i = 0; i < s!.tris.length; i += 3) {
      const bx = s!.tris[i]! - c.x, by = s!.tris[i + 1]! - c.z * SQUASH, y = s!.tris[i + 2]!;
      const ground = h(bx, (by + y * Math.sqrt(1 - SQUASH * SQUASH)) / SQUASH);
      expect(y - ground).toBeGreaterThan(0.05);
      expect(y - ground).toBeLessThan(0.8);
    }
  }
});

test('drawn twice with the depth test: full strength where nothing stands in front, a quarter where something does', () => {
  const b = createBorders();
  const [front, hidden] = b.group.children as Mesh[];
  const fm = front!.material as ShaderMaterial, hm = hidden!.material as ShaderMaterial;
  expect(fm.depthFunc).toBe(LessEqualDepth);
  expect(hm.depthFunc).toBe(GreaterDepth);
  expect(fm.uniforms.uAlpha!.value).toBe(1);
  expect(hm.uniforms.uAlpha!.value).toBe(HIDDEN_ALPHA);
  expect(HIDDEN_ALPHA).toBe(0.25);
  expect(fm.transparent).toBe(false);
  expect(hm.transparent).toBe(true);
  expect(fm.depthWrite || hm.depthWrite).toBe(false); // they never hide anything themselves
  // After the ground and props, so whatever stands in front is already in the depth buffer.
  expect(front!.renderOrder).toBeGreaterThan(0);
  expect(hidden!.renderOrder).toBeGreaterThan(front!.renderOrder);
  b.dispose();
});

test('rebuilt only when the borders (or the ground under them) change', () => {
  const b = createBorders();
  const [front] = b.group.children as Mesh[];
  b.setMap(map('field', [0, 1]));
  const geo = front!.geometry;
  expect(b.triangles()).toBeGreaterThan(0);
  b.setMap(map('field', [0, 1]));
  expect(front!.geometry).toBe(geo);
  b.setMap(map('field', [0, 1], '#2D6DB5'));
  expect(front!.geometry).not.toBe(geo);
  const blue = front!.geometry;
  b.setMap(map('mountain', [0, 1], '#2D6DB5'));
  expect(front!.geometry).not.toBe(blue);
  b.setMap({ radius: 3, tiles: {}, fog: [] });
  expect(b.triangles()).toBe(0);
  b.dispose();
});
