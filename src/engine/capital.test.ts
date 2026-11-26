import { expect, test } from 'vitest';
import { applyAction } from './apply';
import { CONFIG } from './data/config';
import { cityIncome } from './economy';
import { cityById } from './state';
import { addCity, addUnit, blankMatch, give, must, setTile } from './testkit';
import type { City, GameEvent, MatchState } from './types';

// rules 7: a captured capital is an ordinary city for its captor, and the loser's best remaining city becomes the
// capital at once. Lumber camps give 2 growth, Markets 3 (2 before rules 9).

function capture(s: MatchState, at: City): { state: MatchState; events: GameEvent[] } {
  const [q, r] = at.pos.split(',').map(Number) as [number, number];
  const w = addUnit(s, 'warrior', 0, q, r);
  const res = applyAction(s, { type: 'capture', unit: w.id });
  if (!res.ok) throw new Error(res.reason);
  return res;
}
function moved(events: GameEvent[]): GameEvent[] {
  return events.filter((e) => e.type === 'capitalMoved');
}

test('a Lumber camp adds 2 growth and a Market 3 (rules 9; 2 in rules 7 and 8)', () => {
  expect(CONFIG.buildings.lumberCamp.growth).toBe(2);
  expect(CONFIG.buildings.market.growth).toBe(3);
  const s = blankMatch(); const c = addCity(s, 0, 0, 0, { level: 5 }); give(s, 0, 'logging', 'granary');
  setTile(s, 1, 0, { terrain: 'forest' });
  const a = must(applyAction(s, { type: 'build', at: '1,0', building: 'lumberCamp' }));
  expect(cityById(a, c.id)).toMatchObject({ level: 5, growth: 2 });
  const b = must(applyAction(a, { type: 'build', at: '0,1', building: 'market' }));
  expect(cityById(b, c.id)).toMatchObject({ level: 5, growth: 5 });   // level 5 needs 6
});

test('a captured capital is an ordinary city for its captor: no capital income, and it can connect once', () => {
  const s = blankMatch();
  const mine = addCity(s, 0, -3, 3, { capital: true });
  const theirs = addCity(s, 1, 0, 0, { capital: true });
  const other = addCity(s, 1, 3, -3);
  const r = capture(s, theirs);
  const taken = cityById(r.state, theirs.id)!;
  expect(taken).toMatchObject({ owner: 0, capital: false, linked: false });
  expect(cityIncome(r.state, taken)).toBe(taken.level);
  expect(r.events.map((e) => e.type).slice(-2)).toEqual(['captured', 'capitalMoved']);
  expect(moved(r.events)).toEqual([{ type: 'capitalMoved', player: 1, city: other.id }]);
  expect(r.state.cities.filter((c) => c.owner === 0 && c.capital).map((c) => c.id)).toEqual([mine.id]);

  const t = r.state; give(t, 0, 'riding'); t.players[0]!.gold = 50;
  const one = must(applyAction(t, { type: 'road', at: '-1,1' }));
  const two = applyAction(one, { type: 'road', at: '-2,2' });
  if (!two.ok) throw new Error(two.reason);
  expect(two.events).toContainEqual({ type: 'connected', city: theirs.id, capital: mine.id });
  expect(cityById(two.state, theirs.id)).toMatchObject({ linked: true, level: 1, growth: 1 });   // rules 9: the 1 paid half-fills a level 1 bar
  expect(cityById(two.state, mine.id)).toMatchObject({ level: 1, growth: 1 });
  const three = applyAction(two.state, { type: 'road', at: '-1,0' });
  if (!three.ok) throw new Error(three.reason);
  expect(three.events.some((e) => e.type === 'connected')).toBe(false);
  expect(cityById(three.state, theirs.id)).toMatchObject({ level: 1, growth: 1 });
  expect(cityById(three.state, mine.id)).toMatchObject({ level: 1, growth: 1 });
});

