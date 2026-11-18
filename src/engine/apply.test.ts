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
