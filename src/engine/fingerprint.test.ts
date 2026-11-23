import { expect, test } from 'vitest';
import { applyAction, createMatch, hashState, legalActions, RULES_VERSION } from './index';
import { must } from './testkit';

// If this fails, the game plays differently. Bump RULES_VERSION in types.ts and add the new hash here.
// Two phones on different rules must never meet in a match, and a solo save from older rules must say so.
// Before bumping, read the plan 2 final review ruling: a bump strands half-played solo saves.
const FINGERPRINT: Record<number, string> = { 2: '3a5c3ebd861dd09c', 3: 'ba3e0e466edfedd3', 4: 'ee96ecdb02902404', 5: '75e001ae462131a1', 6: 'e52a5e1f88468e36', 7: 'e3e216adf5b4f994' };

test('RULES_VERSION changes whenever the rules do', () => {
  let s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  for (let i = 0; i < 400 && s.winner === null; i++) {
    const legal = legalActions(s).filter(a => a.type !== 'resign');
    s = must(applyAction(s, legal[(i * 7) % legal.length]!));
  }
  expect(hashState(s)).toBe(FINGERPRINT[RULES_VERSION]);
}, 30_000);
