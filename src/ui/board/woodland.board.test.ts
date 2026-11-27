import { expect, test } from 'vitest';
import { applyAction, isHidden, playerView } from '../../engine';
import type { MatchState } from '../../engine';
import { addUnit, blankMatch, give, setTile } from '../../engine/testkit';
import { effectsFor, seenBy } from './effects';
import { buildScene } from './scene';
import type { SceneTile, SceneUnit } from './scene';

const run = (s: MatchState, a: Parameters<typeof applyAction>[1]) => { const r = applyAction(s, a); if (!r.ok) throw new Error(r.reason); return r; };

test('rules 11: a shot from a hidden Skirmisher shows the hit on its target and nothing of where it came from', () => {
  const s = blankMatch({ factions: ['woodland', 'mongols'] }); give(s, 0, 'archery');
  setTile(s, 0, 0, { terrain: 'forest' });
  const sk = addUnit(s, 'skirmisher', 0, 0, 0); const w = addUnit(s, 'warrior', 1, 2, 0);
  const r = run(s, { type: 'attack', unit: sk.id, target: '2,0' });
  const { visible, seenUnits, visibleBefore } = seenBy(s, r.state, 1);
  expect(seenUnits.has(sk.id)).toBe(false);
  const fx = effectsFor(r.events, s, r.state, visible, seenUnits, 1, visibleBefore);
  expect(fx.filter((f) => f.kind === 'lunge')).toEqual([]);
  expect(fx.every((f) => !('at' in f) || f.at === w.pos)).toBe(true);
  expect(JSON.stringify(fx)).not.toContain('"0,0"');
  expect(fx).toContainEqual(expect.objectContaining({ kind: 'number', at: '2,0', tone: 'hurt' }));
});

test('a Dash-strike plays the arrow as a lunge and the charge as a run out to the charge tile and back', () => {
  const s = blankMatch({ factions: ['woodland', 'spartans'] }); give(s, 0, 'archery');
  const sk = addUnit(s, 'skirmisher', 0, 0, 0); const h = addUnit(s, 'hoplite', 1, 1, 1);
  const r = run(s, { type: 'attack', unit: sk.id, target: '1,1', dash: true });
  const all = new Set(Object.keys(s.tiles));
  const fx = effectsFor(r.events, s, r.state, all, new Set([sk.id, h.id]), 0, all);
  const lunges = fx.filter((f) => f.kind === 'lunge');
  expect(lunges).toHaveLength(2);
  expect(lunges[0]).not.toHaveProperty('via');
  expect(lunges[1]).toMatchObject({ from: '0,0', toward: '1,1', via: '1,0' });
  expect(r.state.units.find((u) => u.id === sk.id)!.pos).toBe('0,0');   // the board ends on the engine's tile
});

function sceneFor(s: MatchState, viewer: number, hidden: Set<number>) {
  return buildScene({ view: playerView(s, viewer), radius: s.radius, marks: {}, selectedUnit: null, spentUnits: new Set(), hiddenUnits: hidden });
}

test('the owner sees the eye on its Woodland unit in a forest and its own snares; the other side sees neither', () => {
  const s = blankMatch({ factions: ['woodland', 'mongols'] });
  setTile(s, 0, 0, { terrain: 'forest' });
  const sk = addUnit(s, 'skirmisher', 0, 0, 0); addUnit(s, 'horseman', 1, 1, 0);   // next to it: it sees the Skirmisher
  s.snares = [{ owner: 0, at: '-1,1' }];
  expect(isHidden(s, sk)).toBe(true);
  const own = sceneFor(s, 0, new Set([sk.id]));
  expect((own.find((i) => i.kind === 'unit' && i.unit.id === sk.id) as SceneUnit).hidden).toBe(true);
  expect(own.filter((i): i is SceneTile => i.kind === 'tile' && i.snare === true).map((t) => t.key)).toEqual(['-1,1']);
  // The Mongol side: the Skirmisher is in its view (a rider beside it) but never marked hidden, and no snare.
  const theirs = sceneFor(s, 1, new Set([sk.id]));
  expect((theirs.find((i) => i.kind === 'unit' && i.unit.id === sk.id) as SceneUnit).hidden).toBe(false);
  expect(theirs.some((i) => i.kind === 'tile' && i.snare === true)).toBe(false);
});