// The loser (player 1) holds a capital at 0,0 and the cities each case adds; player 0's capital is far away.
function loser(): { s: MatchState; cap: City } {
  const s = blankMatch({ radius: 6 });
  addCity(s, 0, -6, 6, { capital: true });
  const cap = addCity(s, 1, 0, 0, { capital: true });
  return { s, cap };
}

test('the new capital is the city with the highest level', () => {
  const { s, cap } = loser();
  addCity(s, 1, 2, 0, { level: 2, growth: 2 });
  const far = addCity(s, 1, 5, 0, { level: 3 });
  const r = capture(s, cap);
  expect(moved(r.events)).toEqual([{ type: 'capitalMoved', player: 1, city: far.id }]);
  expect(cityById(r.state, far.id)).toMatchObject({ capital: true, linked: true });
  expect(r.state.cities.filter((c) => c.capital).length).toBe(2);   // one each
});

test('at the same level, the city with more growth points wins', () => {
  const { s, cap } = loser();
  addCity(s, 1, 2, 0, { level: 2, growth: 0 });
  const far = addCity(s, 1, 5, 0, { level: 2, growth: 1 });
  expect(moved(capture(s, cap).events)).toEqual([{ type: 'capitalMoved', player: 1, city: far.id }]);
});

test('a full tie goes to the city nearest the lost capital, then to the lowest id', () => {
  const near = loser();
  addCity(near.s, 1, 5, 0);
  const close = addCity(near.s, 1, 0, 3);
  expect(moved(capture(near.s, near.cap).events)).toEqual([{ type: 'capitalMoved', player: 1, city: close.id }]);
  const even = loser();
  const first = addCity(even.s, 1, 3, 0);
  addCity(even.s, 1, 0, 3);
  expect(moved(capture(even.s, even.cap).events)).toEqual([{ type: 'capitalMoved', player: 1, city: first.id }]);
});

test('a city linked before the move stays linked and pays nothing again; an unlinked one joins the new capital', () => {
  const { s, cap } = loser();
  const next = addCity(s, 1, 0, 3, { level: 3 });
  const linked = addCity(s, 1, 2, 3, { linked: true });
  const unlinked = addCity(s, 1, 3, 0);
  setTile(s, 1, 3, { road: true });                                  // linked to next already
  const r = capture(s, cap);
  expect(moved(r.events)).toEqual([{ type: 'capitalMoved', player: 1, city: next.id }]);
  expect(cityById(r.state, linked.id)).toMatchObject({ linked: true, growth: 0 });
  expect(cityById(r.state, unlinked.id)!.linked).toBe(false);
  const theirTurn = must(applyAction(r.state, { type: 'endTurn' }));
  give(theirTurn, 1, 'riding'); theirTurn.players[1]!.gold = 50;
  theirTurn.players[1]!.faction = 'spartans';                        // rules 8: Mongols build no roads
  const a = applyAction(theirTurn, { type: 'road', at: '2,1' });
  if (!a.ok) throw new Error(a.reason);
  expect(a.events.some((e) => e.type === 'connected')).toBe(false);
  const b = applyAction(a.state, { type: 'road', at: '1,2' });
  if (!b.ok) throw new Error(b.reason);
  expect(b.events.filter((e) => e.type === 'connected')).toEqual([{ type: 'connected', city: unlinked.id, capital: next.id }]);
  expect(cityById(b.state, linked.id)!.growth).toBe(0);
  expect(cityById(b.state, unlinked.id)).toMatchObject({ linked: true, level: 1, growth: 1 });   // rules 9: a level 1 bar needs 2, Spartan or not
});

test('a player whose last city is taken is eliminated and no capital moves', () => {
  const { s, cap } = loser();
  const r = capture(s, cap);
  expect(moved(r.events)).toEqual([]);
  expect(r.events.some((e) => e.type === 'eliminated')).toBe(true);
});

test('taking an ordinary city moves no capital', () => {
  const { s } = loser();
  const c = addCity(s, 1, 3, 0);
  const r = capture(s, c);
  expect(moved(r.events)).toEqual([]);
  expect(cityById(r.state, c.id)).toMatchObject({ owner: 0, capital: false });
});
