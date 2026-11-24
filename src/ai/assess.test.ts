import { expect, test } from 'vitest';
import { applyAction, createMatch, damageFor, reachable } from '../engine';
import type { MatchState, PlayerId } from '../engine';
import { addCity, addUnit, blankMatch, randomPlayout, rngFor, setTile } from '../engine/testkit';
import { dangerMap, exposureCost, followCredit, moveScore, objectives, unitValue, unitWorth, valueOf } from './assess';
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
// Rules 6 gave a Mongol rider an odd number of half-points (a Horseman has 5). The danger map once took range() of the
// fractional reach, which lists no real tile, so the Spartan AI saw no danger from any Mongol rider.
test('danger covers a Mongol rider\'s whole-tile reach', () => {
  const s = blankMatch();
  addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  addUnit(s, 'horseman', 1, 0, -2);
  const d = dangerMap(s, 0);
  expect(d['0,1']).toBeGreaterThan(0);              // 3 tiles: 2 of movement (5 half-points) and 1 of range
  expect(d['0,2'] ?? 0).toBe(0);
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
  expect(unitWorth('hoplite')).toBe(3);
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
test('the enemy capital goal follows a moved capital (rules 7), and the old capital tile is then an ordinary city', () => {
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
  setTile(s, 0, -3, { terrain: 'field' });
  const next = addCity(s, 1, 0, -3);
  const old = s.cities.find(c => c.pos === '2,-5')!;
  old.capital = false; next.capital = true; next.linked = true;   // as if 2,-5 had been taken back by its first owner
  const goals = objectives(believedState(aiInputFor(s, 0)), 0, PERSONAS.spartans);
  expect(goals.some(o => o.kind === 'enemyCapital' && o.at === '0,-3')).toBe(true);
  expect(goals.filter(o => o.at === '2,-5').map(o => o.kind)).toEqual(['enemyCity']);
});
test('an unexplored enemy capital tile stays a goal: the start is known to both', () => {
  const b = believedState(aiInputFor(createMatch({ seed: 42, factions: ['spartans', 'mongols'] }), 0));
  expect(b.players[0]!.explored).not.toContain('2,-5');
  expect(objectives(b, 0, PERSONAS.spartans)).toContainEqual({ at: '2,-5', kind: 'enemyCapital', value: 14 });
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
        // moveScore does not price a hero trait the march earns; since rules 7 this position has a Horseman one move
        // from Tireless, so those moves are left out as lures are. For the same reason, a move that ends a Hunker (since
        // the rules 7 Spartan growth discount and 12 start gold this position has a hunkered Defender) is left out:
        // moveScore does not price the hunker it gives up
        if (r.events.some(e => e.type === 'lured' || e.type === 'heroTrait' || e.type === 'hunkerEnded')) continue;
        const fresh = r.state.players[s.current]!.explored.length - b.players[s.current]!.explored.length;
        expect(moveScore(b, ctx, u.id, to, mp)).toBeCloseTo(valueOf(r.state, ctx) - before + 0.9 * fresh, 6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  }
}, 60_000);   // a 90-turn random playout and every reachable move: well over the default 5 s under load
test('the value rewards a capture and punishes standing in danger', () => {
  const b = believedState(aiInputFor(openVillage(), 1));
  const ctx = makeCtx(b, 1, 1);
  const rider = b.units.find(u => u.owner === 1)!;
  expect(moveScore(b, ctx, rider.id, '2,-2', 0)).toBeGreaterThan(moveScore(b, ctx, rider.id, '1,-2', 0));
  const raid = believedState(aiInputFor(riderRaid(), 1));
  const rctx = makeCtx(raid, 1, 0.5);
  const w = rctx.skill.danger;                       // the danger weight at this dial
  expect(w).toBeGreaterThan(0);
  const archer = raid.units.find(u => u.owner === 1)!;
  expect(rctx.danger['0,-1']).toBe(6);
  const at = (danger: Record<string, number>) => moveScore(raid, { ...rctx, danger }, archer.id, '0,-1', 0);
  expect(at({}) - at({ '0,-1': 6 })).toBeCloseTo(w * 5 * 6 / 10, 9);    // worth 5, danger 6 on 10 hp, times the weight
  expect(at({}) - at({ '0,-1': 50 })).toBeCloseTo(w * 5, 9);            // never more than its worth times the weight
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

// A noCityCapture unit (the scout) is not drawn to enemy cities and is no capture threat to an empty city.
test('a scout is not pulled toward an enemy city, a warrior is', () => {
  const diff = (type: 'scout' | 'warrior') => {
    const f = (y: number) => {
      const s = blankMatch({ factions: ['spartans', 'mongols'] });
      addCity(s, 0, 0, 0); addCity(s, 1, 0, -8); addUnit(s, type, 0, 0, y);
      for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
      return valueOf(s, makeCtx(s, 0, LEVEL_DIAL.normal));
    };
    return f(-4) - f(-2);
  };
  expect(diff('warrior')).toBeGreaterThan(0);
  expect(diff('scout')).toBeLessThanOrEqual(0);
});
test('an empty city is not exposed to an enemy scout, but is to a warrior', () => {
  const cost = (type: 'scout' | 'warrior') => {
    const s = blankMatch({ factions: ['spartans', 'mongols'] });
    addCity(s, 0, 0, 0); addCity(s, 1, 0, -8);
    addUnit(s, type, 1, 1, 0);
    const b = believedState(aiInputFor(s, 0));
    return exposureCost(b, makeCtx(b, 0, LEVEL_DIAL.normal), b.cities.find(c => c.owner === 0)!);
  };
  expect(cost('warrior')).toBeGreaterThan(0);
  expect(cost('scout')).toBe(0);
});

test('unitValue: worth plus 3 a trait, 3 for a hero, 1 for a draught', () => {
  const s = blankMatch();
  expect(unitValue(addUnit(s, 'warrior', 0, 0, 0))).toBe(2);
  expect(unitValue(addUnit(s, 'warrior', 0, 1, 0, { heroTraits: ['hardy'] }))).toBe(5);
  expect(unitValue(addUnit(s, 'warrior', 0, 2, 0, { heroTraits: ['hardy', 'tireless'] }))).toBe(11);
  expect(unitValue(addUnit(s, 'warrior', 0, 3, 0, { heroTraits: ['hardy', 'tireless'], item: 'draught' }))).toBe(12);
});
test('a hero standing in danger costs more than a plain unit there', () => {
  // The same tile and the same danger: only the danger term differs between the two contexts.
  const drop = (heroTraits: ('hardy' | 'tireless')[]): number => {
    const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
    addUnit(s, 'warrior', 0, 1, 0, { heroTraits });
    for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
    const ctx = makeCtx(s, 0, LEVEL_DIAL.normal);
    return valueOf(s, { ...ctx, danger: {} }) - valueOf(s, { ...ctx, danger: { '1,0': 5 } });
  };
  const w = skillFor(LEVEL_DIAL.normal).danger;
  expect(drop([])).toBeCloseTo(w * 2 * 5 / 10, 9);
  expect(drop(['hardy', 'tireless'])).toBeCloseTo(w * 11 * 5 / 10, 9);
  expect(drop(['hardy', 'tireless'])).toBeGreaterThan(drop([]));
});
test('assess reads maxHpOf', () => {
  // Through valueOf (the health share is a local): a Fierce Warrior at 12/12 is worth exactly what a full plain one
  // is, plus its trait worth. Read against the type's 10 it would count 12/10 of its worth and a negative wound.
  const value = (patch: { hp?: number; heroTraits?: 'fierce'[] }): number => {
    const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
    addUnit(s, 'warrior', 0, 1, 0, patch);
    for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
    return valueOf(s, makeCtx(s, 0, LEVEL_DIAL.normal));
  };
  expect(value({ hp: 12, heroTraits: ['fierce'] }) - value({})).toBeCloseTo(3, 9);
});
test('two Spartan heroes side by side bond like two Hoplites; two Mongol heroes do not', () => {
  // The formation term alone: the hero pair's gain from standing together, less a plain pair's.
  const value = (factions: ['spartans', 'mongols'] | ['mongols', 'spartans'], heroTraits: ('hardy' | 'tireless')[], apart: boolean): number => {
    const s = blankMatch({ factions }); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
    addUnit(s, 'warrior', 0, 1, 0, { heroTraits });
    addUnit(s, 'warrior', 0, apart ? -1 : 2, 0, { heroTraits });
    for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
    return valueOf(s, makeCtx(s, 0, LEVEL_DIAL.normal));
  };
  const extra = (factions: ['spartans', 'mongols'] | ['mongols', 'spartans']): number => {
    const heroes = value(factions, ['hardy', 'tireless'], false) - value(factions, ['hardy', 'tireless'], true);
    const plain = value(factions, [], false) - value(factions, [], true);
    return heroes - plain;
  };
  expect(extra(['spartans', 'mongols'])).toBeCloseTo(PERSONAS.spartans.formation * (2 - 1), 9);
  expect(extra(['mongols', 'spartans'])).toBeCloseTo(0, 9);
});
test('a map-revealed treasure becomes an objective', () => {
  const s = blankMatch({ unexplored: true }); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  setTile(s, 1, 0, { treasure: true }); setTile(s, -3, 0, { treasure: true });
  const u = addUnit(s, 'warrior', 0, 1, 0);
  s.players[0]!.explored = ['1,0']; s.players[1]!.explored = ['0,-3'];
  s.rng = rngFor('map');
  const r = applyAction(s, { type: 'claimTreasure', unit: u.id });
  expect(r.ok).toBe(true); if (!r.ok) return;
  const ev = r.events.find(e => e.type === 'treasure');
  expect(ev?.type === 'treasure' && ev.outcome === 'map' && ev.found).toBe('-3,0');
  const b = believedState(aiInputFor(r.state, 0));
  expect(objectives(b, 0, PERSONAS.spartans)).toContainEqual({ at: '-3,0', kind: 'treasure', value: 9 });
});
test('rules 8: a blockade counts as the gold it cuts, gained on an enemy city and lost on an own one', () => {
  const s = blankMatch(); const own = addCity(s, 0, 0, 3); const theirs = addCity(s, 1, 0, -3);
  for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
  addUnit(s, 'warrior', 0, 1, -3); addUnit(s, 'warrior', 0, -1, -2);   // beside the enemy city
  addUnit(s, 'warrior', 1, 1, 3); addUnit(s, 'warrior', 1, -1, 3);     // beside the own city
  const ctx = makeCtx(s, 0, 1);
  const before = valueOf(s, ctx);
  theirs.incomeBonus = 4;                           // 5 gold: the blockade cuts 2, one more than at 1 gold (cut 0)
  expect(valueOf(s, ctx) - before).toBeCloseTo(ctx.skill.economy * 3 * 2, 9);
  own.incomeBonus = 4;                              // 4 more income, of which the blockade takes 2
  expect(valueOf(s, ctx) - before).toBeCloseTo(ctx.skill.economy * 3 * (2 + 4 - 2), 9);
});
