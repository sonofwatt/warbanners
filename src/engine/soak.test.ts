import { expect, test } from 'vitest';
import { applyAction, legalActions, replay } from './apply';
import { UNITS } from './data/units';
import { hashState } from './hash';
import { rngInt } from './rng';
import { createMatch, isEnterable, tileAt } from './state';
import { must } from './testkit';
import type { Action, MatchSettings, MatchState } from './types';

function checkInvariants(s: MatchState): void {
  const seen = new Set<string>();
  for (const u of s.units) {
    expect(seen.has(u.pos), `two units on ${u.pos}`).toBe(false); seen.add(u.pos);
    expect(isEnterable(s, u.pos), `unit ${u.id} on ${u.pos}`).toBe(true);
    expect(u.hp).toBeGreaterThanOrEqual(1); expect(u.hp).toBeLessThanOrEqual(UNITS[u.type].hp);
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
