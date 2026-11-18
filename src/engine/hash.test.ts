import { expect, test } from 'vitest';
import { hashState } from './hash';
import { createMatch } from './state';
import type { MatchState } from './types';

test('hash ignores key order and survives JSON', () => {
  const s = createMatch({ seed: 7, factions: ['mongols', 'spartans'] });
  const shuffled = Object.fromEntries(Object.entries(s).reverse()) as MatchState;
  expect(hashState(shuffled)).toBe(hashState(s));
  expect(hashState(JSON.parse(JSON.stringify(s)))).toBe(hashState(s));
  expect(hashState(s)).toMatch(/^[0-9a-f]{16}$/);
});
test('hash changes when anything changes', () => {
  const s = createMatch({ seed: 7, factions: ['mongols', 'spartans'] });
  const t = structuredClone(s); t.players[0]!.gold += 1;
  expect(hashState(t)).not.toBe(hashState(s));
});
