import { expect, test } from 'vitest';
import { applyAction, createMatch } from '../../engine';
import type { Action, MatchState } from '../../engine';
import { addCity, addUnit, blankMatch, setTile } from '../../engine/testkit';
import { addAction, advance, dirTo, extends_, hexLine, ROAD_STEPS, roadWearOf, startTraffic, stepOf, wearOf } from './roadWear';
import type { Passes } from './roadWear';

function must(r: ReturnType<typeof applyAction>): Extract<ReturnType<typeof applyAction>, { ok: true }> {
  if (!r.ok) throw new Error(r.reason);
  return r;
}
// The unit's owner moves it (the test puts its seat on turn).
function move(s: MatchState, unit: number, to: string): { before: MatchState; after: MatchState; events: ReturnType<typeof must>['events'] } {
  s.current = s.units.find((u) => u.id === unit)!.owner;
  const r = must(applyAction(s, { type: 'move', unit, to }));
  return { before: s, after: r.state, events: r.events };
}
/** A blank board with a road along row 0 from -4,0 to 4,0. */
function roadMatch(): MatchState {
  const s = blankMatch({ radius: 6 });
  for (let q = -4; q <= 4; q++) setTile(s, q, 0, { road: true });
  return s;
}
const passesOf = (s: MatchState, unit: number, to: string): [Passes, Passes] => {
  const { before, after, events } = move(s, unit, to);
  const p: [Passes, Passes] = [new Map(), new Map()];
  addAction(p, events, before, after);
  return p;
};
const keys = (p: Passes): string[] => [...p.keys()].sort();

test('a straight hex line joins neighbours from end to end', () => {
  expect(hexLine('0,0', '0,0')).toEqual(['0,0']);
  expect(hexLine('0,0', '3,0')).toEqual(['0,0', '1,0', '2,0', '3,0']);
  const l = hexLine('-2,1', '2,-1');
  expect([l[0], l[l.length - 1]]).toEqual(['-2,1', '2,-1']);
  for (let i = 1; i < l.length; i++) expect(dirTo(l[i - 1]!, l[i]!)).toBeGreaterThanOrEqual(0);
});

test('a move counts a pass on each road tile of its straight line, and on nothing else', () => {
  const s = roadMatch();
  setTile(s, 1, -1, { road: false });
  const k = addUnit(s, 'knight', 0, -1, 0);
  const p = passesOf(s, k.id, '2,0');
  expect(keys(p[0])).toEqual(['-1,0', '0,0', '1,0', '2,0']);
  expect(p[0].get('0,0')).toBe(1);
  // Off the road nothing is counted.
  const s2 = blankMatch({ radius: 6 });
  const w = addUnit(s2, 'knight', 0, 0, 0);
  expect(passesOf(s2, w.id, '2,0')[0].size).toBe(0);
});

test('a city on the road takes no wear', () => {
  const s = roadMatch();
  addCity(s, 0, 1, 0);
  const k = addUnit(s, 'knight', 0, -1, 0);
  expect(keys(passesOf(s, k.id, '2,0')[0])).toEqual(['-1,0', '0,0', '2,0']);
});

test('wear steps: a light road until busy, then wider in a few steps, capped', () => {
  expect(stepOf(0)).toBe(0);
  expect(stepOf(ROAD_STEPS[0]! - 1)).toBe(0);
  expect(stepOf(ROAD_STEPS[0]!)).toBe(1);
  expect(stepOf(ROAD_STEPS[1]!)).toBe(2);
  expect(stepOf(ROAD_STEPS[2]!)).toBe(3);
  expect(stepOf(10_000)).toBe(3);
  const p: Passes = new Map([['0,0', ROAD_STEPS[0]! - 1], ['1,0', ROAD_STEPS[1]!]]);
  expect([...wearOf(p)]).toEqual([['1,0', 2]]); // a light road is left out
  // The step changes only three times however busy a road gets, so its ground is rebuilt only then.
  let changes = 0;
  for (let n = 1; n < 200; n++) if (stepOf(n) !== stepOf(n - 1)) changes++;
  expect(changes).toBe(ROAD_STEPS.length);
});

