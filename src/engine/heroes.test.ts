import { expect, test } from 'vitest';
import { applyAction } from './apply';
import { CONFIG } from './data/config';
import { canEarnTraits, isHero, thresholdOf } from './heroes';
import { spawnUnit, unitById } from './state';
import { addCity, addUnit, blankMatch } from './testkit';
import type { GameEvent, MatchState, Unit } from './types';
import { playerView } from './vision';

const H = CONFIG.heroes;
const traitEvents = (ev: GameEvent[]): GameEvent[] => ev.filter((e) => e.type === 'heroTrait');
function act(s: MatchState, a: Parameters<typeof applyAction>[1]) {
  const r = applyAction(s, a);
  if (!r.ok) throw new Error(r.reason);
  return r;
}
// Player 1 ends its turn, so player 0's turn starts with turnsTaken above 0 and its rested units heal.
function turnStart(s: MatchState): { state: MatchState; events: GameEvent[] } {
  s.current = 1;
  s.players[0]!.turnsTaken = 1;
  return act(s, { type: 'endTurn' });
}
// A match with player 0's city at the centre (its territory holds the centre and its six neighbours).
function home(): MatchState {
  const s = blankMatch();
  addCity(s, 0, 0, 0);
  addCity(s, 1, 3, 0);
  return s;
}

test('a new unit starts with no deeds, no traits and nothing carried', () => {
  const s = blankMatch();
  const u = spawnUnit(s, 'warrior', 0, '0,0', null);
  expect(u.deeds).toEqual({ fight: 0, march: 0, survive: 0, rest: 0 });
  expect(u.heroTraits).toEqual([]);
  expect(u.item).toBeNull();
});

test('fight: one attack, and a kill', () => {
  let s = blankMatch();
  const a = addUnit(s, 'warrior', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0);
  s = act(s, { type: 'attack', unit: a.id, target: '1,0' }).state;
  expect(unitById(s, a.id)!.deeds.fight).toBe(H.fightPerAttack);
  s = blankMatch();
  const k = addUnit(s, 'knight', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0);
  s = act(s, { type: 'attack', unit: k.id, target: '1,0' }).state;
  expect(s.units).toHaveLength(1);
  expect(unitById(s, k.id)!.deeds.fight).toBe(H.fightPerAttack + H.fightPerKill);
});

test('fight: a splash kill counts as a kill, and splashed survivors earn survive', () => {
  let s = blankMatch();
  const c = addUnit(s, 'catapult', 0, 0, 0);
  addUnit(s, 'warrior', 0, 1, 0);                  // sees the target tile
  const t = addUnit(s, 'defender', 1, 2, 0);
  const weak = addUnit(s, 'warrior', 1, 3, 0, { hp: 1 });
  const strong = addUnit(s, 'warrior', 1, 2, 1);
  s = act(s, { type: 'attack', unit: c.id, target: '2,0' }).state;
  expect(unitById(s, weak.id)).toBeUndefined();
  expect(unitById(s, c.id)!.deeds.fight).toBe(H.fightPerAttack + H.fightPerKill);
  expect(unitById(s, t.id)!.deeds.survive).toBe(1);
  expect(unitById(s, strong.id)!.deeds.survive).toBe(1);
});

test('survive: a target that lives, and an attacker that lives through a counter', () => {
  let s = blankMatch();
  const a = addUnit(s, 'warrior', 0, 0, 0); const d = addUnit(s, 'warrior', 1, 1, 0);
  s = act(s, { type: 'attack', unit: a.id, target: '1,0' }).state;
  expect(unitById(s, a.id)!.deeds.survive).toBe(1);
  expect(unitById(s, d.id)!.deeds.survive).toBe(1);
});

test('a fresh unit hit and alive earns no survive', () => {
  let s = blankMatch();
  const a = addUnit(s, 'warrior', 0, 0, 0); const d = addUnit(s, 'warrior', 1, 1, 0, { fresh: true });
  s = act(s, { type: 'attack', unit: a.id, target: '1,0' }).state;
  expect(unitById(s, d.id)!.deeds.survive).toBe(0);
  expect(unitById(s, a.id)!.deeds.survive).toBe(1);
});

test('a counter that kills the attacker is a kill for the defender', () => {
  let s = blankMatch();
  const a = addUnit(s, 'warrior', 0, 0, 0, { hp: 1 }); const d = addUnit(s, 'warrior', 1, 1, 0);
  const r = act(s, { type: 'attack', unit: a.id, target: '1,0' });
  s = r.state;
  expect(unitById(s, a.id)).toBeUndefined();
  expect(unitById(s, d.id)!.deeds.fight).toBe(H.fightPerKill);
});

