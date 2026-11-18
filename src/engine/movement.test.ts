import { expect, test } from 'vitest';
import { applyAction } from './apply';
import { hashState } from './hash';
import { maxMp, reachable } from './movement';
import { rngInt } from './rng';
import { claimTerritory, unitAt, unitById } from './state';
import { addCity, addUnit, blankMatch, must, setTile } from './testkit';

test('warrior on fields reaches its six neighbours', () => {
  const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0);
  expect(Object.keys(reachable(s, u.id)).sort()).toEqual(['-1,0', '-1,1', '0,-1', '0,1', '1,-1', '1,0'].sort());
});
test('forest costs two tiles of movement, but one step is always allowed', () => {
  const s = blankMatch(); const h = addUnit(s, 'horseman', 0, 0, 0);          // 4 half-points
  setTile(s, 1, 0, { terrain: 'forest' });
  const r = reachable(s, h.id);
  expect(r['1,0']).toBe(0); expect(r['2,0']).toBeUndefined(); expect(r['-2,0']).toBe(0);
  const w = addUnit(s, 'warrior', 0, 0, 2); setTile(s, 1, 2, { terrain: 'forest' });
  expect(reachable(s, w.id)['1,2']).toBe(0);
});
test('mountain needs a fresh unit and ends the move; water is closed', () => {
  const s = blankMatch(); const k = addUnit(s, 'horseman', 0, 0, 0);
  setTile(s, 1, 0, { terrain: 'mountain' }); setTile(s, -1, 0, { terrain: 'water' });
  const r = reachable(s, k.id);
  expect(r['1,0']).toBe(0); expect(r['-1,0']).toBeUndefined(); expect(r['2,0']).toBeUndefined();
});
test('roads are cheap', () => {
  const s = blankMatch(); const w = addUnit(s, 'warrior', 0, 0, 0);
  for (const q of [0, 1, 2]) setTile(s, q, 0, { road: true });
  expect(reachable(s, w.id)['2,0']).toBe(0);
});
test('engagement stops a unit beside an enemy; enemies block, friends do not', () => {
  const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0);          // 6 half-points
  addUnit(s, 'warrior', 1, 3, -1); addUnit(s, 'warrior', 0, 1, 0);
  const r = reachable(s, k.id);
  expect(r['1,0']).toBeUndefined();           // a friend stands there
  expect(r['2,0']).toBe(0);                   // passed through the friend; beside the enemy, so the 2 points left are gone
  expect(r['2,-1']).toBe(0);                  // also beside the enemy
  expect(r['3,0']).toBeUndefined();           // only reachable through 2,0
  expect(r['3,-1']).toBeUndefined();          // the enemy's tile
  expect(r['-2,0']).toBe(2);                  // away from the enemy nothing is lost
});
test('move action updates the unit and refuses a bad target', () => {
  const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0);
  const t = must(applyAction(s, { type: 'move', unit: u.id, to: '1,0' }));
  expect(unitById(t, u.id)).toMatchObject({ pos: '1,0', mp: 0, moved: true, enteredTurn: 5 });
  expect(applyAction(s, { type: 'move', unit: u.id, to: '3,0' }).ok).toBe(false);
  const e = addUnit(s, 'warrior', 1, 0, 2);
  expect(applyAction(s, { type: 'move', unit: e.id, to: '1,2' }).ok).toBe(false);   // not the current player
});
test('treasure outcomes follow rngInt(3)', () => {
  // with rng state 1 the first draw is 2693262067 % 3 = 1: explore
  const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0); setTile(s, 1, 0, { treasure: true });
  const r = applyAction(s, { type: 'move', unit: u.id, to: '1,0' }); const t = must(r);
  expect(t.tiles['1,0']!.treasure).toBe(false);
  expect(r.ok && r.events).toContainEqual({ type: 'treasure', at: '1,0', outcome: 'explore' });
  expect(t.players[0]!.explored).toContain('4,-3');     // within 4 of 1,0 (the far edge of the radius-4 board)
  expect(t.rng).not.toBe(s.rng);
});
const rngStateFor = (n: number, want: number) => { let st = 1; while (rngInt(st, n)[0] !== want) st++; return st; };
test('treasure unit appears on the first free neighbour', () => {
  const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0); setTile(s, 1, 0, { treasure: true });
  s.rng = rngStateFor(3, 2);
  const t = must(applyAction(s, { type: 'move', unit: u.id, to: '1,0' }));
  expect(unitAt(t, '2,0')).toMatchObject({ type: 'warrior', owner: 0, home: null });
  expect(t.players[0]!.gold).toBe(20);
});
test('treasure unit with nowhere to stand becomes 5 gold', () => {
  const s = blankMatch({ radius: 1 }); setTile(s, 1, 0, { treasure: true });
  setTile(s, 1, -1, { terrain: 'water' }); setTile(s, 0, 1, { terrain: 'water' });
  addUnit(s, 'warrior', 0, 0, 0);                                   // a friend on the only other neighbour
  const h = addUnit(s, 'horseman', 0, -1, 0);                       // rides through the friend
  s.rng = rngStateFor(3, 2);
  const t = must(applyAction(s, { type: 'move', unit: h.id, to: '1,0' }));
  expect(t.units).toHaveLength(2); expect(t.players[0]!.gold).toBe(25);
});
test('treasure gold', () => {
  const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0); setTile(s, 1, 0, { treasure: true });
  s.rng = rngStateFor(3, 0);
  expect(must(applyAction(s, { type: 'move', unit: u.id, to: '1,0' })).players[0]!.gold).toBe(25);
});

