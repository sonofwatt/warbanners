import { expect, test } from 'vitest';
import { applyAction, createMatch, visibleTiles } from '../engine';
import { addCity, addUnit, blankMatch, randomPlayout, setTile } from '../engine/testkit';
import type { MatchState } from '../engine';
import { aiInputFor, believedState, viewKey } from './input';
import { planTurn } from './plan';
import { draughtFinish, hiddenScout, hopelessCharge, lureFromCity, safeLure } from './scenarios';
import { skillFor } from './skill';
import { LEVEL_DIAL } from './types';

const fixtures = () => [randomPlayout(7, 160), randomPlayout(1, 200), randomPlayout(3, 90), createMatch({ seed: 42, factions: ['spartans', 'mongols'] })];
test.each([0, 0.2, 0.5, 0.85, 1])('every planned action is legal where it is played, dial %f', (dial) => {
  for (const s of fixtures()) {
    const input = aiInputFor(s, s.current);
    const plan = planTurn(input, { dial, seed: 5, refused: [] });
    let b = believedState(input);
    plan.actions.forEach((a, i) => {
      const r = applyAction(b, a); expect(r.ok).toBe(true); if (!r.ok) return;
      b = r.state; expect(viewKey(aiInputFor(b, s.current))).toBe(plan.expect[i]);
    });
    expect(plan.actions.at(-1)).toEqual({ type: 'endTurn' });
    expect(plan.actions.some(a => a.type === 'resign')).toBe(false);
    expect(plan.evals).toBeLessThanOrEqual(skillFor(dial).evals);
  }
}, 30_000);
test('same input and seed give the same plan; another seed may differ only below hard', () => {
  const input = aiInputFor(randomPlayout(7, 160), 0);
  expect(planTurn(input, { dial: 0.5, seed: 9, refused: [] })).toEqual(planTurn(structuredClone(input), { dial: 0.5, seed: 9, refused: [] }));
  expect(planTurn(input, { dial: 1, seed: 9, refused: [] })).toEqual(planTurn(input, { dial: 1, seed: 10, refused: [] }));
}, 30_000);
test('a refused action is never planned again', () => {
  const { state } = hiddenScout();
  const input = aiInputFor(state, 1);
  const refused = [{ type: 'move', unit: 0, to: '2,0' } as const];
  for (const dial of [0, 0.5, 1]) {
    for (let seed = 0; seed < 10; seed++) expect(planTurn(input, { dial, seed, refused }).actions).not.toContainEqual(refused[0]);
  }
});
test('never a hopeless charge, never a lure onto its own city', () => {
  for (const dial of [0, 0.2, 0.5, 1]) for (let seed = 0; seed < 20; seed++) {
    const charge = planTurn(aiInputFor(hopelessCharge(), 1), { dial, seed, refused: [] });
    expect(charge.actions.filter(a => a.type === 'attack')).toEqual([]);   // damage 2, counter 7 kills the 3-hp rider
    const lure = planTurn(aiInputFor(lureFromCity(), 1), { dial, seed, refused: [] });
    expect(lure.actions.some(a => a.type === 'attack' && a.lure === true)).toBe(false);
  }
});
test('the deadline ends the turn early with legal actions', () => {
  let t = 0; const now = () => (t += 10);
  const plan = planTurn(aiInputFor(randomPlayout(7, 160), 0), { dial: 1, seed: 1, refused: [], now, deadlineMs: 100 });
  expect(plan.cutShort).toBe(true);
  expect(plan.actions.at(-1)).toEqual({ type: 'endTurn' });
}, 30_000);
test('a hard plan on the 25-unit position stays inside its budget in Node', () => {
  const input = aiInputFor(randomPlayout(7, 236), 0);         // 25 units; re-picked for Task 8's thresholds
  const t0 = performance.now();
  const plan = planTurn(input, { dial: 1, seed: 1, refused: [] });
  expect(performance.now() - t0).toBeLessThan(800);
  expect(plan.cutShort).toBe(false);
}, 30_000);

