import { expect, test, vi } from 'vitest';
import { applyAction } from './apply';
import { blockadeOf, cityIncome } from './economy';
import { addCity, addUnit, blankMatch, must } from './testkit';

// The switch off replays rules 7: no blockade, the whole income paid.
vi.mock('./data/config', async (orig) => {
  const m = await orig<typeof import('./data/config')>();
  return { CONFIG: { ...m.CONFIG, blockade: { ...m.CONFIG.blockade, on: false } } };
});

test('with the blockade off, enemies beside a city cut nothing and no event is sent', () => {
  const s = blankMatch();
  const c = addCity(s, 0, 0, 0, { level: 4 });
  addCity(s, 1, 3, 0);
  s.current = 1; s.players[0]!.turnsTaken = 1; s.players[0]!.gold = 0;
  addUnit(s, 'warrior', 1, 1, 0); addUnit(s, 'warrior', 1, 0, 1); addUnit(s, 'warrior', 1, -1, 0);
  expect(blockadeOf(s, c)).toEqual({ enemies: 0, blockaded: false, cut: 0 });
  const r = applyAction(s, { type: 'endTurn' });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.state.players[0]!.gold).toBe(cityIncome(s, c));
  expect(r.events.some((e) => e.type === 'blockaded')).toBe(false);
  must(r);
});
