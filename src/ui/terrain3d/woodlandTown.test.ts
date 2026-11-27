import { expect, test } from 'vitest';
import './layout';   // first, as the other tests load it: townLayout and layout import each other
import { pieceFits, townPlan } from './townLayout';
import { buildingPieceFits, buildingPlan, FIELD_BUILDINGS } from './buildingLayout';
import type { TownKind } from './townLayout';

const count = (level: number, walls = false, capital = false): Record<string, number> => {
  const plan = townPlan({ faction: 'woodland', level, capital, walls }, 2, -1);
  const out: Record<string, number> = { palisade: plan.walls === null ? 0 : 1 };
  for (const p of plan.pieces) out[p.kind] = (out[p.kind] ?? 0) + 1;
  return out;
};
const pick = (c: Record<string, number>, ...k: (TownKind | 'palisade')[]): number[] => k.map((x) => c[x] ?? 0);

test('rules 11: a Woodland city grows by level as David set it out', () => {
  const K = ['tipi', 'longhouse', 'wigwam', 'lodge', 'palisade'] as const;
  expect(pick(count(1), ...K)).toEqual([2, 0, 0, 0, 0]);
  expect(pick(count(2), ...K)).toEqual([1, 1, 0, 0, 0]);
  expect(pick(count(3), ...K)).toEqual([1, 1, 2, 0, 0]);
  expect(pick(count(4), ...K)).toEqual([1, 1, 2, 1, 0]);
  expect(pick(count(5), ...K)).toEqual([2, 1, 2, 1, 1]);
  expect(pick(count(6), ...K)).toEqual([3, 1, 2, 1, 1]);
  expect(pick(count(7), ...K)).toEqual([3, 1, 3, 1, 1]);
});

test('a tipi at every level, the palisade with walls at any level, and every piece on the tile, clear of the square', () => {
  for (let level = 1; level <= 8; level++) {
    expect(count(level).tipi ?? 0, `level ${level}`).toBeGreaterThan(0);
    for (const p of townPlan({ faction: 'woodland', level, capital: level % 2 === 0, walls: false }, 0, 0).pieces) {
      expect(pieceFits(p), `${p.kind} at level ${level}`).toBe(true);
    }
  }
  expect(count(2, true).palisade).toBe(1);
  expect(townPlan({ faction: 'woodland', level: 3, capital: true, walls: false }, 0, 0).banner).not.toBeNull();
});

test('the other peoples\' cities are unchanged: no Woodland piece in them', () => {
  for (const faction of ['spartans', 'mongols'] as const) {
    for (let level = 1; level <= 6; level++) {
      const kinds = townPlan({ faction, level, capital: false, walls: false }, 1, 1).pieces.map((p) => p.kind);
      expect(kinds.some((k) => ['tipi', 'longhouse', 'wigwam', 'lodge'].includes(k))).toBe(false);
    }
  }
});

test('rules 11: each tile building has its own Woodland look on Woodland land, and today\'s look elsewhere', () => {
  const own: Record<string, string> = {
    farm: 'wigwamHut', granary: 'storehouse', orchard: 'thicket', plantation: 'thicket', lumberCamp: 'leanTo', lumberMill: 'bigLeanTo', market: 'tradeLodge',
  };
  for (const b of FIELD_BUILDINGS) {
    const wood = buildingPlan(b, 0, 1, 2, true);
    const plain = buildingPlan(b, 0, 1, 2);
    expect(wood.pieces.map((p) => p.kind), b).toContain(own[b]);
    expect(plain.pieces.map((p) => p.kind), b).not.toContain(own[b]);
    expect(plain, b).toEqual(buildingPlan(b, 0, 1, 2, false));
    for (const p of wood.pieces) expect(buildingPieceFits(p), `${b} ${p.kind}`).toBe(true);
    for (const turn of [1, 2, 3]) for (const p of buildingPlan(b, turn, 3, -2, true).pieces) expect(buildingPieceFits(p), `${b} ${p.kind} turn ${turn}`).toBe(true);
  }
  expect(buildingPlan('lumberMill', 0, 0, 0, true).wheel).toBeNull();
});
