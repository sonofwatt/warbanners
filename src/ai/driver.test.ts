import { expect, test } from 'vitest';
import { applyAction, hashState, visibleTiles } from '../engine';
import type { Action, MatchState } from '../engine';
import { addCity, addUnit, blankMatch, must, randomPlayout } from '../engine/testkit';
import { MAX_REPLANS, START, afterAct, afterThink, aiStep, planSeed, runAiTurn } from './driver';
import type { Cursor } from './driver';
import { aiInputFor, believedState, viewKey } from './input';
import { planTurn } from './plan';
import type { Plan } from './plan';
import { hiddenScout } from './scenarios';

test('a move into an unseen scout is refused, remembered, and the turn still ends', () => {
  const { state, rider } = hiddenScout();
  // force the first plan to try 2,0 by giving the driver a plan that does. Its expected views are never read:
  // aiStep compares a view only after an accepted action, and this plan's only one is refused.
  let cur = afterThink(START, { actions: [{ type: 'move', unit: rider, to: '2,0' }, { type: 'endTurn' }], expect: ['x', 'y'], evals: 0, cutShort: false });
  const step = aiStep(cur, state, { player: 1, dial: 0.5, salt: 1 });
  expect(step).toEqual({ kind: 'act', action: { type: 'move', unit: rider, to: '2,0' } });
  cur = afterAct(cur, { type: 'move', unit: rider, to: '2,0' }, false);
  expect(cur.refused).toEqual([{ type: 'move', unit: rider, to: '2,0' }]);
  expect(aiStep(cur, state, { player: 1, dial: 0.5, salt: 1 }).kind).toBe('think');
});

test('a whole AI turn from the hidden-scout position', () => {
  const { state } = hiddenScout();
  const log = runAiTurn(state, { player: 1, dial: 0.5, salt: 3 });
  expect(log.state.current).toBe(0);
  expect(log.steps.at(-1)!.action).toEqual({ type: 'endTurn' });
  expect(log.refused.every(a => a.type === 'move')).toBe(true);
  expect(log.replans).toBeLessThanOrEqual(MAX_REPLANS);
});

test('the same position and salt give the same turn', () => {
  const s = randomPlayout(3, 90);
  const a = runAiTurn(s, { player: s.current, dial: 0.5, salt: 11 }), b = runAiTurn(s, { player: s.current, dial: 0.5, salt: 11 });
  expect(a.steps.map(x => x.action)).toEqual(b.steps.map(x => x.action));
  expect(hashState(a.state)).toBe(hashState(b.state));
}, 30_000);                                         // a 90-turn random playout plus a whole AI turn

test('the same turn whatever is hidden from the AI', () => {
  // built as in input.test.ts's first test, player 0 to move
  const base = blankMatch(); addCity(base, 0, 0, 3); addCity(base, 1, 0, -3);
  addUnit(base, 'warrior', 0, 0, 2); addUnit(base, 'horseman', 1, 0, -2);
  for (const p of base.players) p.explored = [...visibleTiles(base, p.id)].sort();
  const other = structuredClone(base);
  other.players[1]!.gold = 99; other.players[1]!.techs = ['riding', 'roads']; other.rng = 12345; other.seed = 777;
  addUnit(other, 'archer', 1, 3, -3);          // out of player 0's sight
  expect(base.current).toBe(0);
  expect(aiInputFor(other, 0)).toEqual(aiInputFor(base, 0));
  const seat = { player: 0, dial: 0.5, salt: 4 };
  const a = runAiTurn(base, seat), b = runAiTurn(other, seat);
  expect(a.steps.length).toBeGreaterThan(1);
  expect(b.steps.map(x => x.action)).toEqual(a.steps.map(x => x.action));
  expect(b.refused).toEqual(a.refused);
  expect(b.replans).toBe(a.replans);
});

