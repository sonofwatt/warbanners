import { expect, test } from 'vitest';
import { applyAction, legalActions } from './apply';
import { isConnected } from './connect';
import { UNITS } from './data/units';
import { key, range } from './hex';
import { cityById } from './state';
import { addCity, addUnit, blankMatch, give, setTile } from './testkit';
import type { GameEvent, MatchState } from './types';
import { visibleTiles } from './vision';

// rules 7: the first time a city is joined to its owner's capital by roads and own cities, both gain growth.
// Player 0 is Spartan and a Spartan city leaves level L on L growth, so the 1 growth paid to a level 1 city fills its bar:
// the pay shows as level 2 with growth 0 and a queued reward, and "once" as the level staying 2.
function roads(s: MatchState): MatchState {
  give(s, 0, 'riding'); s.players[0]!.gold = 50;
  return s;
}
function road(s: MatchState, at: string): { state: MatchState; events: GameEvent[] } {
  const r = applyAction(s, { type: 'road', at });
  if (!r.ok) throw new Error(r.reason);
  return r;
}

test('capitals start linked and new cities do not', () => {
  const s = blankMatch();
  const cap = addCity(s, 0, 0, 0, { capital: true });
  const c = addCity(s, 0, 3, 0);
  expect(cap.linked).toBe(true);
  expect(c.linked).toBe(false);
});

test('a road chain from a city to the capital pays 1 growth to both, once', () => {
  const s = roads(blankMatch());
  const cap = addCity(s, 0, 0, 0, { capital: true }); const c = addCity(s, 0, 3, 0);
  const a = road(s, '1,0');
  expect(a.events.some((e) => e.type === 'connected')).toBe(false);
  expect(isConnected(a.state, cityById(a.state, c.id)!)).toBe(false);
  const b = road(a.state, '2,0');
  expect(isConnected(b.state, cityById(b.state, c.id)!)).toBe(true);
  expect(b.events).toContainEqual({ type: 'connected', city: c.id, capital: cap.id });
  expect(cityById(b.state, c.id)).toMatchObject({ level: 2, growth: 0, linked: true });
  expect(cityById(b.state, cap.id)).toMatchObject({ level: 2, growth: 0 });
  const d = road(b.state, '1,-1');                                    // a second road changes nothing
  expect(d.events.some((e) => e.type === 'connected')).toBe(false);
  expect(cityById(d.state, c.id)).toMatchObject({ level: 2, growth: 0 });
  expect(cityById(d.state, cap.id)).toMatchObject({ level: 2, growth: 0 });
});

test('roads between two cities pay nothing until one joins the capital; then each joined city pays', () => {
  const s = roads(blankMatch());
  const cap = addCity(s, 0, 0, 0, { capital: true }); const a = addCity(s, 0, 2, 0); const b = addCity(s, 0, 4, 0);
  const first = road(s, '3,0');                                       // a and b joined, neither to the capital
  expect(first.events.some((e) => e.type === 'connected')).toBe(false);
  expect(cityById(first.state, a.id)).toMatchObject({ level: 1, growth: 0 });
  const second = road(first.state, '1,0');                            // the chain runs through city a
  expect(second.events.filter((e) => e.type === 'connected')).toEqual([
    { type: 'connected', city: a.id, capital: cap.id },
    { type: 'connected', city: b.id, capital: cap.id },
  ]);
  expect(cityById(second.state, a.id)).toMatchObject({ level: 2, growth: 0 });
  expect(cityById(second.state, b.id)).toMatchObject({ level: 2, growth: 0 });
  expect(cityById(second.state, cap.id)).toMatchObject({ level: 2, growth: 1 });   // 1 per city joined: the first fills level 1, the second starts level 2
});

