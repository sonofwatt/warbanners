import { expect, test } from 'vitest';
import { applyAction, createMatch, damageFor, reachable } from '../engine';
import type { MatchState, PlayerId } from '../engine';
import { addCity, addUnit, blankMatch, randomPlayout, setTile } from '../engine/testkit';
import { dangerMap, followCredit, moveScore, objectives, unitWorth, valueOf } from './assess';
import type { Ctx } from './assess';
import { aiInputFor, believedState } from './input';
import { PERSONAS } from './persona';
import { hiddenScout, openVillage, riderRaid, spartanLine } from './scenarios';
import { skillFor } from './skill';
import { LEVEL_DIAL } from './types';

function makeCtx(b: MatchState, me: PlayerId, dial: number): Ctx {
  const persona = PERSONAS[b.players[me]!.faction];
  return {
    me, skill: skillFor(dial), persona, danger: dangerMap(b, me), goals: objectives(b, me, persona), hurt: new Set(),
  };
}

test('danger comes only from seen enemies', () => {
  const s = riderRaid();
  const d0 = dangerMap(believedState(aiInputFor(s, 1)), 1);
  expect(d0['0,-1']).toBeGreaterThan(0);          // the Spartan warrior can reach it
  expect(d0['0,-4'] ?? 0).toBe(0);                  // too far for a move-1, range-1 warrior
  const { state } = hiddenScout();
  expect(Object.values(dangerMap(believedState(aiInputFor(state, 1)), 1)).every(v => v === 0)).toBe(true);
});
test('a hoplite beside a hoplite is worth more to the Spartans than one alone', () => {
  const b = believedState(aiInputFor(spartanLine(), 0));
  const ctx = makeCtx(b, 0, LEVEL_DIAL.normal);   // test helper: skillFor, PERSONAS[faction], dangerMap, objectives, empty hurt
  expect(moveScore(b, ctx, 0, '1,0', 0)).toBeGreaterThan(moveScore(b, ctx, 0, '0,0', 0));
});
test('the enemy capital is always an objective until it is taken', () => {
  const b = believedState(aiInputFor(createMatch({ seed: 42, factions: ['spartans', 'mongols'] }), 0));
  expect(objectives(b, 0, PERSONAS.spartans).some(o => o.kind === 'enemyCapital' && o.at === '2,-5')).toBe(true);
});

