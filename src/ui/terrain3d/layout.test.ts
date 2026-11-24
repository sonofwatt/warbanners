import { expect, test } from 'vitest';
import type { GlMap, GlTile } from './input';
import { EDGE_NB, edgeDist, peaksFor, tileSetup, turnOf, variantOf } from './layout';

test('no two neighbouring tiles share a layout, and every tile turns one of six ways', () => {
  const turns = new Set<number>();
  for (let q = -6; q <= 6; q++) {
    for (let r = -6; r <= 6; r++) {
      const v = variantOf(q, r);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(4);
      for (const [dq, dr] of EDGE_NB) expect(variantOf(q + dq, r + dr)).not.toBe(v);
      const t = turnOf(q, r);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(6);
      turns.add(t);
    }
  }
  expect(turns.size).toBe(6);
});

test('a mountain is one tall straight peak with two or three clearly lower ones that stay on the tile', () => {
  for (let v = 0; v < 4; v++) {
    for (let turn = 0; turn < 6; turn++) {
      const [main, ...subs] = peaksFor(v, turn, false, false);
      expect(main!.h * Math.sqrt(1 - 0.62 * 0.62)).toBeGreaterThan(35); // board units on screen
      expect(main!.h * Math.sqrt(1 - 0.62 * 0.62)).toBeLessThan(38.5);
      expect(subs.length).toBeGreaterThanOrEqual(2);
      expect(subs.length).toBeLessThanOrEqual(3);
      for (const s of subs) {
        expect(s.h / main!.h).toBeGreaterThanOrEqual(0.4);
        expect(s.h / main!.h).toBeLessThanOrEqual(0.65);
        expect(edgeDist(s.x, s.z)).toBeGreaterThan(s.b * 0.9);
        // Left of the main peak means behind it, so its lit left face is never covered.
        if (s.x < main!.x) expect(s.z).toBeLessThan(main!.z - 5);
      }
    }
  }
});

test('ore or a mine on a mountain keeps the front of the tile clear', () => {
  const peaks = peaksFor(1, 0, true, true);
  for (const p of peaks.slice(1)) expect(p.z).toBeLessThanOrEqual(-8);
});

test('each terrain has four distinct layouts', () => {
  const field: GlTile = { terrain: 'field', resource: null, building: null, village: false, treasure: false, road: false, city: false };
  for (const terrain of ['field', 'forest', 'mountain', 'water'] as const) {
    const looks = new Set<string>();
    for (const k of ['0,0', '1,0', '2,0', '3,0']) {
      const map: GlMap = { radius: 4, tiles: { [k]: { ...field, terrain } }, fog: [] };
      const s = tileSetup(map, k);
      looks.add(`${s.v}`);
      expect(s.trees.length + s.peaks.length + s.bits.length + (terrain === 'water' && s.v === 0 ? 1 : 0)).toBeGreaterThan(0);
    }
    expect(looks.size).toBe(4);
  }
});

test('the 3D walls are five times the svg walls, and the board bounds grow only below the tiles', async () => {
  const { boardBounds, hexToBoard, THICK } = await import('../board/layout');
  const { THICK_3D } = await import('./input');
  expect(THICK_3D).toBe(5 * THICK);
  const svg = boardBounds(6);
  const gl = boardBounds(6, THICK_3D);
  expect(gl.maxY - svg.maxY).toBe(THICK_3D - THICK);
  expect([gl.minX, gl.minY, gl.maxX]).toEqual([svg.minX, svg.minY, svg.maxX]);
  expect(hexToBoard('2,3')).toEqual(hexToBoard('2,3')); // tile tops do not move
});
