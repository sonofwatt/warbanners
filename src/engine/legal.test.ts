import { expect, test } from 'vitest';
import { applyAction, legalActions, replay } from './apply';
import { hashState } from './hash';
import { addCity, addUnit, blankMatch, give, must } from './testkit';
import { createMatch } from './state';
import type { Action, MatchSettings } from './types';

test('every listed action is accepted and nothing else obvious is missing', () => {
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  const acts = legalActions(s);
  for (const a of acts) expect(applyAction(s, a).ok).toBe(true);
  expect(acts.at(-2)).toEqual({ type: 'endTurn' }); expect(acts.at(-1)).toEqual({ type: 'resign' });
  expect(acts.some(a => a.type === 'move')).toBe(true);
  expect(acts.some(a => a.type === 'train')).toBe(false);                    // the starting unit stands on the capital
  const moved = must(applyAction(s, acts.find(a => a.type === 'move')!));
  expect(legalActions(moved).some(a => a.type === 'train' && a.unitType === 'hoplite')).toBe(true);
  expect(acts.some(a => a.type === 'research' && a.tech === 'shieldwork')).toBe(true);
  expect(acts.some(a => a.type === 'research' && a.tech === 'smithing')).toBe(false);
});
test('nothing is legal once the match is over', () => {
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  expect(legalActions(must(applyAction(s, { type: 'resign' })))).toEqual([]);
});
test('replay reproduces a match and reports a bad action by index', () => {
  const settings: MatchSettings = { seed: 42, factions: ['spartans', 'mongols'] };
  let s = createMatch(settings); const log: Action[] = [];
  for (let i = 0; i < 6; i++) { const a = legalActions(s)[0]!; log.push(a); s = must(applyAction(s, a)); }
  expect(hashState(replay(settings, log))).toBe(hashState(s));
  expect(() => replay(settings, [...log, { type: 'move', unit: 999, to: '0,0' }])).toThrow(/action 6 refused/);
});
test('lure variants are listed only where a lure would be recorded', () => {
  const s = blankMatch({ factions: ['mongols', 'spartans'] }); addCity(s, 0, -4, 0);
  const rider = addUnit(s, 'horseman', 0, 0, 0);
  const victim = addUnit(s, 'warrior', 1, 1, 0);
  const attacks = (): Action[] => legalActions(s).filter(a => a.type === 'attack');
  expect(attacks()).toEqual([
    { type: 'attack', unit: rider.id, target: '1,0' }, { type: 'attack', unit: rider.id, target: '1,0', lure: true },
  ]);
  const piper = addUnit(s, 'piper', 1, 2, 0);                                // steadies the victim
  expect(piper.id).toBeGreaterThan(victim.id);
  expect(attacks()).toEqual([{ type: 'attack', unit: rider.id, target: '1,0' }]);
});
test('order: moves, attacks, abilities, capture, campTrain, then cities, tiles, research, endTurn, resign', () => {
  const s = blankMatch({ factions: ['mongols', 'spartans'] }); addCity(s, 0, -4, 0);
  give(s, 0, 'roads', 'riding');
  const camp = addUnit(s, 'camp', 0, 0, 0);
  s.players[0]!.explored = Object.keys(s.tiles).sort();
  const types = legalActions(s).map(a => a.type);
  const first = (t: string): number => types.indexOf(t as Action['type']);
  expect(first('move')).toBe(0);
  expect(first('campTrain')).toBeGreaterThan(first('move'));
  expect(first('train')).toBeGreaterThan(first('campTrain'));
  expect(first('road')).toBeGreaterThan(first('train'));
  expect(first('research')).toBeGreaterThan(first('road'));
  expect(camp.id).toBe(0);
});
