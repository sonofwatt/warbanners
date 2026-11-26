import { expect, test } from 'vitest';
import { applyAction, createMatch } from '../../engine';
import type { Action, MatchState } from '../../engine';
import { addUnit, blankMatch, setTile } from '../../engine/testkit';
import {
  addAction, addPass, advance, dirTo, extends_, hexLine, KIND_STEPS, kindOf, lookCode, looksOf, PATH_STEPS, ROAD_STEPS, startTraffic, tracksOf,
} from './tracks';
import type { Wear } from './tracks';

// The unit's owner moves it (the test puts its seat on turn).
const move = (s: MatchState, unit: number, to: string): { before: MatchState; after: MatchState; events: ReturnType<typeof must>['events'] } => {
  s.current = s.units.find((u) => u.id === unit)!.owner;
  const r = must(applyAction(s, { type: 'move', unit, to }));
  return { before: s, after: r.state, events: r.events };
};
function must(r: ReturnType<typeof applyAction>): Extract<ReturnType<typeof applyAction>, { ok: true }> {
  if (!r.ok) throw new Error(r.reason);
  return r;
}

test('a straight hex line joins neighbours from end to end', () => {
  expect(hexLine('0,0', '0,0')).toEqual(['0,0']);
  expect(hexLine('0,0', '3,0')).toEqual(['0,0', '1,0', '2,0', '3,0']);
  const l = hexLine('-2,1', '2,-1');
  expect(l[0]).toBe('-2,1');
  expect(l[l.length - 1]).toBe('2,-1');
  for (let i = 1; i < l.length; i++) expect(dirTo(l[i - 1]!, l[i]!)).toBeGreaterThanOrEqual(0);
  // Every phone rounds a line along a seam the same way.
  expect(hexLine('0,0', '2,-1')).toEqual(hexLine('0,0', '2,-1'));
});

test('unit types leave their own kind of mark; a scout weighs half', () => {
  expect(kindOf('warrior')).toEqual({ kind: 'foot', weight: 1 });
  expect(kindOf('scout')).toEqual({ kind: 'foot', weight: 0.5 });
  expect(kindOf('knight').kind).toBe('hoof');
  expect(kindOf('horseArcher').kind).toBe('hoof');
  expect(kindOf('catapult').kind).toBe('wheel');
  expect(kindOf('camp').kind).toBe('wheel');
});

test('a move counts on each tile of its straight line, with the edges it crossed', () => {
  const s = blankMatch({ radius: 4 });
  const k = addUnit(s, 'knight', 0, 0, 0);
  const { before, after, events } = move(s, k.id, '2,0');
  const wears: [Wear, Wear] = [new Map(), new Map()];
  addAction(wears, events, before, after);
  const looks = looksOf(wears[0]);
  expect([...looks.keys()].sort()).toEqual(['0,0', '1,0', '2,0']);
  // The start goes out east (direction 0), the middle crosses east-west, the end came in from the west (3).
  expect(looks.get('0,0')!.hoof).toEqual({ level: 1, edges: 1 << 0 });
  expect(looks.get('1,0')!.hoof).toEqual({ level: 1, edges: (1 << 0) | (1 << 3) });
  expect(looks.get('2,0')!.hoof).toEqual({ level: 1, edges: 1 << 3 });
  expect(looks.get('1,0')!.foot.level).toBe(0);
});

test('nothing is counted on water', () => {
  const s = blankMatch({ radius: 4 });
  setTile(s, 1, 0, { terrain: 'water' });
  const wear: Wear = new Map();
  const w = addUnit(s, 'warrior', 0, 0, 0);
  // A route along the line through the water tile (as a straight line between two land tiles can).
  addAction([wear, new Map()], [{ type: 'moved', unit: w.id, from: '0,0', to: '2,0' }], s, s);
  expect(wear.has('1,0')).toBe(false);
  expect(wear.has('0,0') && wear.has('2,0')).toBe(true);
});

test('wear steps: a few faint marks after one pass, trodden after many, capped', () => {
  const wear: Wear = new Map();
  const levels: number[] = [];
  for (let i = 0; i < 50; i++) {
    addPass(wear, '0,0', 'foot', 1, 3, 0);
    levels.push(looksOf(wear).get('0,0')!.foot.level);
  }
  expect(levels[0]).toBe(1);
  expect(Math.max(...levels)).toBe(KIND_STEPS.length);
  expect(levels[49]).toBe(3);
  // A level only changes at a step, so the 3D ground is rebuilt only then.
  const changes = levels.filter((l, i) => i > 0 && l !== levels[i - 1]).length;
  expect(changes).toBe(KIND_STEPS.length - 1);
  const look = looksOf(wear).get('0,0')!;
  expect(look.path).toBe(PATH_STEPS.length);
  expect(look.road).toBe(ROAD_STEPS.length);
});

test('a scout alone leaves fainter tracks than a warrior', () => {
  const a: Wear = new Map(), b: Wear = new Map();
  for (let i = 0; i < 4; i++) { addPass(a, '0,0', 'foot', 1, 3, 0); addPass(b, '0,0', 'foot', kindOf('scout').weight, 3, 0); }
  expect(looksOf(b).get('0,0')!.foot.level).toBeLessThan(looksOf(a).get('0,0')!.foot.level);
});

