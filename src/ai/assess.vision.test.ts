// The rest term asks restHealAt about every hurt unit; the visible-tile set it needs is computed once per evaluation.
import { expect, test, vi } from 'vitest';
import type * as Engine from '../engine';

const calls = vi.hoisted(() => ({ visible: [] as unknown[] }));
vi.mock('../engine', async (importOriginal) => {
  const real = await importOriginal<typeof Engine>();
  return {
    ...real,
    restHealAt: (...args: Parameters<typeof real.restHealAt>) => { calls.visible.push(args[2]); return real.restHealAt(...args); },
  };
});

const { addCity, addUnit, blankMatch } = await import('../engine/testkit');
const { dangerMap, objectives, valueOf, moveScore } = await import('./assess');
const { PERSONAS } = await import('./persona');
const { skillFor } = await import('./skill');

test('valueOf and moveScore pass restHealAt one visible-tile set per evaluation', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const a = addUnit(s, 'warrior', 0, 1, 2, { hp: 4 });
  addUnit(s, 'warrior', 0, -1, 2, { hp: 5 });
  addUnit(s, 'archer', 0, 2, 1, { hp: 6 });
  for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
  const persona = PERSONAS.spartans;
  const ctx = { me: 0, skill: skillFor(1), persona, danger: dangerMap(s, 0), goals: objectives(s, 0, persona), hurt: new Set<number>() };

  calls.visible.length = 0;
  valueOf(s, ctx);
  expect(calls.visible).toHaveLength(3);
  expect(calls.visible[0]).toBeInstanceOf(Set);
  expect(new Set(calls.visible).size).toBe(1);

  calls.visible.length = 0;
  moveScore(s, ctx, a.id, '2,2', 0);             // the unit before and after the move: one set for each state
  expect(calls.visible).toHaveLength(2);
  expect(calls.visible.every((v) => v instanceof Set)).toBe(true);
});
