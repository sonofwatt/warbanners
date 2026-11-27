import { describe, expect, test } from 'vitest';
import { aiInputFor } from '../ai/input';
import { abilityTargets } from './abilities';
import { applyAction, legalActions } from './apply';
import { CONFIG } from './data/config';
import { pathTo, reachable } from './movement';
import { addCity, addUnit, blankMatch, randomPlayout, setTile } from './testkit';
import { unitById } from './state';
import { playerView } from './vision';
import { snareAt } from './woodland';
import { springSnare } from './movement';
import { assertNoWoodlandKeys } from './woodland.testkit';
import type { Action, FactionId, GameEvent, MatchState } from './types';

function run(s: MatchState, a: Action): { state: MatchState; events: GameEvent[] } {
  const r = applyAction(s, a);
  if (!r.ok) throw new Error(r.reason);
  return { state: r.state, events: r.events };
}
const match = (factions: [FactionId, FactionId], current = 0): MatchState => {
  const s = blankMatch({ factions }); s.current = current; return s;
};
const snareOf = (owner: number, at: string): { owner: number; at: string } => ({ owner, at });

describe('rules 11: setting a snare', () => {
  // The Trapper (Woodland, player 0) stands on 0,0. Its neighbours in direction order: 1,0 1,-1 0,-1 -1,0 -1,1 0,1.
  test('targets: an explored field or forest next to it, free of units, villages and mountains', () => {
    const s = match(['woodland', 'spartans']); const t = addUnit(s, 'trapper', 0, 0, 0);
    setTile(s, 1, 0, { village: true });
    setTile(s, 1, -1, { terrain: 'mountain' });
    addUnit(s, 'warrior', 1, 0, -1);
    s.players[0]!.explored = s.players[0]!.explored.filter((k) => k !== '-1,0');
    setTile(s, -1, 1, { terrain: 'forest' });
    expect(abilityTargets(s, t.id, 'snare')).toEqual(['-1,1', '0,1']);
  });

  test('targets: no city, treasure, water or snare of its own; an enemy snare does not hide a tile', () => {
    const s = match(['woodland', 'woodland']); const t = addUnit(s, 'trapper', 0, 0, 0);
    addCity(s, 1, 1, 0);
    for (const k of Object.keys(s.tiles)) s.tiles[k]!.cityId = null;   // only the city tile itself matters here
    setTile(s, 1, -1, { treasure: true });
    setTile(s, 0, -1, { terrain: 'water' });
    s.snares = [snareOf(0, '-1,0'), snareOf(1, '-1,1')];
    expect(abilityTargets(s, t.id, 'snare')).toEqual(['-1,1', '0,1']);
  });

  test('setting one uses the ability; a 4th removes the oldest of its own, never an enemy snare', () => {
    const s = match(['woodland', 'woodland']); const t = addUnit(s, 'trapper', 0, 0, 0);
    s.snares = [snareOf(0, '3,0'), snareOf(1, '0,3'), snareOf(0, '-3,0'), snareOf(0, '0,-3')];
    const { state, events } = run(s, { type: 'ability', unit: t.id, ability: 'snare', target: '0,1' });
    expect(state.snares).toEqual([snareOf(1, '0,3'), snareOf(0, '-3,0'), snareOf(0, '0,-3'), snareOf(0, '0,1')]);
    expect(unitById(state, t.id)).toMatchObject({ attacks: 0, mp: 0, acted: true });
    expect(events).toContainEqual({ type: 'ability', unit: t.id, ability: 'snare', target: '0,1' });
    expect(abilityTargets(state, t.id, 'snare')).toEqual([]);
  });

  test('the first snare of a match creates the list; a refused target leaves it absent', () => {
    const s = match(['woodland', 'spartans']); const t = addUnit(s, 'trapper', 0, 0, 0);
    expect(applyAction(s, { type: 'ability', unit: t.id, ability: 'snare', target: '2,0' }).ok).toBe(false);
    expect('snares' in s).toBe(false);
    expect(run(s, { type: 'ability', unit: t.id, ability: 'snare', target: '1,0' }).state.snares).toEqual([snareOf(0, '1,0')]);
  });

  test('legalActions lists the snare targets; guide and smoke are asked in woodland.smoke.test.ts', () => {
    const s = match(['woodland', 'spartans']); const t = addUnit(s, 'trapper', 0, 0, 0);
    const snares = legalActions(s).filter((a) => a.type === 'ability' && a.ability === 'snare');
    expect(snares.map((a) => a.type === 'ability' && a.target)).toEqual(abilityTargets(s, t.id, 'snare'));
    expect(snares.length).toBe(6);
  });
});