test('a unit is worth its gold cost, or 8 when it has none', () => {
  expect(unitWorth('warrior')).toBe(2);
  expect(unitWorth('hoplite')).toBe(4);
  expect(unitWorth('kingsGuard')).toBe(8);
  expect(unitWorth('skyCaller')).toBe(8);
});
test('danger is the damage on a Warrior defence with the cover of the tile, added up over enemies', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  setTile(s, 1, 1, { terrain: 'forest' });
  addUnit(s, 'warrior', 1, 0, 0);
  addUnit(s, 'horseman', 0, 1, -1);               // a Spartan rider: move 2 + range 1
  addUnit(s, 'archer', 0, -1, 0);                 // move 1 + range 2
  addUnit(s, 'camp', 0, -1, 1);                   // attack 0: adds no danger anywhere
  for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
  const d = dangerMap(believedState(aiInputFor(s, 1)), 1);
  const field = damageFor(4, 3, 1);
  expect(d['0,1']).toBe(2 * field);                       // both reach it
  expect(d['1,1']).toBe(2 * damageFor(4, 3, 1.25));       // forest cover
  expect(d['0,-3']).toBe(damageFor(4, 3, 1.5) + damageFor(4, 3, 1.5));   // own Mongol city: cover 1.5
  expect(d['1,-4']).toBe(field);                          // the rider at distance 3, the archer at 4
  expect(d['0,4'] ?? 0).toBe(0);                          // out of every reach
});
test('objectives: villages, the mirror to explore, defend, sorted by value then key', () => {
  const b = believedState(aiInputFor(openVillage(), 1));
  const goals = objectives(b, 1, PERSONAS.mongols);
  expect(goals).toContainEqual({ at: '2,-2', kind: 'village', value: 20 });
  expect(goals.some(o => o.kind === 'explore' && o.at === '-2,2')).toBe(!b.players[1]!.explored.includes('-2,2'));
  for (let i = 1; i < goals.length; i++) {
    const a = goals[i - 1]!; const c = goals[i]!;
    expect(a.value > c.value || (a.value === c.value && a.at <= c.at)).toBe(true);
  }
  expect(goals.some(o => o.kind === 'defend')).toBe(false);
  const raid = believedState(aiInputFor(riderRaid(), 0));          // a Mongol rider 5 from the Spartan city
  expect(objectives(raid, 0, PERSONAS.spartans).some(o => o.kind === 'defend')).toBe(false);
  const near = riderRaid(); near.units[1]!.pos = '0,1';
  for (const p of near.players) p.explored = Object.keys(near.tiles).sort();
  expect(objectives(believedState(aiInputFor(near, 0)), 0, PERSONAS.spartans))
    .toContainEqual({ at: '0,3', kind: 'defend', value: 15 });
});
test('a seen enemy city is a goal; a taken enemy capital is not', () => {
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
  const b = believedState(aiInputFor(s, 0));
  const goals = objectives(b, 0, PERSONAS.spartans);
  expect(goals.filter(o => o.at === '2,-5')).toEqual([{ at: '2,-5', kind: 'enemyCapital', value: 16 }]);
  b.cities.find(c => c.pos === '2,-5')!.owner = 0;
  expect(objectives(b, 0, PERSONAS.spartans).some(o => o.at === '2,-5')).toBe(false);
});
test('moveScore is the change in valueOf for a move, plus 0.9 per newly explored tile', () => {
  for (const [seed, turns] of [[3, 90]] as const) {
    const s = randomPlayout(seed, turns);
    if (s.winner !== null) continue;
    const b = believedState(aiInputFor(s, s.current));
    const ctx = makeCtx(b, s.current, 1);
    const before = valueOf(b, ctx);
    let checked = 0;
    for (const u of b.units.filter(x => x.owner === s.current)) {
      for (const [to, mp] of Object.entries(reachable(b, u.id))) {
        const r = applyAction(b, { type: 'move', unit: u.id, to });
        expect(r.ok).toBe(true); if (!r.ok) continue;
        if (r.events.some(e => e.type === 'lured')) continue;
        const fresh = r.state.players[s.current]!.explored.length - b.players[s.current]!.explored.length;
        expect(moveScore(b, ctx, u.id, to, mp)).toBeCloseTo(valueOf(r.state, ctx) - before + 0.9 * fresh, 6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  }
});
test('the value rewards a capture and punishes standing in danger', () => {
  const b = believedState(aiInputFor(openVillage(), 1));
  const ctx = makeCtx(b, 1, 1);
  const rider = b.units.find(u => u.owner === 1)!;
  expect(moveScore(b, ctx, rider.id, '2,-2', 0)).toBeGreaterThan(moveScore(b, ctx, rider.id, '1,-2', 0));
  const raid = believedState(aiInputFor(riderRaid(), 1));
  const rctx = makeCtx(raid, 1, 1);
  const archer = raid.units.find(u => u.owner === 1)!;
  expect(rctx.danger['0,-1']).toBe(5);
  const at = (danger: Record<string, number>) => moveScore(raid, { ...rctx, danger }, archer.id, '0,-1', 0);
  expect(at({}) - at({ '0,-1': 5 })).toBeCloseTo(4 * 5 / 10, 9);    // worth 4, danger 5 on 10 hp
  expect(at({}) - at({ '0,-1': 50 })).toBeCloseTo(4, 9);            // never more than its worth
});

test('an own city left empty within an enemy\'s move costs half its worth', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const foe = addUnit(s, 'warrior', 1, 0, 1);       // 2 tiles from the empty city, move 1: cannot walk in
  for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
  const ctx = makeCtx(s, 0, 1);
  const far = valueOf(s, ctx);
  foe.pos = '0,2';                                  // next to it: it could
  expect(far - valueOf(s, ctx)).toBeCloseTo(0.5 * (12 + 4 + PERSONAS.spartans.spread), 9);
});
test('a hit on a city\'s garrison is worth more than the same hit in the field', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  addUnit(s, 'warrior', 0, 0, 3);                   // in its city
  addUnit(s, 'warrior', 0, 2, 0);                   // in the field
  for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
  const ctx = makeCtx(s, 1, 1);
  const hit = (pos: string) => { const c = structuredClone(s); c.units.find(u => u.pos === pos)!.hp -= 3; return valueOf(c, ctx) - valueOf(s, ctx); };
  expect(hit('0,3')).toBeCloseTo(3 / 10 * (2 + 0.5 * 16), 9);         // worth 2 plus half the city's 16
  expect(hit('2,0')).toBeCloseTo(3 / 10 * 2, 9);
});
test('stepping out of a line is forgiven in part while the partner can still follow, once per unit', () => {
  const b = believedState(aiInputFor(spartanLine(), 0));
  const ctx = makeCtx(b, 0, LEVEL_DIAL.normal);
  b.units[1]!.pos = '1,0';                          // the two hoplites side by side
  const loss = moveScore(b, { ...ctx, persona: { ...ctx.persona, formation: 0 } }, 0, '-1,2', 0) - moveScore(b, ctx, 0, '-1,2', 0);
  expect(loss).toBeCloseTo(PERSONAS.spartans.formation * 2, 9);       // one hoplite bond broken
  expect(followCredit(b, ctx, 0, '-1,2', 0)).toBeCloseTo(0.75 * loss, 9);
  b.units[1]!.moved = true;                         // the partner has moved: nobody follows
  expect(followCredit(b, ctx, 0, '-1,2', 0)).toBe(0);
  b.units[1]!.moved = false; b.units[0]!.moved = true;               // a second step gets no credit
  expect(followCredit(b, ctx, 0, '-1,2', 0)).toBe(0);
});
test('the follow credit goes to a step the line can keep up with, and not to one it cannot', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  addUnit(s, 'hoplite', 0, 0, 2);                   // move 1: can step one tile a turn
  const rider = addUnit(s, 'horseman', 0, 1, 1);    // beside it, advancing on the enemy city
  for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
  const ctx = makeCtx(s, 0, LEVEL_DIAL.normal);
  const bond = PERSONAS.spartans.formation * 1;    // a horseman and a hoplite bond with weight 1
  expect(followCredit(s, ctx, rider.id, '1,0', 0)).toBeCloseTo(0.75 * bond, 9);   // one ahead: the hoplite keeps up
  expect(followCredit(s, ctx, rider.id, '1,-1', 0)).toBe(0);                     // two ahead: it cannot
  expect(followCredit(s, ctx, rider.id, '0,1', 0)).toBe(0);                      // still beside it: no bond broken
});

