import { expect, test } from 'vitest';
import { applyAction, createMatch, hashState, legalActions, RULES_VERSION } from './index';
import { must } from './testkit';

// If this fails, the game plays differently. Bump RULES_VERSION in types.ts and add the new hash here.
// Two phones on different rules must never meet in a match, and a solo save from older rules must say so.
// Before bumping, read the plan 2 final review ruling: a bump strands half-played solo saves.
const FINGERPRINT: Record<number, string> = { 2: '3a5c3ebd861dd09c', 3: 'ba3e0e466edfedd3', 4: 'ee96ecdb02902404', 5: '75e001ae462131a1', 6: 'e52a5e1f88468e36', 7: 'fb56cf755cda717e', 8: '60916c498b6b16ec', 9: 'd51b5776849292d1', 10: 'c082a2825f521ef9' };   // 10: units carry cosmetic battle wear (gritty mode), play unchanged;   // 9: rules 9 (no Spartan discount on leaving level 1, level 2 gold reward 5, the unhunker action, Market growth 3, the Spartan capital starting at level 2); 00ab42395a0dd506 before the level 2 capital (the Market's growth did not move this playout), first pinned 1c0741146a928313 before unhunker; the unreleased tuning forms of 2026-11-25 pinned 5ca7c78cdf02ec87, 5cd47ce5efa22166 and 3747e0372e1e9fa6. 8 re-pinned (unreleased) for rules 8's tuning pass (blockade, Mongol growth and tribute); before that for rules 8's tech tree; before that for the rules 8 additions: city sight, Scout, Mongol riding and roads, hunker heal, climbing tech

test('RULES_VERSION changes whenever the rules do', () => {
  let s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  for (let i = 0; i < 400 && s.winner === null; i++) {
    const legal = legalActions(s).filter(a => a.type !== 'resign');
    s = must(applyAction(s, legal[(i * 7) % legal.length]!));
  }
  expect(hashState(s)).toBe(FINGERPRINT[RULES_VERSION]);
}, 30_000);
