import { expect, test } from 'vitest';
import { applyAction, isConnected } from '../engine';
import { addCity, addUnit, blankMatch, give, setTile } from '../engine/testkit';
import type { MatchState } from '../engine';
import { aiInputFor, believedState } from './input';
import { planTurn } from './plan';
import { connectingChains } from './roads';
import { LEVEL_DIAL } from './types';

// Player 0 holds the capital at 0,0 and a city three tiles east, so 1,0 and 2,0 are the two field tiles between.
function twoApart(): MatchState {
  const s = blankMatch({ radius: 5 });
  give(s, 0, 'riding');
  s.players[0]!.gold = 20;
  addCity(s, 0, 0, 0, { capital: true });
  addCity(s, 0, 3, 0);
  addCity(s, 1, 0, -4, { capital: true });
  return s;
}
const believed = (s: MatchState) => believedState(aiInputFor(s, s.current));

test('the cheapest chain from an unlinked city to the capital counts only the tiles still to build', () => {
  const chains = connectingChains(believed(twoApart()), 0);
  expect(chains).toHaveLength(1);
  expect(chains[0]).toMatchObject({ city: 1, capital: 0, build: ['2,0', '1,0'] });
});

test('an existing road is free, and a road in rival territory is not', () => {
  const s = twoApart();
  setTile(s, 2, 0, { road: true });
  expect(connectingChains(believed(s), 0)[0]!.build).toEqual(['1,0']);
  // 1,0 now lies in a rival city's land and already has a road: it neither carries the chain nor takes a new road
  setTile(s, 1, 0, { road: true, cityId: 2 });
  const chain = connectingChains(believed(s), 0)[0]!;
  expect(chain.build).not.toContain('1,0');
  expect(chain.build.length).toBe(2);   // around it: 2,-1 then 1,-1 (or the twin path south), next to the road at 2,0
});

test('a linked city, a capital or a city with no way through gives no chain', () => {
  const s = twoApart();
  s.cities[1]!.linked = true;
  expect(connectingChains(believed(s), 0)).toEqual([]);
  const walled = twoApart();
  for (const [q, r] of [[4, 0], [4, -1], [3, -1], [2, 0], [2, 1], [3, 1]] as const) setTile(walled, q, r, { terrain: 'water' });
  expect(connectingChains(believed(walled), 0)).toEqual([]);
});

// rules 7: a taken capital is an ordinary city of its captor, and the loser's capital moves; chains follow it.
test('chains lead to the moved capital, and a taken capital is a city that needs one', () => {
  const s = twoApart();
  addCity(s, 0, -3, 0, { level: 3 });                                 // id 3, the best of player 0's other cities
  const w = addUnit(s, 'warrior', 1, 0, 0);
  s.current = 1;
  const r = applyAction(s, { type: 'capture', unit: w.id });
  if (!r.ok) throw new Error(r.reason);
  expect(r.events).toContainEqual({ type: 'capitalMoved', player: 0, city: 3 });
  const after = r.state; after.current = 0;
  expect(connectingChains(believed(after), 0).map((c) => [c.city, c.capital])).toEqual([[1, 3]]);   // 3,0 to -3,0, round 0,0
  give(after, 1, 'riding');
  expect(connectingChains(believed({ ...after, current: 1 }), 1)).toEqual([]);   // rules 8: the Mongols build no roads
  after.players[1]!.faction = 'spartans';                                       // as if a road builder had taken it
  const theirs = connectingChains(believed({ ...after, current: 1 }), 1);
  expect(theirs).toEqual([expect.objectContaining({ city: 0, capital: 2 })]);
});

test('the chain never uses a tile its player has not explored', () => {
  const s = twoApart();
  const hidden = new Set(['1,0', '2,0', '1,1', '2,-1']);
  s.players[0]!.explored = s.players[0]!.explored.filter((k) => !hidden.has(k));
  const chain = connectingChains(believed(s), 0)[0]!;
  for (const k of chain.build) expect(s.players[0]!.explored).toContain(k);
  expect(chain.build.some((k) => hidden.has(k))).toBe(false);
});

// Plays player 0's turns with the planner; player 1 only ends its turns.
function playTurns(s: MatchState, turns: number, dial: number): { state: MatchState; roads: string[] } {
  const roads: string[] = [];
  for (let t = 0; t < turns; t++) {
    const plan = planTurn(aiInputFor(s, 0), { dial, seed: t, refused: [] });
    for (const a of plan.actions) {
      const r = applyAction(s, a);
      if (!r.ok) throw new Error(`${JSON.stringify(a)}: ${r.reason}`);
      if (a.type === 'road') roads.push(a.at);
      s = r.state;
    }
    const r = applyAction(s, { type: 'endTurn' });
    if (!r.ok) throw new Error(r.reason);
    s = r.state;
  }
  return { state: s, roads };
}

test('at normal skill a city two field tiles from the capital is joined by road within a few turns', () => {
  const { state, roads } = playTurns(twoApart(), 3, LEVEL_DIAL.normal);
  expect(roads).toEqual(expect.arrayContaining(['1,0', '2,0']));
  expect(state.cities[1]!.linked).toBe(true);
  expect(isConnected(state, state.cities[1]!)).toBe(true);
});

test('no road is laid when no own city is unlinked', () => {
  const s = twoApart();
  s.cities.splice(1, 1);
  for (const dial of [0, LEVEL_DIAL.normal, 1]) expect(playTurns(structuredClone(s), 3, dial).roads).toEqual([]);
});

test('the AI never lays a road on a tile it has not explored', () => {
  for (const dial of [0, LEVEL_DIAL.normal, 1]) {
    const s = twoApart();
    const hidden = new Set(['1,0', '2,0', '1,1', '2,-1']);
    s.players[0]!.explored = s.players[0]!.explored.filter((k) => !hidden.has(k));
    // a unit trained this turn may explore more, so each road is checked against what was explored when it was laid
    let at = s;
    for (const a of planTurn(aiInputFor(s, 0), { dial, seed: 1, refused: [] }).actions) {
      if (a.type === 'road') expect(at.players[0]!.explored).toContain(a.at);
      const r = applyAction(at, a);
      if (r.ok) at = r.state;
    }
  }
});
