import { expect } from 'vitest';
import { canonical } from './hash';
import type { MatchState } from './types';

// Hash compatibility: a match that never used a Woodland rule holds none of their fields, so older states hash as before.
// Call it on the end state of a Spartan and Mongol playout (Tasks 3, 7 and 8 add their own keys here).
export const WOODLAND_KEYS = ['veilUntil', 'guidedTurn', 'snares'] as const;

export function assertNoWoodlandKeys(state: MatchState): void {
  const text = canonical(state);
  for (const k of WOODLAND_KEYS) expect(text, `canonical state holds "${k}"`).not.toContain(`"${k}":`);
}
