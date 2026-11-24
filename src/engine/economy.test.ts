import { expect, test } from 'vitest';
import { applyAction } from './apply';
import { hashState } from './hash';
import { neighbors } from './hex';
import { addGrowth, cityIncome, playerIncome, unitCapacity } from './economy';
import { cityById, unitAt } from './state';
import { addCity, addUnit, blankMatch, give, must, setTile } from './testkit';
import type { Action, GameEvent } from './types';

test('income', () => {
  const s = blankMatch(); const cap = addCity(s, 0, 0, 0, { capital: true }); addCity(s, 0, 3, 0, { level: 2, incomeBonus: 1, market: true });
  expect(cityIncome(s, cap)).toBe(2); expect(playerIncome(s, 0)).toBe(2 + 5);
});
test('growth levels a city and queues the reward; Mongols need one more', () => {
  const s = blankMatch(); const c = addCity(s, 0, 0, 0); const ev: GameEvent[] = [];
  addGrowth(s, c, 1, ev);                                            // a Spartan city leaves level L on L growth (rules 7 discount)
  expect(c).toMatchObject({ level: 2, growth: 0, pendingRewards: [2] });
  expect(ev).toContainEqual({ type: 'cityLevel', city: c.id, level: 2 });
  const m = addCity(s, 1, 3, 0); addGrowth(s, m, 2, []);      // a Mongol city needs L + 2, two more than a Spartan one
  expect(m).toMatchObject({ level: 1, growth: 2 });
  addGrowth(s, m, 1, []); expect(m.level).toBe(2);
});
test('each reward does what rules 6 says', () => {
  const s = blankMatch(); const c = addCity(s, 0, 0, 0, { level: 2, pendingRewards: [2] });
  let t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice: 0 }));
  expect(t.players[0]!.gold).toBe(26); expect(cityById(t, c.id)!.pendingRewards).toEqual([]);
  c.pendingRewards = [3]; t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice: 0 }));
  expect(cityById(t, c.id)!.radius).toBe(2); expect(t.tiles['2,0']!.cityId).toBe(c.id);
  c.pendingRewards = [3]; t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice: 1 }));
  expect(unitCapacity(cityById(t, c.id)!)).toBe(2 + 1 + 2);
  c.pendingRewards = [4]; t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice: 0 }));
  expect(cityById(t, c.id)!.incomeBonus).toBe(1);
  c.pendingRewards = [7]; t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice: 0 }));
  expect(unitAt(t, '0,0')).toMatchObject({ type: 'kingsGuard', home: null, mp: 0 });
  c.pendingRewards = [5]; t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice: 1 }));
  expect(unitAt(t, '0,0')!.type).toBe('piper');
  expect(applyAction(t, { type: 'chooseReward', city: c.id, choice: 0 }).ok).toBe(false);
});
test('scout reward explores every tile within 3, sorted and without duplicates', () => {
  const s = blankMatch({ radius: 6, unexplored: true }); const c = addCity(s, 0, 0, 0, { level: 2, pendingRewards: [2] });
  const r = applyAction(s, { type: 'chooseReward', city: c.id, choice: 1 });
  const t = must(r);
  expect(t.players[0]!.explored).toContain('3,0'); expect(t.players[0]!.explored).toContain('-3,3');
  expect(t.players[0]!.explored).not.toContain('4,0');
  expect(t.players[0]!.explored).toEqual([...new Set(t.players[0]!.explored)].sort());
  expect(r.ok && r.events).toContainEqual({ type: 'reward', city: c.id, reward: 'scout' });
});
test('growth reward can level the city again and queue another reward', () => {
  const s = blankMatch(); const c = addCity(s, 0, 0, 0, { level: 4, growth: 3, pendingRewards: [4] });
  const t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice: 1 }));
  expect(cityById(t, c.id)).toMatchObject({ level: 5, growth: 1, pendingRewards: [5] });
});
test('reward unit steps aside when the city is occupied, and becomes gold when boxed in', () => {
  const s = blankMatch({ radius: 1 }); const c = addCity(s, 0, 0, 0, { level: 5, pendingRewards: [5] }); addUnit(s, 'warrior', 0, 0, 0);
  let t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice: 0 }));
  expect(unitAt(t, '1,0')!.type).toBe('kingsGuard');
  for (const n of neighbors({ q: 0, r: 0 })) setTile(s, n.q, n.r, { terrain: 'water' });
  t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice: 0 }));
  expect(t.units).toHaveLength(1); expect(t.players[0]!.gold).toBe(26);
});
test('chooseReward refusals', () => {
  const s = blankMatch(); const c = addCity(s, 0, 0, 0, { level: 2, pendingRewards: [2] });
  const e = addCity(s, 1, 3, 0, { level: 2, pendingRewards: [2] }); const none = addCity(s, 0, -3, 0);
  for (const a of [
    { type: 'chooseReward', city: e.id, choice: 0 }, { type: 'chooseReward', city: none.id, choice: 0 },
    { type: 'chooseReward', city: 99, choice: 0 }, { type: 'chooseReward', city: c.id, choice: 2 },
    { type: 'chooseReward', city: c.id, choice: -1 }, { type: 'chooseReward', city: c.id, choice: '0' },
    { type: 'chooseReward', city: 'constructor', choice: 0 }, { type: 'chooseReward', city: c.id },
  ] as unknown as Action[]) {
    const h = hashState(s); expect(applyAction(s, a).ok).toBe(false); expect(hashState(s)).toBe(h);
  }
});
test('harvest and build', () => {
  const s = blankMatch(); const c = addCity(s, 0, 0, 0); give(s, 0, 'foraging', 'farming', 'bronze', 'markets');
  setTile(s, 1, 0, { resource: 'orchard' }); setTile(s, 0, 1, { resource: 'cropland' }); setTile(s, -1, 0, { terrain: 'mountain', resource: 'ore' });
  let t = must(applyAction(s, { type: 'harvest', at: '1,0' }));
  expect(t.tiles['1,0']!.resource).toBeNull(); expect(t.players[0]!.gold).toBe(18); expect(cityById(t, c.id)).toMatchObject({ level: 2, growth: 0 });   // the harvest's 1 growth fills a Spartan level 1 bar
  t = must(applyAction(t, { type: 'build', at: '0,1', building: 'farm' }));
  expect(t.tiles['0,1']!.building).toBe('farm'); expect(cityById(t, c.id)).toMatchObject({ level: 3, growth: 0 });   // the farm's 2 growth fills level 2
  expect(applyAction(t, { type: 'build', at: '0,1', building: 'farm' }).ok).toBe(false);     // already built
  expect(applyAction(t, { type: 'build', at: '-1,0', building: 'farm' }).ok).toBe(false);    // wrong tile
  t = must(applyAction(t, { type: 'build', at: '0,-1', building: 'market' }));
  expect(cityById(t, c.id)!.market).toBe(true);
  expect(applyAction(t, { type: 'build', at: '1,-1', building: 'market' }).ok).toBe(false);  // one per city
  expect(applyAction(s, { type: 'harvest', at: '3,0' }).ok).toBe(false);                     // outside territory
});
test('build: mine on ore, resource stays; market refused on a resource tile', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0); give(s, 0, 'bronze', 'markets');
  setTile(s, -1, 0, { terrain: 'mountain', resource: 'ore' }); setTile(s, 0, 1, { resource: 'cropland' });
  const t = must(applyAction(s, { type: 'build', at: '-1,0', building: 'mine' }));
  expect(t.tiles['-1,0']).toMatchObject({ building: 'mine', resource: 'ore' });
  expect(applyAction(s, { type: 'build', at: '0,1', building: 'market' }).ok).toBe(false);
});
test('a city tile takes no harvest, building or road', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0); give(s, 0, 'foraging', 'markets', 'roads');
  setTile(s, 0, 0, { resource: 'orchard' });
  expect(applyAction(s, { type: 'harvest', at: '0,0' }).ok).toBe(false);
  expect(applyAction(s, { type: 'build', at: '0,0', building: 'market' }).ok).toBe(false);
  expect(applyAction(s, { type: 'road', at: '0,0' }).ok).toBe(false);
});
test('no tech, no gold, no deal', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0); setTile(s, 1, 0, { resource: 'orchard' });
  expect(applyAction(s, { type: 'harvest', at: '1,0' }).ok).toBe(false);
  give(s, 0, 'foraging'); s.players[0]!.gold = 1;
  expect(applyAction(s, { type: 'harvest', at: '1,0' }).ok).toBe(false);
});
test('roads and walls', () => {
  const r = blankMatch(); addCity(r, 0, 0, 0); give(r, 0, 'roads');         // Spartans: Mongols build no roads (rules 8)
  r.players[0]!.explored = Object.keys(r.tiles).sort();
  let t = must(applyAction(r, { type: 'road', at: '3,0' }));                    // unclaimed tile is allowed
  expect(t.tiles['3,0']!.road).toBe(true); expect(t.players[0]!.gold).toBe(19);
  expect(applyAction(t, { type: 'road', at: '3,0' }).ok).toBe(false);
  setTile(r, 2, 0, { terrain: 'mountain' }); expect(applyAction(r, { type: 'road', at: '2,0' }).ok).toBe(false);
  addCity(r, 1, -3, 0); expect(applyAction(r, { type: 'road', at: '-3,1' }).ok).toBe(false);  // enemy territory
  const s = blankMatch({ factions: ['mongols', 'spartans'] }); const c = addCity(s, 0, 0, 0); give(s, 0, 'roads', 'shieldwork');
  s.players[0]!.explored = Object.keys(s.tiles).sort();
  expect(applyAction(s, { type: 'road', at: '3,0' }).ok).toBe(false);          // rules 8
  const e = addCity(s, 1, -3, 0);
  expect(e.id).not.toBe(c.id);
  t = must(applyAction(s, { type: 'buildWalls', city: c.id }));
  expect(cityById(t, c.id)!.walls).toBe(true); expect(t.players[0]!.gold).toBe(14);
  expect(applyAction(t, { type: 'buildWalls', city: c.id }).ok).toBe(false);     // already walled
  expect(applyAction(s, { type: 'buildWalls', city: e.id }).ok).toBe(false);     // not yours
  const sp = blankMatch(); const sc = addCity(sp, 0, 0, 0); give(sp, 0, 'shieldwork');
  expect(applyAction(sp, { type: 'buildWalls', city: sc.id }).ok).toBe(false);  // Spartans cannot
});
test('a road needs an explored tile, so a refusal never reveals terrain', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0); give(s, 0, 'roads');
  s.players[0]!.explored = ['0,0'];
  const before = hashState(s);
  expect(applyAction(s, { type: 'road', at: '3,0' })).toEqual({ ok: false, reason: 'cannot build a road there' });
  expect(hashState(s)).toBe(before);
  s.players[0]!.explored = ['0,0', '3,0'];
  expect(applyAction(s, { type: 'road', at: '3,0' }).ok).toBe(true);
});
test('hostile keys, ids and buildings are refused with the state untouched', () => {
  const s = blankMatch({ factions: ['mongols', 'spartans'] }); const c = addCity(s, 0, 0, 0);
  give(s, 0, 'foraging', 'farming', 'markets', 'roads', 'shieldwork', 'bronze');
  setTile(s, 1, 0, { resource: 'orchard' });
  for (const a of [
    { type: 'harvest', at: 'constructor' }, { type: 'harvest', at: '__proto__' }, { type: 'harvest', at: 5 },
    { type: 'build', at: 'constructor', building: 'farm' }, { type: 'build', at: '__proto__', building: 'farm' },
    { type: 'build', at: '0,1', building: 'constructor' }, { type: 'build', at: '0,1', building: '__proto__' },
    { type: 'build', at: '0,1', building: 'toString' }, { type: 'build', at: '0,1' },
    { type: 'road', at: 'constructor' }, { type: 'road', at: '__proto__' },
    { type: 'buildWalls', city: 'constructor' }, { type: 'buildWalls', city: '__proto__' }, { type: 'buildWalls', city: '0' },
    { type: 'buildWalls' },
  ] as unknown as Action[]) {
    const h = hashState(s); expect(applyAction(s, a).ok).toBe(false); expect(hashState(s)).toBe(h);
  }
  expect(c.walls).toBe(false);
});
