import { expect, test } from 'vitest';
import { applyAction, createMatch, hashState, legalActions, RULES_VERSION } from '../engine';
import type { MatchSettings, MatchState } from '../engine';
import { append, newRecord, restore } from './record';
import type { MatchRecord, Restored } from './record';

const SETTINGS: MatchSettings = { seed: 42, factions: ['spartans', 'mongols'] };
function playSome(n: number): { rec: MatchRecord; state: MatchState } {
  let state = createMatch(SETTINGS);
  let rec = newRecord('m1', SETTINGS, ['Ann', 'Ben'], 1000);
  for (let i = 0; i < n; i++) {
    const legal = legalActions(state).filter(a => a.type !== 'resign');
    const action = legal[(i * 7) % legal.length]!;
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(r.reason);
    state = r.state; rec = append(rec, action, state, 1001 + i);
  }
  return { rec, state };
}
const ok = (r: Restored) => { if (!r.ok) throw new Error(r.reason); return r; };

test('a new record restores to the opening position', () => {
  const rec = newRecord('m1', SETTINGS, ['Ann', 'Ben'], 1000);
  expect(rec).toMatchObject({ rulesVersion: RULES_VERSION, actions: [], snapshot: null, createdAt: 1000, updatedAt: 1000 });
  const r = ok(restore(rec));
  expect(hashState(r.state)).toBe(hashState(createMatch(SETTINGS)));
  expect(r.repaired).toBe(false);
});
test('a record survives being written as JSON and read back', () => {
  const { rec, state } = playSome(40);
  const r = ok(restore(JSON.parse(JSON.stringify(rec))));
  expect(hashState(r.state)).toBe(hashState(state));
  expect(r.repaired).toBe(false);
  expect(rec.updatedAt).toBe(1040);
});
test('append does not change the record it was given', () => {
  const { rec } = playSome(3); const copy = JSON.stringify(rec);
  append(rec, { type: 'endTurn' }, createMatch(SETTINGS), 5);
  expect(JSON.stringify(rec)).toBe(copy);
});
test('a damaged snapshot is rebuilt from the actions', () => {
  const { rec, state } = playSome(40);
  const bad = JSON.parse(JSON.stringify(rec)); bad.snapshot.state.players[0].gold += 50;
  const r = ok(restore(bad));
  expect(r.repaired).toBe(true);
  expect(hashState(r.state)).toBe(hashState(state));
  expect(r.record.snapshot!.hash).toBe(hashState(state));
  const stale = JSON.parse(JSON.stringify(rec)); stale.snapshot.count = 3;
  expect(ok(restore(stale)).repaired).toBe(true);
});
test('another rules version is refused as such', () => {
  const { rec } = playSome(5);
  expect(restore({ ...rec, rulesVersion: RULES_VERSION + 1 })).toEqual({ ok: false, reason: 'version' });
});
test('rubbish is refused and nothing throws', () => {
  const { rec } = playSome(5);
  const illegal = { ...rec, snapshot: null, actions: [...rec.actions, { type: 'move', unit: 999, to: '0,0' }] };
  for (const v of [null, undefined, 'x', 7, [], {}, { rulesVersion: RULES_VERSION }, illegal]) {
    expect(restore(v)).toEqual({ ok: false, reason: 'corrupt' });
  }
});
test('a trusted snapshot does not excuse a damaged players list or settings', () => {
  const { rec } = playSome(5);
  const damage = (f: (r: any) => void) => { const r = JSON.parse(JSON.stringify(rec)); f(r); return r; };
  const bads = [
    damage(r => { delete r.players; }),
    damage(r => { r.players = [{ name: 'Ann', kind: 'human' }]; }),
    damage(r => { r.players[1] = { kind: 'human' }; }),
    damage(r => { r.settings.factions = ['spartans']; }),
    damage(r => { r.settings.factions = ['spartans', 'nobody']; }),
    damage(r => { r.settings.seed = 'x'; }),
  ];
  for (const b of bads) expect(restore(b)).toEqual({ ok: false, reason: 'corrupt' });
});
test('a snapshot this build cannot play is rebuilt from the actions, though its hash matches itself', () => {
  const { rec, state } = playSome(40);
  const drift = (f: (s: any) => void) => {
    const r = JSON.parse(JSON.stringify(rec)); f(r.snapshot.state); r.snapshot.hash = hashState(r.snapshot.state); return r;
  };
  for (const bad of [drift(s => { delete s.players[0].explored; }), drift(s => { delete s.winner; })]) {
    const r = ok(restore(bad));
    expect(r.repaired).toBe(true);
    expect(hashState(r.state)).toBe(hashState(state));
  }
});
test('a record that cannot be rebuilt either is reported as damaged, not thrown', () => {
  const { rec } = playSome(10);
  const r = JSON.parse(JSON.stringify(rec));
  delete r.snapshot.state.players[0].explored; r.snapshot.hash = hashState(r.snapshot.state);
  r.actions[3] = { type: 'move', unit: 999, to: '0,0' };
  expect(restore(r)).toEqual({ ok: false, reason: 'corrupt' });
});
