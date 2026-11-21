/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { applyAction, legalActions } from './apply';
import { hashState } from './hash';
import { createMatch } from './state';
import { must, randomPlayoutLog } from './testkit';
import type { Action, MatchState } from './types';

// Strip what plan 5 added, so a stage 1 state hashes as it did on rules 3.
function stage1Shape(s: MatchState): unknown {
  return { ...s, rulesVersion: 3, units: s.units.map(({ deeds: _d, heroTraits: _h, item: _i, itemTurn: _t, ...rest }) => rest) };
}

const FIXTURE = new URL('./stage1.fixture.json', import.meta.url);

interface Fixture {
  fingerprint: { actions: Action[]; hashes: string[] };
  playouts: { seed: number; turns: number; actions: Action[]; hashes: Record<number, string> }[];
}

// The rules 3 playouts, recorded from the engine before plan 5 touched it.
test.runIf(process.env.RECORD_STAGE1 === '1')('record the rules 3 playouts', () => {
  let s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  const fp: Fixture['fingerprint'] = { actions: [], hashes: [] };
  for (let i = 0; i < 400 && s.winner === null; i++) {
    const legal = legalActions(s).filter((a) => a.type !== 'resign');
    const a = legal[(i * 7) % legal.length]!;
    s = must(applyAction(s, a));
    fp.actions.push(a);
    fp.hashes.push(hashState(s));
  }
  const playouts: Fixture['playouts'] = [];
  for (const [seed, turns] of [[7, 160], [1, 200], [3, 90]] as const) {
    const { actions } = randomPlayoutLog(seed, turns);
    let t = createMatch({ seed, factions: ['spartans', 'mongols'] });
    const hashes: Record<number, string> = {};
    actions.forEach((a, i) => {
      t = must(applyAction(t, a));
      if (a.type === 'endTurn' || i === actions.length - 1) hashes[i] = hashState(t);
    });
    playouts.push({ seed, turns, actions, hashes });
  }
  writeFileSync(FIXTURE, JSON.stringify({ fingerprint: fp, playouts }));
}, 120_000);

test('the recorded rules 3 playouts end on the pinned digests', () => {
  const fx = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture;
  expect(fx.fingerprint.hashes.at(-1)).toBe('ba3e0e466edfedd3');
  const want: Record<number, string> = { 7: '9e8f2b190371ac46', 1: 'ae927f4d0a90590c', 3: 'ec1d2740c2ea62f1' };
  expect(fx.playouts.map((p) => p.seed)).toEqual([7, 1, 3]);
  for (const p of fx.playouts) {
    expect(p.hashes[p.actions.length - 1], `seed ${p.seed}`).toBe(want[p.seed]);
  }
});

test('until stage 2 first changes an outcome, rules 4 plays the rules 3 playout exactly', () => {
  const { actions, hashes } = (JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture).fingerprint;
  let s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  let matched = 0;
  for (let i = 0; i < actions.length; i++) {
    const r = applyAction(s, actions[i]!);
    expect(r.ok, `action ${i}`).toBe(true);
    if (!r.ok) return;
    if (r.events.some((e) => e.type === 'treasure' || e.type === 'heroTrait' || e.type === 'chainCost')) break;
    expect(hashState(stage1Shape(r.state) as MatchState), `after action ${i}`).toBe(hashes[i]);
    s = r.state; matched = i + 1;
  }
  expect(matched).toBeGreaterThan(0);
  console.info(`stage 1 provenance: ${matched} of ${actions.length} actions identical`);
}, 30_000);
