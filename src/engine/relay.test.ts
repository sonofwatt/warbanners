import { describe, expect, test } from 'vitest';
import { applyAction, legalActions } from './apply';
import { CONFIG } from './data/config';
import { distance, parseKey } from './hex';
import { reachable } from './movement';
import { claimTerritory, unitById } from './state';
import { addCity, addUnit, blankMatch, must, setTile } from './testkit';
import type { MatchState, UnitTypeId } from './types';

// Rules 10 (David, 2026-11-26): relay riders ride one tile less at home. Each turn, the first tile a mounted Mongol
// unit enters by relay riding costs what it would without relay riders; every later relay tile that turn costs
// CONFIG.relayCost. The rule is per turn, so a split move and the retreat move after an attack do not pay it again.
// mongols.rules9.test.ts keeps the rules 8 and 9 behaviour (every relay tile at relayCost) under a mock.

const FIELD = CONFIG.terrain.field.enterCost!;

// A Mongol city at 0,0 whose territory covers the whole board, all fields.
function home(): MatchState {
  const s = blankMatch({ radius: 8, factions: ['mongols', 'spartans'] });
  claimTerritory(s, addCity(s, 0, 0, 0, { radius: 8 }));
  return s;
}
const reach = (s: MatchState, id: number): number => {
  const from = parseKey(unitById(s, id)!.pos);
  return Math.max(0, ...Object.keys(reachable(s, id)).map((k) => distance(from, parseKey(k))));
};

test('the rule is on', () => {
  expect(CONFIG.relayFirstFull).toBe(true);
});

describe('reach at home: one tile less than rules 9', () => {
  const cases: [UnitTypeId, number][] = [['horseman', 3], ['knight', 5], ['horseArcher', 3], ['khansGuard', 5], ['skyCaller', 3]];
  for (const [type, tiles] of cases) {
    test(`${type} rides ${tiles} field tiles inside Mongol territory (${tiles + 1} in rules 9)`, () => {
      const s = home(); const u = addUnit(s, type, 0, 0, 0);
      expect(reach(s, u.id)).toBe(tiles);
      const r = reachable(s, u.id);
      expect(r['1,0']).toBe(u.mp - FIELD);                                        // the first tile: a field's cost
      expect(r['2,0']).toBe(u.mp - FIELD - CONFIG.relayCost);                     // then the relay cost
    });
  }
  test('foot units are unaffected: normal terrain costs at home', () => {
    const s = home(); const w = addUnit(s, 'warrior', 0, 0, 0); const sw = addUnit(s, 'swordsman', 0, 0, 1);
    expect(reach(s, w.id)).toBe(1); expect(reach(s, sw.id)).toBe(1);
    expect(reachable(s, w.id)['1,0']).toBe(0);
  });
  test('Spartans are unaffected: no relay riding, in their own land or anywhere', () => {
    const s = blankMatch({ radius: 8 }); claimTerritory(s, addCity(s, 0, 0, 0, { radius: 8 }));
    const h = addUnit(s, 'horseman', 0, 0, 0); const k = addUnit(s, 'knight', 0, 0, 1);
    expect(reach(s, h.id)).toBe(2); expect(reach(s, k.id)).toBe(3);
    const done = must(applyAction(s, { type: 'move', unit: h.id, to: '1,0' }));
    expect('relayTurn' in unitById(done, h.id)!).toBe(false);
  });
  test('a road does not count as the first relay tile (it costs the same either way)', () => {
    const s = home(); setTile(s, 0, 0, { road: true }); setTile(s, -1, 0, { road: true });
    const h = addUnit(s, 'horseman', 0, -1, 0);                                   // on a road beside the city
    const r = reachable(s, h.id);
    expect(r['1,0']).toBe(h.mp - CONFIG.roadCost - FIELD);                        // road into the city, then the first field
    expect(r['2,0']).toBe(h.mp - CONFIG.roadCost - FIELD - CONFIG.relayCost);     // three tiles, as on fields alone
    expect(r['3,0']).toBeUndefined();
  });
  test('a forest as the first relay tile ends the move, as a forest does without relay riders', () => {
    const s = home();
    for (const [q, r] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const) setTile(s, q, r, { terrain: 'forest' });
    const h = addUnit(s, 'horseman', 0, 0, 0);                                    // every first step is a forest
    expect(reachable(s, h.id)['1,0']).toBe(0);
    expect(reach(s, h.id)).toBe(1);
    const open = home(); setTile(open, 1, 0, { terrain: 'forest' });
    const g = addUnit(open, 'horseman', 0, 0, 0);                                 // a field first, then the forest at the relay cost
    expect(reachable(open, g.id)['1,0']).toBe(g.mp - FIELD - CONFIG.relayCost);
  });
});