describe('rules 11: springing a snare', () => {
  // A Mongol Horseman (player 0) on 0,0; a Woodland snare (player 1) on 1,0, the middle of the only shortest way to 2,0.
  const mongolMatch = (): MatchState => match(['mongols', 'woodland']);

  test('the path is the tiles the search took, start excluded', () => {
    const s = mongolMatch(); const h = addUnit(s, 'horseman', 0, 0, 0);
    expect(pathTo(s, h, '2,0')).toEqual(['1,0', '2,0']);
    expect(pathTo(s, h, '1,0')).toEqual(['1,0']);
    expect(pathTo(s, h, '0,0')).toEqual([]);
  });

  test('a Horseman moving 2 tiles through it stops on it: hp 7, mp 0, snare gone, March 1, and it may still attack', () => {
    const s = mongolMatch(); const h = addUnit(s, 'horseman', 0, 0, 0);
    const plain = structuredClone(s);
    s.snares = [snareOf(1, '1,0')];
    // the mover cannot see it: its reach, its legal actions and its view are as if there were none
    expect(reachable(s, h.id)).toEqual(reachable(plain, h.id));
    expect(legalActions(s)).toEqual(legalActions(plain));
    expect(playerView(s, 0).snares).toBeUndefined();
    const { state, events } = run(s, { type: 'move', unit: h.id, to: '2,0' });
    expect(events).toEqual([
      { type: 'moved', unit: h.id, from: '0,0', to: '1,0' },
      { type: 'snared', unit: h.id, at: '1,0', damage: CONFIG.woodland.snareDamage },
    ]);
    expect(unitById(state, h.id)).toMatchObject({ pos: '1,0', hp: 7, mp: 0, bonusMp: 0, attacks: 1, moved: true });
    expect(unitById(state, h.id)!.deeds.march).toBe(1);
    expect('snares' in state).toBe(false);
    const foe = addUnit(state, 'warrior', 1, 2, -1);
    expect(legalActions(state)).toContainEqual({ type: 'attack', unit: h.id, target: '2,-1' });
    expect(unitById(run(state, { type: 'attack', unit: h.id, target: '2,-1' }).state, foe.id)!.hp).toBeLessThan(10);
  });

  test('a unit with 3 hp dies on it: died, no deeds to anyone', () => {
    const s = mongolMatch(); const h = addUnit(s, 'horseman', 0, 0, 0, { hp: 3 });
    const t = addUnit(s, 'trapper', 1, -3, 0);
    s.snares = [snareOf(1, '1,0')];
    const { state, events } = run(s, { type: 'move', unit: h.id, to: '2,0' });
    expect(events).toEqual([
      { type: 'moved', unit: h.id, from: '0,0', to: '1,0' },
      { type: 'snared', unit: h.id, at: '1,0', damage: 3 },
      { type: 'died', unit: h.id },
    ]);
    expect(unitById(state, h.id)).toBeUndefined();
    expect(unitById(state, t.id)!.deeds).toEqual({ fight: 0, march: 0, survive: 0, rest: 0 });
  });

  test('its owner\'s own unit walks over it: nothing happens', () => {
    const s = match(['woodland', 'mongols']); const w = addUnit(s, 'trapper', 0, 0, 0, { mp: 4 });
    s.snares = [snareOf(0, '1,0')];
    expect(snareAt(s, '1,0', 0)).toBe(false); expect(snareAt(s, '1,0', 1)).toBe(true);
    const { state, events } = run(s, { type: 'move', unit: w.id, to: '2,0' });
    expect(events).toEqual([{ type: 'moved', unit: w.id, from: '0,0', to: '2,0' }]);
    expect(unitById(state, w.id)).toMatchObject({ pos: '2,0', hp: 10 });
    expect(state.snares).toEqual([snareOf(0, '1,0')]);
  });

  test('a Knight\'s kill advance onto one: kill and momentum paid, then snared, chain ended, attacks 0', () => {
    const s = match(['spartans', 'woodland']); const k = addUnit(s, 'knight', 0, 0, 0);
    const w = addUnit(s, 'warrior', 1, 1, 0, { hp: 1 }); addUnit(s, 'warrior', 1, 2, 0);
    s.snares = [snareOf(1, '1,0')];
    const { state, events } = run(s, { type: 'attack', unit: k.id, target: '1,0' });
    expect(events).toEqual([
      { type: 'attacked', unit: k.id, target: w.id, damage: expect.any(Number), counter: 0 },
      { type: 'died', unit: w.id },
      { type: 'advanced', unit: k.id, from: '0,0', to: '1,0' },
      { type: 'momentum', unit: k.id, spent: 1, left: 6 },
      { type: 'snared', unit: k.id, at: '1,0', damage: 3 },
      { type: 'chainEnded', unit: k.id },
    ]);
    const after = unitById(state, k.id)!;
    expect(after).toMatchObject({ pos: '1,0', hp: 12, attacks: 0, mp: 0, momentum: 6 });
    expect(after.deeds.fight).toBe(CONFIG.heroes.fightPerAttack + CONFIG.heroes.fightPerKill);
    expect('snares' in state).toBe(false);
  });

  test('a Knight\'s kill advance off a mountain onto one: one chainEnded, attacks 0, the snare sprung', () => {
    const s = match(['spartans', 'woodland']); setTile(s, 0, 0, { terrain: 'mountain' });
    const k = addUnit(s, 'knight', 0, 0, 0);
    const w = addUnit(s, 'warrior', 1, 1, 0, { hp: 1 }); addUnit(s, 'warrior', 1, 2, 0);
    s.snares = [snareOf(1, '1,0')];
    const { state, events } = run(s, { type: 'attack', unit: k.id, target: '1,0' });
    expect(events.filter((e) => e.type === 'chainEnded')).toEqual([{ type: 'chainEnded', unit: k.id }]);
    expect(events).toContainEqual({ type: 'died', unit: w.id });
    expect(events).toContainEqual({ type: 'snared', unit: k.id, at: '1,0', damage: 3 });
    expect(unitById(state, k.id)).toMatchObject({ pos: '1,0', hp: 12, attacks: 0, mp: 0, turnEnded: true });
    expect('snares' in state).toBe(false);
  });

  test('springSnare on a tile with no enemy snare does nothing', () => {
    const s = match(['woodland', 'mongols']); const t = addUnit(s, 'trapper', 0, 1, 0);
    s.snares = [snareOf(0, '1,0')];
    const ev: GameEvent[] = [];
    expect(springSnare(s, t, ev)).toBe(false);
    expect(ev).toEqual([]); expect(s.snares).toEqual([snareOf(0, '1,0')]); expect(t.hp).toBe(10);
  });

  test('a unit lured onto one springs it', () => {
    // as the Mongol lure test: the Horse Archer's target on 2,0 is pulled to 1,0 when the archer rides off
    const s = match(['mongols', 'woodland']);
    const a = addUnit(s, 'horseArcher', 0, 0, 0, { mp: 6 }); const d = addUnit(s, 'trapper', 1, 2, 0);
    s.snares = [snareOf(0, '1,0')];
    const shot = run(s, { type: 'attack', unit: a.id, target: '2,0', lure: true }).state;
    const hp = unitById(shot, d.id)!.hp;
    const { state, events } = run(shot, { type: 'move', unit: a.id, to: '-2,0' });
    expect(events.slice(-2)).toEqual([
      { type: 'lured', unit: d.id, from: '2,0', to: '1,0' },
      { type: 'snared', unit: d.id, at: '1,0', damage: 3 },
    ]);
    expect(unitById(state, d.id)).toMatchObject({ pos: '1,0', hp: hp - 3, mp: 0 });
    expect('snares' in state).toBe(false);
  });

  test('a champion placed by a reward onto a Woodland snare beside its city does not spring it', () => {
    const s = match(['mongols', 'woodland']);
    const c = addCity(s, 0, 0, 0, { level: 5, pendingRewards: [5] }); addUnit(s, 'horseman', 0, 0, 0);
    s.snares = [snareOf(1, '1,0')];
    const { state, events } = run(s, { type: 'chooseReward', city: c.id, choice: 0 });
    const champ = state.units.find((u) => u.pos === '1,0')!;
    expect(champ).toMatchObject({ type: 'khansGuard', owner: 0 });
    expect(events.some((e) => e.type === 'snared')).toBe(false);
    expect(state.snares).toEqual([snareOf(1, '1,0')]);
  });
});

