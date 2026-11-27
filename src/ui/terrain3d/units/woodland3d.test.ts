import { expect, test } from 'vitest';
import { guardOf } from './crouch';
import { ALL_TYPES, BOW, buildFigure, FEET, LEGS, WEAPON } from './figures';
import type { UnitType } from './figures';
import { CLEAN } from './parts';
import { strikeKind } from './strike';

const WOODLAND: UnitType[] = ['skirmisher', 'woodlandHunter', 'warChief', 'smokeKeeper', 'trapper'];
const look = { main: '#B3261E', dark: '#8E1D17', accent: '#C8963E' };

test('rules 11: the five Woodland figures are built, each its own, with a shadow and moving legs', () => {
  for (const t of WOODLAND) expect(ALL_TYPES).toContain(t);
  const sizes = new Set<number>();
  for (const t of WOODLAND) {
    const f = buildFigure(t, { look, wear: CLEAN });
    expect(f.shadow.rx, t).toBeGreaterThan(0);
    expect(Object.keys(f.pieces), t).toEqual(expect.arrayContaining([LEGS, FEET]));
    sizes.add(f.triangles);
  }
  expect(sizes.size, 'no two Woodland figures are the same model').toBeGreaterThan(3);
});

test('each Woodland figure wears the owner\'s colour', () => {
  const blue = { main: '#2D6DB5', dark: '#1F4F87', accent: '#D4A72C' };
  const colours = (t: UnitType, l: typeof look): string => {
    const f = buildFigure(t, { look: l, wear: CLEAN });
    return [f.fill, ...Object.values(f.pieces).map((p) => p.fill)].map((g) => Array.from(g.getAttribute('color')?.array ?? []).join()).join('|');
  };
  for (const t of WOODLAND) expect(colours(t, look), t).not.toBe(colours(t, blue));
});

test('the hunker: the weapon carriers sling it onto the back and squat; the Keeper and the Trapper huddle lower', () => {
  for (const [t, piece] of [['warChief', WEAPON], ['skirmisher', WEAPON], ['woodlandHunter', BOW]] as const) {
    const g = guardOf(t);
    expect(g.pieces[piece], t).toBeDefined();
    expect(g.pieces[piece]!.shift[2], `${t} weapon goes behind the body`).toBeLessThan(-5);
    expect(g.drop, t).toBeGreaterThan(8);
  }
  for (const t of ['smokeKeeper', 'trapper'] as const) {
    expect(guardOf(t).drop).toBeGreaterThan(guardOf('warChief').drop);
    expect(guardOf(t).lean).toBeGreaterThan(guardOf('warChief').lean);
  }
  // The Hunter's bow is built as a piece with the drawing arm and the arrow, so its shot plays as an archer's.
  const hunter = buildFigure('woodlandHunter', { look, wear: CLEAN });
  expect(Object.keys(hunter.pieces)).toEqual(expect.arrayContaining([BOW, WEAPON]));
  expect(strikeKind('woodlandHunter')).toBe('bow');
  expect(strikeKind('warChief')).toBe('swing');
});
