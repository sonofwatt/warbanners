import { expect, test } from 'vitest';
import { applyAction, createMatch, hashState, legalActions } from '../engine';
import type { MatchSettings, MatchState } from '../engine';
import { must } from '../engine/testkit';
import { encodeAction } from './wire';
import type { Head, Snap } from './wire';
import { applyLocal, follow, opening, rebuild } from './sync';
import type { Follow } from './sync';

const SETTINGS: MatchSettings = { seed: 42, factions: ['spartans', 'mongols'] };
function script(n: number): { list: string[]; states: MatchState[] } {
  let s = createMatch(SETTINGS); const list: string[] = []; const states = [s];
  for (let i = 0; i < n; i++) {
    const legal = legalActions(s).filter(a => a.type !== 'resign');
    const a = legal[(i * 7) % legal.length]!; s = must(applyAction(s, a)); list.push(encodeAction(a)); states.push(s);
  }
  return { list, states };
}
const headAt = (k: number, states: MatchState[]): Head => ({ n: k, seat: states[k]!.current, hash: hashState(states[k]!), at: 0, turnAt: 0, paused: 0 });

test('new actions are applied in order with their events', () => {
  const { list, states } = script(30);
  const f = follow(opening(SETTINGS), list.slice(0, 12), headAt(12, states));
  expect(f.kind).toBe('advanced');
  if (f.kind !== 'advanced') return;
  expect(f.steps).toHaveLength(12); expect(hashState(f.followed.state)).toBe(hashState(states[12]!));
  expect(f.steps[11]!.after).toBe(f.followed.state);
  expect(follow(f.followed, list.slice(0, 12), headAt(12, states))).toEqual({ kind: 'same' });
});
test('a list ahead of its head, or behind it, waits', () => {
  const { list, states } = script(10);
  expect(follow(opening(SETTINGS), list.slice(0, 5), headAt(4, states))).toEqual({ kind: 'wait' });
  expect(follow(opening(SETTINGS), list.slice(0, 3), headAt(4, states))).toEqual({ kind: 'wait' });
});
test('our own write that lost a race is replaced by the winner', () => {
  const { list, states } = script(10);
  const mine = follow(opening(SETTINGS), list.slice(0, 6), headAt(6, states)) as Extract<Follow, { kind: 'advanced' }>;
  const other = legalActions(mine.followed.state).find(a => encodeAction(a) !== list[6])!;
  const ahead = applyLocal(mine.followed, other)!;                         // we played something else at index 6
  const r = follow(ahead.followed, list.slice(0, 7), headAt(7, states));
  expect(r.kind).toBe('rebuilt');
  expect(r.kind === 'rebuilt' && hashState(r.followed.state)).toBe(hashState(states[7]!));
});
test('a hash that disagrees after a full rebuild breaks the match at that point', () => {
  const { list, states } = script(10);
  expect(follow(opening(SETTINGS), list, { ...headAt(10, states), hash: '0000000000000000' })).toEqual({ kind: 'broken', at: 10, reason: 'hash' });
});
test('an action this phone refuses breaks the match at its index', () => {
  const { list, states } = script(5);
  const bad = [...list.slice(0, 3), '{"to":"9,9","type":"move","unit":0}'];
  expect(follow(opening(SETTINGS), bad, headAt(4, states))).toEqual({ kind: 'broken', at: 3, reason: 'refused' });
});
test('rejoin: a good snapshot is used, a bad one is ignored', () => {
  const { list, states } = script(40);
  const good: Snap = { n: 30, hash: hashState(states[30]!), state: JSON.stringify(states[30]) };
  const r1 = rebuild(SETTINGS, list, good, { 30: good.hash });
  expect(r1.ok && r1.fromSnap).toBe(true); expect(r1.ok && hashState(r1.followed.state)).toBe(hashState(states[40]!));
  const tampered = { ...good, state: JSON.stringify({ ...states[30], stamp: 999 }) };
  const r2 = rebuild(SETTINGS, list, tampered, {});
  expect(r2.ok && r2.fromSnap).toBe(false); expect(r2.ok && hashState(r2.followed.state)).toBe(hashState(states[40]!));
  expect(rebuild(SETTINGS, list, { ...good, state: '{' }, {}).ok).toBe(true);
  expect(rebuild(SETTINGS, list, { ...good, n: 41 }, {}).ok).toBe(true);
  const unreadable = { units: 'x' };
  expect(rebuild(SETTINGS, list, { n: 30, hash: hashState(unreadable as never), state: JSON.stringify(unreadable) }, {}).ok && 'fallback').toBe('fallback');
});
test('applyLocal refuses what the engine refuses and encodes what it accepts', () => {
  expect(applyLocal(opening(SETTINGS), { type: 'move', unit: 99, to: '0,0' })).toBeNull();
  expect(applyLocal(opening(SETTINGS), { type: 'endTurn' })!.encoded).toBe('{"type":"endTurn"}');
});