test('a hurt unit is worth more where resting heals more: own land, then unclaimed, then enemy land, never next to an enemy', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const u = addUnit(s, 'warrior', 0, 1, 2, { hp: 4, attacks: 0 }); // in its own territory; no strike term
  for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
  const ctx = { ...makeCtx(s, 0, 1), danger: {}, goals: [] };  // only the rest term differs between these tiles
  const at = (pos: string): number => { const c = structuredClone(s); c.units.find(x => x.id === u.id)!.pos = pos; return valueOf(c, ctx); };
  const home = at('1,2'); const open = at('2,0'); const enemy = at('1,-3');
  expect(home - open).toBeCloseTo(0.5 * 2 * (4 - 2) / 10, 9);        // worth 2: heals 4 at home, 2 on open land
  expect(open - enemy).toBeCloseTo(0.5 * 2 * (2 - 1) / 10, 9);       // 1 in enemy land
  addUnit(s, 'warrior', 1, 0, 2);                                     // an enemy beside the home tile, 2 from the open one
  expect(at('1,2') - at('2,0')).toBeCloseTo(-0.5 * 2 * 2 / 10, 9);    // heals nothing there now, still 2 out in the open
});
test('a unit standing on a treasure is worth more than one beside it', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3); setTile(s, 2, 0, { treasure: true });
  const u = addUnit(s, 'warrior', 0, 1, 0);
  for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
  const ctx = { ...makeCtx(s, 0, 1), danger: {}, goals: [] };
  expect(moveScore(s, ctx, u.id, '2,0', 0) - moveScore(s, ctx, u.id, '2,-1', 0)).toBeCloseTo(6, 9);
});
test('a hurt unit that moved or acted this turn gets half the rest credit: it heals the turn after next, not next turn', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const u = addUnit(s, 'warrior', 0, 1, 2, { hp: 4, attacks: 0 });  // in its own territory: rest would heal 4
  for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
  const ctx = { ...makeCtx(s, 0, 1), danger: {}, goals: [] };
  const with_ = (patch: { moved?: boolean; acted?: boolean; pos?: string }): number => {
    const c = structuredClone(s); Object.assign(c.units.find(x => x.id === u.id)!, patch); return valueOf(c, ctx);
  };
  const rest = 0.5 * 2 * 4 / 10;                                      // worth 2, heals 4 of 10
  expect(with_({}) - with_({ moved: true })).toBeCloseTo(rest / 2, 9);
  expect(with_({}) - with_({ acted: true })).toBeCloseTo(rest / 2, 9);
  expect(moveScore(s, ctx, u.id, '1,2', 0)).toBeCloseTo(-rest / 2, 9);  // moving onto the same tile gives up half
  // a hurt unit walking to better healing ground is credited half the difference: 4 at home, 2 on open land
  expect(with_({ moved: true }) - with_({ moved: true, pos: '2,0' })).toBeCloseTo(0.5 * 0.5 * 2 * (4 - 2) / 10, 9);
});
