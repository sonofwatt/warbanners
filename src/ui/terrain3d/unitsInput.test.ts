import { expect, test } from 'vitest';
import { createMatch, isHero, playerView, UNITS } from '../../engine';
import type { MatchState, PlayerId, Unit } from '../../engine';
import { ACCENT, playerColour } from '../art/palette';
import { buildScene } from '../board/scene';
import type { SceneUnit } from '../board/scene';
import { glUnitsOf, unitAlpha } from './unitsInput';

// The state-to-figure mapping of the 3D units: exactly the units the svg board draws for this viewer, in their
// owner's colours, heroes marked, and nothing the viewer cannot see.

const base = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
const clone = (s: MatchState): MatchState => structuredClone(s);
const scene = (s: MatchState, viewer: PlayerId, spent: ReadonlySet<number> = new Set()) =>
  buildScene({ view: playerView(s, viewer), radius: s.radius, marks: {}, selectedUnit: null, spentUnits: spent });
const sceneUnits = (items: ReturnType<typeof scene>) => items.filter((i): i is SceneUnit => i.kind === 'unit');

test('the figures are the scene units, where the svg draws them, in their owner faction colours', () => {
  const items = scene(base, 0);
  const { units } = glUnitsOf(items, ['spartans', 'mongols']);
  const svg = sceneUnits(items);
  expect(units.map((u) => u.id)).toEqual(svg.map((u) => u.unit.id));
  for (const [i, u] of units.entries()) {
    expect(u.type).toBe(svg[i]!.unit.type);
    expect({ x: u.x, y: u.y }).toEqual(svg[i]!.at);
    expect(u.look).toEqual({ ...playerColour('spartans'), accent: ACCENT.spartans });
  }
  const blue = glUnitsOf(scene(base, 1), ['spartans', 'mongols']).units;
  expect(blue.length).toBeGreaterThan(0);
  for (const u of blue) expect(u.look).toEqual({ ...playerColour('mongols'), accent: ACCENT.mongols });
});

test('a unit the viewer cannot see is not a figure: fog hides it from the 3D scene as from the svg', () => {
  expect(base.units.length).toBe(2);
  const mine = glUnitsOf(scene(base, 0), ['spartans', 'mongols']).units;
  expect(mine.map((u) => u.id)).toEqual(base.units.filter((u) => u.owner === 0).map((u) => u.id));
  // Put the other side's unit right next to ours: now it is seen, and drawn.
  const s = clone(base);
  const own = s.units.find((u) => u.owner === 0)!;
  const enemy = s.units.find((u) => u.owner === 1)!;
  const [q, r] = own.pos.split(',').map(Number) as [number, number];
  enemy.pos = `${q + 1},${r}`;
  const seen = glUnitsOf(scene(s, 0), ['spartans', 'mongols']).units;
  expect(new Set(seen.map((u) => u.id))).toEqual(new Set([own.id, enemy.id]));
});

test('heroes carry the pennant; spent and hidden own units dim as the svg figure does', () => {
  const s = clone(base);
  const own = s.units.find((u) => u.owner === 0)!;
  own.heroTraits = ['fierce', 'tireless', 'hardy', 'watchful'];
  expect(isHero(own as Unit)).toBe(true);
  const [u] = glUnitsOf(scene(s, 0, new Set([own.id])), ['spartans', 'mongols']).units;
  expect(u!.hero).toBe(true);
  expect(u!.alpha).toBe(0.55);
  const plain = glUnitsOf(scene(base, 0), ['spartans', 'mongols']).units[0]!;
  expect(plain.hero).toBe(false);
  const hidden = UNITS[plain.type].traits.includes('hidden');
  expect(plain.alpha, plain.type).toBe(hidden ? 0.7 : 1);
  expect(unitAlpha({ mine: true, spent: false, hidden: true })).toBe(0.7);
  expect(unitAlpha({ mine: false, spent: true, hidden: true }), 'an enemy figure is never dimmed').toBe(1);
});

test('the signature changes when a unit moves, changes or goes, and only then', () => {
  const a = glUnitsOf(scene(base, 0), ['spartans', 'mongols']);
  expect(glUnitsOf(scene(base, 0), ['spartans', 'mongols']).key).toBe(a.key);
  const moved = clone(base);
  const own = moved.units.find((u) => u.owner === 0)!;
  const [q, r] = own.pos.split(',').map(Number) as [number, number];
  own.pos = `${q + 1},${r}`;
  expect(glUnitsOf(scene(moved, 0), ['spartans', 'mongols']).key).not.toBe(a.key);
  const gone = clone(base);
  gone.units = gone.units.filter((u) => u.owner !== 0);
  const none = glUnitsOf(scene(gone, 0), ['spartans', 'mongols']);
  expect(none.units).toEqual([]);
  expect(none.key).not.toBe(a.key);
  expect(glUnitsOf(scene(base, 0), ['mongols', 'spartans']).key, 'a new owner colour rebuilds').not.toBe(a.key);
});
