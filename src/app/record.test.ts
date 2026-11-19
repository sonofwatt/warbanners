import { expect, test } from 'vitest';
import { applyAction, createMatch, hashState, legalActions, RULES_VERSION } from '../engine';
import type { MatchSettings, MatchState } from '../engine';
import { append, newRecord, restore, setAdapt } from './record';
import type { MatchRecord, Restored, Seat } from './record';

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
const AI_SEAT: Seat = { name: 'Normal AI', kind: 'ai', level: 'normal', salt: 12345, adapt: { dial: 0.5, trend: 0 } };
test('a solo record keeps its AI seat and restores, by snapshot and by replay', () => {
  const rec = newRecord('m2', SETTINGS, [{ name: 'Ann', kind: 'human' }, AI_SEAT], 1000);
  expect(rec.players).toEqual([{ name: 'Ann', kind: 'human' }, AI_SEAT]);
  const state = createMatch(SETTINGS);
  const r1 = applyAction(state, legalActions(state).find(a => a.type === 'move')!);
  if (!r1.ok) throw new Error(r1.reason);
  const played = append(rec, legalActions(state).find(a => a.type === 'move')!, r1.state, 1001);
  const back = ok(restore(JSON.parse(JSON.stringify(played))));
  expect(back.repaired).toBe(false); expect(back.record.players[1]).toEqual(AI_SEAT);
  const damaged = JSON.parse(JSON.stringify(played)); damaged.snapshot.state.players[1].gold += 9;
  const fixed = ok(restore(damaged));
  expect(fixed.repaired).toBe(true); expect(hashState(fixed.state)).toBe(hashState(r1.state));
});
test('a plan 2 record with two people restores unchanged', () => {
  const { rec, state } = playSome(6);
  expect(rec.players).toEqual([{ name: 'Ann', kind: 'human' }, { name: 'Ben', kind: 'human' }]);
  const r = ok(restore(JSON.parse(JSON.stringify(rec))));
  expect(r.record.players).toEqual(rec.players); expect(hashState(r.state)).toBe(hashState(state));
});
test('a damaged AI seat makes the save damaged', () => {
  const rec = newRecord('m2', SETTINGS, [{ name: 'Ann', kind: 'human' }, AI_SEAT], 1000);
  const damage = (f: (p: any) => void) => { const r = JSON.parse(JSON.stringify(rec)); f(r.players[1]); return r; };
  const bads = [
    damage(p => { p.level = 'brutal'; }), damage(p => { delete p.salt; }), damage(p => { p.salt = 'x'; }),
    damage(p => { delete p.adapt; }), damage(p => { p.adapt.dial = 'x'; }), damage(p => { p.adapt.trend = null; }),
    damage(p => { p.kind = 'robot'; }), damage(p => { p.kind = 'ai'; p.name = 3; }),
  ];
  for (const b of bads) expect(restore(b)).toEqual({ ok: false, reason: 'corrupt' });
  const noPerson = JSON.parse(JSON.stringify(rec)); noPerson.players[0] = { ...AI_SEAT };
  expect(restore(noPerson)).toEqual({ ok: false, reason: 'corrupt' });
});
test('setAdapt gives a new record with the seat\'s new dial', () => {
  const rec = newRecord('m2', SETTINGS, [{ name: 'Ann', kind: 'human' }, { ...AI_SEAT, level: 'adaptive' }], 1000);
  const copy = JSON.stringify(rec);
  const next = setAdapt(rec, 1, { dial: 0.46, trend: 0.2 });
  expect(next.players[1]).toMatchObject({ kind: 'ai', adapt: { dial: 0.46, trend: 0.2 } });
  expect(JSON.stringify(rec)).toBe(copy);
  expect(setAdapt(rec, 0, { dial: 0.1, trend: 0 }).players[0]).toEqual({ name: 'Ann', kind: 'human' });
});
