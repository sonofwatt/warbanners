import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';
import { applyAction, playerView } from '../../engine';
import type { GameEvent, MatchState } from '../../engine';
import { addCity, addUnit, blankMatch } from '../../engine/testkit';
import { EFFECT_MS, MAX_TOTAL_MS, effectsFor, seenBy, watchMs } from './effects';

/** Every unit in either state: for the tests about tiles, where every unit is in sight. */
const everyone = (...states: MatchState[]): Set<number> => new Set(states.flatMap((x) => x.units.map((u) => u.id)));

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
  const fx = effectsFor(r.events, s, r.state, new Set(Object.keys(s.tiles)), everyone(s, r.state));
  expect(fx).toContainEqual({ kind: 'lunge', unit: rider.id, toward: '1,0', delay: 0 });
  expect(fx).toContainEqual({ kind: 'number', at: '1,0', text: `-${dmg}`, tone: 'hurt', delay: 0 });
  expect(fx.find((f) => f.kind === 'fall')).toMatchObject({ unitType: 'warrior', owner: 1, at: '1,0' });
  expect(effectsFor(r.events, s, r.state, new Set(['0,0']), everyone(s, r.state)).filter((f) => 'at' in f && f.at === '1,0')).toEqual([]);
});

test('the fall comes 120 ms after the blow', () => {
  const { s, rider } = killPosition();
  const r = applyAction(s, { type: 'attack', unit: rider.id, target: '1,0' });
  if (!r.ok) throw new Error(r.reason);
  const fx = effectsFor(r.events, s, r.state, new Set(Object.keys(s.tiles)), everyone(s, r.state));
  expect(fx.find((f) => f.kind === 'fall')?.delay).toBe(120);
});

test('a counter-attack gives a number on the attacker 150 ms later', () => {
  const s = blankMatch();
  const a = addUnit(s, 'warrior', 0, 0, 0);
  addUnit(s, 'warrior', 1, 1, 0);
  const events: GameEvent[] = [{ type: 'attacked', unit: a.id, target: s.units[1]!.id, damage: 4, counter: 2 }];
  const fx = effectsFor(events, s, s, new Set(['0,0', '1,0']), everyone(s, s));
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
  const fx = effectsFor(events, s, after, new Set(['1,0']), everyone(s, after));
  expect(fx).toEqual([{ kind: 'number', at: '1,0', text: '+4', tone: 'heal', delay: 0 }]);
});

test('the fall follows a unit that moved earlier in the list', () => {
  const s = blankMatch();
  const u = addUnit(s, 'archer', 1, 0, 0);
  const events: GameEvent[] = [
    { type: 'moved', unit: u.id, from: '0,0', to: '1,0' },
    { type: 'died', unit: u.id },
  ];
  const fx = effectsFor(events, s, s, new Set(['0,0', '1,0']), everyone(s, s));
  expect(fx).toEqual([{ kind: 'fall', unitType: 'archer', owner: 1, at: '1,0', delay: 0 }]);
});

test('building gives a burst and an unseen tile gives nothing', () => {
  const s = blankMatch();
  const events: GameEvent[] = [{ type: 'built', at: '2,0', what: 'road' }];
  expect(effectsFor(events, s, s, new Set(['2,0']), everyone(s, s))).toEqual([{ kind: 'burst', at: '2,0', tone: 'build', delay: 0 }]);
  expect(effectsFor(events, s, s, new Set(['0,0']), everyone(s, s))).toEqual([]);
});

test('a long list still finishes in time', () => {
  const s = blankMatch();
  const many: GameEvent[] = Array.from({ length: 30 }, () => ({ type: 'built', at: '0,0', what: 'road' as const }));
  const fx = effectsFor(many, s, s, new Set(['0,0']), everyone(s, s));
  expect(fx).toHaveLength(30);
  expect(Math.max(...fx.map((f) => f.delay)) + EFFECT_MS).toBeLessThanOrEqual(MAX_TOTAL_MS);
});

test('no lunge when the target tile is hidden, even if the attacker is seen', () => {
  const s = blankMatch();
  const a = addUnit(s, 'warrior', 0, 0, 0);
  const b = addUnit(s, 'warrior', 1, 1, 0);
  const events: GameEvent[] = [{ type: 'attacked', unit: a.id, target: b.id, damage: 4, counter: 2 }];
  const fx = effectsFor(events, s, s, new Set(['0,0']), everyone(s, s));
  expect(fx.some((f) => f.kind === 'lunge')).toBe(false);
  expect(JSON.stringify(fx)).not.toContain('1,0');
});

test('an event with every effect hidden does not use up a delay slot', () => {
  const s = blankMatch();
  const events: GameEvent[] = [
    { type: 'built', at: '5,0', what: 'road' },
    { type: 'built', at: '0,0', what: 'road' },
  ];
  expect(effectsFor(events, s, s, new Set(['0,0']), everyone(s, s))).toEqual([{ kind: 'burst', at: '0,0', tone: 'build', delay: 0 }]);
});

