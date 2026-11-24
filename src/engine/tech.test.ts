import { describe, expect, test } from 'vitest';
import { applyAction } from './apply';
import { hashState } from './hash';
import { addCity, blankMatch, must } from './testkit';
import { TECHS } from './data/techs';
import { techPrice } from './tech';
import type { TechId } from './types';

describe('tech', () => {
  test('tech price rises with cities', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0);
    expect([techPrice(s, 0, 'gathering'), techPrice(s, 0, 'farming'), techPrice(s, 0, 'granary')]).toEqual([4, 6, 8]);
    addCity(s, 0, 3, 0); addCity(s, 0, -3, 0);
    expect([techPrice(s, 0, 'gathering'), techPrice(s, 0, 'farming'), techPrice(s, 0, 'granary')]).toEqual([6, 10, 14]);
    // rules 8: every tech in a column costs the same
    for (const [t, d] of Object.entries(TECHS)) expect(techPrice(s, 0, t as TechId)).toBe([6, 10, 14][d.tier - 1]);
  });

  test('research needs the step before it', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0);
    expect(applyAction(s, { type: 'research', tech: 'farming' }).ok).toBe(false);
    const t = must(applyAction(s, { type: 'research', tech: 'gathering' }));
    expect(t.players[0]!.techs).toEqual(['gathering']); expect(t.players[0]!.gold).toBe(16);
    expect(applyAction(t, { type: 'research', tech: 'gathering' }).ok).toBe(false);
    expect(applyAction(t, { type: 'research', tech: 'granary' }).ok).toBe(false);   // column 3 needs its own column 2
    const u = must(applyAction(t, { type: 'research', tech: 'farming' }));
    expect(u.players[0]!.gold).toBe(10);
    expect(applyAction(u, { type: 'research', tech: 'chivalry' }).ok).toBe(false);  // the other row's column 2 is not enough
    // rules 8: a column 3 tech needs only its own column 2 tech
    const v = blankMatch(); addCity(v, 0, 0, 0); v.players[0]!.techs = ['riding'];
    expect(applyAction(v, { type: 'research', tech: 'chivalry' }).ok).toBe(true);
  });

  test('rules 8: the rules 7 techs are not in the tree in play', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0); s.players[0]!.gold = 99;
    for (const tech of ['bronze', 'shieldwork', 'markets', 'roads', 'hunting', 'forestry', 'engineering'] as const) {
      expect(applyAction(s, { type: 'research', tech }).ok).toBe(false);
    }
  });

  test('research pushes a researched event and needs the gold', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0);
    const r = applyAction(s, { type: 'research', tech: 'prospecting' });
    expect(r.ok && r.events).toEqual([{ type: 'researched', tech: 'prospecting' }]);
    s.players[0]!.gold = 3;
    expect(applyAction(s, { type: 'research', tech: 'prospecting' }).ok).toBe(false);
  });

  test('hostile tech names are refused and change nothing', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0);
    const h = hashState(s);
    for (const tech of ['constructor', '__proto__', 'toString', 7, null]) {
      expect(applyAction(s, { type: 'research', tech } as never).ok).toBe(false);
    }
    expect(hashState(s)).toBe(h);
  });
});
