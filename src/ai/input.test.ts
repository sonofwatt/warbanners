import { expect, test } from 'vitest';
import {
  applyAction, createMatch, key, legalActions, mirror, parseKey, reachable, visibleTiles,
} from '../engine';
import { addCity, addUnit, blankMatch, randomPlayout } from '../engine/testkit';
import { aiInputFor, believedState, viewKey } from './input';
import { hiddenScout, hopelessCharge, lureFromCity, openVillage, riderRaid, spartanLine } from './scenarios';

test('the input does not change when only hidden things change', () => {
  const base = blankMatch(); addCity(base, 0, 0, 3); addCity(base, 1, 0, -3);
  addUnit(base, 'warrior', 0, 0, 2); addUnit(base, 'horseman', 1, 0, -2);
  for (const p of base.players) p.explored = [...visibleTiles(base, p.id)].sort();
  const other = structuredClone(base);
  other.players[1]!.gold = 99; other.players[1]!.techs = ['riding', 'roads']; other.rng = 12345; other.seed = 777;
  addUnit(other, 'archer', 1, 3, -3);          // out of player 0's sight
  expect(aiInputFor(other, 0)).toEqual(aiInputFor(base, 0));
  expect(viewKey(aiInputFor(other, 0))).toBe(viewKey(aiInputFor(base, 0)));
});
test('the input carries no seed, rng or rival gold', () => {
  const input = aiInputFor(createMatch({ seed: 42, factions: ['spartans', 'mongols'] }), 1);
  expect(Object.keys(input).sort()).toEqual(['me', 'radius', 'rivals', 'self', 'stamp', 'view']);
  expect(Object.keys(input.rivals[0]!).sort()).toEqual(['alive', 'faction', 'id', 'turnsTaken']);
  expect(JSON.stringify(input)).not.toContain('"seed"');
});
test('an unseen blocker is missing from the believed state, so its tile looks open', () => {
  const { state, rider, scout } = hiddenScout();
  const b = believedState(aiInputFor(state, 1));
  expect(b.units.some(u => u.id === scout)).toBe(false);
  expect(Object.keys(reachable(state, rider)).length).toBe(37);
  expect(Object.keys(reachable(b, rider)).length).toBe(41);
  expect(Object.keys(reachable(b, rider)).filter(k => !(k in reachable(state, rider))).sort()).toEqual(['2,0', '2,1', '3,-1', '3,0']);
  expect(reachable(state, rider)['1,0']).toBe(0);   // engaged by the unseen scout
  expect(reachable(b, rider)['1,0']).toBe(4);
  expect(applyAction(state, { type: 'move', unit: rider, to: '2,0' })).toEqual({ ok: false, reason: 'cannot reach that tile' });
});
test('unexplored tiles take the explored mirror terrain, else field', () => {
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  const input = aiInputFor(s, 0); const b = believedState(input);
  expect(Object.keys(b.tiles)).toHaveLength(127);
  for (const k of Object.keys(b.tiles)) {
    if (input.view.tiles[k]) { expect(b.tiles[k]).toEqual(input.view.tiles[k]); continue; }
    const m = key(mirror(parseKey(k)));
    expect(b.tiles[k]!.terrain).toBe(input.view.tiles[m]?.terrain ?? 'field');
    expect(b.tiles[k]!.village || b.tiles[k]!.treasure).toBe(false);
  }
});
test('the believed state is playable by the engine', () => {
  const b = believedState(aiInputFor(randomPlayout(7, 160), 0));
  for (const a of legalActions(b).slice(0, 40)) expect(applyAction(b, a).ok).toBe(true);
}, 30_000);                                         // a 160-turn random playout: about 5 s alone, more under load
test('every scenario is a legal position with the right player to move', () => {
  const cases: [string, ReturnType<typeof spartanLine>, number][] = [
    ['spartanLine', spartanLine(), 0], ['riderRaid', riderRaid(), 1], ['openVillage', openVillage(), 1],
    ['lureFromCity', lureFromCity(), 1], ['hopelessCharge', hopelessCharge(), 1],
    ['hiddenScout', hiddenScout().state, 1],
  ];
  for (const [name, s, mover] of cases) {
    expect(s.current, name).toBe(mover);
    expect(legalActions(s).length, name).toBeGreaterThan(0);
    expect(s.players.every(p => p.explored.length > 0), name).toBe(true);
  }
});
