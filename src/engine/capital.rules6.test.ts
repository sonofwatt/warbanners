import { expect, test, vi } from 'vitest';
import { applyAction } from './apply';
import { cityIncome } from './economy';
import { cityById } from './state';
import { addCity, addUnit, blankMatch, give, must, setTile } from './testkit';

// The replay switches for rules 6: capitalMoves off keeps a captured capital a capital, the old growth of 1 for a
// Lumber camp and a Market, and the Lumber camp's old cost of 3. This file is alone because vi.mock binds a whole file.
vi.mock('./data/config', async (orig) => {
  const m = await orig<typeof import('./data/config')>();
  const b = m.CONFIG.buildings;
  return {
    CONFIG: {
      ...m.CONFIG, capitalMoves: false, connectGrowth: 0,
      buildings: { ...b, lumberCamp: { ...b.lumberCamp, cost: 3, growth: 1 }, market: { ...b.market, growth: 1 } },
    },
  };
});

test('with capitalMoves off a captured capital keeps its flag and pays capital income, and no capital moves', () => {
  const s = blankMatch();
  addCity(s, 0, -3, 3, { capital: true });
  const theirs = addCity(s, 1, 0, 0, { capital: true });
  const other = addCity(s, 1, 3, -3, { level: 4 });
  const w = addUnit(s, 'warrior', 0, 0, 0);
  const r = applyAction(s, { type: 'capture', unit: w.id });
  if (!r.ok) throw new Error(r.reason);
  const taken = cityById(r.state, theirs.id)!;
  expect(taken).toMatchObject({ owner: 0, capital: true });
  expect(cityIncome(r.state, taken)).toBe(taken.level + 1);
  expect(r.events.some((e) => e.type === 'capitalMoved')).toBe(false);
  expect(cityById(r.state, other.id)!.capital).toBe(false);
});

test('with the rules 6 numbers a Lumber camp and a Market each add 1 growth', () => {
  const s = blankMatch(); const c = addCity(s, 0, 0, 0, { level: 5 }); give(s, 0, 'forestry', 'markets');
  setTile(s, 1, 0, { terrain: 'forest' });
  const a = must(applyAction(s, { type: 'build', at: '1,0', building: 'lumberCamp' }));
  const b = must(applyAction(a, { type: 'build', at: '0,1', building: 'market' }));
  expect(cityById(b, c.id)).toMatchObject({ level: 5, growth: 2 });
});
