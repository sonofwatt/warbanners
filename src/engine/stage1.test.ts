/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { applyAction, legalActions } from './apply';
import { hashState } from './hash';
import { createMatch } from './state';
import { must, randomPlayoutLog } from './testkit';
import type { Action, MatchState } from './types';

// Rules 6 changes movement from the first action (a mounted Mongol starts with a half-point bonus, not a tile), so this
// file switches the rules 6 movement off through CONFIG and the faction data, as stage1.dormant.test.ts does; stage 2,
// momentum (rules 7) and the chain level-up stay on. Rules 7's connection growth, moving capitals, the Lumber camp cost of 4, the Lumber camp
// and Market growth of 2 and Scout sight 1, equal start gold and no Spartan growth discount are switched off the same way (startGold [10, 10], Spartan growthExtra 0, connectGrowth 0, capitalMoves false, cost 3, growth 1, sight 3).
// Rules 8's mountain range bonus and turn end are switched off too (rangeBonus 0, endsTurn false), and the rules 7 tech tree is back (techTree 'rules7').
// Rules 9's level 2 reward gold of 5 and the faction growth extra from level 2 only are switched off too (rewardGold 6, growthExtraFrom 1).
// The record test below is meant for the rules 3 engine, never this one.
vi.mock('./data/config', async (orig) => {
  const m = await orig<typeof import('./data/config')>();
  const b = m.CONFIG.buildings;
  return {
    CONFIG: {
      ...m.CONFIG, startGold: [10, 10], closedFog: false, connectGrowth: 0, capitalMoves: false, hunker: { ...m.CONFIG.hunker, on: false }, mountain: { ...m.CONFIG.mountain, rangeBonus: 0, endsTurn: false, tech: null }, citySightExtra: 1, techTree: 'rules7', blockade: { ...m.CONFIG.blockade, on: false }, rewardGold: 6, growthExtraFrom: 1,
      buildings: { ...b, lumberCamp: { ...b.lumberCamp, cost: 3, growth: 1 }, market: { ...b.market, growth: 1 } },
    },
  };
});
vi.mock('./data/units', async (orig) => {
  const m = await orig<typeof import('./data/units')>();
  return { UNITS: { ...m.UNITS, scout: { ...m.UNITS.scout, sight: 3 } } };
});
vi.mock('./data/factions', async (orig) => {
  const m = await orig<typeof import('./data/factions')>();
  return { FACTIONS: { ...m.FACTIONS, spartans: { ...m.FACTIONS.spartans, growthExtra: 0, capitalStartLevel: 1 }, mongols: { ...m.FACTIONS.mongols, growthExtra: 1, tributeVillage: 3, tributeCityBase: 3, territoryRiding: false, mountedMoveBonus: 2, relayMountedOnly: false, canBuildRoads: true } } };
});

// Strip what plan 5, rules 6, rules 7 (with hunker and momentum) and rules 8 (turnEnded, the harvested tile flag) added, so a stage 1 state hashes as it did on rules 3.
function stage1Shape(s: MatchState): unknown {
  return {
    ...s, rulesVersion: 3, units: s.units.map(({ deeds: _d, heroTraits: _h, item: _i, itemTurn: _t, bonusMp: _b, hunkered: _k, momentum: _m, turnEnded: _e, wear: _w, ...rest }) => rest),
    cities: s.cities.map(({ linked: _l, ...rest }) => rest),
    tiles: Object.fromEntries(Object.entries(s.tiles).map(([k, { harvested: _v, ...t }]) => [k, t])),
  };
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

test('until stage 2 first changes an outcome, the current rules (rules 6 movement and rules 7 off) play the rules 3 playout exactly', () => {
  const { actions, hashes } = (JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture).fingerprint;
  let s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  let matched = 0;
  for (let i = 0; i < actions.length; i++) {
    const r = applyAction(s, actions[i]!);
    expect(r.ok, `action ${i}`).toBe(true);
    if (!r.ok) return;
    if (r.events.some((e) => e.type === 'treasure' || e.type === 'heroTrait' || e.type === 'momentum' || e.type === 'chainEnded')) break;
    expect(hashState(stage1Shape(r.state) as MatchState), `after action ${i}`).toBe(hashes[i]);
    s = r.state; matched = i + 1;
  }
  expect(matched).toBeGreaterThan(0);
  console.info(`stage 1 provenance: ${matched} of ${actions.length} actions identical`);
}, 30_000);
