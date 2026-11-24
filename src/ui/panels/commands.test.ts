import { expect, test } from 'vitest';
import { applyAction, createMatch, legalActions, playerView, techPrice } from '../../engine';
import type { MatchState } from '../../engine';
import { addCity, addUnit, blankMatch, give, must } from '../../engine/testkit';
import { indexActions } from '../interaction';
import type { Selection } from '../interaction';
import { T } from '../text';
import { cityCommands, techRows, tileCommands, unitCommands } from './commands';
import type { Command } from './commands';

const open = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
const ixOf = (s: MatchState) => indexActions(legalActions(s));
const byId = (cs: Command[]) => Object.fromEntries(cs.map(c => [c.id, c]));
const unitSel = (id: number, o: Partial<Extract<Selection, { kind: 'unit' }>> = {}): Extract<Selection, { kind: 'unit' }> => ({ kind: 'unit', id, armed: null, askLure: null, ...o });
const seeAll = (s: MatchState) => { for (const p of s.players) p.explored = Object.keys(s.tiles).sort(); return s; };

test('the opening city offers what Spartans can ever train, and says why not yet', () => {
  const c = byId(cityCommands(0, open, ixOf(open)));
  expect(Object.keys(c).sort()).toEqual(['train-archer', 'train-catapult', 'train-defender', 'train-hoplite', 'train-horseman', 'train-knight', 'train-scout', 'train-spearman', 'train-swordsman', 'train-warrior']);
  expect(c['train-warrior']).toMatchObject({ enabled: false, cost: 2, why: T.reason['city tile is occupied'] });
  expect(c['train-horseman']).toMatchObject({ enabled: false, why: `Needs ${T.tech.riding}` });
});
test('once the tile is free a warrior can be trained', () => {
  const moved = must(applyAction(open, { type: 'move', unit: 0, to: '-1,4' }));
  const c = byId(cityCommands(0, moved, ixOf(moved)));
  expect(c['train-warrior']).toMatchObject({ enabled: true, why: null, action: { type: 'train', city: 0, unitType: 'warrior' } });
});
test('the units to train come trainable first, then the rest, each part cheapest first', () => {
  const moved = must(applyAction(open, { type: 'move', unit: 0, to: '-1,4' }));
  const train = cityCommands(0, moved, ixOf(moved)).filter(c => c.unit !== undefined);
  const ready = train.filter(c => c.enabled);
  expect(ready.length).toBeGreaterThan(0);
  expect(train.slice(0, ready.length).every(c => c.enabled)).toBe(true);
  const costs = (cs: Command[]) => cs.map(c => c.cost ?? 0);
  const ascending = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1]! <= x);
  expect(ascending(costs(ready))).toBe(true);
  expect(ascending(costs(train.slice(ready.length)))).toBe(true);
});
test('tile commands: legal ones, blocked ones with a reason, and nothing irrelevant', () => {
  // rules 8: the Spartans start with Prospecting, so the Mine waits on Mining, and tapping it opens the tree there
  expect(byId(tileCommands('-2,4', open, ixOf(open)))['build-mine']).toMatchObject({ enabled: false, cost: 5, action: null, why: `Needs ${T.tech.mining}`, tech: 'mining' });
  const mined = structuredClone(open); mined.players[0]!.techs.push('mining');
  expect(byId(tileCommands('-2,4', mined, ixOf(mined)))['build-mine']).toMatchObject({ enabled: true, cost: 5, action: { type: 'build', at: '-2,4', building: 'mine' } });
  const s42 = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  expect(tileCommands('-1,5', s42, ixOf(s42))).toEqual([
    expect.objectContaining({ id: 'harvest', label: T.harvestVerb.orchard, enabled: false, why: `Needs ${T.tech.foraging}` }),
    expect.objectContaining({ id: 'build-orchard', enabled: false, why: `Needs ${T.tech.orchards}` }),
  ]);
  expect(tileCommands('-1,4', s42, ixOf(s42))).toEqual([expect.objectContaining({ id: 'build-market', enabled: false, why: `Needs ${T.tech.granary}` })]);
  // rules 8: a harvested tile offers no harvest but still its building; an improvement offers its upgrade
  const h = structuredClone(s42); h.tiles['-1,5']!.harvested = true; h.tiles['-1,4']!.building = 'farm';
  expect(tileCommands('-1,5', h, ixOf(h)).map(c => c.id)).toEqual(['build-orchard']);
  expect(tileCommands('-1,4', h, ixOf(h))).toEqual([expect.objectContaining({ id: 'build-granary', enabled: false, why: `Needs ${T.tech.granary}`, tech: 'granary' })]);
  expect(tileCommands('-2,3', s42, ixOf(s42))).toEqual([]);
});
test('walls: hidden for Spartans, disabled for Mongols without the Walls tech, a reward pair when one is pending', () => {
  expect(cityCommands(0, open, ixOf(open)).some(c => c.id === 'walls')).toBe(false);
  const m = createMatch({ seed: 7, factions: ['mongols', 'spartans'] });
  expect(byId(cityCommands(0, m, ixOf(m)))['walls']).toMatchObject({ enabled: false, cost: 6, why: `Needs ${T.tech.walls}`, tech: 'walls' });
  const r = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
  r.cities[0]!.pendingRewards = [2];
  const c = byId(cityCommands(0, r, ixOf(r)));
  expect(c['reward-0']).toMatchObject({ label: T.reward.gold.name, action: { type: 'chooseReward', city: 0, choice: 0 } });
  expect(c['reward-1']).toMatchObject({ label: T.reward.scout.name, action: { type: 'chooseReward', city: 0, choice: 1 } });
});
test('tech rows', () => {
  const rows = techRows(open, ixOf(open));
  expect(rows).toHaveLength(21);
  const st = Object.fromEntries(rows.map(r => [r.tech, r.status]));
  // rules 8: Spartans start with Prospecting; its two column 2 techs and the other column 1 techs are ready at 10 gold
  expect(st).toMatchObject({ prospecting: 'owned', spears: 'ready', mining: 'ready', foraging: 'ready', trapping: 'ready', gathering: 'ready',
    fishing: 'ready', smithing: 'locked', foundry: 'locked', farming: 'locked', defence: 'locked' });
  expect(rows.find(r => r.tech === 'foraging')!.price).toBe(techPrice(open, 0, 'foraging'));
  expect(rows.map(r => r.branch)).toEqual([...Array(5).fill('orchards'), ...Array(5).fill('hunting'), ...Array(5).fill('mountains'), ...Array(5).fill('plains'), 'waters']);
  expect(rows.filter(r => r.branch === 'orchards').map(r => r.row)).toEqual([null, 'top', 'top', 'bottom', 'bottom']);
});
test('unit commands: abilities arm, a camp lists what it can train, a lure asks, a capture is offered', () => {
  const ps = seeAll(blankMatch());
  addCity(ps, 0, 0, 3); addCity(ps, 1, 0, -3);
  const piper = addUnit(ps, 'piper', 0, 0, 0); addUnit(ps, 'hoplite', 0, 1, 0, { hp: 7 }); addUnit(ps, 'warrior', 1, -1, 0);
  const pix = ixOf(ps);
  const pc = unitCommands(unitSel(piper.id), ps, pix);
  expect(pc.map(c => c.id)).toEqual(['ability-heal', 'ability-taunt', 'hunker']);
  expect(pc.slice(0, 2).every(c => c.arm !== null && c.action === null)).toBe(true);
  const armed = byId(unitCommands(unitSel(piper.id, { armed: { kind: 'ability', ability: 'heal' } }), ps, pix));
  expect(armed['ability-heal']!.label).toBe(T.ui.cancel);
  // Cancel disarms; the other ability still arms itself, swapping straight over.
  expect(armed['ability-heal']!.arm).toBeNull();
  expect(armed['ability-taunt']!.arm).toEqual({ kind: 'ability', ability: 'taunt' });
  expect(armed['ability-taunt']!.label).toBe(T.ability.taunt.name);

  const cs = seeAll(blankMatch({ factions: ['mongols', 'spartans'] }));
  addCity(cs, 0, 0, 3); addCity(cs, 1, 0, -3); give(cs, 0, 'riding');
  const camp = addUnit(cs, 'camp', 0, 0, 0);
  cs.tiles['2,0']!.village = true; const taker = addUnit(cs, 'warrior', 0, 2, 0);
  const cix = ixOf(cs);
  const cc = unitCommands(unitSel(camp.id), cs, cix);
  expect(cc.slice(0, -1).every(c => c.id.startsWith('camp-'))).toBe(true);
  expect(cc.at(-1)!.id).toBe('hunker');
  expect(byId(cc)['camp-warrior']).toMatchObject({ cost: 2, arm: { kind: 'campTrain', unitType: 'warrior' } });
  expect(unitCommands(unitSel(taker.id), cs, cix)).toEqual([
    expect.objectContaining({ id: 'capture', action: { type: 'capture', unit: taker.id } }), expect.objectContaining({ id: 'hunker' }),
  ]);

  const ls = seeAll(blankMatch({ factions: ['mongols', 'spartans'] }));
  addCity(ls, 0, 0, 3); addCity(ls, 1, 0, -3);
  const rider = addUnit(ls, 'horseArcher', 0, 0, 0); addUnit(ls, 'warrior', 1, 1, 0);
  const lc = unitCommands(unitSel(rider.id, { askLure: '1,0' }), ls, ixOf(ls));
  expect(lc.map(c => c.id)).toEqual(['attack', 'attack-lure']);
  expect(lc[0]!.action).toEqual({ type: 'attack', unit: rider.id, target: '1,0' });
  expect(lc[1]!.action).toEqual({ type: 'attack', unit: rider.id, target: '1,0', lure: true });

  const es = seeAll(blankMatch()); addCity(es, 0, 0, 3); addCity(es, 1, 0, -3);
  addUnit(es, 'warrior', 0, 0, 0); const foe = addUnit(es, 'warrior', 1, 1, -1);
  expect(playerView(es, 0).units.some(u => u.id === foe.id)).toBe(true);
  expect(unitCommands(unitSel(foe.id), es, ixOf(es))).toEqual([]);
});