describe('rules 11: snares are hidden', () => {
  test('the Mongol view and AI input hold no Woodland snare; the Woodland view holds all three', () => {
    const s = match(['woodland', 'mongols']);
    addUnit(s, 'trapper', 0, 0, 0); addUnit(s, 'horseman', 1, 1, 0);   // the Horseman stands next to one of them
    s.snares = [snareOf(0, '2,0'), snareOf(0, '0,1'), snareOf(0, '-1,0')];
    expect(playerView(s, 1).snares).toBeUndefined();
    expect(aiInputFor(s, 1).view.snares).toBeUndefined();
    expect(JSON.stringify(aiInputFor(s, 1))).not.toContain('snares');
    expect(playerView(s, 0).snares).toEqual(s.snares);
    expect(playerView(s, 0).snares).not.toBe(s.snares);
    expect(aiInputFor(s, 0).view.snares).toEqual(s.snares);
  });

  test('a mirror match: each side sees only its own snares', () => {
    const s = match(['woodland', 'woodland']);
    s.snares = [snareOf(0, '2,0'), snareOf(1, '-2,0')];
    expect(playerView(s, 0).snares).toEqual([snareOf(0, '2,0')]);
    expect(playerView(s, 1).snares).toEqual([snareOf(1, '-2,0')]);
  });

  test.each([1, 2, 3])('hash compat: a Spartan and Mongol playout holds no snares key (seed %i)', (seed) => {
    const end = randomPlayout(seed, 8);
    assertNoWoodlandKeys(end);
    expect('snares' in end).toBe(false);
  });
});
