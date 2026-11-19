import { expect, test } from 'vitest';
import { createMatch, playerView } from '../../engine';
import { sameData } from './same';

test('plain values compare by value, however deep', () => {
  expect(sameData(1, 1)).toBe(true);
  expect(sameData('a', 'b')).toBe(false);
  expect(sameData(null, null)).toBe(true);
  expect(sameData(null, {})).toBe(false);
  expect(sameData([1, 2], [1, 2])).toBe(true);
  expect(sameData([1, 2], [1, 2, 3])).toBe(false);
  expect(sameData([1, 2], { 0: 1, 1: 2 })).toBe(false);
  expect(sameData({ a: { b: [1, { c: 'x' }] } }, { a: { b: [1, { c: 'x' }] } })).toBe(true);
  expect(sameData({ a: { b: [1, { c: 'x' }] } }, { a: { b: [1, { c: 'y' }] } })).toBe(false);
  expect(sameData({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  expect(sameData({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
});

test('two views of the same position are the same data, though every object in them is new', () => {
  const s = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
  const a = playerView(s, 0);
  const b = playerView(s, 0);
  expect(a.units[0]).not.toBe(b.units[0]);
  expect(sameData(a, b)).toBe(true);
  expect(sameData(a, { ...b, units: b.units.map((u) => ({ ...u, hp: u.hp - 1 })) })).toBe(false);
});
