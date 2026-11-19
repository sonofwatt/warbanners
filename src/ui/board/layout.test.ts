import { expect, test } from 'vitest';
import { neighbors } from '../../engine';
import {
  boardBounds,
  boardKeys,
  boardToHex,
  depthOrder,
  edgeDirs,
  hexToBoard,
  tileCorners,
} from './layout';

test('tile centres', () => {
  expect(hexToBoard('0,0').x).toBeCloseTo(0, 5);
  expect(hexToBoard('0,0').y).toBeCloseTo(0, 5);
  expect(hexToBoard('1,0').x).toBeCloseTo(51.96, 2);
  expect(hexToBoard('1,0').y).toBeCloseTo(0, 5);
  expect(hexToBoard('0,1').x).toBeCloseTo(25.98, 2);
  expect(hexToBoard('0,1').y).toBeCloseTo(27.9, 5);
  expect(hexToBoard('-2,5').x).toBeCloseTo(25.98, 2);
  expect(hexToBoard('-2,5').y).toBeCloseTo(139.5, 5);
});

test('tiles meet with no gap', () => {
  const a = tileCorners('0,0')[0]!;
  const b = tileCorners('0,1')[4]!;
  expect(a.x).toBeCloseTo(25.98, 2);
  expect(a.y).toBeCloseTo(9.3, 5);
  expect(b.x).toBeCloseTo(a.x, 5);
  expect(b.y).toBeCloseTo(a.y, 5);
});

test('every tile of the stage 1 board is found from its centre and from 10 units off it', () => {
  const keys = boardKeys(6);
  expect(keys).toHaveLength(127);
  for (const k of keys) {
    const c = hexToBoard(k);
    expect(boardToHex(c)).toBe(k);
    expect(boardToHex({ x: c.x + 10, y: c.y })).toBe(k);
    expect(boardToHex({ x: c.x, y: c.y - 10 })).toBe(k);
  }
});

test('back to front order', () => {
  const keys = boardKeys(6);
  for (let i = 1; i < keys.length; i++) {
    expect(hexToBoard(keys[i]!).y).toBeGreaterThanOrEqual(hexToBoard(keys[i - 1]!).y - 1e-9);
  }
});

test('depthOrder sorts by y then x', () => {
  expect(depthOrder('0,0', '0,1')).toBeLessThan(0);
  expect(depthOrder('0,1', '0,0')).toBeGreaterThan(0);
  expect(depthOrder('0,0', '1,0')).toBeLessThan(0);
  expect(depthOrder('1,0', '1,0')).toBe(0);
});

test('bounds of the stage 1 board', () => {
  const b = boardBounds(6);
  expect(b.minX).toBeCloseTo(-337.75, 1);
  expect(b.maxX).toBeCloseTo(337.75, 1);
  expect(b.minY).toBeCloseTo(-220.0, 1);
  expect(b.maxY).toBeCloseTo(195.0, 1);
});

test('edge directions are unit vectors in the engine direction order', () => {
  const dirs = edgeDirs();
  expect(dirs).toHaveLength(6);
  const c = hexToBoard('0,0');
  neighbors({ q: 0, r: 0 }).forEach((n, i) => {
    const p = hexToBoard(`${n.q},${n.r}`);
    const d = dirs[i]!;
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 9);
    const len = Math.hypot(p.x - c.x, p.y - c.y);
    expect(d.x).toBeCloseTo((p.x - c.x) / len, 9);
    expect(d.y).toBeCloseTo((p.y - c.y) / len, 9);
  });
});