// The fog rule: an enemy's move counts only where the viewer saw it happen.
test('an enemy on a road in the fog adds nothing for the viewer; its owner counts all of it', () => {
  const s = roadMatch();
  addUnit(s, 'warrior', 0, -4, 3); // far away, sight 1
  const e = addUnit(s, 'knight', 1, 1, 0);
  const p = passesOf(s, e.id, '3,0');
  expect(p[0].size).toBe(0);
  expect(keys(p[1])).toEqual(['1,0', '2,0', '3,0']);
});

test('an enemy seen moving counts only on the road tiles the viewer saw', () => {
  const s = roadMatch();
  addUnit(s, 'warrior', 0, -3, 1); // sees -2,0 and -3,0 (sight 1)
  addUnit(s, 'archer', 0, 3, 0); // sees 1,0 (sight 2); 0,0 and -1,0 are seen by neither
  const e = addUnit(s, 'knight', 1, -2, 0);
  const p = passesOf(s, e.id, '1,0');
  expect(keys(p[0])).toEqual(['-2,0', '1,0']);
  expect(keys(p[1])).toEqual(['-1,0', '-2,0', '0,0', '1,0']);
});

test('an enemy walking out of sight, or out of the fog, adds nothing', () => {
  const s = roadMatch();
  addUnit(s, 'archer', 0, -2, 2); // sees 0,0 (sight 2), not 1,0 or beyond
  const out = addUnit(s, 'knight', 1, 0, 0);
  expect(passesOf(s, out.id, '3,0')[0].size).toBe(0);
  const s2 = roadMatch();
  addUnit(s2, 'archer', 0, -2, 2);
  const inn = addUnit(s2, 'knight', 1, 3, 0);
  expect(passesOf(s2, inn.id, '0,0')[0].size).toBe(0);
});

test('a real match: wear only on roads the viewer explored, the same from one replay or step by step', () => {
  const settings = { seed: 3, factions: ['spartans', 'mongols'] as ['spartans', 'mongols'] };
  let s = createMatch(settings);
  // Each unit's first legal step, then end turn: a test of the replay, not of the rules.
  const actions: Action[] = [];
  for (let turn = 0; turn < 10; turn++) {
    for (const u of s.units.filter((x) => x.owner === s.current)) {
      for (const [dq, dr] of [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]] as const) {
        const [q, r] = u.pos.split(',').map(Number) as [number, number];
        const a: Action = { type: 'move', unit: u.id, to: `${q + dq},${r + dr}` };
        const res = applyAction(s, a);
        if (res.ok) { s = res.state; actions.push(a); break; }
      }
    }
    s = must(applyAction(s, { type: 'endTurn' })).state;
    actions.push({ type: 'endTurn' });
  }
  for (const viewer of [0, 1] as const) {
    const wear = roadWearOf(settings, actions, viewer);
    const explored = new Set(s.players[viewer]!.explored);
    for (const k of wear.keys()) { expect(explored.has(k), k).toBe(true); expect(s.tiles[k]!.road, k).toBe(true); }
  }
  const t = startTraffic(settings);
  for (let i = 1; i <= actions.length; i++) {
    expect(extends_(t, settings, actions.slice(0, i))).toBe(true);
    advance(t, actions.slice(0, i));
  }
  const whole = startTraffic(settings);
  advance(whole, actions);
  expect([...t.passes[0]].sort()).toEqual([...whole.passes[0]].sort());
  expect([...t.passes[1]].sort()).toEqual([...whole.passes[1]].sort());
  // A record that does not extend this one (another match, a changed action) starts again.
  expect(extends_(t, { ...settings, seed: 4 }, actions)).toBe(false);
  expect(extends_(t, settings, [...actions.slice(0, -1), { type: 'resign' }])).toBe(false);
});

test('a replay in slices stops when its time is up and picks up where it left', () => {
  const settings = { seed: 3, factions: ['spartans', 'mongols'] as ['spartans', 'mongols'] };
  const actions: Action[] = [{ type: 'endTurn' }, { type: 'endTurn' }, { type: 'endTurn' }];
  const t = startTraffic(settings);
  let now = 0;
  expect(advance(t, actions, 1, () => (now += 5))).toBe(false);
  expect(t.count).toBe(1);
  expect(advance(t, actions)).toBe(true);
  expect(t.count).toBe(3);
});
