import { describe, expect, test } from 'vitest';
import { applyAction, createMatch, replay } from '../engine';
import type { Action, MatchSettings, MatchState } from '../engine';
import { randomPlayoutLog } from '../engine/testkit';
import { roundOf } from './record';
import { matchTallies } from './tally';

const SETTINGS: MatchSettings = { seed: 3, factions: ['spartans', 'mongols'] };

// An independent count of damage dealt, per seat, from the events of a replay.
function dealtByReplay(settings: MatchSettings, actions: readonly Action[]): number[] {
  let s: MatchState = createMatch(settings);
  const out = [0, 0];
  for (const a of actions) {
    const before = s;
    const r = applyAction(s, a);
    if (!r.ok) break;
    for (const e of r.events) {
      if (e.type === 'attacked') {
        const atk = before.units.find(u => u.id === e.unit)!.owner;
        out[atk]! += e.damage;
        out[1 - atk]! += e.counter;
      } else if (e.type === 'splashed') out[before.current]! += e.damage;
    }
    s = r.state;
  }
  return out;
}

test('a fresh match counts nothing', () => {
  const t = matchTallies(SETTINGS, []);
  expect(t.rounds).toBe(1);
  expect(t.winner).toBeNull();
  for (const x of t.tallies) expect(x).toEqual({ dealt: 0, taken: 0, kills: 0, deaths: 0, cities: 0, heroes: 0, treasures: 0 });
});

describe('random playouts', () => {
  for (const seed of [1, 2, 5, 11, 42]) {
    test(`seed ${seed}: the two sides mirror each other and damage matches the events`, () => {
      const { state, actions } = randomPlayoutLog(seed, 60);
      const settings: MatchSettings = { seed, factions: ['spartans', 'mongols'] };
      const t = matchTallies(settings, actions);
      const [a, b] = t.tallies;
      expect(a.kills).toBe(b.deaths);
      expect(b.kills).toBe(a.deaths);
      expect(a.taken).toBe(b.dealt);
      expect(b.taken).toBe(a.dealt);
      expect([a.dealt, b.dealt]).toEqual(dealtByReplay(settings, actions));
      expect(t.winner).toBe(state.winner);
      expect(t.rounds).toBe(roundOf(state));
    });
  }

  test('some playout has fighting, deaths and treasure, so the counts are not all zero', () => {
    const all = [1, 2, 5, 11, 42].map(seed => matchTallies({ seed, factions: ['spartans', 'mongols'] }, randomPlayoutLog(seed, 60).actions));
    const sum = (k: 'dealt' | 'kills' | 'treasures') => all.reduce((n, t) => n + t.tallies[0][k] + t.tallies[1][k], 0);
    expect(sum('dealt')).toBeGreaterThan(0);
    expect(sum('kills')).toBeGreaterThan(0);
    expect(sum('treasures')).toBeGreaterThan(0);
  });
});

test('a resign gives the other seat the win', () => {
  const actions: Action[] = [{ type: 'endTurn' }, { type: 'resign' }];
  const t = matchTallies(SETTINGS, actions);
  expect(t.winner).toBe(0);
  expect(replay(SETTINGS, actions).winner).toBe(0);
});

test('a refused action stops the count where the match stopped', () => {
  const t = matchTallies(SETTINGS, [{ type: 'endTurn' }, { type: 'move', unit: 999, to: '0,0' }, { type: 'endTurn' }]);
  expect(t.rounds).toBe(1);
});
