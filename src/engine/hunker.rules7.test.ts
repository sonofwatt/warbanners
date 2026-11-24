import { expect, test, vi } from 'vitest';
import { applyAction } from './apply';
import { CONFIG } from './data/config';
import { unitById } from './state';
import { addCity, addUnit, blankMatch, must } from './testkit';

// CONFIG.hunker.healAtTurnEnd off replays rules 7: a hunkered unit heals at the start of its owner's next turn, by
// where it stands then. This file is alone because vi.mock binds a whole file.
vi.mock('./data/config', async (orig) => {
  const m = await orig<typeof import('./data/config')>();
  return { CONFIG: { ...m.CONFIG, hunker: { ...m.CONFIG.hunker, healAtTurnEnd: false } } };
});

const end = { type: 'endTurn' } as const;

test('with healAtTurnEnd off, the hunker heal waits for the start of the next turn, with no restHealed event', () => {
  expect(CONFIG.hunker.healAtTurnEnd).toBe(false);
  const s = blankMatch(); addCity(s, 0, 0, 0); addCity(s, 1, 3, 0);
  const u = addUnit(s, 'warrior', 0, -3, 0, { hp: 3 });
  const r = applyAction(must(applyAction(s, { type: 'hunker', unit: u.id })), end);
  expect(r.ok).toBe(true); if (!r.ok) return;
  expect(unitById(r.state, u.id)!.hp).toBe(3);
  expect(r.events.some((e) => e.type === 'restHealed')).toBe(false);
  const next = must(applyAction(r.state, end));
  expect(unitById(next, u.id)!.hp).toBe(3 + CONFIG.restHeal.neutral + CONFIG.hunker.restBonus);
});
