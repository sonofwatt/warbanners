import { expect, test } from 'vitest';
import { createMatch } from './state';
import { RULES_VERSION } from './types';

test('createMatch sets up rules 4', () => {
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  expect(s.rulesVersion).toBe(RULES_VERSION);
  expect(s.players.map(p => p.gold)).toEqual([8, 10]);
  expect(s.players.map(p => p.techs)).toEqual([['bronze'], ['riding']]);
  expect(s.cities.map(c => [c.pos, c.owner, c.capital, c.level])).toEqual([['-2,5', 0, true, 1], ['2,-5', 1, true, 1]]);
  expect(s.units.map(u => [u.type, u.owner, u.pos, u.home])).toEqual([['warrior', 0, '-2,5', 0], ['horseman', 1, '2,-5', 1]]);
  expect(s.tiles['-2,5']!.cityId).toBe(0);
  expect(s.tiles['-1,5']!.cityId).toBe(0);
  expect([s.current, s.stamp, s.winner]).toEqual([0, 0, null]);
  expect(createMatch({ seed: 42, factions: ['spartans', 'mongols'] })).toEqual(s);
});
test('starting units can act on the first turn', () => {
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  expect(s.units[0]).toMatchObject({ mp: 2, attacks: 1 });
});
