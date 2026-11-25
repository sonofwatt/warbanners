import { expect, test } from 'vitest';
import { applyAction, createMatch, visibleTiles } from '../engine';
import { addCity, addUnit, blankMatch, randomPlayout, setTile } from '../engine/testkit';
import type { MatchState } from '../engine';
import { aiInputFor, believedState, viewKey } from './input';
import { planTurn, withGrowth } from './plan';
import { draughtFinish, hiddenScout, hopelessCharge, killOrChip, lureFromCity, pipersTaunt, safeLure, woundedHoplite } from './scenarios';
import { skillFor } from './skill';
import { LEVEL_DIAL } from './types';

// Built once and shared: the engine never mutates a state it is given. Since the rules 7 Spartan growth discount and 12 start
// gold the random playouts hold more units and take about 44 s to build (seed 7 to turn 160 alone 25 s), so the first test
// to ask pays that and has a 120 s limit; the rest find them ready.
let cached: MatchState[] | null = null;
// Seed 7 at 130 turns since rules 8 (it now ends after 135, and a plan on an ended match cannot end its turn).
const fixtures = (): MatchState[] => (cached ??= [randomPlayout(7, 130), randomPlayout(1, 200), randomPlayout(3, 90), createMatch({ seed: 42, factions: ['spartans', 'mongols'] })]);
test.each([0, 0.2, 0.5, 0.85, 1])('every planned action is legal where it is played, dial %f', (dial) => {
  fixtures().forEach((s, f) => {
    const input = aiInputFor(s, s.current);
    const plan = planTurn(input, { dial, seed: 5, refused: [] });
    let b = believedState(input);
    expect(b.winner).toBeNull();
    let wonAt: number | null = null;              // the action after which the believed state was won
    plan.actions.forEach((a, i) => {
      // After a win in the believed state the planner still ends its turn, for the real match to decide, and the
      // believed engine refuses that endTurn. Allowed only for the one fixture that needs it (since rules 8 seed 3 at
      // 90 turns is a position the planner wins) and only when the win came from the action just before that endTurn,
      // so a plan that wins early and queues more actions still fails.
      if (f === 2 && wonAt === plan.actions.length - 2 && a.type === 'endTurn' && i === plan.actions.length - 1) return;
      const r = applyAction(b, a); expect(r.ok).toBe(true); if (!r.ok) return;
      if (wonAt === null && r.state.winner !== null) wonAt = i;
      b = r.state; expect(viewKey(aiInputFor(b, s.current))).toBe(plan.expect[i]);
    });
    expect(plan.actions.at(-1)).toEqual({ type: 'endTurn' });
    expect(plan.actions.some(a => a.type === 'resign')).toBe(false);
    expect(plan.evals).toBeLessThanOrEqual(skillFor(dial).evals);
  });
}, 120_000);
test('same input and seed give the same plan; another seed may differ only below hard', () => {
  const input = aiInputFor(fixtures()[0]!, 0);
  expect(planTurn(input, { dial: 0.5, seed: 9, refused: [] })).toEqual(planTurn(structuredClone(input), { dial: 0.5, seed: 9, refused: [] }));
  expect(planTurn(input, { dial: 1, seed: 9, refused: [] })).toEqual(planTurn(input, { dial: 1, seed: 10, refused: [] }));
}, 120_000);
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
  const plan = planTurn(aiInputFor(fixtures()[2]!, 0), { dial: 1, seed: 1, refused: [], now, deadlineMs: 100 });   // seed 3, turn 90 (since rules 8 tuning: seed 7 at turn 130 is now planned within the ten clock reads the deadline allows)
  expect(plan.cutShort).toBe(true);
  expect(plan.actions.at(-1)).toEqual({ type: 'endTurn' });
}, 120_000);
test('a hard plan on the 25-unit position stays inside its budget in Node', () => {
  const input = aiInputFor(randomPlayout(7, 52), 0);          // 25 units; re-picked for rules 9's Spartan tuning ((7, 66) differs now), earlier (7, 66) for rules 9's unhunker action ((3, 96) differs now), earlier (3, 96) for rules 9 ((3, 82) differs now), earlier (3, 82) for rules 8's tuning pass ((1, 84) differs now), earlier (1, 84) for rules 8's tech tree ((1, 92) has 30 now), earlier (1, 92) for the rules 8 additions ((9, 164) has 41 now), earlier (9, 164) for rules 8's mountains ((4, 104) has 27 now), earlier (4, 104) for rules 7's levers ((9, 256) has 38 now and took about 500 ms), earlier (9, 256) for rules 7's Hunker ((9, 274) has 26 now), earlier (9, 274) for rules 7's Lumber camp cost 4 ((8, 292) has 29 now), earlier (8, 292) for rules 7's moving capitals ((7, 286) has 45 now), earlier (7, 286) for rules 7 ((7, 164) has 12 now), earlier for rules 6 ((7, 236) had 29) and Task 8
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

// Hexonia habits, growing with the skill (skill.focus): a badly wounded unit falls back out of reach to heal, and a kill
// is taken over chip damage. Before them a hard AI walked this Hoplite on toward the riders, and a normal AI chipped the
// Hoplite instead of killing the Warrior on one seed in three.
test('a badly wounded Hoplite steps back out of the riders\' reach at normal and hard', () => {
  for (const dial of [LEVEL_DIAL.normal, LEVEL_DIAL.hard]) for (let seed = 0; seed < 5; seed++) {
    const plan = planTurn(aiInputFor(woundedHoplite(), 0), { dial, seed, refused: [] });
    const to = plan.actions.find((a) => a.type === 'move' && a.unit === 0);
    expect(to?.type === 'move' && ['0,2', '-1,2'].includes(to.to), `dial ${dial} seed ${seed}`).toBe(true);
  }
});
test('a kill is taken over chip damage: always at hard, nearly always at normal', () => {
  const kills = (dial: number): number => Array.from({ length: 20 }, (_, seed) => planTurn(aiInputFor(killOrChip(), 1), { dial, seed, refused: [] }))
    .filter((p) => p.actions.some((a) => a.type === 'attack' && a.target === '-1,1')).length;
  expect(kills(LEVEL_DIAL.hard)).toBe(20);
  expect(kills(LEVEL_DIAL.normal)).toBeGreaterThanOrEqual(16);
});

// A taunt changes nothing valueOf measures, so it is credited (tauntCredit) when it turns an enemy's blow from a weaker
// unit onto a Hoplite.
test('a Piper taunts a rider that could strike its Archer, so the blow falls on the Hoplite', () => {
  for (const dial of [LEVEL_DIAL.normal, LEVEL_DIAL.hard]) {
    const taunts = Array.from({ length: 10 }, (_, seed) => planTurn(aiInputFor(pipersTaunt(), 0), { dial, seed, refused: [] }))
      .filter((p) => p.actions.some((a) => a.type === 'ability' && a.ability === 'taunt' && a.target === '0,-1')).length;
    expect(taunts, `dial ${dial}`).toBeGreaterThanOrEqual(dial === LEVEL_DIAL.hard ? 10 : 3);
  }
});
test('withGrowth levels cities through the engine, several levels at once, and leaves the state it was given alone', () => {
  const s = blankMatch();                                       // player 0 Spartans, player 1 Mongols
  const sp = addCity(s, 0, 0, 0, { level: 1, growth: 1 });
  const mo = addCity(s, 1, 2, 0, { level: 1, growth: 0 });
  const other = addCity(s, 0, -2, 0, { level: 1, growth: 0 });
  const before = structuredClone(s);
  const g = withGrowth(s, [sp.id, mo.id], 6);
  const at = (id: number) => g.cities.find((c) => c.id === id)!;
  expect([at(sp.id).level, at(sp.id).growth, at(sp.id).pendingRewards]).toEqual([4, 2, [2, 3, 4]]);   // Spartans (rules 9: 2 to leave level 1, then L-1): 7 growth pays 2 + 1 + 2 and leaves 2 toward level 5 (3)
  expect([at(mo.id).level, at(mo.id).growth, at(mo.id).pendingRewards]).toEqual([3, 1, [2, 3]]);   // Mongols (rules 8, the common pace): 6 pays 2 + 3 and leaves 1
  expect(at(other.id)).toBe(s.cities.find((c) => c.id === other.id));
  expect(s).toEqual(before);
});

// Rules 7, Hunker. Player 1 (the AI) has no gold, so no city trains and no guard steps off to make room.
function hunkerField(): MatchState {
  const s = blankMatch(); addCity(s, 0, -3, 0, { capital: true }); addCity(s, 1, 3, 0, { capital: true });
  s.current = 1; s.players[1]!.gold = 0;
  return s;
}
test('rules 7: a garrison with no attack to make hunkers when a seen enemy could reach it; a quiet one does not', () => {
  const s = hunkerField();
  const guard = addUnit(s, 'warrior', 1, 3, 0);
  addUnit(s, 'horseman', 0, 1, 0);                                    // seen, two tiles off, across water
  s.cities.find((c) => c.owner === 1)!.radius = 2;                    // rules 8: a city sees only its radius, so 2 to see it
  for (const [q, r] of [[2, 0], [2, -1], [1, 1], [2, 1]] as const) setTile(s, q, r, { terrain: 'water' });
  const quiet = hunkerField();
  const idle = addUnit(quiet, 'warrior', 1, 3, 0);
  for (const dial of [0, 0.5, 1]) for (let seed = 0; seed < 4; seed++) {
    const mine = (st: MatchState, id: number) => planTurn(aiInputFor(st, 1), { dial, seed, refused: [] }).actions
      .filter((a) => 'unit' in a && a.unit === id);
    expect(mine(s, guard.id)).toEqual([{ type: 'hunker', unit: guard.id }]);
    expect(mine(quiet, idle.id).some((a) => a.type === 'hunker')).toBe(false);
  }
});
test('rules 7: a wounded unit with no safe tile to reach and only a hopeless attack hunkers', () => {
  const s = hunkerField();
  const hurt = addUnit(s, 'warrior', 1, 0, -2, { hp: 2 });
  addUnit(s, 'spearman', 0, -1, -2);                                  // its counter would kill the warrior
  for (const [q, r] of [[1, -3], [1, -2], [0, -1]] as const) setTile(s, q, r, { terrain: 'water' });
  for (const dial of [0, 0.5, 1]) {
    const plan = planTurn(aiInputFor(s, 1), { dial, seed: 1, refused: [] });
    expect(plan.actions.filter((a) => 'unit' in a && a.unit === hurt.id)).toEqual([{ type: 'hunker', unit: hurt.id }]);
  }
  const refused = [{ type: 'hunker', unit: hurt.id } as const];
  expect(planTurn(aiInputFor(s, 1), { dial: 1, seed: 1, refused }).actions).not.toContainEqual(refused[0]);
});
// rules 7, momentum: a Knight with 2 momentum beside two Hoplites of 1 health, one braced (price 4) and one not
// (price 2), with a Warrior of 1 health behind the unbraced one. Killing the unbraced Hoplite is paid and opens a
// second kill; the braced one is short and ends the chain. The plan takes the paid kill first.
test('a chain rider takes the kill it can pay for first', () => {
  const s = blankMatch({ factions: ['spartans', 'spartans'] });
  addCity(s, 0, -3, 3, { capital: true }); addCity(s, 1, 3, -3, { capital: true });
  const k = addUnit(s, 'knight', 0, 0, 0, { momentum: 2 });
  addUnit(s, 'hoplite', 1, 1, 0, { hp: 1 });
  addUnit(s, 'warrior', 1, 2, 0, { hp: 1 });
  addUnit(s, 'hoplite', 1, -1, 0, { hp: 1 }); addUnit(s, 'hoplite', 1, -2, 0); addUnit(s, 'hoplite', 1, -2, 1);
  for (const dial of [0.5, 0.85, 1]) for (const seed of [1, 2, 3]) {
    const plan = planTurn(aiInputFor(s, 0), { dial, seed, refused: [] });
    const first = plan.actions.find((a) => a.type === 'attack' && a.unit === k.id);
    expect(first, `dial ${dial} seed ${seed}`).toMatchObject({ target: '1,0' });
  }
});
