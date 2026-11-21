import { expect, test } from 'vitest';
import { TECHS, UNITS } from '../engine';
import type { UnitTypeId } from '../engine';
import { PERSONAS } from './persona';
import { skillFor } from './skill';
import { LEVEL_DIAL } from './types';

test('the three fixed levels and the ends of the dial', () => {
  expect(skillFor(0)).toEqual({ topK: 4, temperature: 3, margin: 6, lookahead: 0, danger: 1.3, focus: 0, economy: 0.5, evals: 150 });
  expect(skillFor(1)).toEqual({ topK: 1, temperature: 0.1, margin: 1, lookahead: 2, danger: 0, focus: 1, economy: 1, evals: 1200 });
  expect(skillFor(LEVEL_DIAL.normal)).toMatchObject({ topK: 3, lookahead: 1, evals: 675 });
  expect(skillFor(LEVEL_DIAL.hard)).toMatchObject({ topK: 1, lookahead: 2, evals: 1043 });
  expect(skillFor(-3)).toEqual(skillFor(0)); expect(skillFor(9)).toEqual(skillFor(1));
});
// Measured in Task 12b: a higher danger weight plays more timidly and loses more, mostly as the Mongols (hard with
// the old weight 0.9 won 24% from the second seat, with 0.3 43%, with 0 48%), so caution falls as the skill rises.
// Normal keeps the weight Task 12's faction balance was measured with.
test('the danger weight falls as the skill rises', () => {
  const d = [0, LEVEL_DIAL.easy, LEVEL_DIAL.normal, LEVEL_DIAL.hard, 1].map((x) => skillFor(x).danger);
  for (let i = 1; i < d.length; i++) expect(d[i]).toBeLessThan(d[i - 1]!);
  expect(skillFor(LEVEL_DIAL.normal).danger).toBeCloseTo(0.65, 9);
});
test('every persona names only real techs and trainable units of its own faction or shared ones', () => {
  for (const [f, p] of Object.entries(PERSONAS)) {
    expect(new Set(p.techOrder)).toEqual(new Set(Object.keys(TECHS)));
    expect(p.techOrder).toHaveLength(Object.keys(TECHS).length);
    for (const u of Object.keys(p.mix) as UnitTypeId[]) {
      expect([null, f]).toContain(UNITS[u].faction);
      expect(UNITS[u].cost).not.toBeNull();
    }
  }
});