describe('mixed moves', () => {
  test('starting outside and riding in: the outside tiles and the first home tile at normal cost, then relay', () => {
    const s = blankMatch({ radius: 8, factions: ['mongols', 'spartans'] });
    claimTerritory(s, addCity(s, 0, 0, 0, { radius: 2 }));                      // territory up to distance 2
    const k = addUnit(s, 'knight', 0, 4, 0);                                      // 6 half-points, two tiles outside
    const r = reachable(s, k.id);
    expect(r['3,0']).toBe(4);                                                     // outside: field
    expect(r['2,0']).toBe(2);                                                     // first home tile: field
    expect(r['1,0']).toBe(1);                                                     // then relay
    expect(r['0,0']).toBe(0);
    expect(reach(s, k.id)).toBe(4);                                               // rules 9: 5 (field, then four relay tiles)
  });
  test('starting inside and riding out: the first home tile at normal cost, outside tiles at normal cost', () => {
    const s = blankMatch({ radius: 8, factions: ['mongols', 'spartans'] });
    claimTerritory(s, addCity(s, 0, 0, 0, { radius: 1 }));                      // territory up to distance 1
    const k = addUnit(s, 'knight', 0, 0, 0);
    const r = reachable(s, k.id);
    expect(r['1,0']).toBe(4);                                                     // the one home tile: field
    expect(r['2,0']).toBe(2); expect(r['3,0']).toBe(0);                           // outside: field, field
    expect(reach(s, k.id)).toBe(3);                                               // rules 9: 3 as well (relay, field, field = 5)
  });
  test('a unit that steps straight out of its territory never pays the first relay tile', () => {
    const s = blankMatch({ radius: 8, factions: ['mongols', 'spartans'] });
    claimTerritory(s, addCity(s, 0, 0, 0, { radius: 1 }));
    const h = addUnit(s, 'horseman', 0, 1, 0);                                    // on the edge of its territory
    const moved = must(applyAction(s, { type: 'move', unit: h.id, to: '2,0' }));
    expect(unitById(moved, h.id)!.mp).toBe(h.mp - FIELD);
    expect('relayTurn' in unitById(moved, h.id)!).toBe(false);
  });
});

describe('per turn, not per move', () => {
  test('a split move pays the first relay tile once: three tiles in all, as in one move', () => {
    const s = home(); const h = addUnit(s, 'horseman', 0, 0, 0);
    const a = must(applyAction(s, { type: 'move', unit: h.id, to: '1,0' }));
    expect(unitById(a, h.id)).toMatchObject({ mp: h.mp - FIELD, relayTurn: a.stamp });
    expect(reachable(a, h.id)['3,0']).toBe(0);                                    // two more at the relay cost
    expect(reachable(a, h.id)['4,0']).toBeUndefined();
  });
  test('the retreat move after an attack keeps the relay open: one tile less in all, not two', () => {
    const s = home(); const ha = addUnit(s, 'horseArcher', 0, 0, 0);
    addUnit(s, 'warrior', 1, 4, 0, { hp: 30 });                                   // a Spartan to shoot at from 2,0
    const moved = must(applyAction(s, { type: 'move', unit: ha.id, to: '1,0' }));  // first relay tile: a field, 2 left
    const m = unitById(moved, ha.id)!; expect(m.mp).toBe(2);
    // 2,0 is in range 2 of the warrior but next to nothing: one more relay tile keeps 1, then shoot from there
    const at2 = must(applyAction(moved, { type: 'move', unit: ha.id, to: '2,0' }));
    expect(unitById(at2, ha.id)!.mp).toBe(1);
    const shot = must(applyAction(at2, { type: 'attack', unit: ha.id, target: '4,0' }));
    expect(unitById(shot, ha.id)!.mp).toBe(1);                                    // retreat keeps its movement
    const back = reachable(shot, ha.id);
    expect(back['1,0']).toBe(0);                                                  // the retreat pays the relay cost
    expect(back['0,1']).toBeUndefined();
    // in all: 1,0 then 2,0 then back to 1,0 is three tiles for 4 half-points (four in rules 9)
  });
  test('the next turn pays the first relay tile again', () => {
    const s = home(); const h = addUnit(s, 'horseman', 0, 0, 0);
    let t = must(applyAction(s, { type: 'move', unit: h.id, to: '1,0' }));
    t = must(applyAction(t, { type: 'endTurn' })); t = must(applyAction(t, { type: 'endTurn' }));
    const r = reachable(t, h.id);
    expect(r['2,0']).toBe(h.mp - FIELD);
    expect(reach(t, h.id)).toBe(3);
  });
  test('hasten adds its half-points at the relay cost once the relay is open', () => {
    const s = home(); const h = addUnit(s, 'horseman', 0, 0, 0);
    const a = must(applyAction(s, { type: 'move', unit: h.id, to: '1,0' }));
    const u = unitById(a, h.id)!; u.mp += CONFIG.hastenMp;                        // as a Sky Caller's hasten does
    expect(reach(a, h.id)).toBe(2 + CONFIG.hastenMp / CONFIG.relayCost);
  });
});

test('legal moves (what the board marks) are exactly the reachable tiles', () => {
  const s = home(); setTile(s, 1, 0, { terrain: 'forest' }); setTile(s, -1, 1, { road: true });
  for (const type of ['horseman', 'knight', 'warrior'] as const) {
    const u = addUnit(s, type, 0, 0, -2);
    const moves = legalActions(s).flatMap((a) => (a.type === 'move' && a.unit === u.id ? [a.to] : [])).sort();
    expect(moves).toEqual(Object.keys(reachable(s, u.id)).sort());
    for (const to of moves) expect(unitById(must(applyAction(s, { type: 'move', unit: u.id, to })), u.id)!.mp).toBe(reachable(s, u.id)[to]);
  }
});