// tests beyond the brief
test('a treasure passed through is not collected', () => {
  const s = blankMatch(); const h = addUnit(s, 'horseman', 0, 0, 0); setTile(s, 1, 0, { treasure: true });
  const t = must(applyAction(s, { type: 'move', unit: h.id, to: '2,0' }));
  expect(t.tiles['1,0']!.treasure).toBe(true); expect(t.rng).toBe(s.rng);
});
test('maxMp gives mounted Mongol units the bonus and nobody else', () => {
  const s = blankMatch();                                           // player 0 Spartan, player 1 Mongol
  expect(maxMp(s, addUnit(s, 'horseman', 0, 0, 0))).toBe(4);
  expect(maxMp(s, addUnit(s, 'horseman', 1, 1, 0))).toBe(6);
  expect(maxMp(s, addUnit(s, 'warrior', 1, 2, 0))).toBe(2);
});
test('unknown, spent and acted units reach nothing; a retreat unit may move after acting', () => {
  const s = blankMatch();
  expect(reachable(s, 99)).toEqual({});
  expect(reachable(s, addUnit(s, 'warrior', 0, 0, 0, { mp: 0 }).id)).toEqual({});
  expect(reachable(s, addUnit(s, 'warrior', 0, 0, 2, { acted: true }).id)).toEqual({});
  expect(Object.keys(reachable(s, addUnit(s, 'horseman', 0, 0, -2, { acted: true }).id)).length).toBeGreaterThan(0);
});
test('a unit that has already moved may not step onto a mountain or over budget', () => {
  const s = blankMatch(); const w = addUnit(s, 'warrior', 0, 0, 0, { moved: true, mp: 1 });
  setTile(s, 1, 0, { terrain: 'mountain' });
  const r = reachable(s, w.id);
  expect(r['1,0']).toBeUndefined(); expect(r['-1,0']).toBeUndefined();   // field costs 2, only 1 left
  const f = addUnit(s, 'knight', 0, 0, 2, { moved: true, mp: 6 }); setTile(s, 1, 2, { terrain: 'mountain' });
  expect(reachable(s, f.id)['1,2']).toBeUndefined();
});
test('road to a city tile costs 1 for anyone', () => {
  const s = blankMatch(); const w = addUnit(s, 'warrior', 0, 0, 0, { mp: 2 });
  setTile(s, 0, 0, { road: true }); addCity(s, 1, 1, 0);
  const r = reachable(s, w.id);
  expect(r['1,0']).toBe(1);
  expect(r['2,0']).toBeUndefined();                                // off the road: field costs 2, 1 left
});
test('Mongol riders pay 1 inside their own territory, even over a mountain or forest', () => {
  const s = blankMatch(); claimTerritory(s, addCity(s, 1, 3, 0, { radius: 2 }));
  setTile(s, 2, 0, { terrain: 'forest' }); setTile(s, 1, 0, { terrain: 'mountain' });
  setTile(s, -1, 0, { terrain: 'mountain' });
  const h = addUnit(s, 'horseman', 1, 0, 0, { moved: true, mp: 3 });
  expect(reachable(s, h.id)['-1,0']).toBeUndefined();               // outside the territory: a moved unit cannot climb
  expect(reachable(s, h.id)['1,0']).toBe(2);                        // inside it the mountain costs 1
  const g = addUnit(s, 'horseman', 1, 4, 0, { moved: true, mp: 3 });
  expect(reachable(s, g.id)['3,0']).toBe(2);
  expect(reachable(s, g.id)['2,0']).toBe(1);                        // forest inside own territory still costs 1
});
test('relay riders do not apply to Spartans or to enemy territory', () => {
  const s = blankMatch(); claimTerritory(s, addCity(s, 1, 3, 0, { radius: 2 }));
  const w = addUnit(s, 'warrior', 0, 4, 0);
  expect(reachable(s, w.id)['3,0']).toBe(0);
  const h = addUnit(s, 'horseman', 1, 0, 2, { mp: 6 });
  addCity(s, 0, 0, -2);
  expect(reachable(s, h.id)['0,1']).toBe(4);
});
test('a Mongol horseman entering a forest loses the rest of its move', () => {
  const s = blankMatch(); const h = addUnit(s, 'horseman', 1, 0, 0, { mp: 6 });
  setTile(s, 1, 0, { terrain: 'forest' });
  const r = reachable(s, h.id);
  expect(r['1,0']).toBe(0); expect(r['-1,0']).toBe(4);
  const moved = addUnit(s, 'horseman', 1, 0, 2, { mp: 1, moved: true }); setTile(s, 1, 2, { terrain: 'forest' });
  expect(reachable(s, moved.id)['1,2']).toBe(0);                    // needs 1 point left, has it
  const w = addUnit(s, 'warrior', 1, 0, -2, { mp: 4 }); setTile(s, 1, -2, { terrain: 'forest' });
  expect(reachable(s, w.id)['1,-2']).toBe(0);                       // plain cost 4
  const k = addUnit(s, 'knight', 0, 3, -3); setTile(s, 2, -3, { terrain: 'forest' });
  expect(reachable(s, k.id)['2,-3']).toBe(2);                       // Spartan knight: forest costs 4 of 6
});
test('engagement counts enemies the mover cannot see, and sets mp to 0 on arrival', () => {
  const s = blankMatch(); const w = addUnit(s, 'warrior', 0, 0, 0, { mp: 4 });
  addUnit(s, 'scout', 1, 3, -1);                                    // hidden enemy
  expect(reachable(s, w.id)['1,0']).toBe(2);
  expect(reachable(s, w.id)['2,0']).toBe(0);
});
test('move refuses malformed arguments and unknown units', () => {
  const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0);
  for (const a of [{ type: 'move', unit: 99, to: '1,0' }, { type: 'move', unit: u.id, to: 5 },
    { type: 'move', unit: '0', to: '1,0' }, { type: 'move', unit: u.id }, { type: 'move', unit: u.id, to: '0,0' }]) {
    expect(applyAction(s, a as never).ok).toBe(false);
  }
});
test('a move clears a pending lure', () => {
  const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0, { lure: { target: 9, from: '0,0' } });
  expect(unitById(must(applyAction(s, { type: 'move', unit: u.id, to: '1,0' })), u.id)!.lure).toBeNull();
});
test('inherited property names are refused as move targets', () => {
  const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0); const before = hashState(s);
  for (const to of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    expect(applyAction(s, { type: 'move', unit: u.id, to }).ok).toBe(false);
  }
  expect(hashState(s)).toBe(before);
});
