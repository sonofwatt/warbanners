import { expect, test } from 'vitest';
import { applyAction, createMatch } from '../engine';
import { randomPlayout } from '../engine/testkit';
import { aiInputFor, believedState, viewKey } from './input';
import { planTurn } from './plan';
import { hiddenScout, hopelessCharge, lureFromCity } from './scenarios';
import { skillFor } from './skill';

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
test('a hard plan on the 24-unit position stays inside its budget in Node', () => {
  const input = aiInputFor(randomPlayout(7, 160), 0);
  const t0 = performance.now();
  const plan = planTurn(input, { dial: 1, seed: 1, refused: [] });
  expect(performance.now() - t0).toBeLessThan(800);
  expect(plan.cutShort).toBe(false);
}, 30_000);
