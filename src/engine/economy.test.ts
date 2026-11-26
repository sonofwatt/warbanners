import { expect, test } from 'vitest';
import { applyAction, legalActions } from './apply';
import { hashState } from './hash';
import { neighbors } from './hex';
import { addGrowth, cityIncome, growthNeeded, playerIncome, unitCapacity } from './economy';
import { CONFIG } from './data/config';
import { cityById, claimTerritory, unitAt } from './state';
import { addCity, addUnit, blankMatch, give, must, setTile } from './testkit';
import type { Action, BuildingId, GameEvent, TechId, Tile } from './types';

test('income', () => {
  const s = blankMatch(); const cap = addCity(s, 0, 0, 0, { capital: true }); addCity(s, 0, 3, 0, { level: 2, incomeBonus: 1, market: true });
  expect(cityIncome(s, cap)).toBe(2); expect(playerIncome(s, 0)).toBe(2 + 5);
});
test('growth levels a city and queues the reward; Mongols need one more than Spartans from level 2 on', () => {
  const s = blankMatch(); const c = addCity(s, 0, 0, 0); const ev: GameEvent[] = [];
  expect(CONFIG.growthExtraFrom).toBe(2);
  expect(growthNeeded(s, c)).toBe(2);                                // rules 9: no Spartan discount on leaving level 1 (1 before)
  addGrowth(s, c, 1, ev);
  expect(c).toMatchObject({ level: 1, growth: 1, pendingRewards: [] }); expect(ev).toEqual([]);
  addGrowth(s, c, 1, ev);
  expect(c).toMatchObject({ level: 2, growth: 0, pendingRewards: [2] });
  expect(ev).toContainEqual({ type: 'cityLevel', city: c.id, level: 2 });
  expect(growthNeeded(s, c)).toBe(2);                                // from level 2 a Spartan city leaves level L on L growth
  addGrowth(s, c, 2, []); expect(c).toMatchObject({ level: 3, growth: 0 });
  expect(growthNeeded(s, c)).toBe(3);
  const m = addCity(s, 1, 3, 0);                                     // a Mongol city needs L + 1 since rules 8 (L + 2 before)
  expect(growthNeeded(s, m)).toBe(2); addGrowth(s, m, 1, []);
  expect(m).toMatchObject({ level: 1, growth: 1 });
  addGrowth(s, m, 1, []); expect(m.level).toBe(2);
  expect(growthNeeded(s, m)).toBe(3);
  addGrowth(s, m, 2, []); expect(m).toMatchObject({ level: 2, growth: 2 });
  addGrowth(s, m, 1, []); expect(m).toMatchObject({ level: 3, growth: 0 });
});
test('each reward does what rules 6 says', () => {
  const s = blankMatch(); const c = addCity(s, 0, 0, 0, { level: 2, pendingRewards: [2] });
  let t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice: 0 }));
  expect(CONFIG.rewardGold).toBe(5);                                 // rules 9 (6 before)
  expect(t.players[0]!.gold).toBe(25); expect(cityById(t, c.id)!.pendingRewards).toEqual([]);
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
  expect(t.units).toHaveLength(1); expect(t.players[0]!.gold).toBe(25);
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
  const s = blankMatch(); const c = addCity(s, 0, 0, 0); give(s, 0, 'foraging', 'farming', 'mining', 'granary');
  setTile(s, 1, 0, { resource: 'orchard' }); setTile(s, 0, 1, { resource: 'cropland' }); setTile(s, -1, 0, { terrain: 'mountain', resource: 'ore' });
  let t = must(applyAction(s, { type: 'harvest', at: '1,0' }));
  // rules 8: the fruit stays on the tile, marked harvested
  expect(t.tiles['1,0']).toMatchObject({ resource: 'orchard', harvested: true }); expect(t.players[0]!.gold).toBe(18);
  expect(applyAction(t, { type: 'harvest', at: '1,0' })).toEqual({ ok: false, reason: 'nothing to harvest' }); expect(cityById(t, c.id)).toMatchObject({ level: 1, growth: 1 });   // rules 9: a Spartan level 1 bar needs 2, like anyone's
  t = must(applyAction(t, { type: 'build', at: '0,1', building: 'farm' }));
  expect(t.tiles['0,1']!.building).toBe('farm'); expect(cityById(t, c.id)).toMatchObject({ level: 2, growth: 1 });   // the farm's 2 growth fills level 1, 1 carried into level 2
  expect(applyAction(t, { type: 'build', at: '0,1', building: 'farm' }).ok).toBe(false);     // already built
  expect(applyAction(t, { type: 'build', at: '-1,0', building: 'farm' }).ok).toBe(false);    // wrong tile
  t = must(applyAction(t, { type: 'build', at: '0,-1', building: 'market' }));
  expect(cityById(t, c.id)!.market).toBe(true);
  expect(applyAction(t, { type: 'build', at: '1,-1', building: 'market' }).ok).toBe(false);  // one per city
  expect(applyAction(s, { type: 'harvest', at: '3,0' }).ok).toBe(false);                     // outside territory
});
test('build: mine on ore, resource stays; market refused on a resource tile', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0); give(s, 0, 'mining', 'granary');
  setTile(s, -1, 0, { terrain: 'mountain', resource: 'ore' }); setTile(s, 0, 1, { resource: 'cropland' });
  const t = must(applyAction(s, { type: 'build', at: '-1,0', building: 'mine' }));
  expect(t.tiles['-1,0']).toMatchObject({ building: 'mine', resource: 'ore' });
  expect(applyAction(s, { type: 'build', at: '0,1', building: 'market' }).ok).toBe(false);
});
test('a city tile takes no harvest, building or road', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0); give(s, 0, 'foraging', 'granary', 'riding');
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
  const r = blankMatch(); addCity(r, 0, 0, 0); give(r, 0, 'riding');         // Spartans: Mongols build no roads (rules 8)
  r.players[0]!.explored = Object.keys(r.tiles).sort();
  let t = must(applyAction(r, { type: 'road', at: '3,0' }));                    // unclaimed tile is allowed
  expect(t.tiles['3,0']!.road).toBe(true); expect(t.players[0]!.gold).toBe(19);
  expect(applyAction(t, { type: 'road', at: '3,0' }).ok).toBe(false);
  setTile(r, 2, 0, { terrain: 'mountain' }); expect(applyAction(r, { type: 'road', at: '2,0' }).ok).toBe(false);
  addCity(r, 1, -3, 0); expect(applyAction(r, { type: 'road', at: '-3,1' }).ok).toBe(false);  // enemy territory
  const s = blankMatch({ factions: ['mongols', 'spartans'] }); const c = addCity(s, 0, 0, 0); give(s, 0, 'riding', 'walls');
  s.players[0]!.explored = Object.keys(s.tiles).sort();
  expect(applyAction(s, { type: 'road', at: '3,0' }).ok).toBe(false);          // rules 8
  const e = addCity(s, 1, -3, 0);
  expect(e.id).not.toBe(c.id);
  t = must(applyAction(s, { type: 'buildWalls', city: c.id }));
  expect(cityById(t, c.id)!.walls).toBe(true); expect(t.players[0]!.gold).toBe(14);
  expect(applyAction(t, { type: 'buildWalls', city: c.id }).ok).toBe(false);     // already walled
  expect(applyAction(s, { type: 'buildWalls', city: e.id }).ok).toBe(false);     // not yours
  const sp = blankMatch(); const sc = addCity(sp, 0, 0, 0); give(sp, 0, 'walls');
  expect(applyAction(sp, { type: 'buildWalls', city: sc.id }).ok).toBe(false);  // Spartans cannot
});
test('a road needs an explored tile, so a refusal never reveals terrain', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0); give(s, 0, 'riding');
  s.players[0]!.explored = ['0,0'];
  const before = hashState(s);
  expect(applyAction(s, { type: 'road', at: '3,0' })).toEqual({ ok: false, reason: 'cannot build a road there' });
  expect(hashState(s)).toBe(before);
  s.players[0]!.explored = ['0,0', '3,0'];
  expect(applyAction(s, { type: 'road', at: '3,0' }).ok).toBe(true);
});
test('hostile keys, ids and buildings are refused with the state untouched', () => {
  const s = blankMatch({ factions: ['mongols', 'spartans'] }); const c = addCity(s, 0, 0, 0);
  give(s, 0, 'foraging', 'farming', 'granary', 'riding', 'walls', 'mining');
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

// rules 8: the new tree's harvests, improvements and upgrades
test('rules 8: every column 1 resource is harvested by its tech, from the city, and keeps its tile', () => {
  const s = blankMatch(); const c = addCity(s, 0, 0, 0, { level: 3 });
  setTile(s, 1, 0, { resource: 'orchard' }); setTile(s, 0, 1, { resource: 'cropland' }); setTile(s, -1, 1, { terrain: 'forest', resource: 'game' });
  setTile(s, -1, 0, { terrain: 'mountain', resource: 'jewels' }); setTile(s, 1, -1, { terrain: 'water', resource: 'fish' });
  const spots: [string, TechId][] = [['1,0', 'foraging'], ['0,1', 'gathering'], ['-1,1', 'trapping'], ['-1,0', 'prospecting'], ['1,-1', 'fishing']];
  for (const [at, tech] of spots) {
    expect(applyAction(s, { type: 'harvest', at })).toEqual({ ok: false, reason: 'missing tech' });
    const t = blankMatch(); Object.assign(t, structuredClone(s)); give(t, 0, tech);
    const resource = t.tiles[at]!.resource;
    const after = must(applyAction(t, { type: 'harvest', at }));
    expect(after.tiles[at]).toMatchObject({ resource, harvested: true, building: null });
    expect(after.players[0]!.gold).toBe(20 - CONFIG.harvest[resource as keyof typeof CONFIG.harvest].cost);
    expect(cityById(after, c.id)!.growth).toBe(CONFIG.harvest[resource as keyof typeof CONFIG.harvest].growth);
    expect(legalActions(after).some((a) => a.type === 'harvest' && a.at === at)).toBe(false);
  }
  // ore has no harvest: it is mined
  setTile(s, 2, -1, { terrain: 'mountain', resource: 'ore' }); give(s, 0, 'prospecting', 'mining');
  expect(applyAction(s, { type: 'harvest', at: '2,-1' }).ok).toBe(false);
});
test('rules 8: an Orchard goes on fruit, harvested or not; on unharvested fruit it ends the harvest', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0); give(s, 0, 'foraging', 'orchards');
  setTile(s, 1, 0, { resource: 'orchard' }); setTile(s, 0, 1, { resource: 'orchard' }); setTile(s, 1, -1, {});
  let t = must(applyAction(s, { type: 'harvest', at: '1,0' }));
  t = must(applyAction(t, { type: 'build', at: '1,0', building: 'orchard' }));
  expect(t.tiles['1,0']).toMatchObject({ building: 'orchard', resource: 'orchard', harvested: true });
  t = must(applyAction(t, { type: 'build', at: '0,1', building: 'orchard' }));
  expect(applyAction(t, { type: 'harvest', at: '0,1' })).toEqual({ ok: false, reason: 'nothing to harvest' });
  expect(applyAction(t, { type: 'build', at: '1,-1', building: 'orchard' })).toEqual({ ok: false, reason: 'wrong tile' });
});
test('rules 8: a Farm goes on harvested wild grain, a Lumber camp on a plain or game forest, a Mine on ore only', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0, { radius: 2 }); claimTerritory(s, s.cities[0]!); s.players[0]!.gold = 99;
  give(s, 0, 'gathering', 'farming', 'trapping', 'logging', 'prospecting', 'mining');
  setTile(s, 0, 1, { resource: 'cropland' }); setTile(s, -1, 1, { terrain: 'forest', resource: 'game' }); setTile(s, -1, 0, { terrain: 'forest' });
  setTile(s, 1, -1, { terrain: 'mountain', resource: 'jewels' }); setTile(s, 1, 0, { terrain: 'mountain', resource: 'ore' });
  let t = must(applyAction(s, { type: 'harvest', at: '0,1' }));
  t = must(applyAction(t, { type: 'build', at: '0,1', building: 'farm' }));
  t = must(applyAction(t, { type: 'harvest', at: '-1,1' }));
  t = must(applyAction(t, { type: 'build', at: '-1,1', building: 'lumberCamp' }));
  t = must(applyAction(t, { type: 'build', at: '-1,0', building: 'lumberCamp' }));
  t = must(applyAction(t, { type: 'build', at: '1,0', building: 'mine' }));
  expect(applyAction(t, { type: 'build', at: '1,-1', building: 'mine' })).toEqual({ ok: false, reason: 'wrong tile' });
  expect(t.tiles['0,1']!.building).toBe('farm'); expect(t.tiles['-1,1']!.building).toBe('lumberCamp');
});
test('rules 8: each upgrade replaces its improvement on the same tile, for more gold and more growth', () => {
  const pairs: [BuildingId, BuildingId, TechId, TechId, Partial<Tile>][] = [
    ['orchard', 'plantation', 'orchards', 'plantations', { resource: 'orchard' }],
    ['lumberCamp', 'lumberMill', 'logging', 'milling', { terrain: 'forest' }],
    ['mine', 'foundry', 'mining', 'foundry', { terrain: 'mountain', resource: 'ore' }],
    ['farm', 'granary', 'farming', 'granary', { resource: 'cropland' }],
  ];
  for (const [base, up, baseTech, upTech, tile] of pairs) {
    const s = blankMatch(); const c = addCity(s, 0, 0, 0, { level: 9 }); s.players[0]!.gold = 30;
    setTile(s, 1, 0, tile); setTile(s, 0, 1, tile); give(s, 0, baseTech);
    expect(applyAction(s, { type: 'build', at: '1,0', building: up })).toEqual({ ok: false, reason: 'wrong tile' });   // nothing to upgrade
    let t = must(applyAction(s, { type: 'build', at: '1,0', building: base }));
    expect(applyAction(t, { type: 'build', at: '1,0', building: up })).toEqual({ ok: false, reason: 'missing tech' });
    give(t, 0, upTech);
    const gold = t.players[0]!.gold, growth = cityById(t, c.id)!.growth;
    t = must(applyAction(t, { type: 'build', at: '1,0', building: up }));
    expect(t.tiles['1,0']!.building).toBe(up);
    expect(t.players[0]!.gold).toBe(gold - CONFIG.buildings[up].cost);
    expect(cityById(t, c.id)!.growth).toBe(growth + CONFIG.buildings[up].growth);
    expect(CONFIG.buildings[up].cost).toBeGreaterThan(CONFIG.buildings[base].cost);
    expect(CONFIG.buildings[up].growth).toBeGreaterThan(CONFIG.buildings[base].growth);
    expect(applyAction(t, { type: 'build', at: '1,0', building: up })).toEqual({ ok: false, reason: 'already built' });
    expect(applyAction(t, { type: 'build', at: '0,1', building: up })).toEqual({ ok: false, reason: 'wrong tile' });   // bare tile
    expect(legalActions(t).some((a) => a.type === 'build' && a.at === '1,0')).toBe(false);
  }
});
test('rules 8: the Market moves to Granary and keeps its rules', () => {
  const s = blankMatch(); const c = addCity(s, 0, 0, 0); give(s, 0, 'farming');
  expect(applyAction(s, { type: 'build', at: '1,0', building: 'market' })).toEqual({ ok: false, reason: 'missing tech' });
  give(s, 0, 'granary');
  const t = must(applyAction(s, { type: 'build', at: '1,0', building: 'market' }));
  expect(cityById(t, c.id)!.market).toBe(true);
  expect(applyAction(t, { type: 'build', at: '0,1', building: 'market' })).toEqual({ ok: false, reason: 'city already has a market' });
});
