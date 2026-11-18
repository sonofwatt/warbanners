import { describe, expect, test } from 'vitest';
import { applyAction } from './apply';
import { hashState } from './hash';
import { addCity, blankMatch, must } from './testkit';
import { techPrice } from './tech';

describe('tech', () => {
  test('tech price rises with cities', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0);
    expect([techPrice(s, 0, 'foraging'), techPrice(s, 0, 'farming'), techPrice(s, 0, 'markets')]).toEqual([4, 6, 8]);
    addCity(s, 0, 3, 0); addCity(s, 0, -3, 0);
    expect([techPrice(s, 0, 'foraging'), techPrice(s, 0, 'farming'), techPrice(s, 0, 'markets')]).toEqual([6, 10, 14]);
  });

  test('research needs the step before it', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0);
    expect(applyAction(s, { type: 'research', tech: 'farming' }).ok).toBe(false);
    const t = must(applyAction(s, { type: 'research', tech: 'foraging' }));
    expect(t.players[0]!.techs).toEqual(['foraging']); expect(t.players[0]!.gold).toBe(16);
    expect(applyAction(t, { type: 'research', tech: 'foraging' }).ok).toBe(false);
    expect(must(applyAction(t, { type: 'research', tech: 'farming' })).players[0]!.gold).toBe(10);
  });

  test('research pushes a researched event and needs the gold', () => {
    const s = blankMatch(); addCity(s, 0, 0, 0);
    const r = applyAction(s, { type: 'research', tech: 'bronze' });
    expect(r.ok && r.events).toEqual([{ type: 'researched', tech: 'bronze' }]);
    s.players[0]!.gold = 3;
    expect(applyAction(s, { type: 'research', tech: 'bronze' }).ok).toBe(false);
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