test('a unit that has waited on a treasure is offered Claim treasure', () => {
  const s = seeAll(blankMatch()); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  s.tiles['2,0']!.treasure = true; const finder = addUnit(s, 'warrior', 0, 2, 0);
  expect(unitCommands(unitSel(finder.id), s, ixOf(s))).toEqual([
    { id: 'claimTreasure', label: T.ui.claimTreasure, cost: null, enabled: true, why: null, action: { type: 'claimTreasure', unit: finder.id }, arm: null },
    { id: 'hunker', label: T.ui.hunker, cost: null, enabled: true, why: null, action: { type: 'hunker', unit: finder.id }, arm: null, hint: T.ui.hunkerHint },
  ]);
  const walker = addUnit(s, 'warrior', 0, -2, 0, { moved: true }); s.tiles['-2,0']!.treasure = true;   // arrived this turn
  expect(unitCommands(unitSel(walker.id), s, ixOf(s))).toEqual([]);
});

test('Drink draught is offered when useItem is legal', () => {
  const s = seeAll(blankMatch()); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const drinker = addUnit(s, 'warrior', 0, 0, 0, { item: 'draught' }); const plain = addUnit(s, 'warrior', 0, 1, 0);
  const ix = ixOf(s);
  const c = byId(unitCommands(unitSel(drinker.id), s, ix));
  expect(c['useItem']).toEqual({ id: 'useItem', label: T.ui.drink, cost: null, enabled: true, why: null, action: { type: 'useItem', unit: drinker.id }, arm: null });
  expect(byId(unitCommands(unitSel(plain.id), s, ix))['useItem']).toBeUndefined();
  drinker.fresh = true;    // too new to drink: no longer legal
  expect(byId(unitCommands(unitSel(drinker.id), s, ixOf(s)))['useItem']).toBeUndefined();
});

test('rules 7: Hunker is offered to a unit that has done nothing, never to a Catapult, a moved or a hunkered unit', () => {
  const s = seeAll(blankMatch()); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const idle = addUnit(s, 'warrior', 0, 2, 0);
  const cat = addUnit(s, 'catapult', 0, -2, 0);
  const moved = addUnit(s, 'warrior', 0, -2, 2, { moved: true });
  const dug = addUnit(s, 'warrior', 0, 2, -2, { hunkered: true });
  const ix = ixOf(s);
  expect(unitCommands(unitSel(idle.id), s, ix).find(c => c.id === 'hunker')).toEqual(
    { id: 'hunker', label: T.ui.hunker, cost: null, enabled: true, why: null, action: { type: 'hunker', unit: idle.id }, arm: null, hint: T.ui.hunkerHint });
  for (const u of [cat, moved, dug]) expect(unitCommands(unitSel(u.id), s, ix).some(c => c.id === 'hunker')).toBe(false);
});