test('a road tile inside enemy territory breaks the chain; one in neutral land does not', () => {
  const s = blankMatch({ radius: 5 });
  addCity(s, 0, 0, 0, { capital: true }); const c = addCity(s, 0, 4, 0);
  const enemy = addCity(s, 1, -4, 0);
  for (const q of [1, 2, 3]) setTile(s, q, 0, { road: true });
  expect(s.tiles['2,0']!.cityId).toBeNull();                          // neutral
  expect(isConnected(s, c)).toBe(true);
  setTile(s, 2, 0, { cityId: enemy.id });
  expect(isConnected(s, c)).toBe(false);
});

test('a growth bonus that fills the bar levels the city and queues its reward', () => {
  const s = roads(blankMatch());
  addCity(s, 0, 0, 0, { capital: true }); const c = addCity(s, 0, 2, 0, { level: 2, growth: 1 });   // level 2 needs 2, so the 1 paid fills the bar
  const r = road(s, '1,0');
  expect(cityById(r.state, c.id)).toMatchObject({ level: 3, growth: 0, pendingRewards: [3] });
  expect(r.events).toContainEqual({ type: 'cityLevel', city: c.id, level: 3 });
});

test('a captured city that was linked pays its new owner once when joined to the new capital', () => {
  const s = blankMatch();
  const cap = addCity(s, 0, 0, 0, { capital: true });
  addCity(s, 1, -3, 3, { capital: true });
  const c = addCity(s, 1, 3, 0, { linked: true });
  for (const q of [1, 2]) setTile(s, q, 0, { road: true });
  expect(isConnected(s, c)).toBe(false);                              // 2,0 is player 1's territory
  const w = addUnit(s, 'warrior', 0, 3, 0);
  const r = applyAction(s, { type: 'capture', unit: w.id });
  if (!r.ok) throw new Error(r.reason);
  expect(r.events).toContainEqual({ type: 'connected', city: c.id, capital: cap.id });
  expect(cityById(r.state, c.id)).toMatchObject({ owner: 0, linked: true, level: 2, growth: 0 });
  expect(cityById(r.state, cap.id)).toMatchObject({ level: 2, growth: 0 });
  r.state.players[0]!.gold = 50; give(r.state, 0, 'riding');
  const again = road(r.state, '1,-1');
  expect(again.events.some((e) => e.type === 'connected')).toBe(false);
  expect(cityById(again.state, c.id)).toMatchObject({ level: 2, growth: 0 });
});

test('no capital, no bonus', () => {
  const s = roads(blankMatch());
  const a = addCity(s, 0, 0, 0); const b = addCity(s, 0, 2, 0);
  const r = road(s, '1,0');
  expect(r.events.some((e) => e.type === 'connected')).toBe(false);
  expect(isConnected(r.state, cityById(r.state, a.id)!)).toBe(false);
  expect(cityById(r.state, b.id)!.linked).toBe(false);
});

// rules 8: the Scout has sight 2 and no pathfinder (rules 7 gave it sight 1 so it could step into the fog). With only
// the next tile explored, every move it is offered stays on explored land.
test('a Scout sees 2 tiles and is never offered a move onto an unexplored tile', () => {
  expect(UNITS.scout.sight).toBe(2);
  const s = blankMatch({ unexplored: true });
  const sc = addUnit(s, 'scout', 0, 0, 0);
  s.players[0]!.explored = [...visibleTiles(s, 0)].sort();
  expect(s.players[0]!.explored).toEqual(range({ q: 0, r: 0 }, 2).map(key).sort());
  const one = structuredClone(s);
  one.players[0]!.explored = range({ q: 0, r: 0 }, 1).map(key).sort();   // as if it had seen only the next tile
  const fogMoves = (t: MatchState) => legalActions(t)
    .filter((a) => a.type === 'move' && a.unit === sc.id && !t.players[0]!.explored.includes(a.to));
  expect(fogMoves(one)).toEqual([]);
  expect(legalActions(one).some((a) => a.type === 'move' && a.unit === sc.id)).toBe(true);
});
