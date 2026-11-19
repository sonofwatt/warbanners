import { expect, test } from 'vitest';
import { applyAction, createMatch, legalActions, playerView } from '../engine';
import type { MatchState } from '../engine';
import { addCity, addUnit, blankMatch, give, must } from '../engine/testkit';
import { afterAction, indexActions, marksFor, nextUnit, NONE, spentUnits, tap } from './interaction';
import type { Selection } from './interaction';

const open = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });   // my warrior (id 0) stands on my capital at -2,5
const V = playerView(open, 0), IX = indexActions(legalActions(open));
const unitSel = (id: number, o: Partial<Extract<Selection, { kind: 'unit' }>> = {}): Selection => ({ kind: 'unit', id, armed: null, askLure: null, ...o });
const seeAll = (s: MatchState) => { for (const p of s.players) p.explored = Object.keys(s.tiles).sort(); return s; };

test('the index groups what the engine allows', () => {
  expect([...IX.moves[0]!].sort()).toEqual(['-1,4', '-1,5', '-2,4', '-2,6', '-3,5', '-3,6']);
  expect(IX.build['-2,4']).toEqual(['mine']);
  expect(IX.research).toEqual(['foraging', 'riding', 'hunting', 'shieldwork']);
  expect(IX.activeUnits).toEqual([0]);
  expect(IX.train[0]).toBeUndefined();          // the capital tile is occupied
});
test('tap my unit on my city, then its tile again for the city, then again for nothing', () => {
  const a = tap(NONE, { unit: 0, hex: '-2,5' }, V, IX);
  expect(a).toEqual({ selection: unitSel(0), action: null });
  const b = tap(a.selection, { unit: null, hex: '-2,5' }, V, IX);
  expect(b.selection).toEqual({ kind: 'city', id: 0 });
  expect(tap(b.selection, { unit: 0, hex: '-2,5' }, V, IX).selection).toEqual(NONE);
});
test('tap my unit off a city, then its tile again for the tile, then again for nothing', () => {
  const s = seeAll(blankMatch()); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const w = addUnit(s, 'warrior', 0, 1, 0);
  const v = playerView(s, 0), ix = indexActions(legalActions(s));
  const a = tap(NONE, { unit: w.id, hex: '1,0' }, v, ix);
  expect(a).toEqual({ selection: unitSel(w.id), action: null });
  const b = tap(a.selection, { unit: w.id, hex: '1,0' }, v, ix);
  expect(b).toEqual({ selection: { kind: 'tile', at: '1,0' }, action: null });
  expect(marksFor(b.selection, v, ix)).toEqual({ '1,0': 'selected' });
  expect(tap(b.selection, { unit: w.id, hex: '1,0' }, v, ix)).toEqual({ selection: NONE, action: null });
  // A tap there with another tile selected starts the cycle again with the unit.
  expect(tap({ kind: 'tile', at: '2,0' }, { unit: w.id, hex: '1,0' }, v, ix).selection).toEqual(unitSel(w.id));
});
test('my unit standing on an enemy city: the unit, then the tile, then nothing', () => {
  const s = seeAll(blankMatch()); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const w = addUnit(s, 'warrior', 0, 0, -3);
  const v = playerView(s, 0), ix = indexActions(legalActions(s));
  const a = tap(NONE, { unit: w.id, hex: '0,-3' }, v, ix);
  expect(a.selection).toEqual(unitSel(w.id));
  const b = tap(a.selection, { unit: null, hex: '0,-3' }, v, ix);
  expect(b.selection).toEqual({ kind: 'tile', at: '0,-3' });
  expect(tap(b.selection, { unit: null, hex: '0,-3' }, v, ix).selection).toEqual(NONE);
});
test('Next unit: the units that can still act, in id order, after the selected one, wrapping round', () => {
  const ix = indexActions([
    { type: 'move', unit: 5, to: '0,1' }, { type: 'capture', unit: 2 }, { type: 'move', unit: 9, to: '1,0' },
  ]);
  expect(ix.activeUnits).toEqual([2, 5, 9]);
  expect(nextUnit(NONE, ix)).toEqual(unitSel(2));
  expect(nextUnit(unitSel(2), ix)).toEqual(unitSel(5));
  expect(nextUnit(unitSel(5, { armed: { kind: 'ability', ability: 'heal' } }), ix)).toEqual(unitSel(9));
  expect(nextUnit(unitSel(9), ix)).toEqual(unitSel(2));                       // wraps to the first
  expect(nextUnit(unitSel(7), ix)).toEqual(unitSel(2));                       // a unit that cannot act (or a foe): the first
  expect(nextUnit({ kind: 'city', id: 0 }, ix)).toEqual(unitSel(2));
  expect(nextUnit({ kind: 'tile', at: '0,0' }, ix)).toEqual(unitSel(2));
  expect(nextUnit(unitSel(9), indexActions([{ type: 'move', unit: 9, to: '1,0' }]))).toEqual(unitSel(9));   // the only one
});
test('Next unit skips a unit that has done all it can, and offers nothing when none can act', () => {
  const s = seeAll(blankMatch()); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const a = addUnit(s, 'warrior', 0, -2, 0), b = addUnit(s, 'warrior', 0, 0, 0), c = addUnit(s, 'warrior', 0, 2, 0);
  expect(indexActions(legalActions(s)).activeUnits).toEqual([a.id, b.id, c.id]);
  const moved = must(applyAction(s, { type: 'move', unit: b.id, to: '0,1' }));
  const ix = indexActions(legalActions(moved));
  expect(ix.activeUnits).toEqual([a.id, c.id]);                                // b has nothing left this turn
  expect(nextUnit(unitSel(a.id), ix)).toEqual(unitSel(c.id));
  expect(nextUnit(unitSel(b.id), ix)).toEqual(unitSel(a.id));
  expect(nextUnit(NONE, indexActions([]))).toBeNull();
  expect(nextUnit(unitSel(a.id), indexActions([]))).toBeNull();
});
test('with a unit selected, a highlighted tile moves it', () => {
  expect(tap(unitSel(0), { unit: null, hex: '-1,4' }, V, IX).action).toEqual({ type: 'move', unit: 0, to: '-1,4' });
});
test('other taps change the selection and never act', () => {
  expect(tap(unitSel(0), { unit: null, hex: '-2,3' }, V, IX)).toEqual({ selection: { kind: 'tile', at: '-2,3' }, action: null });
  expect(tap(unitSel(0), { unit: null, hex: '0,0' }, V, IX)).toEqual({ selection: NONE, action: null });   // fog
  expect(tap(unitSel(0), { unit: null, hex: null }, V, IX)).toEqual({ selection: NONE, action: null });
});
test('marks for a selected unit', () => {
  const m = marksFor(unitSel(0), V, IX);
  expect(m['-2,5']).toBe('selected'); expect(m['-1,4']).toBe('move');
  expect(Object.values(m).filter(x => x === 'move')).toHaveLength(6);
});
test('an attack that can lure asks first', () => {
  const s = seeAll(blankMatch({ factions: ['mongols', 'spartans'] }));
  addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const rider = addUnit(s, 'horseArcher', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0);
  const v = playerView(s, 0), ix = indexActions(legalActions(s));
  expect(ix.lures[rider.id]).toEqual(['1,0']);
  const r = tap(unitSel(rider.id), { unit: null, hex: '1,0' }, v, ix);
  expect(r).toEqual({ selection: unitSel(rider.id, { askLure: '1,0' }), action: null });
  expect(marksFor(r.selection, v, ix)).toEqual({ '0,0': 'selected', '1,0': 'attack' });
});
test('an armed ability fires on a target and disarms on anything else', () => {
  const s = seeAll(blankMatch());
  addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const piper = addUnit(s, 'piper', 0, 0, 0); addUnit(s, 'hoplite', 0, 1, 0, { hp: 7 }); addUnit(s, 'warrior', 1, -1, 0);
  const v = playerView(s, 0), ix = indexActions(legalActions(s));
  const armed = unitSel(piper.id, { armed: { kind: 'ability', ability: 'heal' } });
  expect(marksFor(armed, v, ix)).toEqual({ '0,0': 'selected', '1,0': 'ability' });
  expect(tap(armed, { unit: null, hex: '1,0' }, v, ix)).toEqual({ selection: unitSel(piper.id), action: { type: 'ability', unit: piper.id, ability: 'heal', target: '1,0' } });
  expect(tap(armed, { unit: null, hex: '0,1' }, v, ix)).toEqual({ selection: unitSel(piper.id), action: null });   // a move target, but armed: no move
});
test('a camp trains onto the tapped tile, and a waiting capture is marked', () => {
  const s = seeAll(blankMatch({ factions: ['mongols', 'spartans'] }));
  addCity(s, 0, 0, 3); addCity(s, 1, 0, -3); give(s, 0, 'riding', 'roads');
  const camp = addUnit(s, 'camp', 0, 0, 0);
  s.tiles['2,0']!.village = true; const taker = addUnit(s, 'warrior', 0, 2, 0);
  const v = playerView(s, 0), ix = indexActions(legalActions(s));
  const armed = unitSel(camp.id, { armed: { kind: 'campTrain', unitType: 'warrior' } });
  expect(tap(armed, { unit: null, hex: '1,-1' }, v, ix).action).toEqual({ type: 'campTrain', unit: camp.id, unitType: 'warrior', to: '1,-1' });
  expect(ix.captures).toEqual([taker.id]);
  expect(marksFor(NONE, v, ix)).toEqual({ '2,0': 'capture' });
});
test('an enemy unit can be looked at but not ordered', () => {
  const s = seeAll(blankMatch()); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  addUnit(s, 'warrior', 0, 0, 0); const foe = addUnit(s, 'warrior', 1, 1, -1);   // next to my warrior, so I can see it
  const v = playerView(s, 0), ix = indexActions(legalActions(s));
  const r = tap(NONE, { unit: foe.id, hex: '1,-1' }, v, ix);
  expect(r).toEqual({ selection: unitSel(foe.id), action: null });
  expect(tap(r.selection, { unit: null, hex: '2,-2' }, v, ix).action).toBeNull();
});
test('after an action the selection is kept only while the unit can still do something', () => {
  const moved = must(applyAction(open, { type: 'move', unit: 0, to: '-1,4' }));
  const v = playerView(moved, 0), ix = indexActions(legalActions(moved));
  expect(afterAction(unitSel(0), v, ix)).toEqual(ix.activeUnits.includes(0) ? unitSel(0) : NONE);
  expect(afterAction(unitSel(77), v, ix)).toEqual(NONE);
  expect(spentUnits(V, IX).size).toBe(0);
});
