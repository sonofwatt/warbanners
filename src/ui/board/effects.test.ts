import { expect, test } from 'vitest';
import { applyAction } from '../../engine';
import type { GameEvent, MatchState } from '../../engine';
import { addCity, addUnit, blankMatch } from '../../engine/testkit';
import { EFFECT_MS, MAX_TOTAL_MS, effectsFor } from './effects';

function killPosition() {
  const s = blankMatch();
  addCity(s, 0, 0, 3);
  addCity(s, 1, 0, -3);
  const rider = addUnit(s, 'horseman', 0, 0, 0);
  addUnit(s, 'warrior', 1, 1, 0, { hp: 1 });
  addUnit(s, 'defender', 1, 0, -1);
  return { s, rider };
}

test('a killing blow: lunge, number, fall, in order', () => {
  const { s, rider } = killPosition();
  const r = applyAction(s, { type: 'attack', unit: rider.id, target: '1,0' });
  if (!r.ok) throw new Error(r.reason);
  const dmg = (r.events.find((e) => e.type === 'attacked') as { damage: number }).damage;
  const fx = effectsFor(r.events, s, r.state, new Set(Object.keys(s.tiles)));
  expect(fx).toContainEqual({ kind: 'lunge', unit: rider.id, toward: '1,0', delay: 0 });
  expect(fx).toContainEqual({ kind: 'number', at: '1,0', text: `-${dmg}`, tone: 'hurt', delay: 0 });
  expect(fx.find((f) => f.kind === 'fall')).toMatchObject({ unitType: 'warrior', owner: 1, at: '1,0' });
  expect(effectsFor(r.events, s, r.state, new Set(['0,0'])).filter((f) => 'at' in f && f.at === '1,0')).toEqual([]);
});

test('the fall comes 120 ms after the blow', () => {
  const { s, rider } = killPosition();
  const r = applyAction(s, { type: 'attack', unit: rider.id, target: '1,0' });
  if (!r.ok) throw new Error(r.reason);
  const fx = effectsFor(r.events, s, r.state, new Set(Object.keys(s.tiles)));
  expect(fx.find((f) => f.kind === 'fall')?.delay).toBe(120);
});

test('a counter-attack gives a number on the attacker 150 ms later', () => {
  const s = blankMatch();
  const a = addUnit(s, 'warrior', 0, 0, 0);
  addUnit(s, 'warrior', 1, 1, 0);
  const events: GameEvent[] = [{ type: 'attacked', unit: a.id, target: s.units[1]!.id, damage: 4, counter: 2 }];
  const fx = effectsFor(events, s, s, new Set(['0,0', '1,0']));
  expect(fx).toContainEqual({ kind: 'number', at: '1,0', text: '-4', tone: 'hurt', delay: 0 });
  expect(fx).toContainEqual({ kind: 'number', at: '0,0', text: '-2', tone: 'hurt', delay: 150 });
});

test('a heal shows the health actually gained', () => {
  const s = blankMatch();
  const healer = addUnit(s, 'warrior', 0, 0, 0);
  const hurt = addUnit(s, 'warrior', 0, 1, 0, { hp: 3 });
  const after: MatchState = structuredClone(s);
  after.units.find((u) => u.id === hurt.id)!.hp = 7;
  const events: GameEvent[] = [{ type: 'ability', unit: healer.id, ability: 'heal', target: '1,0' }];
  const fx = effectsFor(events, s, after, new Set(['1,0']));
  expect(fx).toEqual([{ kind: 'number', at: '1,0', text: '+4', tone: 'heal', delay: 0 }]);
});

test('the fall follows a unit that moved earlier in the list', () => {
  const s = blankMatch();
  const u = addUnit(s, 'archer', 1, 0, 0);
  const events: GameEvent[] = [
    { type: 'moved', unit: u.id, from: '0,0', to: '1,0' },
    { type: 'died', unit: u.id },
  ];
  const fx = effectsFor(events, s, s, new Set(['0,0', '1,0']));
  expect(fx).toEqual([{ kind: 'fall', unitType: 'archer', owner: 1, at: '1,0', delay: 0 }]);
});

test('building gives a burst and an unseen tile gives nothing', () => {
  const s = blankMatch();
  const events: GameEvent[] = [{ type: 'built', at: '2,0', what: 'road' }];
  expect(effectsFor(events, s, s, new Set(['2,0']))).toEqual([{ kind: 'burst', at: '2,0', tone: 'build', delay: 0 }]);
  expect(effectsFor(events, s, s, new Set(['0,0']))).toEqual([]);
});

test('a long list still finishes in time', () => {
  const s = blankMatch();
  const many: GameEvent[] = Array.from({ length: 30 }, () => ({ type: 'built', at: '0,0', what: 'road' as const }));
  const fx = effectsFor(many, s, s, new Set(['0,0']));
  expect(fx).toHaveLength(30);
  expect(Math.max(...fx.map((f) => f.delay)) + EFFECT_MS).toBeLessThanOrEqual(MAX_TOTAL_MS);
});

test('no lunge when the target tile is hidden, even if the attacker is seen', () => {
  const s = blankMatch();
  const a = addUnit(s, 'warrior', 0, 0, 0);
  const b = addUnit(s, 'warrior', 1, 1, 0);
  const events: GameEvent[] = [{ type: 'attacked', unit: a.id, target: b.id, damage: 4, counter: 2 }];
  const fx = effectsFor(events, s, s, new Set(['0,0']));
  expect(fx.some((f) => f.kind === 'lunge')).toBe(false);
  expect(JSON.stringify(fx)).not.toContain('1,0');
});

test('an event with every effect hidden does not use up a delay slot', () => {
  const s = blankMatch();
  const events: GameEvent[] = [
    { type: 'built', at: '5,0', what: 'road' },
    { type: 'built', at: '0,0', what: 'road' },
  ];
  expect(effectsFor(events, s, s, new Set(['0,0']))).toEqual([{ kind: 'burst', at: '0,0', tone: 'build', delay: 0 }]);
});
