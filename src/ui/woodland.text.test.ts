import { expect, test } from 'vitest';
import { ABILITIES, applyAction, legalActions } from '../engine';
import type { GameEvent, MatchState, Trait } from '../engine';
import { addUnit, blankMatch, give, setTile } from '../engine/testkit';
import { digestFor } from '../app/digest';
import { indexActions, tap } from './interaction';
import { unitCommands } from './panels/commands';
import { T, digestText, techName, unlocks } from './text';
import { playerView } from '../engine';

const dashes = /[\u2013\u2014]/;

test('rules 11: every Woodland unit, trait and ability has its own text, with no dashes', () => {
  for (const u of ['skirmisher', 'woodlandHunter', 'warChief', 'smokeKeeper', 'trapper'] as const) {
    expect(T.unit[u].name.length).toBeGreaterThan(0); expect(T.unit[u].blurb).not.toMatch(dashes);
  }
  for (const t of ['bow', 'agile', 'ambush', 'dashStrike', 'forestEye', 'noMountainRange', 'guide', 'smoke', 'snare'] as Trait[]) {
    expect(T.trait[t].blurb.length).toBeGreaterThan(0); expect(T.trait[t].blurb).not.toMatch(dashes);
  }
  for (const a of ABILITIES) expect(T.ability[a].blurb).not.toMatch(dashes);
  for (const s of [T.ui.shoot, T.ui.attackDash, T.ui.digestSnared, T.ui.digestSnaredDied, T.faction.woodland]) expect(s).not.toMatch(dashes);
});

test('the Woodland walls are a Palisade, and Archery opens the Woodland Hunter, never the Archer, for them', () => {
  expect(techName('walls', 'woodland')).toBe('Palisade');
  expect(techName('walls', 'mongols')).toBe(T.tech.walls);
  expect(unlocks('archery', 'woodland')).toContain(T.unit.woodlandHunter.name);
  expect(unlocks('archery', 'woodland')).not.toContain(T.unit.archer.name);
  expect(unlocks('archery', 'spartans')).toContain(T.unit.archer.name);
  expect(unlocks('archery', 'spartans')).not.toContain(T.unit.woodlandHunter.name);
});

// A Skirmisher with Archery on 0,0 and a Spartan Warrior on 1,1 (distance 2), with free fields between.
function dashBoard(): { s: MatchState; sk: number } {
  const s = blankMatch({ factions: ['woodland', 'spartans'] }); give(s, 0, 'archery');
  const sk = addUnit(s, 'skirmisher', 0, 0, 0).id; addUnit(s, 'warrior', 1, 1, 1);
  return { s, sk };
}

test('the card asks Shoot or Dash-strike for a target the Skirmisher can dash at; a second tap shoots', () => {
  const { s, sk } = dashBoard();
  const ix = indexActions(legalActions(s));
  expect(ix.dashes[sk]).toEqual(['1,1']);
  expect(ix.attacks[sk]).toContain('1,1');
  const view = playerView(s, 0);
  const sel = { kind: 'unit' as const, id: sk, armed: null, askLure: null };
  const first = tap(sel, { hex: '1,1', unit: null }, view, ix);
  expect(first.action).toBeNull();
  expect(first.selection).toMatchObject({ askLure: '1,1' });
  const cmds = unitCommands(first.selection as typeof sel & { askLure: string }, s, ix);
  expect(cmds.map((c) => [c.id, c.label])).toEqual([['attack', T.ui.shoot], ['attack-dash', T.ui.attackDash]]);
  expect(cmds[1]!.action).toEqual({ type: 'attack', unit: sk, target: '1,1', dash: true });
  expect(tap(first.selection, { hex: '1,1', unit: null }, view, ix).action).toEqual({ type: 'attack', unit: sk, target: '1,1' });
});

test('a target with no Dash-strike is attacked on the first tap, as before', () => {
  const { s, sk } = dashBoard();
  s.players[0]!.techs = s.players[0]!.techs.filter((t) => t !== 'archery');
  addUnit(s, 'warrior', 1, 1, 0);   // next to the Skirmisher
  const ix = indexActions(legalActions(s));
  expect(ix.dashes[sk] ?? []).toEqual([]);
  const r = tap({ kind: 'unit', id: sk, armed: null, askLure: null }, { hex: '1,0', unit: null }, playerView(s, 0), ix);
  expect(r.action).toEqual({ type: 'attack', unit: sk, target: '1,0' });
});

const step = (s: MatchState, a: Parameters<typeof applyAction>[1]): { before: MatchState; after: MatchState; events: GameEvent[] } => {
  const r = applyAction(s, a); if (!r.ok) throw new Error(r.reason);
  return { before: s, after: r.state, events: r.events };
};

test('the report names a hidden attacker\'s kind, never its tile, and tells a Dash-strike as one hit', () => {
  // A Woodland Skirmisher hidden on a forest shoots a Mongol Warrior 2 away that cannot see it.
  const s = blankMatch({ factions: ['woodland', 'mongols'] }); give(s, 0, 'archery');
  setTile(s, 0, 0, { terrain: 'forest' });
  const sk = addUnit(s, 'skirmisher', 0, 0, 0); addUnit(s, 'warrior', 1, 2, 0);
  expect(playerView(s, 1).units.some((u) => u.id === sk.id)).toBe(false);
  const shot = step(s, { type: 'attack', unit: sk.id, target: '2,0' });
  const lines = digestFor(1, [shot]);
  expect(lines).toEqual([{ kind: 'unitHurt', unitType: 'warrior', damage: expect.any(Number), by: 'skirmisher', at: '2,0' }]);
  expect(digestText(lines[0]!)).toMatch(/from a Skirmisher\.$/);
  expect(JSON.stringify(lines)).not.toContain('"0,0"');
  // A Dash-strike on a sturdy target: the arrow and the charge are one line with the damage of both. From an open
  // field and out of the Warrior's sight it is an unseen attacker, so the old rule holds: not named.
  const { s: d, sk: dsk } = dashBoard(); d.units.find((u) => u.owner === 1)!.hp = 15;
  const dashed = step(d, { type: 'attack', unit: dsk, target: '1,1', dash: true });
  const total = dashed.events.reduce((n, e) => n + (e.type === 'attacked' ? e.damage : 0), 0);
  expect(digestFor(1, [dashed])).toEqual([{ kind: 'unitHurt', unitType: 'warrior', damage: total, by: null, at: '1,1' }]);
});

test('the snare\'s owner is told when an enemy steps on it; the mover\'s side is not', () => {
  const s = blankMatch({ factions: ['woodland', 'mongols'] });
  addUnit(s, 'trapper', 0, -2, 0);
  const rider = addUnit(s, 'horseman', 1, 2, 0);
  s.snares = [{ owner: 0, at: '1,0' }];
  s.current = 1;
  const moved = step(s, { type: 'move', unit: rider.id, to: '0,0' });
  expect(moved.events.some((e) => e.type === 'snared')).toBe(true);
  const lines = digestFor(0, [moved]);
  expect(lines).toEqual([{ kind: 'snareSprung', unitType: 'horseman', damage: 3, died: false, at: '1,0' }]);
  expect(digestText(lines[0]!)).toBe(`An enemy ${T.unit.horseman.name} stepped on your snare and took 3 damage.`);
  expect(digestFor(1, [moved]).some((l) => l.kind === 'snareSprung')).toBe(false);
});
