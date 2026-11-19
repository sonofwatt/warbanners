import { expect, test } from 'vitest';
import { applyAction, legalActions, replay } from './apply';
import { lureApplies } from './combat';
import { CONFIG } from './data/config';
import { TECHS } from './data/techs';
import { UNITS } from './data/units';
import { canonical, hashState } from './hash';
import { key, parseKey, range } from './hex';
import { rngInt } from './rng';
import { addCity, addUnit, blankMatch, give, must } from './testkit';
import { createMatch, tileAt, unitAt, unitById } from './state';
import { ABILITIES } from './types';
import type { Action, BuildingId, MatchSettings, MatchState, TechId, UnitTypeId } from './types';

test('every listed action is accepted and nothing else obvious is missing', () => {
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  const acts = legalActions(s);
  for (const a of acts) expect(applyAction(s, a).ok).toBe(true);
  expect(acts.at(-2)).toEqual({ type: 'endTurn' }); expect(acts.at(-1)).toEqual({ type: 'resign' });
  expect(acts.some(a => a.type === 'move')).toBe(true);
  expect(acts.some(a => a.type === 'train')).toBe(false);                    // the starting unit stands on the capital
  const moved = must(applyAction(s, acts.find(a => a.type === 'move')!));
  expect(legalActions(moved).some(a => a.type === 'train' && a.unitType === 'hoplite')).toBe(true);
  expect(acts.some(a => a.type === 'research' && a.tech === 'shieldwork')).toBe(true);
  expect(acts.some(a => a.type === 'research' && a.tech === 'smithing')).toBe(false);
});
test('nothing is legal once the match is over', () => {
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  expect(legalActions(must(applyAction(s, { type: 'resign' })))).toEqual([]);
});
test('replay reproduces a match and reports a bad action by index', () => {
  const settings: MatchSettings = { seed: 42, factions: ['spartans', 'mongols'] };
  let s = createMatch(settings); const log: Action[] = [];
  for (let i = 0; i < 6; i++) { const a = legalActions(s)[0]!; log.push(a); s = must(applyAction(s, a)); }
  expect(hashState(replay(settings, log))).toBe(hashState(s));
  expect(() => replay(settings, [...log, { type: 'move', unit: 999, to: '0,0' }])).toThrow(/action 6 refused/);
});
test('lure variants are listed only where a lure would be recorded', () => {
  const s = blankMatch({ factions: ['mongols', 'spartans'] }); addCity(s, 0, -4, 0);
  const rider = addUnit(s, 'horseman', 0, 0, 0);
  const victim = addUnit(s, 'warrior', 1, 1, 0);
  const attacks = (): Action[] => legalActions(s).filter(a => a.type === 'attack');
  expect(attacks()).toEqual([
    { type: 'attack', unit: rider.id, target: '1,0' }, { type: 'attack', unit: rider.id, target: '1,0', lure: true },
  ]);
  const piper = addUnit(s, 'piper', 1, 2, 0);                                // steadies the victim
  expect(piper.id).toBeGreaterThan(victim.id);
  expect(attacks()).toEqual([{ type: 'attack', unit: rider.id, target: '1,0' }]);
});
test('order: moves, attacks, abilities, capture, campTrain, then cities, tiles, research, endTurn, resign', () => {
  const s = blankMatch({ factions: ['mongols', 'spartans'] }); addCity(s, 0, -4, 0);
  give(s, 0, 'roads', 'riding');
  const camp = addUnit(s, 'camp', 0, 0, 0);
  s.players[0]!.explored = Object.keys(s.tiles).sort();
  const types = legalActions(s).map(a => a.type);
  const first = (t: string): number => types.indexOf(t as Action['type']);
  expect(first('move')).toBe(0);
  expect(first('campTrain')).toBeGreaterThan(first('move'));
  expect(first('train')).toBeGreaterThan(first('campTrain'));
  expect(first('road')).toBeGreaterThan(first('train'));
  expect(first('research')).toBeGreaterThan(first('road'));
  expect(camp.id).toBe(0);
});

// Every action of each kind near each unit, city and tile, far more than legalActions lists.
function candidates(s: MatchState): Action[] {
  const out: Action[] = [];
  const near = (k: string, n: number): string[] => range(parseKey(k), n).map(key).filter((t) => tileAt(s, t) !== undefined);
  const unitTypes = Object.keys(UNITS) as UnitTypeId[];
  for (const u of s.units) {
    for (const to of near(u.pos, 4)) out.push({ type: 'move', unit: u.id, to });
    for (const target of near(u.pos, 3)) {
      out.push({ type: 'attack', unit: u.id, target }, { type: 'attack', unit: u.id, target, lure: true });
    }
    for (const ability of ABILITIES) for (const target of near(u.pos, 2)) out.push({ type: 'ability', unit: u.id, ability, target });
    out.push({ type: 'capture', unit: u.id });
    for (const unitType of unitTypes) for (const to of near(u.pos, 1)) out.push({ type: 'campTrain', unit: u.id, unitType, to });
  }
  for (const c of s.cities) {
    for (const unitType of unitTypes) out.push({ type: 'train', city: c.id, unitType });
    out.push({ type: 'buildWalls', city: c.id }, { type: 'chooseReward', city: c.id, choice: 0 }, { type: 'chooseReward', city: c.id, choice: 1 });
  }
  for (const at of Object.keys(s.tiles)) {
    out.push({ type: 'harvest', at }, { type: 'road', at });
    for (const building of Object.keys(CONFIG.buildings) as BuildingId[]) out.push({ type: 'build', at, building });
  }
  for (const tech of Object.keys(TECHS) as TechId[]) out.push({ type: 'research', tech });
  out.push({ type: 'endTurn' }, { type: 'resign' });
  return out;
}

// A lure asked for where none can apply is accepted as the plain attack.
function normalise(s: MatchState, a: Action): Action {
  if (a.type !== 'attack' || a.lure !== true) return a;
  const attacker = unitById(s, a.unit); const victim = unitAt(s, a.target);
  if (attacker !== undefined && victim !== undefined && lureApplies(s, attacker, victim)) return a;
  return { type: 'attack', unit: a.unit, target: a.target };
}

function checkComplete(s: MatchState): number {
  const legal = legalActions(s);
  const listed = new Set(legal.map(canonical));
  for (const a of legal) expect(applyAction(s, a).ok, `listed but refused: ${JSON.stringify(a)}`).toBe(true);
  let accepted = 0;
  for (const a of candidates(s)) {
    if (!applyAction(s, a).ok) continue;
    accepted += 1;
    expect(listed.has(canonical(normalise(s, a))), `accepted but not listed: ${JSON.stringify(a)}`).toBe(true);
  }
  return accepted;
}

// Checks the state after 20 to 40 random legal actions, then the state at the start of the next turn.
test.each([1, 2, 3, 4, 5])('seed %i: legalActions lists exactly the actions applyAction accepts', (seed) => {
  let s = createMatch({ seed, factions: seed % 2 ? ['spartans', 'mongols'] : ['mongols', 'spartans'] });
  let pick = seed * 104729;
  const steps = 20 + (seed * 5) % 21;
  for (let i = 0; i < steps && s.winner === null; i++) {
    const acts = legalActions(s).filter((a) => a.type !== 'resign');
    const [n, next] = rngInt(pick, acts.length); pick = next;
    s = must(applyAction(s, acts[n]!));
  }
  checkComplete(s);
  if (s.winner !== null) return;
  s = must(applyAction(s, { type: 'endTurn' }));
  expect(checkComplete(s)).toBeGreaterThan(2);                       // a fresh turn offers more than endTurn and resign
});
