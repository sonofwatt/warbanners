import { expect, test } from 'vitest';
import { applyAction, playerView } from '../engine';
import type { GameEvent } from '../engine';
import { addCity, addUnit, blankMatch } from '../engine/testkit';
import { digestFor } from './digest';

test('what the other player did to my units is reported, and nothing else', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); const mine = addCity(s, 1, 0, -3);
  const rider = addUnit(s, 'horseman', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0, { hp: 1 }); addUnit(s, 'defender', 1, 0, -1);
  const kill = applyAction(s, { type: 'attack', unit: rider.id, target: '1,0' }); if (!kill.ok) throw new Error(kill.reason);
  expect(digestFor(1, [{ before: s, after: kill.state, events: kill.events }])).toEqual([{ kind: 'unitLost', unitType: 'warrior', by: 'horseman' }]);
  expect(digestFor(0, [{ before: s, after: kill.state, events: kill.events }])).toEqual([]);
  const s2 = blankMatch(); addCity(s2, 0, 0, 3); addCity(s2, 1, 0, -3);
  const r2 = addUnit(s2, 'horseman', 0, 0, 0); addUnit(s2, 'defender', 1, 1, 0);
  const hit = applyAction(s2, { type: 'attack', unit: r2.id, target: '1,0' }); if (!hit.ok) throw new Error(hit.reason);
  const dmg = (hit.events.find(e => e.type === 'attacked') as { damage: number }).damage;
  expect(digestFor(1, [{ before: s2, after: hit.state, events: hit.events }])).toEqual([{ kind: 'unitHurt', unitType: 'defender', damage: dmg, by: 'horseman' }]);
  expect(digestFor(1, [{ before: s, after: s, events: [{ type: 'captured', city: mine.id, by: 0 }] }])).toEqual([{ kind: 'cityLost' }]);
});

test('an attacker my side never saw is not named', () => {
  const s = blankMatch(); addCity(s, 0, 0, -4); addCity(s, 1, -3, 3);
  const gun = addUnit(s, 'catapult', 0, 0, 0); addUnit(s, 'warrior', 0, 2, 0); addUnit(s, 'warrior', 1, 3, 0);
  expect(playerView(s, 1).units.some(u => u.id === gun.id)).toBe(false);
  const hit = applyAction(s, { type: 'attack', unit: gun.id, target: '3,0' }); if (!hit.ok) throw new Error(hit.reason);
  expect(playerView(hit.state, 1).units.some(u => u.id === gun.id)).toBe(false);
  const lines = digestFor(1, [{ before: s, after: hit.state, events: hit.events }]);
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) expect(line).toMatchObject({ by: null });
});

test('an enemy melee killer stepping into my lost unit\'s tile is told, only when my side can see it there', () => {
  const play = (defenderAt: [number, number]) => {
    const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
    const rider = addUnit(s, 'horseman', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0, { hp: 1 }); addUnit(s, 'defender', 1, ...defenderAt);
    const kill = applyAction(s, { type: 'attack', unit: rider.id, target: '1,0' }); if (!kill.ok) throw new Error(kill.reason);
    expect(kill.events).toContainEqual({ type: 'advanced', unit: rider.id, from: '0,0', to: '1,0' });
    return digestFor(1, [{ before: s, after: kill.state, events: kill.events }]);
  };
  expect(play([1, -1])).toEqual([{ kind: 'unitLost', unitType: 'warrior', by: 'horseman' }, { kind: 'tileTaken', by: 'horseman' }]);
  expect(play([0, -1])).toEqual([{ kind: 'unitLost', unitType: 'warrior', by: 'horseman' }]);   // 2 from 1,0: out of sight
});

test('an enemy claiming a treasure my side can see is told; one in the fog is not', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  s.tiles['1,-2']!.treasure = true; const finder = addUnit(s, 'warrior', 0, 1, -2);
  const claim = applyAction(s, { type: 'claimTreasure', unit: finder.id }); if (!claim.ok) throw new Error(claim.reason);
  expect(playerView(claim.state, 1).visible).toContain('1,-2');
  expect(digestFor(1, [{ before: s, after: claim.state, events: claim.events }])).toEqual([{ kind: 'treasureTaken' }]);
  expect(digestFor(0, [{ before: s, after: claim.state, events: claim.events }])).toEqual([]);
  const f = blankMatch(); addCity(f, 0, 0, 3); addCity(f, 1, 0, -3);
  f.tiles['3,0']!.treasure = true; const far = addUnit(f, 'warrior', 0, 3, 0);
  const hidden = applyAction(f, { type: 'claimTreasure', unit: far.id }); if (!hidden.ok) throw new Error(hidden.reason);
  expect(playerView(hidden.state, 1).visible).not.toContain('3,0');
  expect(digestFor(1, [{ before: f, after: hidden.state, events: hidden.events }])).toEqual([]);
});

test('a trait earned on the other turn is told once; a hero line replaces the trait line', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const mine = addUnit(s, 'warrior', 1, 1, 0);
  const step = (events: GameEvent[]) => [{ before: s, after: s, events }];
  expect(digestFor(1, step([{ type: 'heroTrait', unit: mine.id, trait: 'hardy', hero: false }]))).toEqual([{ kind: 'traitEarned', unitType: 'warrior', trait: 'hardy' }]);
  expect(digestFor(1, step([{ type: 'heroTrait', unit: mine.id, trait: 'hardy', hero: true }]))).toEqual([{ kind: 'heroMade', unitType: 'warrior' }]);
  // On the viewer's own turn nothing is told: they were there.
  const own = { ...s, current: 1 };
  expect(digestFor(1, [{ before: own, after: own, events: [{ type: 'heroTrait', unit: mine.id, trait: 'hardy', hero: false }] }])).toEqual([]);
});
test('the other side never hears of its enemy progress', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const theirs = addUnit(s, 'warrior', 0, 1, 0);
  expect(digestFor(1, [{ before: s, after: s, events: [{ type: 'heroTrait', unit: theirs.id, trait: 'fierce', hero: true }] }])).toEqual([]);
});
