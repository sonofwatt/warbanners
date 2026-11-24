/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { applyAction } from './apply';
import { hashState } from './hash';
import { createMatch } from './state';
import type { Action, MatchState } from './types';

// With stage 2 switched off through CONFIG alone (no trait can be earned, a treasure draws among stage 1's
// three outcomes, since rules 7 every momentum price is 0 so a chain kill costs nothing, and since rules 6 the old fog rule, the flat Mongol move
// bonus of a whole tile and endless chains are back through CONFIG and the faction data, and since rules 7 no connection
// growth, no capital moves, a growth of 1 for a Lumber camp, equal start gold, no Spartan growth discount, and a Market, the Lumber camp's old cost of 3, and the Scout's sight of 3 and no Hunker through CONFIG and
// the unit data, and since rules 8 no mountain range bonus and no mountain turn end through CONFIG.mountain, and the rules 7 tech tree through CONFIG.techTree), the current rules must replay every recorded rules 3 playout hash for hash. CONFIG is deep-frozen, so the factories build new objects. This file is
// alone because vi.mock binds a whole file.
vi.mock('./data/config', async (orig) => {
  const m = await orig<typeof import('./data/config')>();
  const off = { fight: Infinity, march: Infinity, survive: Infinity, rest: Infinity };
  return {
    CONFIG: {
      ...m.CONFIG,
      startGold: [10, 10],
      momentum: { ...m.CONFIG.momentum, price: Object.fromEntries(Object.keys(m.CONFIG.momentum.price).map((k) => [k, 0])), bracedPrice: 0 },
      closedFog: false,
      levelUpEndsChain: false,
      connectGrowth: 0,
      capitalMoves: false,
      hunker: { ...m.CONFIG.hunker, on: false }, mountain: { ...m.CONFIG.mountain, rangeBonus: 0, endsTurn: false, tech: null }, citySightExtra: 1, techTree: 'rules7', blockade: { ...m.CONFIG.blockade, on: false },
      buildings: {
        ...m.CONFIG.buildings,
        lumberCamp: { ...m.CONFIG.buildings.lumberCamp, cost: 3, growth: 1 },
        market: { ...m.CONFIG.buildings.market, growth: 1 },
      },
      heroes: { ...m.CONFIG.heroes, thresholds: off, agogeThresholds: off },
      treasure: { ...m.CONFIG.treasure, table: ['gold', 'explore', 'unit'] },
    },
  };
});

vi.mock('./data/factions', async (orig) => {
  const m = await orig<typeof import('./data/factions')>();
  return { FACTIONS: { ...m.FACTIONS, spartans: { ...m.FACTIONS.spartans, growthExtra: 0 }, mongols: { ...m.FACTIONS.mongols, growthExtra: 1, territoryRiding: false, mountedMoveBonus: 2, relayMountedOnly: false, canBuildRoads: true } } };
});

vi.mock('./data/units', async (orig) => {
  const m = await orig<typeof import('./data/units')>();
  return { UNITS: { ...m.UNITS, scout: { ...m.UNITS.scout, sight: 3 } } };
});

interface Fixture {
  fingerprint: { actions: Action[]; hashes: string[] };
  playouts: { seed: number; turns: number; actions: Action[]; hashes: Record<number, string> }[];
}
const fixture = JSON.parse(readFileSync(new URL('./stage1.fixture.json', import.meta.url), 'utf8')) as Fixture;

// Strip what plan 5, rules 6, rules 7 (with hunker and momentum) and rules 8 (turnEnded, the harvested tile flag) added, so a stage 1 state hashes as it did on rules 3.
function stage1Shape(s: MatchState): unknown {
  return {
    ...s, rulesVersion: 3, units: s.units.map(({ deeds: _d, heroTraits: _h, item: _i, itemTurn: _t, bonusMp: _b, hunkered: _k, momentum: _m, turnEnded: _e, ...rest }) => rest),
    cities: s.cities.map(({ linked: _l, ...rest }) => rest),
    tiles: Object.fromEntries(Object.entries(s.tiles).map(([k, { harvested: _v, ...t }]) => [k, t])),
  };
}

test('with stage 2 switched off, rules 4 replays the rules 3 fingerprint playout hash for hash', () => {
  const { actions, hashes } = fixture.fingerprint;
  let s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  for (let i = 0; i < actions.length; i++) {
    const r = applyAction(s, actions[i]!);
    expect(r.ok, `action ${i}`).toBe(true);
    if (!r.ok) return;
    s = r.state;
    expect(hashState(stage1Shape(s) as MatchState), `after action ${i}`).toBe(hashes[i]);
  }
  expect(hashes.at(-1)).toBe('ba3e0e466edfedd3');
}, 30_000);

test.each([7, 1, 3])('with stage 2 switched off, the seed %i speed playout replays hash for hash', (seed) => {
  const p = fixture.playouts.find((x) => x.seed === seed)!;
  let s = createMatch({ seed, factions: ['spartans', 'mongols'] });
  let compared = 0;
  for (let i = 0; i < p.actions.length; i++) {
    const r = applyAction(s, p.actions[i]!);
    expect(r.ok, `action ${i}`).toBe(true);
    if (!r.ok) return;
    s = r.state;
    const want = p.hashes[i];
    if (want !== undefined) {
      expect(hashState(stage1Shape(s) as MatchState), `seed ${seed} after action ${i}`).toBe(want);
      compared += 1;
    }
  }
  expect(compared).toBeGreaterThan(0);
}, 60_000);