test('march counts the distance of each own move, not lures or advances', () => {
  let s = blankMatch({ factions: ['mongols', 'spartans'] });
  const h = addUnit(s, 'horseman', 0, 0, 0);
  s = act(s, { type: 'move', unit: h.id, to: '2,0' }).state;
  expect(unitById(s, h.id)!.deeds.march).toBe(2);
  // a lured target does not march
  s = blankMatch({ factions: ['mongols', 'spartans'] });
  const rider = addUnit(s, 'horseman', 0, 0, 0); const lured = addUnit(s, 'warrior', 1, 1, 0);
  s = act(s, { type: 'attack', unit: rider.id, target: '1,0', lure: true }).state;
  expect(unitById(s, rider.id)!.lure).not.toBeNull();
  s = act(s, { type: 'move', unit: rider.id, to: '-1,0' }).state;
  expect(unitById(s, lured.id)!.pos).toBe('0,0');
  expect(unitById(s, lured.id)!.deeds.march).toBe(0);
  expect(unitById(s, rider.id)!.deeds.march).toBe(1);
  // a melee advance adds nothing
  s = blankMatch();
  const k = addUnit(s, 'knight', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0);
  s = act(s, { type: 'attack', unit: k.id, target: '1,0' }).state;
  expect(unitById(s, k.id)!.pos).toBe('1,0');
  expect(unitById(s, k.id)!.deeds.march).toBe(0);
});

test('rest counts only a rest that heals, and never adds survive', () => {
  const s = home();
  const hurt = addUnit(s, 'warrior', 0, 0, 0, { hp: 5, rested: true });
  const full = addUnit(s, 'warrior', 0, 1, 0, { rested: true });
  const t = turnStart(s).state;
  expect(unitById(t, hurt.id)!.hp).toBeGreaterThan(5);
  expect(unitById(t, hurt.id)!.deeds).toMatchObject({ rest: 1, survive: 0 });
  expect(unitById(t, full.id)!.deeds.rest).toBe(0);
});

test('a unit trained last turn earns no rest on its first turn start', () => {
  const s = home();
  const u = addUnit(s, 'warrior', 0, 0, 0, { hp: 5, rested: true, fresh: true });
  const t = turnStart(s).state;
  expect(unitById(t, u.id)!.hp).toBeGreaterThan(5);
  expect(unitById(t, u.id)!.deeds.rest).toBe(0);
});

test('a heal ability counts survive for its target', () => {
  let s = blankMatch();
  const p = addUnit(s, 'piper', 0, 0, 0);
  const hurt = addUnit(s, 'warrior', 0, 1, 0, { hp: 5 });
  const fresh = addUnit(s, 'warrior', 0, 0, 1, { hp: 5, fresh: true });
  s = act(s, { type: 'ability', unit: p.id, ability: 'heal', target: '1,0' }).state;
  expect(unitById(s, hurt.id)!.hp).toBe(5 + CONFIG.abilityHeal);
  expect(unitById(s, hurt.id)!.deeds.survive).toBe(1);
  expect(unitById(s, p.id)!.deeds.survive).toBe(0);
  expect(unitById(s, fresh.id)!.deeds.survive).toBe(0);
  // a fresh target is healed but earns nothing
  s = blankMatch();
  const p2 = addUnit(s, 'piper', 0, 0, 0);
  const f2 = addUnit(s, 'warrior', 0, 1, 0, { hp: 5, fresh: true });
  s = act(s, { type: 'ability', unit: p2.id, ability: 'heal', target: '1,0' }).state;
  expect(unitById(s, f2.id)!.hp).toBe(5 + CONFIG.abilityHeal);
  expect(unitById(s, f2.id)!.deeds.survive).toBe(0);
});

test('the threshold grants the trait with an event', () => {
  const s = blankMatch();
  const a = addUnit(s, 'warrior', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0);
  a.deeds.fight = thresholdOf(s, a, 'fight') - 1;
  const r = act(s, { type: 'attack', unit: a.id, target: '1,0' });
  expect(unitById(r.state, a.id)!.heroTraits).toEqual(['fierce']);
  expect(traitEvents(r.events)).toEqual([{ type: 'heroTrait', unit: a.id, trait: 'fierce', hero: false }]);
});

