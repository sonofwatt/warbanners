import { expect, test } from 'vitest';
import { CONFIG, applyAction, roadRefusal } from '../engine';
import type { MatchState, PlayerId } from '../engine';
import { addCity, addUnit, blankMatch, setTile } from '../engine/testkit';
import { dangerMap, moveScore, objectives, valueOf } from './assess';
import { aiInputFor, believedState } from './input';
import { planTurn } from './plan';
import type { Ctx } from './assess';
import { PERSONAS } from './persona';
import { skillFor } from './skill';
import { LEVEL_DIAL } from './types';

function makeCtx(b: MatchState, me: PlayerId, dial: number): Ctx {
  const persona = PERSONAS[b.players[me]!.faction];
  return { me, skill: skillFor(dial), persona, danger: dangerMap(b, me), goals: objectives(b, me, persona), hurt: new Set() };
}

// Player 0's city at 0,4, player 1's at 0,-4; every tile explored by both, and both may climb (CONFIG.mountain.tech).
function field(factions: ['spartans', 'mongols'] | ['mongols', 'spartans'] = ['spartans', 'mongols']): MatchState {
  const s = blankMatch({ factions }); addCity(s, 0, 0, 4); addCity(s, 1, 0, -4);
  for (const p of s.players) if (CONFIG.mountain.tech !== null) p.techs.push(CONFIG.mountain.tech);
  return s;
}

test('rules 8: moveScore knows a climb ends the turn: it is the change in valueOf the engine gives', () => {
  const s = field();
  setTile(s, 1, 0, { terrain: 'mountain' });
  const a = addUnit(s, 'archer', 0, 0, 0);
  addUnit(s, 'warrior', 1, 3, 0);               // in reach from the mountain, but the climb leaves no attack
  const ctx = makeCtx(s, 0, LEVEL_DIAL.normal);
  const r = applyAction(s, { type: 'move', unit: a.id, to: '1,0' });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.state.units.find((u) => u.id === a.id)).toMatchObject({ attacks: 0, turnEnded: true });
  const fresh = r.state.players[0]!.explored.length - s.players[0]!.explored.length;
  expect(moveScore(s, ctx, a.id, '1,0', 0)).toBeCloseTo(valueOf(r.state, ctx) - valueOf(s, ctx) + 0.9 * fresh, 6);
});

test('rules 8: a ranged unit with an enemy in its mountain reach is worth more on the mountain; a melee unit is not', () => {
  const gain = (type: 'archer' | 'warrior', enemyAt: number): number => {
    const flat = field(); const peak = field();
    setTile(peak, 0, 0, { terrain: 'mountain' });
    for (const s of [flat, peak]) { addUnit(s, type, 0, 0, 0); addUnit(s, 'warrior', 1, enemyAt, 0); }
    return valueOf(peak, makeCtx(peak, 0, LEVEL_DIAL.normal)) - valueOf(flat, makeCtx(flat, 0, LEVEL_DIAL.normal));
  };
  expect(gain('archer', 3)).toBeGreaterThan(0);           // only the mountain's extra tile reaches it (the strike term)
  expect(gain('archer', 4)).toBeCloseTo(0, 6);            // out of reach either way: no flat credit for a peak
  expect(gain('warrior', 3)).toBeCloseTo(0, 6);
});

test('rules 8: a rider that only climbed earns no raid credit; one that acted otherwise still does', () => {
  const at = (turnEnded: boolean): number => {
    const s = field(['mongols', 'spartans']);
    setTile(s, 1, 0, { terrain: 'mountain' });
    addUnit(s, 'horseman', 0, 1, 0, { moved: true, acted: true, mp: 0, attacks: 0, turnEnded });
    return valueOf(s, makeCtx(s, 0, LEVEL_DIAL.normal));
  };
  expect(PERSONAS.mongols.raid).toBeGreaterThan(0);
  expect(at(false) - at(true)).toBeCloseTo(PERSONAS.mongols.raid, 6);
});

test('rules 8: after a kill advance off a mountain the planner plans no second attack for the Knight, and every action is legal', () => {
  for (const dial of [0.5, 0.85, 1]) for (const seed of [1, 2, 3]) {
    const s = field();
    setTile(s, 0, 0, { terrain: 'mountain' });
    const k = addUnit(s, 'knight', 0, 0, 0);
    addUnit(s, 'scout', 1, 1, 0, { hp: 1 });
    addUnit(s, 'warrior', 1, 2, 0, { hp: 1 });
    const input = aiInputFor(s, 0);
    const plan = planTurn(input, { dial, seed, refused: [] });
    let b = believedState(input);
    for (const a of plan.actions) { const r = applyAction(b, a); expect(r.ok).toBe(true); if (!r.ok) break; b = r.state; }
    const knightAttacks = plan.actions.filter((a) => a.type === 'attack' && a.unit === k.id);
    expect(knightAttacks.length).toBeLessThanOrEqual(1);
  }
});

// Plays a plan on the believed state and checks every action is legal.
function playLegal(s: MatchState, me: PlayerId, dial: number, seed: number) {
  const input = aiInputFor(s, me);
  const plan = planTurn(input, { dial, seed, refused: [] });
  let b = believedState(input);
  for (const a of plan.actions) { const r = applyAction(b, a); expect(r.ok, JSON.stringify(a)).toBe(true); if (!r.ok) break; b = r.state; }
  return plan.actions;
}

test('rules 8: without the climbing tech the planner never moves a unit onto a mountain, and its plans stay legal', () => {
  for (const dial of [0.5, 0.85, 1]) for (const seed of [1, 2, 3]) {
    const s = field(); s.players[0]!.techs = []; s.players[0]!.gold = 0;   // no gold: it cannot research the tech first
    for (const q of [-1, 1]) setTile(s, q, 0, { terrain: 'mountain' });
    setTile(s, 0, -1, { terrain: 'mountain' }); setTile(s, 0, 1, { terrain: 'mountain' });
    addUnit(s, 'archer', 0, 0, 0); addUnit(s, 'warrior', 0, -1, 1);
    addUnit(s, 'warrior', 1, 3, 0);
    const actions = playLegal(s, 0, dial, seed);
    expect(actions.some((a) => a.type === 'move' && s.tiles[a.to]?.terrain === 'mountain')).toBe(false);
  }
});

test('rules 8: a Mongol planner with the roads tech and gold plans no road', () => {
  for (const dial of [0.5, 1]) for (const seed of [1, 2]) {
    const s = field(['mongols', 'spartans']); s.players[0]!.techs.push('roads'); s.players[0]!.gold = 60;
    addCity(s, 0, 3, 1, { capital: false }); s.cities[0]!.capital = true;
    s.current = 0;
    expect(roadRefusal(s, '1,3')).toBe('your faction cannot build roads');
    expect(playLegal(s, 0, dial, seed).some((a) => a.type === 'road')).toBe(false);
  }
});
