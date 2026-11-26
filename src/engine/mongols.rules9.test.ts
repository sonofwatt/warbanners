import { expect, test, vi } from 'vitest';
import { CONFIG } from './data/config';
import { UNITS } from './data/units';
import { distance, parseKey } from './hex';
import { reachable } from './movement';
import { claimTerritory, unitById } from './state';
import { addCity, addUnit, blankMatch, give, setTile } from './testkit';
import type { MatchState, UnitTypeId } from './types';

// Rules 8 and 9 relay riding: every step onto a tile of Mongol territory costs CONFIG.relayCost for a mounted Mongol
// unit. Rules 10 makes the first relay tile of each turn cost what it would without relay riders (relay.test.ts); the
// code keeps the old rule behind CONFIG.relayFirstFull, and these tests drive it with that switch off. This file is
// alone because vi.mock binds a whole file.
vi.mock('./data/config', async (orig) => {
  const m = await orig<typeof import('./data/config')>();
  return { CONFIG: { ...m.CONFIG, relayFirstFull: false } };
});

const mongols = () => blankMatch({ factions: ['mongols', 'spartans'] });

test('rules 9 reach at home: two tiles per tile of move for every mounted Mongol unit', () => {
  const cases: [UnitTypeId, number][] = [['horseman', 4], ['knight', 6], ['horseArcher', 4], ['khansGuard', 6], ['skyCaller', 4]];
  for (const [type, tiles] of cases) {
    const s: MatchState = blankMatch({ radius: 8, factions: ['mongols', 'spartans'] });
    claimTerritory(s, addCity(s, 0, 0, 0, { radius: 8 }));
    const u = addUnit(s, type, 0, 0, 0);
    const from = parseKey(unitById(s, u.id)!.pos);
    expect(Math.max(...Object.keys(reachable(s, u.id)).map((k) => distance(from, parseKey(k)))), type).toBe(tiles);
  }
});
test('a mounted unit pays the relay cost for every step onto its own territory, inside or riding in', () => {
  const s = mongols(); claimTerritory(s, addCity(s, 0, 0, 0, { radius: 2 })); setTile(s, 1, 0, { terrain: 'forest' });
  const h = addUnit(s, 'horseman', 0, -1, 0);
  expect(h.mp).toBe(2 * UNITS.horseman.move);                                 // no half-point bonus
  const r = reachable(s, h.id);
  expect(r['1,0']).toBe(h.mp - 2 * CONFIG.relayCost);                         // two territory steps, the forest one too
  expect(r['2,0']).toBe(h.mp - 3 * CONFIG.relayCost);
  const out = addUnit(s, 'horseman', 0, 4, 0);                                // starts outside, rides in
  expect(reachable(s, out.id)['2,0']).toBe(out.mp - CONFIG.terrain.field.enterCost! - CONFIG.relayCost);
});
test('Mongol riders pay 1 inside their own territory over a forest, but a mountain still ends the move (rules 8)', () => {
  const s = blankMatch(); claimTerritory(s, addCity(s, 1, 3, 0, { radius: 2 })); give(s, 1, CONFIG.mountain.tech!);
  setTile(s, 2, 0, { terrain: 'forest' }); setTile(s, 1, 0, { terrain: 'mountain' });
  setTile(s, -1, 0, { terrain: 'mountain' });
  const h = addUnit(s, 'horseman', 1, 0, 0, { moved: true, mp: 3 });
  expect(reachable(s, h.id)['-1,0']).toBeUndefined();               // outside the territory: a moved unit cannot climb
  expect(reachable(s, h.id)['1,0']).toBeUndefined();                // nor inside it: relay riding never skips the climb
  const fresh = addUnit(s, 'horseman', 1, 0, 1, { mp: 3 });
  expect(reachable(s, fresh.id)['1,0']).toBe(0);                    // a first step climbs, for everything left
  const g = addUnit(s, 'horseman', 1, 4, 0, { moved: true, mp: 3 });
  expect(reachable(s, g.id)['3,0']).toBe(2);
  expect(reachable(s, g.id)['2,0']).toBe(1);                        // forest inside own territory still costs 1
});
test('rules 9 mixed moves, for relay.test.ts to compare: riding in five tiles, riding out three', () => {
  const reach = (s: MatchState, id: number): number => {
    const from = parseKey(unitById(s, id)!.pos);
    return Math.max(...Object.keys(reachable(s, id)).map((k) => distance(from, parseKey(k))));
  };
  const inward = blankMatch({ radius: 8, factions: ['mongols', 'spartans'] });
  claimTerritory(inward, addCity(inward, 0, 0, 0, { radius: 2 }));
  expect(reach(inward, addUnit(inward, 'knight', 0, 4, 0).id)).toBe(5);
  const outward = blankMatch({ radius: 8, factions: ['mongols', 'spartans'] });
  claimTerritory(outward, addCity(outward, 0, 0, 0, { radius: 1 }));
  expect(reach(outward, addUnit(outward, 'knight', 0, 0, 0).id)).toBe(3);
});