test('nothing to do: the turn ends at once', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3); s.players[0]!.gold = 0;
  for (const p of s.players) p.explored = [...visibleTiles(s, p.id)].sort();
  const log = runAiTurn(s, { player: 0, dial: 1, salt: 1 });
  expect(log.steps.map(x => x.action)).toEqual([{ type: 'endTurn' }]);
});

test('a refusal loop is cut off', () => {
  const { state, rider } = hiddenScout();
  const seat = { player: 1, dial: 0.5, salt: 1 };
  const doomed: Action = { type: 'move', unit: rider, to: '2,0' };
  expect(applyAction(state, doomed).ok).toBe(false);
  let cur: Cursor = START;
  const seeds: number[] = [];
  for (let guard = 0; guard < 100; guard++) {
    const step = aiStep(cur, state, seat);
    if (step.kind === 'think') {
      seeds.push(step.seed);
      // The expected views are never read: the plan's first action is always refused, so next stays 0.
      cur = afterThink(cur, { actions: [doomed, { type: 'endTurn' }], expect: ['x', 'y'], evals: 0, cutShort: false });
      continue;
    }
    if (step.action.type === 'endTurn') break;
    expect(step.action).toEqual(doomed);
    cur = afterAct(cur, step.action, applyAction(state, step.action).ok);
  }
  expect(seeds).toHaveLength(MAX_REPLANS + 1);
  expect(new Set(seeds).size).toBe(seeds.length);    // each replan draws a fresh seed
  expect(seeds[0]).toBe(planSeed(1, state.stamp, 0));
  expect(cur.replans).toBe(MAX_REPLANS);
  expect(aiStep(cur, state, seat)).toEqual({ kind: 'act', action: { type: 'endTurn' } });
});

test('a view that differs from the plan gives a replan', () => {
  const { state } = hiddenScout();
  const plan = planTurn(aiInputFor(state, 1), { dial: 0.5, seed: planSeed(3, state.stamp, 0), refused: [] });
  const first = plan.actions[0]!;
  expect(first.type).not.toBe('endTurn');
  let cur = afterThink(START, plan);
  cur = afterAct(cur, first, true);
  // the real state did not change, so it cannot match the view the plan expected after its first action
  expect(viewKey(aiInputFor(state, 1))).not.toBe(plan.expect[0]);
  const step = aiStep(cur, state, { player: 1, dial: 0.5, salt: 3 });
  expect(step).toEqual({ kind: 'think', refused: [], seed: planSeed(3, state.stamp, 1) });
  expect(afterThink(cur, plan).replans).toBe(1);
});

// Player 0's warrior stands on player 1's only seen city. The planner believes capturing it wins.
function believedWin(hiddenCity: boolean): MatchState {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  if (hiddenCity) addCity(s, 1, 4, -4);
  addUnit(s, 'warrior', 0, 0, -3);
  addUnit(s, 'warrior', 1, 1, -3);
  s.players[0]!.gold = 0;                       // nothing to research or train before the capture
  for (const p of s.players) p.explored = [...visibleTiles(s, p.id)].sort();
  return s;
}

test('a believed win that is not real: the turn still ends with no replan', () => {
  const s = believedWin(true);
  const input = aiInputFor(s, 0);
  expect(input.view.cities.some(c => c.pos === '4,-4')).toBe(false);
  const plan = planTurn(input, { dial: 0.5, seed: planSeed(2, s.stamp, 0), refused: [] });
  expect(plan.actions.map(a => a.type)).toEqual(['capture', 'endTurn']);
  // the real capture leaves player 1 alive with its unit in sight, so the view differs from the belief
  const r = applyAction(s, plan.actions[0]!); expect(r.ok).toBe(true); if (!r.ok) return;
  expect(viewKey(aiInputFor(r.state, 0))).not.toBe(plan.expect[0]);
  const log = runAiTurn(s, { player: 0, dial: 0.5, salt: 2 });
  expect(log.steps.map(x => x.action.type)).toEqual(['capture', 'endTurn']);
  expect(log.replans).toBe(0);
  expect(log.state.winner).toBe(null);
  expect(log.state.current).toBe(1);
});

