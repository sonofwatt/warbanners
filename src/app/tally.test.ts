import { describe, expect, test } from 'vitest';
import { CONFIG, applyAction, createMatch, replay } from '../engine';
import type { Action, MatchSettings, MatchState } from '../engine';
import { addUnit, blankMatch, randomPlayoutLog } from '../engine/testkit';
import { roundOf } from './record';
import { emptyTally, matchTallies, tallyStep } from './tally';
import type { Tally } from './tally';

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
    }, 30_000);
  }

  test('some playout has fighting, deaths and treasure, so the counts are not all zero', () => {
    const all = [1, 2, 5, 11, 42].map(seed => matchTallies({ seed, factions: ['spartans', 'mongols'] }, randomPlayoutLog(seed, 60).actions));
    const sum = (k: 'dealt' | 'kills' | 'treasures') => all.reduce((n, t) => n + t.tallies[0][k] + t.tallies[1][k], 0);
    expect(sum('dealt')).toBeGreaterThan(0);
    expect(sum('kills')).toBeGreaterThan(0);
    expect(sum('treasures')).toBeGreaterThan(0);
  }, 30_000);   // rules 8's tree gives random play more to choose from: about 4.7 s alone, past the 5 s default in a full run
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

test('rules 11: a snare\'s damage counts as dealt by its owner', () => {
  const s = blankMatch({ factions: ['mongols', 'woodland'] });
  const h = addUnit(s, 'horseman', 0, 0, 0);
  s.snares = [{ owner: 1, at: '1,0' }];
  const r = applyAction(s, { type: 'move', unit: h.id, to: '2,0' });
  if (!r.ok) throw new Error(r.reason);
  expect(r.events.some(e => e.type === 'snared')).toBe(true);
  const t: [Tally, Tally] = [emptyTally(), emptyTally()];
  tallyStep(t, s, r.state, r.events);
  expect(t[1].dealt).toBe(CONFIG.woodland.snareDamage);
  expect(t[0].dealt).toBe(0);
});
