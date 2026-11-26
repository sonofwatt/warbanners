import { expect, test, vi } from 'vitest';
import { applyAction } from './apply';
import { unitById } from './state';
import { addUnit, blankMatch, must } from './testkit';

// rules 7, momentum: no unit has both chain and splash today, so the Knight is given splash here. Only the target's
// kill is priced and only it can give the extra attack; the units the splash kills cost nothing. This file is alone
// because vi.mock binds a whole file.
vi.mock('./data/units', async (orig) => {
  const m = await orig<typeof import('./data/units')>();
  return { UNITS: { ...m.UNITS, knight: { ...m.UNITS.knight, traits: [...m.UNITS.knight.traits, 'splash'] } } };
});

test('a splash kill is not priced: one price for the target, one extra attack', () => {
  const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0, { momentum: 1 });
  const w = addUnit(s, 'warrior', 1, 1, 0, { hp: 1 });
  const n1 = addUnit(s, 'warrior', 1, 2, 0, { hp: 1 }); const n2 = addUnit(s, 'hoplite', 1, 2, -1, { hp: 1 });
  const r = applyAction(s, { type: 'attack', unit: k.id, target: '1,0' }); const t = must(r);
  for (const u of [w, n1, n2]) expect(unitById(t, u.id)).toBeUndefined();
  expect(unitById(t, k.id)).toMatchObject({ attacks: 1, momentum: 0 });
  expect(r.ok && r.events).toContainEqual({ type: 'momentum', unit: k.id, spent: 1, left: 0 });
});