test('a real win ends the turn loop without an endTurn', () => {
  const s = believedWin(false);
  const log = runAiTurn(s, { player: 0, dial: 0.5, salt: 2 });
  expect(log.steps.map(x => x.action.type)).toEqual(['capture']);
  expect(log.state.winner).toBe(0);
  expect(log.steps[0]!.events.some(e => e.type === 'matchOver')).toBe(true);
});

// Player 0's warrior at 0,2 steps to 0,1, which brings a player 1 warrior at 0,0 into sight, three tiles from
// player 0's city. The plan expects the believed view after the step, where 0,0 is empty.
function revealingStep(enemy: boolean): { s: MatchState; plan: Plan; move: Action } {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const warrior = addUnit(s, 'warrior', 0, 0, 2).id;
  if (enemy) addUnit(s, 'warrior', 1, 0, 0);
  for (const p of s.players) p.explored = [...visibleTiles(s, p.id)].sort();
  const move: Action = { type: 'move', unit: warrior, to: '0,1' };
  const b1 = must(applyAction(believedState(aiInputFor(s, 0)), move));
  const b2 = must(applyAction(b1, { type: 'endTurn' }));
  const plan: Plan = { actions: [move, { type: 'endTurn' }], expect: [viewKey(aiInputFor(b1, 0)), viewKey(aiInputFor(b2, 0))], evals: 0, cutShort: false };
  return { s, plan, move };
}

test('a last move that reveals an enemy gives a replan, not endTurn', () => {
  const seat = { player: 0, dial: 0.5, salt: 1 };
  const { s, plan, move } = revealingStep(true);
  expect(aiInputFor(s, 0).view.units.some(u => u.owner === 1 && u.pos === '0,0')).toBe(false);
  let cur = afterThink(START, plan);
  expect(aiStep(cur, s, seat)).toEqual({ kind: 'act', action: move });
  const real = must(applyAction(s, move));
  expect(aiInputFor(real, 0).view.units.some(u => u.owner === 1 && u.pos === '0,0')).toBe(true);
  cur = afterAct(cur, move, true);
  expect(aiStep(cur, real, seat)).toEqual({ kind: 'think', refused: [], seed: planSeed(1, real.stamp, 1) });
  // with no enemy there, the real view is the expected one and the turn ends as planned
  const quiet = revealingStep(false);
  const quietReal = must(applyAction(quiet.s, quiet.move));
  expect(aiStep(afterAct(afterThink(START, quiet.plan), quiet.move, true), quietReal, seat))
    .toEqual({ kind: 'act', action: { type: 'endTurn' } });
});

test('a plan that runs out without endTurn ends the turn once the view is as expected', () => {
  const seat = { player: 0, dial: 0.5, salt: 1 };
  const { s, plan, move } = revealingStep(false);
  const short: Plan = { ...plan, actions: [move], expect: [plan.expect[0]!] };
  const cur = afterAct(afterThink(START, short), move, true);
  expect(aiStep(cur, must(applyAction(s, move)), seat)).toEqual({ kind: 'act', action: { type: 'endTurn' } });
  expect(aiStep(cur, s, seat).kind).toBe('think');   // the move not seen in the real view: replan
});

test('a refused endTurn throws instead of looping', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3); s.players[0]!.gold = 0;
  for (const p of s.players) p.explored = [...visibleTiles(s, p.id)].sort();
  // a value structuredClone cannot copy: the planner never sees it, but applyAction refuses every action
  (s as unknown as Record<string, unknown>).broken = () => 0;
  expect(applyAction(s, { type: 'endTurn' })).toEqual({ ok: false, reason: 'invalid action' });
  expect(() => runAiTurn(s, { player: 0, dial: 1, salt: 1 })).toThrow('the match refused endTurn: invalid action');
});
