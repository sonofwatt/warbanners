import { expect, test } from 'vitest';
import { applyAction } from '../engine';
import { addCity, addUnit, blankMatch } from '../engine/testkit';
import { digestFor } from './digest';

test('what the other player did to my units is reported, and nothing else', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); const mine = addCity(s, 1, 0, -3);
  const rider = addUnit(s, 'horseman', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0, { hp: 1 }); addUnit(s, 'defender', 1, 0, -1);
  const kill = applyAction(s, { type: 'attack', unit: rider.id, target: '1,0' }); if (!kill.ok) throw new Error(kill.reason);
  expect(digestFor(1, [{ before: s, events: kill.events }])).toEqual([{ kind: 'unitLost', unitType: 'warrior', by: 'horseman' }]);
  expect(digestFor(0, [{ before: s, events: kill.events }])).toEqual([]);
  const s2 = blankMatch(); addCity(s2, 0, 0, 3); addCity(s2, 1, 0, -3);
  const r2 = addUnit(s2, 'horseman', 0, 0, 0); addUnit(s2, 'defender', 1, 1, 0);
  const hit = applyAction(s2, { type: 'attack', unit: r2.id, target: '1,0' }); if (!hit.ok) throw new Error(hit.reason);
  const dmg = (hit.events.find(e => e.type === 'attacked') as { damage: number }).damage;
  expect(digestFor(1, [{ before: s2, events: hit.events }])).toEqual([{ kind: 'unitHurt', unitType: 'defender', damage: dmg, by: 'horseman' }]);
  expect(digestFor(1, [{ before: s, events: [{ type: 'captured', city: mine.id, by: 0 }] }])).toEqual([{ kind: 'cityLost' }]);
});