test('Spartans earn from the agoge table', () => {
  let s = blankMatch();
  const hop = addUnit(s, 'hoplite', 0, 0, 0); const foe = addUnit(s, 'warrior', 1, 1, 0);
  const rider = addUnit(s, 'horseman', 1, 0, 1);
  expect(thresholdOf(s, hop, 'fight')).toBe(H.agogeThresholds.fight);
  expect(thresholdOf(s, rider, 'fight')).toBe(H.thresholds.fight);
  hop.deeds.fight = H.agogeThresholds.fight - 1;
  rider.deeds.fight = H.agogeThresholds.fight - 1;
  s = act(s, { type: 'attack', unit: hop.id, target: '1,0' }).state;
  expect(unitById(s, foe.id)).toBeDefined();
  s = act(s, { type: 'endTurn' }).state;
  s = act(s, { type: 'attack', unit: rider.id, target: '0,0' }).state;
  expect(unitById(s, hop.id)!.heroTraits).toEqual(['fierce']);
  expect(unitById(s, rider.id)!.heroTraits).toEqual([]);
});

test('the second trait makes a hero', () => {
  const s = blankMatch();
  const u = addUnit(s, 'warrior', 0, 0, 0, { heroTraits: ['fierce'] });
  const foe = addUnit(s, 'warrior', 1, 1, 0);
  s.current = 1;
  u.deeds.survive = thresholdOf(s, u, 'survive') - 1;
  expect(isHero(u)).toBe(false);
  const r = act(s, { type: 'attack', unit: foe.id, target: '0,0' });
  expect(traitEvents(r.events)).toEqual([{ type: 'heroTrait', unit: u.id, trait: 'hardy', hero: true }]);
  expect(isHero(unitById(r.state, u.id)!)).toBe(true);
});

test('two traits from one attack, in deed order', () => {
  const s = blankMatch();
  const a = addUnit(s, 'warrior', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0);
  a.deeds.fight = thresholdOf(s, a, 'fight') - 1;
  a.deeds.survive = thresholdOf(s, a, 'survive') - 1;
  const r = act(s, { type: 'attack', unit: a.id, target: '1,0' });
  expect(unitById(r.state, a.id)!.heroTraits).toEqual(['fierce', 'hardy']);
  expect(traitEvents(r.events)).toEqual([
    { type: 'heroTrait', unit: a.id, trait: 'fierce', hero: false },
    { type: 'heroTrait', unit: a.id, trait: 'hardy', hero: true },
  ]);
});

test('never a fourth trait', () => {
  const s = home();
  const u = addUnit(s, 'warrior', 0, 0, 0, { hp: 5, rested: true, heroTraits: ['fierce', 'tireless', 'hardy'] });
  u.deeds.rest = thresholdOf(s, u, 'rest') - 1;
  const r = turnStart(s);
  const after = unitById(r.state, u.id)!;
  expect(after.hp).toBeGreaterThan(5);
  expect(after.deeds.rest).toBe(thresholdOf(s, u, 'rest'));
  expect(after.heroTraits).toEqual(['fierce', 'tireless', 'hardy']);
  expect(traitEvents(r.events)).toEqual([]);
});

test('a Camp counts deeds but earns no trait', () => {
  const s = home();
  const c = addUnit(s, 'camp', 0, 0, 0, { hp: 5, rested: true });
  c.deeds.rest = thresholdOf(s, c, 'rest') - 1;
  expect(canEarnTraits(c)).toBe(false);
  const r = turnStart(s);
  const after = unitById(r.state, c.id)!;
  expect(after.deeds.rest).toBe(thresholdOf(s, c, 'rest'));
  expect(after.heroTraits).toEqual([]);
  expect(traitEvents(r.events)).toEqual([]);
});

test('deeds keep counting after their trait', () => {
  const s = blankMatch();
  const a = addUnit(s, 'warrior', 0, 0, 0, { heroTraits: ['fierce'] }); addUnit(s, 'warrior', 1, 1, 0);
  a.deeds.fight = thresholdOf(s, a, 'fight');
  const r = act(s, { type: 'attack', unit: a.id, target: '1,0' });
  expect(unitById(r.state, a.id)!.deeds.fight).toBe(thresholdOf(s, a, 'fight') + H.fightPerAttack);
  expect(traitEvents(r.events)).toEqual([]);
});

test('playerView hides enemy deeds but shows traits and items', () => {
  const s = blankMatch();
  addUnit(s, 'warrior', 0, 0, 0);
  const foe: Unit = addUnit(s, 'warrior', 1, 1, 0, { heroTraits: ['hardy'], item: 'draught' });
  foe.deeds.fight = 4;
  const seen = playerView(s, 0).units.find((u) => u.id === foe.id)!;
  expect(seen.deeds).toEqual({ fight: 0, march: 0, survive: 0, rest: 0 });
  expect(seen.heroTraits).toEqual(['hardy']);
  expect(seen.item).toBe('draught');
  expect(playerView(s, 1).units.find((u) => u.id === foe.id)!.deeds.fight).toBe(4);
});
