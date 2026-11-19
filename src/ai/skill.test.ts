import { expect, test } from 'vitest';
import { TECHS, UNITS } from '../engine';
import { PERSONAS } from './persona';
import { skillFor } from './skill';
import { LEVEL_DIAL } from './types';

test('the three fixed levels and the ends of the dial', () => {
  expect(skillFor(0)).toEqual({ topK: 4, temperature: 3, margin: 6, lookahead: 0, danger: 0.3, focus: 0, economy: 0.5, evals: 150 });
  expect(skillFor(1)).toEqual({ topK: 1, temperature: 0.1, margin: 1, lookahead: 2, danger: 1, focus: 1, economy: 1, evals: 1200 });
  expect(skillFor(LEVEL_DIAL.normal)).toMatchObject({ topK: 3, lookahead: 1, evals: 675 });
  expect(skillFor(LEVEL_DIAL.hard)).toMatchObject({ topK: 1, lookahead: 2, evals: 1043 });
  expect(skillFor(-3)).toEqual(skillFor(0)); expect(skillFor(9)).toEqual(skillFor(1));
});
test('every persona names only real techs and units of its own faction or shared ones', () => {
  for (const [f, p] of Object.entries(PERSONAS)) {
    expect(new Set(p.techOrder)).toEqual(new Set(Object.keys(TECHS)));
    expect(p.techOrder).toHaveLength(Object.keys(TECHS).length);
    for (const u of p.trainOrder) expect([null, f]).toContain(UNITS[u].faction);
  }
});
