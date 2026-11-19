import { expect, test } from 'vitest';
import { CONFIG } from './config';
import { FACTIONS } from './factions';
import { TECHS } from './techs';
import { UNITS } from './units';

test('the data tables cannot be changed', () => {
  expect(Object.isFrozen(UNITS.hoplite.traits)).toBe(true);
  expect(Object.isFrozen(CONFIG.terrain.field)).toBe(true);
  expect(Object.isFrozen(TECHS.bronze)).toBe(true);
  expect(Object.isFrozen(FACTIONS.mongols)).toBe(true);
  expect(() => { (UNITS.warrior as { atk: number }).atk = 99; }).toThrow(TypeError);
  expect(UNITS.warrior.atk).toBe(4);
});
