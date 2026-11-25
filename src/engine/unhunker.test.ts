import { expect, test } from 'vitest';
import { applyAction, legalActions } from './apply';
import { CONFIG } from './data/config';
import { unitById } from './state';
import { addCity, addUnit, blankMatch, must } from './testkit';
import type { Action, MatchState } from './types';

// Rules 9, Unhunker: the owner ends a unit's hunker on their turn. It ends the hunker and nothing else.
const end = { type: 'endTurn' } as const;
const hunker = (unit: number) => ({ type: 'hunker', unit }) as const;
const unhunker = (unit: number) => ({ type: 'unhunker', unit }) as const;
const why = (s: MatchState, a: Action): string => { const r = applyAction(s, a); return r.ok ? 'ok' : r.reason; };
const own = (s: MatchState, id: number): Action[] => legalActions(s).filter((a) => 'unit' in a && a.unit === id);

function field(): MatchState {
  const s = blankMatch(); addCity(s, 0, 0, 0); addCity(s, 1, 3, 0);
  return s;
}

test('legal only for a hunkered unit of the player whose turn it is', () => {
  expect(CONFIG.hunker.unhunker).toBe(true);
  const s = field();
  const plain = addUnit(s, 'warrior', 0, -1, 0);
  const dug = addUnit(s, 'warrior', 0, -1, 1, { hunkered: true });
  const theirs = addUnit(s, 'warrior', 1, 3, -1, { hunkered: true });
  expect(legalActions(s)).toContainEqual(unhunker(dug.id));
  expect(legalActions(s)).not.toContainEqual(unhunker(plain.id));
  expect(why(s, unhunker(plain.id))).toBe('not hunkered');
  expect(why(s, unhunker(theirs.id))).toBe('not your unit');
  expect(why(s, unhunker(99))).toBe('no such unit');
  expect(why(s, { type: 'unhunker', unit: 'x' } as unknown as Action)).toBe('bad unhunker');
  const next = must(applyAction(s, end));                              // player 1's turn: its own unit, not player 0's
  expect(legalActions(next)).toContainEqual(unhunker(theirs.id));
  expect(legalActions(next)).not.toContainEqual(unhunker(dug.id));
});

test('ends the hunker and nothing else: no movement or attacks back, not acting, so the unit still rests', () => {
  const s = field();
  const u = addUnit(s, 'warrior', 0, -1, 0, { hp: 5 });
  const dug = must(applyAction(s, hunker(u.id)));
  const r = applyAction(dug, unhunker(u.id));
  if (!r.ok) throw new Error(r.reason);
  expect(r.events).toEqual([{ type: 'hunkerEnded', unit: u.id }]);
  const after = unitById(r.state, u.id)!;
  expect(after).toMatchObject({ hunkered: false, mp: 0, attacks: 0, moved: false, acted: false, unhunkeredTurn: dug.stamp });
  expect(own(r.state, u.id)).toEqual([]);                             // it hunkered this turn: no move, no attack, no hunker
  expect(why(r.state, hunker(u.id))).toBe('unhunkered this turn');
  const next = must(applyAction(r.state, end));
  expect(unitById(next, u.id)!.rested).toBe(true);                     // unhunkering is not doing something
  const back = must(applyAction(next, end));                          // player 0 again: a normal turn, and it may hunker
  expect(unitById(back, u.id)!.hp).toBeGreaterThan(5);                // and heals from that rest
  expect(own(back, u.id)).toContainEqual(hunker(u.id));
});

test('a unit hunkered on an earlier turn has its normal turn after unhunkering, but cannot hunker again this turn', () => {
  const s = field();
  const u = addUnit(s, 'warrior', 0, -1, 0, { hunkered: true });
  const t = must(applyAction(s, unhunker(u.id)));
  expect(unitById(t, u.id)).toMatchObject({ hunkered: false, mp: u.mp, attacks: u.attacks });
  expect(own(t, u.id).some((a) => a.type === 'move')).toBe(true);
  expect(own(t, u.id)).not.toContainEqual(hunker(u.id));
  expect(why(t, unhunker(u.id))).toBe('not hunkered');
});

test('the unhunkered stamp is absent until a unit unhunkers, so states without it hash as before', () => {
  const s = field();
  const u = addUnit(s, 'warrior', 0, -1, 0);
  expect('unhunkeredTurn' in unitById(must(applyAction(s, hunker(u.id))), u.id)!).toBe(false);   // absent until used
});
