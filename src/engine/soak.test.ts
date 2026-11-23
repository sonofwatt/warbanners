import { expect, test } from 'vitest';
import { applyAction, legalActions, replay } from './apply';
import { maxHpOf } from './heroes';
import { hashState } from './hash';
import { rngInt } from './rng';
import { maxMp } from './movement';
import { createMatch, firstFreeNeighbor, freshAttacks, isEnterable, spawnUnit, tileAt } from './state';
import { must } from './testkit';
import type { AbilityId, Action, FactionId, MatchSettings, MatchState, PlayerId, UnitTypeId } from './types';

function checkInvariants(s: MatchState): void {
  const seen = new Set<string>();
  for (const u of s.units) {
    expect(seen.has(u.pos), `two units on ${u.pos}`).toBe(false); seen.add(u.pos);
    expect(isEnterable(s, u.pos), `unit ${u.id} on ${u.pos}`).toBe(true);
    expect(u.hp).toBeGreaterThanOrEqual(1); expect(u.hp).toBeLessThanOrEqual(maxHpOf(u));
    expect(u.mp).toBeGreaterThanOrEqual(0); expect(u.attacks).toBeGreaterThanOrEqual(0);
    if (u.home !== null) expect(s.cities.some(c => c.id === u.home), `home ${u.home}`).toBe(true);
    expect(s.players[u.owner]?.alive, `owner of unit ${u.id}`).toBe(true);
  }
  for (const p of s.players) {
    expect(p.gold).toBeGreaterThanOrEqual(0);
    expect(p.explored).toEqual([...new Set(p.explored)].sort());
  }
  for (const k of Object.keys(s.tiles)) {
    const id = tileAt(s, k)!.cityId;
    if (id !== null) expect(s.cities.some(c => c.id === id), `tile ${k} city ${id}`).toBe(true);
  }
  const alive = s.players.filter(p => p.alive);
  expect(s.winner !== null).toBe(alive.length === 1);
  if (s.winner !== null) expect(alive[0]!.id).toBe(s.winner);
}

test.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('seed %i: 60 random turns keep every invariant and replay to the same hash', (seed) => {
  const settings: MatchSettings = { seed, factions: seed % 2 ? ['spartans', 'mongols'] : ['mongols', 'spartans'] };
  let s = createMatch(settings); let pick = seed * 7919; const log: Action[] = [];
  for (let turn = 0; turn < 60 && s.winner === null; turn++) {
    for (let n = 0; n < 40; n++) {
      const acts = legalActions(s).filter(a => a.type !== 'resign' && a.type !== 'endTurn');
      if (acts.length === 0) break;
      const [i, next] = rngInt(pick, acts.length); pick = next;
      const r = applyAction(s, acts[i]!); expect(r.ok, `seed ${seed} ${JSON.stringify(acts[i])}`).toBe(true); if (!r.ok) return;
      log.push(acts[i]!); s = r.state; checkInvariants(s);
      if (s.winner !== null) break;
    }
    if (s.winner === null) { log.push({ type: 'endTurn' }); s = must(applyAction(s, { type: 'endTurn' })); checkInvariants(s); }
  }
  expect(hashState(replay(settings, log))).toBe(hashState(s));
  const viaJson = JSON.parse(JSON.stringify(s)) as MatchState;
  expect(hashState(viaJson)).toBe(hashState(s));
  if (s.winner === null) expect(hashState(must(applyAction(viaJson, { type: 'endTurn' })))).toBe(hashState(must(applyAction(s, { type: 'endTurn' }))));
});

test('hostile actions against a live match are all refused quietly', () => {
  const s = createMatch({ seed: 5, factions: ['spartans', 'mongols'] }); const before = hashState(s);
  const enemy = s.units.find(u => u.owner === 1)!; const mine = s.units.find(u => u.owner === 0)!;
  const bad = [
    { type: 'move', unit: enemy.id, to: '0,0' }, { type: 'move', unit: mine.id, to: 'x' }, { type: 'move', unit: mine.id, to: '99,99' },
    { type: 'attack', unit: mine.id, target: mine.pos }, { type: 'train', city: 1, unitType: 'warrior' },
    { type: 'train', city: 0, unitType: 'dragon' }, { type: 'research', tech: 'magic' }, { type: 'chooseReward', city: 0, choice: 5 },
    { type: 'build', at: '0,0', building: 'castle' }, { type: 'ability', unit: mine.id, ability: 'heal', target: mine.pos },
    { type: 'campTrain', unit: mine.id, unitType: 'horseman', to: '0,0' }, { type: 'capture', unit: -1 },
  ] as unknown as Action[];
  for (const a of bad) expect(applyAction(s, a).ok).toBe(false);
  expect(hashState(s)).toBe(before);
});

// Test-only edit: a reward unit placed beside a capital, ready to act.
function place(s: MatchState, faction: FactionId, type: UnitTypeId): void {
  const owner: PlayerId = s.players.find((p) => p.faction === faction)!.id;
  const at = firstFreeNeighbor(s, s.cities.find((c) => c.owner === owner && c.capital)!.pos);
  if (at === null) throw new Error(`no room for a ${type}`);
  const u = spawnUnit(s, type, owner, at, null);
  u.mp = maxMp(s, u); u.attacks = freshAttacks(type); u.fresh = false;
}

// Random play that takes an ability whenever one is offered, at most once per unit per turn.
const abilityCounts: Record<AbilityId, number> = { heal: 0, taunt: 0, hasten: 0, dustStorm: 0 };
test.each([1, 2, 3, 4, 5, 6])('seed %i: abilities in random play keep every invariant and replay to the same hash', (seed) => {
  const settings: MatchSettings = { seed, factions: seed % 2 ? ['spartans', 'mongols'] : ['mongols', 'spartans'] };
  const start = createMatch(settings);
  place(start, 'spartans', 'piper'); place(start, 'mongols', 'skyCaller'); place(start, 'mongols', 'khansGuard');
  checkInvariants(start);
  let s = start; let pick = seed * 7919; const log: Action[] = [];
  for (let turn = 0; turn < 60 && s.winner === null; turn++) {
    const used = new Set<number>();
    for (let n = 0; n < 40; n++) {
      const acts = legalActions(s).filter(a => a.type !== 'resign' && a.type !== 'endTurn');
      if (acts.length === 0) break;
      const abilities = acts.filter(a => a.type === 'ability' && !used.has(a.unit));
      const pool = abilities.length > 0 ? abilities : acts;
      const [i, next] = rngInt(pick, pool.length); pick = next;
      const a = pool[i]!;
      const r = applyAction(s, a); expect(r.ok, `seed ${seed} ${JSON.stringify(a)}`).toBe(true); if (!r.ok) return;
      if (a.type === 'ability') { used.add(a.unit); abilityCounts[a.ability] += 1; }
      log.push(a); s = r.state; checkInvariants(s);
      if (s.winner !== null) break;
    }
    if (s.winner === null) { log.push({ type: 'endTurn' }); s = must(applyAction(s, { type: 'endTurn' })); checkInvariants(s); }
  }
  let again = start;
  for (const a of log) again = must(applyAction(again, a));
  expect(hashState(again)).toBe(hashState(s));
}, 30_000);   // seed 6 took over the default 5 s once Spartan cities level sooner (rules 7), as its game now runs the full 60 turns
test('the ability soak applied every ability at least once', () => {
  expect(abilityCounts.heal).toBeGreaterThan(0);
  expect(abilityCounts.taunt).toBeGreaterThan(0);
  expect(abilityCounts.hasten).toBeGreaterThan(0);
  expect(abilityCounts.dustStorm).toBeGreaterThan(0);
});