// A Spartan Scout is hidden: it shows only to a unit or city right next to it, even on a visible tile.
function hiddenScout(spotted: boolean) {
  const s = blankMatch({ factions: ['mongols', 'spartans'] });
  addCity(s, 0, 0, 0);
  const viewer = addUnit(s, 'warrior', 0, 0, 0);
  const archer = addUnit(s, 'archer', 0, 1, 0);
  const scout = addUnit(s, 'scout', 1, 2, 0);
  if (spotted) archer.pos = '1,0';
  else archer.pos = '0,1';
  const view = playerView(s, 0);
  const seen = new Set(view.units.map((u) => u.id));
  return { s, viewer, scout, visible: new Set(view.visible), seen, spotted: view.units.some((u) => u.id === scout.id) };
}

test('a hidden enemy on a visible tile gets no number, lunge or fall', () => {
  const { s, viewer, scout, visible, seen, spotted } = hiddenScout(false);
  expect(visible.has('2,0')).toBe(true);
  expect(spotted).toBe(false);
  const events: GameEvent[] = [
    { type: 'attacked', unit: viewer.id, target: scout.id, damage: 2, counter: 1 },
    { type: 'splashed', target: scout.id, damage: 1 },
    { type: 'died', unit: scout.id },
  ];
  const fx = effectsFor(events, s, s, visible, seen);
  expect(JSON.stringify(fx)).not.toContain('2,0');
  expect(fx.some((f) => f.kind === 'lunge' || f.kind === 'fall')).toBe(false);
  // The counter on the viewer's own unit still shows, in the first slot.
  expect(fx).toEqual([{ kind: 'number', at: '0,0', text: '-1', tone: 'hurt', delay: 150 }]);
});

test('the same hidden enemy, spotted by a unit next to it, gets its number', () => {
  const { s, scout, visible, seen, spotted } = hiddenScout(true);
  expect(spotted).toBe(true);
  const fx = effectsFor([{ type: 'splashed', target: scout.id, damage: 1 }], s, s, visible, seen);
  expect(fx).toEqual([{ kind: 'number', at: '2,0', text: '-1', tone: 'hurt', delay: 0 }]);
});

test('seenBy works an action out once: the store and the match screen ask about the same action and share the answer', () => {
  const { s, rider } = killPosition();
  const r = applyAction(s, { type: 'attack', unit: rider.id, target: '1,0' });
  if (!r.ok) throw new Error(r.reason);
  const first = seenBy(s, r.state, 0);
  expect(seenBy(s, r.state, 0)).toBe(first);
  expect(first.visible).toEqual(new Set(playerView(r.state, 0).visible));
  expect(first.seenUnits).toEqual(new Set([...playerView(s, 0).units, ...playerView(r.state, 0).units].map((u) => u.id)));
  // Another viewer or another state before is a different question.
  expect(seenBy(s, r.state, 1)).not.toBe(first);
  expect(seenBy(s, r.state, 1).visible).toEqual(new Set(playerView(r.state, 1).visible));
  const other = applyAction(s, { type: 'endTurn' });
  if (!other.ok) throw new Error(other.reason);
  expect(seenBy(other.state, r.state, 0)).not.toBe(seenBy(s, r.state, 0));
});

/** A match played for `actions` turn ends, asking seenBy about each one as the store does. Only the last state is returned. */
function askedChain(actions: number): { last: MatchState; earlier: WeakRef<MatchState>[] } {
  let state = killPosition().s;
  const earlier: WeakRef<MatchState>[] = [];
  for (let i = 0; i < actions; i++) {
    const r = applyAction(state, { type: 'endTurn' });
    if (!r.ok) throw new Error(r.reason);
    seenBy(state, r.state, 0);
    seenBy(state, r.state, 1);
    earlier.push(new WeakRef(state));
    state = r.state;
  }
  return { last: state, earlier };
}

test('seenBy keeps no earlier state alive: while the latest state lives, the states before it can still be freed', async () => {
  setFlagsFromString('--expose-gc');
  const gc = runInNewContext('gc') as () => void;
  const { last, earlier } = askedChain(6);
  // A WeakRef holds its target until the current job ends.
  await new Promise((r) => setTimeout(r, 0));
  gc();
  expect(earlier.filter((w) => w.deref() !== undefined).length).toBe(0);
  expect(last.units.length).toBeGreaterThan(0);   // the latest state was alive through the collection
});

test('a melee kill slides the killer into the tile: the fall is drawn where the victim stood, and the viewer waits for the slide', () => {
  const { s, rider } = killPosition();
  const r = applyAction(s, { type: 'attack', unit: rider.id, target: '1,0' });
  if (!r.ok) throw new Error(r.reason);
  expect(r.events).toContainEqual({ type: 'advanced', unit: rider.id, from: '0,0', to: '1,0' });
  const fx = effectsFor(r.events, s, r.state, new Set(Object.keys(s.tiles)), everyone(s, r.state));
  expect(fx.find((f) => f.kind === 'fall')).toMatchObject({ at: '1,0' });
  expect(watchMs([{ type: 'advanced', unit: rider.id, from: '0,0', to: '1,0' }], s, r.state, 1)).toBe(EFFECT_MS);
});
test('an advance by a unit the viewer never sees is not waited for', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const scout = addUnit(s, 'scout', 0, 3, -1);
  const after = structuredClone(s); after.units.find((u) => u.id === scout.id)!.pos = '3,0';
  expect(playerView(after, 1).units.some((u) => u.id === scout.id)).toBe(false);
  expect(watchMs([{ type: 'advanced', unit: scout.id, from: '3,-1', to: '3,0' }], s, after, 1)).toBe(0);
});
