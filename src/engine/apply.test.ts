import { expect, test } from 'vitest';
import { applyAction } from './apply';
import { hashState } from './hash';
import { blankMatch } from './testkit';
import type { Action } from './types';

test('garbage is refused without throwing or touching the state', () => {
  const s = blankMatch(); const before = hashState(s);
  const bad: unknown[] = [null, undefined, 7, 'endTurn', {}, { type: 5 }, { type: 'fly' }, { type: 'move' },
    { type: 'move', unit: 'x', to: 3 }, { type: 'move', unit: 999, to: '0,0' }];
  for (const a of bad) { const r = applyAction(s, a as Action); expect(r.ok).toBe(false); }
  expect(hashState(s)).toBe(before);
});
test('nothing is accepted once there is a winner', () => {
  const s = blankMatch(); s.winner = 1;
  expect(applyAction(s, { type: 'endTurn' })).toEqual({ ok: false, reason: 'match over' });
});
test('an action whose reads throw is refused quietly, never thrown', () => {
  const s = blankMatch(); const before = hashState(s);
  const getter = { get type(): string { throw new Error('boom'); } } as unknown as Action;
  const proxy = new Proxy({}, {
    get() { throw new Error('boom'); }, has() { throw new Error('boom'); },
    ownKeys() { throw new Error('boom'); }, getOwnPropertyDescriptor() { throw new Error('boom'); },
  }) as unknown as Action;
  const sneaky = { type: 'move', unit: 0, get to(): string { throw new Error('late'); } } as unknown as Action;
  const frozen = Object.freeze({ type: 'endTurn' }) as Action;
  for (const a of [getter, proxy, sneaky]) {
    expect(applyAction(s, a)).toEqual({ ok: false, reason: 'invalid action' });
  }
  expect(applyAction(s, frozen).ok).toBe(true);
  expect(hashState(s)).toBe(before);
});