// Player 1's warrior stands on a treasure it reached on an earlier turn; a second treasure lies one step away.
function treasureWait(): MatchState {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3); s.current = 1;
  setTile(s, 1, 0, { treasure: true }); setTile(s, -2, 0, { treasure: true });
  addUnit(s, 'warrior', 1, 1, 0);
  addUnit(s, 'warrior', 1, -1, 0);
  for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
  return s;
}
test('a treasure is claimed by the unit that waited on it, and another unit steps onto the next one, at every level', () => {
  for (const dial of [0, 0.2, 0.5, 1]) for (let seed = 0; seed < 10; seed++) {
    const plan = planTurn(aiInputFor(treasureWait(), 1), { dial, seed, refused: [] });
    expect(plan.actions).toContainEqual({ type: 'claimTreasure', unit: 0 });
    if (dial >= 0.5) expect(plan.actions).toContainEqual({ type: 'move', unit: 1, to: '-2,0' });
  }
});
test('a melee kill is scored with the step into the tile: the kill that lands on a village is chosen', () => {
  const s = blankMatch(); addCity(s, 0, 0, 4); addCity(s, 1, 0, -4); s.current = 1;
  addUnit(s, 'warrior', 1, 0, 0);
  addUnit(s, 'warrior', 0, -1, 0, { hp: 1 }); addUnit(s, 'warrior', 0, 1, 0, { hp: 1 });
  setTile(s, 1, 0, { village: true });                             // under the later target in the listed order
  for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
  for (const seed of [0, 1, 2, 3]) {
    const plan = planTurn(aiInputFor(s, 1), { dial: 1, seed, refused: [] });
    expect(plan.actions.find(a => a.type === 'attack')).toEqual({ type: 'attack', unit: 0, target: '1,0' });
  }
});
test('a Mongol rider explores: a move to the edge of the fog, then another move into what it saw (rules 9, rules 6)', () => {
  const s = blankMatch({ radius: 6 }); addCity(s, 0, 0, 5); addCity(s, 1, 0, -5); s.current = 1;
  const rider = addUnit(s, 'khansGuard', 1, 0, -4, { mp: 7 }).id;                // 3 tiles and a half-point, sight 2
  for (const p of s.players) p.explored = [...visibleTiles(s, p.id)].sort();
  const seen = new Set(s.players[1]!.explored);
  for (const dial of [0, 0.5, 1]) for (const seed of [1, 2, 3]) {
    const moves = planTurn(aiInputFor(s, 1), { dial, seed, refused: [] }).actions.filter((a) => a.type === 'move' && a.unit === rider);
    expect(moves.length, `dial ${dial} seed ${seed}`).toBe(2);
    expect(moves[0]!.type === 'move' && seen.has(moves[0]!.to)).toBe(true);    // the first ends at the edge, never in the fog
    expect(moves[1]!.type === 'move' && seen.has(moves[1]!.to)).toBe(false);   // the second goes where it then saw
  }
});

test('the planner drinks a draught when a second attack kills a hurt enemy in reach', () => {
  // draughtFinish(): one attack leaves the full enemy Warrior at 4 (damage 6, counter 2); a second from the attacker
  // at 8/10 deals 5 and kills. Drink and first attack may come in either order. Normal and hard see it; easy has no
  // lookahead, so it never sees the second strike. Hard starts this fight since Task 8 cut the draught's worth from 2
  // to 1 (with 2, the first attack on a full Warrior scored -0.317 at hard and the drink cost more than the kill gave).
  const s = draughtFinish();
  const me = s.units.find(u => u.owner === 1)!.id;
  const foe = s.units.find(u => u.owner === 0)!;
  const first = applyAction(s, { type: 'attack', unit: me, target: foe.pos });
  expect(first.ok).toBe(true); if (!first.ok) return;
  expect(first.state.units.find(u => u.id === foe.id)!.hp).toBe(4);
  expect(first.state.units.find(u => u.id === me)!.hp).toBe(8);
  for (const dial of [LEVEL_DIAL.normal, LEVEL_DIAL.hard]) for (const seed of [0, 1, 2, 3, 4]) {
    const plan = planTurn(aiInputFor(s, 1), { dial, seed, refused: [] });
    expect(plan.actions, `dial ${dial} seed ${seed}`).toContainEqual({ type: 'useItem', unit: me });
    expect(plan.actions.filter(a => a.type === 'attack' && a.unit === me && a.target === foe.pos)).toHaveLength(2);
  }
});
test('the planner keeps its draught when no enemy is in reach', () => {
  const s = draughtFinish();
  s.units.find(u => u.owner === 0)!.pos = '-3,4';
  for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
  for (const dial of [0, LEVEL_DIAL.normal, LEVEL_DIAL.hard, 1]) for (const seed of [0, 1, 2]) {
    const plan = planTurn(aiInputFor(s, 1), { dial, seed, refused: [] });
    expect(plan.actions.some(a => a.type === 'useItem')).toBe(false);
  }
});
test('hard Mongols lure when the pull is safe', () => {
  // safeLure(): the rider's tile, the only one a lure could pull the Warrior onto, is open field. The existing
  // lureFromCity test (never a lure onto its own city) still holds at every level.
  for (const seed of [0, 1, 2, 3]) {
    const plan = planTurn(aiInputFor(safeLure(), 1), { dial: LEVEL_DIAL.hard, seed, refused: [] });
    expect(plan.actions.some(a => a.type === 'attack' && a.lure === true), `seed ${seed}`).toBe(true);
  }
});
