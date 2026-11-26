import { describe, expect, test } from 'vitest';
import { applyAction } from './apply';
import { hashState } from './hash';
import { unitAt } from './state';
import { addCity, addUnit, blankMatch, give, must } from './testkit';
import { trainable, unitCost, unitsOf } from './training';

describe('training', () => {
  test('what each faction can train', () => {
    const s = blankMatch(); give(s, 0, 'spears'); give(s, 1, 'riding');
    expect(trainable(s, 0)).toEqual(['warrior', 'spearman', 'hoplite', 'scout']);
    expect(trainable(s, 1)).toEqual(['warrior', 'horseman', 'horseArcher', 'camp']);   // rules 8: the Camp comes with Riding
    // rules 8: a faction's start tech alone trains no new unit
    const f = blankMatch(); give(f, 0, 'prospecting'); give(f, 1, 'gathering');
    expect(trainable(f, 0)).toEqual(['warrior', 'scout']); expect(trainable(f, 1)).toEqual(['warrior']);
    expect(unitCost(s, 1, 'horseman')).toBe(2); expect(unitCost(s, 0, 'horseman')).toBe(3);
    expect(unitCost(s, 0, 'kingsGuard')).toBeNull();
  });

  test('training', () => {
    const s = blankMatch(); const c = addCity(s, 0, 0, 0); give(s, 0, 'spears');
    const r = applyAction(s, { type: 'train', city: c.id, unitType: 'hoplite' }); const t = must(r);
    expect(unitAt(t, '0,0')).toMatchObject({ type: 'hoplite', owner: 0, home: c.id, mp: 0, attacks: 0, hp: 15 });
    expect(t.players[0]!.gold).toBe(17);
    expect(r.ok && r.events).toEqual([{ type: 'trained', unit: unitAt(t, '0,0')!.id, at: '0,0' }]);
    expect(applyAction(t, { type: 'train', city: c.id, unitType: 'warrior' }).ok).toBe(false);       // tile occupied
    expect(applyAction(s, { type: 'train', city: c.id, unitType: 'archer' }).ok).toBe(false);        // no tech
    expect(applyAction(s, { type: 'train', city: c.id, unitType: 'horseArcher' }).ok).toBe(false);   // wrong faction
    expect(applyAction(s, { type: 'train', city: c.id, unitType: 'piper' }).ok).toBe(false);         // reward only
  });

  test('capacity is level + 1', () => {
    const s = blankMatch(); const c = addCity(s, 0, 0, 0);
    addUnit(s, 'warrior', 0, 2, 0, { home: c.id }); addUnit(s, 'warrior', 0, 2, 1, { home: c.id });
    expect(unitsOf(s, c.id)).toBe(2);
    expect(applyAction(s, { type: 'train', city: c.id, unitType: 'warrior' }).ok).toBe(false);
    c.capacityBonus = 2;
    expect(applyAction(s, { type: 'train', city: c.id, unitType: 'warrior' }).ok).toBe(true);
  });

  test('needs gold, an own city', () => {
    const s = blankMatch(); const c = addCity(s, 0, 0, 0); const e = addCity(s, 1, 3, 0);
    expect(applyAction(s, { type: 'train', city: e.id, unitType: 'warrior' }).ok).toBe(false);
    s.players[0]!.gold = 1;
    expect(applyAction(s, { type: 'train', city: c.id, unitType: 'warrior' }).ok).toBe(false);
  });

  test('hostile input is refused and changes nothing', () => {
    const s = blankMatch(); const c = addCity(s, 0, 0, 0); give(s, 0, 'spears');
    const h = hashState(s);
    for (const unitType of ['constructor', '__proto__', 'toString', 5, null]) {
      expect(applyAction(s, { type: 'train', city: c.id, unitType } as never).ok).toBe(false);
    }
    for (const city of ['constructor', '__proto__', '0', null, 99, -1]) {
      expect(applyAction(s, { type: 'train', city, unitType: 'warrior' } as never).ok).toBe(false);
    }
    expect(hashState(s)).toBe(h);
  });
});
