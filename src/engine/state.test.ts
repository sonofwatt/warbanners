import { expect, test } from 'vitest';
import { hashState } from './hash';
import { createMatch, isEnterable, tileAt } from './state';
import { blankMatch } from './testkit';
import { RULES_VERSION } from './types';

test('createMatch sets up rules 4', () => {
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  expect(s.rulesVersion).toBe(RULES_VERSION);
  expect(s.players.map(p => p.gold)).toEqual([10, 12]);   // the second seat starts with 2 more gold (rules 7)
  expect(s.players.map(p => p.techs)).toEqual([['prospecting', 'foraging'], ['gathering']]);   // rules 8; the Spartans' Foraging since rules 9
  expect(s.cities.map(c => c.growth)).toEqual([3, 0]);   // rules 9: the Spartan capital's head start, banked at level 1
  expect(s.cities.map(c => [c.pos, c.owner, c.capital, c.level])).toEqual([['-2,5', 0, true, 1], ['2,-5', 1, true, 1]]);
  expect(s.units.map(u => [u.type, u.owner, u.pos, u.home])).toEqual([['scout', 0, '-2,5', 0], ['horseman', 1, '2,-5', 1]]);
  expect(s.tiles['-2,5']!.cityId).toBe(0);
  expect(s.tiles['-1,5']!.cityId).toBe(0);
  expect([s.current, s.stamp, s.winner]).toEqual([0, 0, null]);
  expect(createMatch({ seed: 42, factions: ['spartans', 'mongols'] })).toEqual(s);
});
test('starting units can act on the first turn', () => {
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  expect(s.units[0]).toMatchObject({ type: 'scout', mp: 4, attacks: 1 });
});
test('a Mongol starting horseman begins with its full movement and no bonus (rules 8)', () => {
  const s = createMatch({ seed: 42, factions: ['mongols', 'spartans'] });
  expect(s.units[0]).toMatchObject({ type: 'horseman', mp: 4, bonusMp: 0 });    // 4 half-points; the half-point bonus is gone
});
test('inherited property names are not tiles', () => {
  const s = blankMatch();
  for (const k of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    expect(isEnterable(s, k)).toBe(false);
    expect(tileAt(s, k)).toBeUndefined();
  }
  expect(tileAt(s, '0,0')).toBe(s.tiles['0,0']);
  expect(tileAt(s, '9,9')).toBeUndefined();
});
test('the seed is stored as an unsigned 32-bit number, so -1 and 4294967295 are the same match', () => {
  const a = createMatch({ seed: -1, factions: ['spartans', 'mongols'] });
  const b = createMatch({ seed: 4294967295, factions: ['spartans', 'mongols'] });
  expect(a.seed).toBe(4294967295);
  expect(hashState(a)).toBe(hashState(b));
});