test('a kind keeps its edges between steps: a new direction shows only at the next step', () => {
  const wear: Wear = new Map();
  addPass(wear, '0,0', 'foot', 1, 3, 0);
  const code = lookCode(looksOf(wear).get('0,0')!);
  addPass(wear, '0,0', 'foot', 1, 1, 4);
  expect(lookCode(looksOf(wear).get('0,0')!)).toBe(code);
  for (let i = 0; i < 4; i++) addPass(wear, '0,0', 'foot', 1, 1, 4);
  expect(looksOf(wear).get('0,0')!.foot.edges & (1 << 1)).not.toBe(0);
});

test('road wear: a light road stays light, a busy one widens in steps', () => {
  const wear: Wear = new Map();
  const roads: number[] = [];
  for (let i = 0; i < 50; i++) { addPass(wear, '0,0', 'foot', 1, 0, 3); roads.push(looksOf(wear).get('0,0')!.road); }
  expect(roads[ROAD_STEPS[0]! - 2]).toBe(0);
  expect(roads[ROAD_STEPS[0]! - 1]).toBe(1);
  expect(roads[49]).toBe(3);
});

// The fog rule: an enemy's move leaves tracks only where the viewer saw it happen.
test('an enemy moving through the fog leaves no tracks for the viewer; its owner sees all of them', () => {
  const s = blankMatch({ radius: 6 });
  addUnit(s, 'warrior', 0, -5, 0); // player 0 watches from far west, sight 1
  const e = addUnit(s, 'warrior', 1, 4, 0);
  const { before, after, events } = move(s, e.id, '5,0');
  const wears: [Wear, Wear] = [new Map(), new Map()];
  addAction(wears, events, before, after);
  expect(wears[0].size).toBe(0);
  expect(wears[1].has('4,0') && wears[1].has('5,0')).toBe(true);
});

test('an enemy seen moving leaves tracks only on the tiles the viewer saw', () => {
  const s = blankMatch({ radius: 6 });
  addUnit(s, 'warrior', 0, -3, 0); // sees -2,0 (sight 1)
  addUnit(s, 'archer', 0, 3, 0); // sees 1,0 (sight 2); 0,0 and -1,0 are seen by neither
  const e = addUnit(s, 'knight', 1, -2, 0);
  const { before, after, events } = move(s, e.id, '1,0');
  const wears: [Wear, Wear] = [new Map(), new Map()];
  addAction(wears, events, before, after);
  expect([...wears[0].keys()].sort()).toEqual(['-2,0', '1,0']);
  expect([...wears[1].keys()].sort()).toEqual(['-1,0', '-2,0', '0,0', '1,0']);
});

test('an enemy walking out of sight, or out of the fog, leaves nothing', () => {
  const s = blankMatch({ radius: 6 });
  addUnit(s, 'warrior', 0, 0, 0); // sight 1
  const out = addUnit(s, 'knight', 1, 1, 0);
  const a = move(s, out.id, '3,0');
  const wears: [Wear, Wear] = [new Map(), new Map()];
  addAction(wears, a.events, a.before, a.after);
  expect(wears[0].size).toBe(0);
  const s2 = blankMatch({ radius: 6 });
  addUnit(s2, 'warrior', 0, 0, 0);
  const inn = addUnit(s2, 'knight', 1, 3, 0);
  const b = move(s2, inn.id, '1,0');
  const w2: [Wear, Wear] = [new Map(), new Map()];
  addAction(w2, b.events, b.before, b.after);
  expect(w2[0].size).toBe(0);
});

test('a real match: tracks only on explored tiles, the same from one replay or step by step', () => {
  const settings = { seed: 3, factions: ['spartans', 'mongols'] as ['spartans', 'mongols'] };
  let s = createMatch(settings);
  const actions: Action[] = [];
  // A few turns of the first legal move of each unit, then end turn.
  for (let turn = 0; turn < 8; turn++) {
    for (const u of s.units.filter((x) => x.owner === s.current)) {
      for (const to of ['1,0', '0,1', '-1,1', '-1,0', '0,-1', '1,-1']) {
        const [dq, dr] = to.split(',').map(Number) as [number, number];
        const [q, r] = u.pos.split(',').map(Number) as [number, number];
        const a: Action = { type: 'move', unit: u.id, to: `${q + dq},${r + dr}` };
        const res = applyAction(s, a);
        if (res.ok) { s = res.state; actions.push(a); break; }
      }
    }
    const res = must(applyAction(s, { type: 'endTurn' }));
    s = res.state;
    actions.push({ type: 'endTurn' });
  }
  for (const viewer of [0, 1] as const) {
    const looks = tracksOf(settings, actions, viewer);
    expect(looks.size).toBeGreaterThan(0);
    const explored = new Set(s.players[viewer]!.explored);
    for (const k of looks.keys()) expect(explored.has(k), k).toBe(true);
    for (const k of looks.keys()) expect(s.tiles[k]!.terrain).not.toBe('water');
  }
  const t = startTraffic(settings);
  for (let i = 1; i <= actions.length; i++) {
    expect(extends_(t, settings, actions.slice(0, i))).toBe(true);
    advance(t, actions.slice(0, i));
  }
  expect([...looksOf(t.wears[0])].map(([k, l]) => `${k}${lookCode(l)}`)).toEqual([...tracksOf(settings, actions, 0)].map(([k, l]) => `${k}${lookCode(l)}`));
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
