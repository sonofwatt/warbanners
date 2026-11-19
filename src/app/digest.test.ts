import { expect, test } from 'vitest';
import { applyAction, playerView } from '../engine';
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
