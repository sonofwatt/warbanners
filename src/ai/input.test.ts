import { expect, test } from 'vitest';
import {
  CONFIG, applyAction, createMatch, freshDeeds, key, legalActions, mirror, parseKey, reachable, visibleTiles,
} from '../engine';
import type { TreasureOutcome } from '../engine';
import { addCity, addUnit, blankMatch, randomPlayout, rngFor, setTile } from '../engine/testkit';
import { aiInputFor, believedState, viewKey } from './input';
import { draughtFinish, hiddenScout, hopelessCharge, lureFromCity, openVillage, riderRaid, safeLure, spartanLine } from './scenarios';

test('the input does not change when only hidden things change', () => {
  const base = blankMatch(); addCity(base, 0, 0, 3); addCity(base, 1, 0, -3);
  addUnit(base, 'warrior', 0, 0, 2); addUnit(base, 'horseman', 1, 0, -2);
  for (const p of base.players) p.explored = [...visibleTiles(base, p.id)].sort();
  const other = structuredClone(base);
  other.players[1]!.gold = 99; other.players[1]!.techs = ['gathering', 'riding']; other.rng = 12345; other.seed = 777;
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
  expect(Object.keys(reachable(state, rider)).length).toBe(20);   // rules 10: 20 and 21 (the rider's first tile of Mongol land costs a field's 2); rules 6: 23 and 24 (was 37 and 41; fog closed, half-point bonus)
  expect(Object.keys(reachable(b, rider)).length).toBe(21);
  expect(Object.keys(reachable(b, rider)).filter(k => !(k in reachable(state, rider))).sort()).toEqual(['2,0']);
  expect(reachable(state, rider)['1,0']).toBe(0);   // engaged by the unseen scout
  expect(reachable(b, rider)['1,0']).toBe(3);
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
  const b = believedState(aiInputFor(randomPlayout(7, 130), 0));   // 130 since rules 8: seed 7 now ends after 135 turns
  for (const a of legalActions(b).slice(0, 40)) expect(applyAction(b, a).ok).toBe(true);
}, 120_000);                                        // a 130-turn random playout (160 before rules 8): about 25 s alone since rules 7's Spartan growth discount, more under load
test('every scenario is a legal position with the right player to move', () => {
  const cases: [string, ReturnType<typeof spartanLine>, number][] = [
    ['spartanLine', spartanLine(), 0], ['riderRaid', riderRaid(), 1], ['openVillage', openVillage(), 1],
    ['lureFromCity', lureFromCity(), 1], ['hopelessCharge', hopelessCharge(), 1],
    ['hiddenScout', hiddenScout().state, 1], ['safeLure', safeLure(), 1], ['draughtFinish', draughtFinish(), 1],
  ];
  for (const [name, s, mover] of cases) {
    expect(s.current, name).toBe(mover);
    expect(legalActions(s).length, name).toBeGreaterThan(0);
    expect(s.players.every(p => p.explored.length > 0), name).toBe(true);
  }
});
test('AiInput carries no enemy deeds but shows enemy traits and items', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const deeds = { fight: 5, march: 9, survive: 3, rest: 2 };
  const mine = addUnit(s, 'warrior', 0, 0, 0, { deeds: { ...deeds }, heroTraits: ['hardy'] });
  const foe = addUnit(s, 'warrior', 1, 1, 0, { deeds: { ...deeds }, heroTraits: ['fierce', 'tireless'], item: 'draught', hp: 12 });
  for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
  const input = aiInputFor(s, 0);
  const seen = input.view.units.find(u => u.id === foe.id)!;
  expect(seen.deeds).toEqual(freshDeeds());
  expect(seen.heroTraits).toEqual(['fierce', 'tireless']);
  expect(seen.item).toBe('draught');
  expect(input.view.units.find(u => u.id === mine.id)!.deeds).toEqual(deeds);
  expect(believedState(input).units.find(u => u.id === foe.id)!.deeds).toEqual(freshDeeds());
  expect(s.units.find(u => u.id === foe.id)!.deeds).toEqual(deeds);    // the match itself keeps them
});
test('a treasure the other player claims out of sight changes nothing the AI can read, whatever it gives', () => {
  // Player 1 claims far from player 0's sight: the trait, the found site and the spawned unit stay hidden.
  for (const outcome of CONFIG.treasure.table as readonly TreasureOutcome[]) {
    const s = blankMatch({ unexplored: true }); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
    setTile(s, 2, -3, { treasure: true }); setTile(s, -2, -1, { treasure: true }); setTile(s, 1, 2, { treasure: true });
    addUnit(s, 'warrior', 0, 0, 2);
    const claimer = addUnit(s, 'warrior', 1, 2, -3);
    s.current = 1;
    for (const p of s.players) p.explored = [...visibleTiles(s, p.id)].sort();
    expect(visibleTiles(s, 0).has('2,-3')).toBe(false);
    s.rng = rngFor(outcome);
    const before = aiInputFor(s, 0);
    const r = applyAction(s, { type: 'claimTreasure', unit: claimer.id });
    expect(r.ok, outcome).toBe(true); if (!r.ok) continue;
    expect(r.events.find(e => e.type === 'treasure')).toMatchObject({ outcome });
    expect(aiInputFor(r.state, 0), outcome).toEqual(before);
  }
});
