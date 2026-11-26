import { expect, test } from 'vitest';
import { abilityTargets } from './abilities';
import { applyAction, legalActions } from './apply';
import { attackTargets } from './combat';
import { canCapture } from './capture';
import { hashState } from './hash';
import { reachable } from './movement';
import { createMatch, unitAt, unitById } from './state';
import { addCity, addUnit, blankMatch, give, must, rngFor, setTile } from './testkit';
import type { MatchState } from './types';

const mongols = (): MatchState => blankMatch({ factions: ['mongols', 'spartans'] });

test('a Horseman trained this turn cannot be hastened, move or attack, and a move is refused', () => {
  const s = mongols(); give(s, 0, 'riding'); const city = addCity(s, 0, 0, 0);
  const caller = addUnit(s, 'skyCaller', 0, 1, 0);
  addUnit(s, 'warrior', 1, -1, 0);                                       // an enemy beside the city
  const t = must(applyAction(s, { type: 'train', city: city.id, unitType: 'horseman' }));
  const h = unitAt(t, '0,0')!;
  expect(h.fresh).toBe(true);
  expect(abilityTargets(t, caller.id, 'hasten')).not.toContain('0,0');
  const before = hashState(t);
  expect(applyAction(t, { type: 'ability', unit: caller.id, ability: 'hasten', target: '0,0' }).ok).toBe(false);
  expect(hashState(t)).toBe(before);
  // Even with movement and an attack forced onto it, a fresh unit does nothing.
  const forced = structuredClone(t); Object.assign(unitById(forced, h.id)!, { mp: 6, attacks: 1 });
  expect(reachable(forced, h.id)).toEqual({});
  expect(attackTargets(forced, h.id)).toEqual([]);
  expect(legalActions(forced).some((a) => 'unit' in a && a.unit === h.id)).toBe(false);
  expect(applyAction(forced, { type: 'move', unit: h.id, to: '0,1' }).ok).toBe(false);
  expect(applyAction(forced, { type: 'attack', unit: h.id, target: '-1,0' }).ok).toBe(false);
});

test('a Camp trained this turn cannot train, and acts normally once its owner\'s next turn starts', () => {
  const s = mongols(); give(s, 0, 'riding'); const city = addCity(s, 0, 0, 0, { level: 3 });
  const t = must(applyAction(s, { type: 'train', city: city.id, unitType: 'camp' }));
  const camp = unitAt(t, '0,0')!;
  const before = hashState(t);
  expect(applyAction(t, { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: '1,0' }).ok).toBe(false);
  expect(hashState(t)).toBe(before);
  expect(legalActions(t).some((a) => a.type === 'campTrain')).toBe(false);
  const later = must(applyAction(must(applyAction(t, { type: 'endTurn' })), { type: 'endTurn' }));
  expect(unitById(later, camp.id)!.fresh).toBe(false);
  expect(applyAction(later, { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: '1,0' }).ok).toBe(true);
});

test('a trained unit stays fresh through the other player\'s turn and acts on its owner\'s next turn', () => {
  const s = mongols(); give(s, 0, 'riding'); const city = addCity(s, 0, 0, 0);
  const caller = addUnit(s, 'skyCaller', 0, 1, 0);
  const t = must(applyAction(s, { type: 'train', city: city.id, unitType: 'horseman' }));
  const h = unitAt(t, '0,0')!;
  const theirs = must(applyAction(t, { type: 'endTurn' }));
  expect(unitById(theirs, h.id)!.fresh).toBe(true);
  const mine = must(applyAction(theirs, { type: 'endTurn' }));
  expect(unitById(mine, h.id)!.fresh).toBe(false);
  expect(Object.keys(reachable(mine, h.id)).length).toBeGreaterThan(0);
  expect(abilityTargets(mine, caller.id, 'hasten')).toContain('0,0');
  expect(applyAction(mine, { type: 'move', unit: h.id, to: '-1,0' }).ok).toBe(true);
});

test('a fresh unit standing on a village cannot capture it', () => {
  const s = blankMatch(); setTile(s, 1, 0, { village: true });
  const u = addUnit(s, 'warrior', 0, 1, 0, { fresh: true });
  expect(canCapture(s, u.id)).toBe(false);
  expect(canCapture(s, addUnit(s, 'warrior', 0, 3, 0).id)).toBe(false);   // control: not a village
  u.fresh = false;
  expect(canCapture(s, u.id)).toBe(true);
});

test('a fresh unit has no ability targets', () => {
  const s = blankMatch(); const p = addUnit(s, 'piper', 0, 0, 0, { fresh: true }); addUnit(s, 'warrior', 0, 1, 0, { hp: 3 });
  expect(abilityTargets(s, p.id, 'heal')).toEqual([]);
  p.fresh = false;
  expect(abilityTargets(s, p.id, 'heal')).toEqual(['1,0']);
});

test('a treasure unit and a reward unit are fresh', () => {
  const s = blankMatch(); setTile(s, 1, 0, { treasure: true }); const u = addUnit(s, 'warrior', 0, 1, 0);
  s.rng = rngFor('unit');
  const t = must(applyAction(s, { type: 'claimTreasure', unit: u.id }));
  expect(unitAt(t, '2,0')).toMatchObject({ type: 'warrior', fresh: true });
  const r = blankMatch(); const c = addCity(r, 0, 0, 0, { level: 5, pendingRewards: [5] });
  const after = must(applyAction(r, { type: 'chooseReward', city: c.id, choice: 0 }));
  expect(unitAt(after, '0,0')).toMatchObject({ type: 'kingsGuard', fresh: true });
});

test('starting units and test units are not fresh', () => {
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  expect(s.units.map((u) => u.fresh)).toEqual([false, false]);
  expect(addUnit(blankMatch(), 'warrior', 0, 0, 0).fresh).toBe(false);
});
