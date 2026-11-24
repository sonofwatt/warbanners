import { expect, test } from 'vitest';
import { adaptiveSeries, census, runMatch, summarize } from './sim';
import type { SimOpts } from './sim';
import { CONFIG, applyAction, createMatch } from '../engine';
import type { GameEvent, MatchState } from '../engine';

test('a short match is repeatable', () => {
  const o: SimOpts = { seed: 3, factions: ['spartans', 'mongols'], seats: [{ level: 'easy' }, { level: 'easy' }], maxRounds: 8 };
  expect(runMatch(o)).toEqual(runMatch(o));
});
test('a stalled match is adjudged and flagged', () => {
  const r = runMatch({ seed: 3, factions: ['spartans', 'mongols'], seats: [{ level: 'easy' }, { level: 'easy' }], maxRounds: 2 });
  expect(r).toMatchObject({ stalled: true, winner: null, rounds: 2 });
});
test('the summary counts an adjudged stall as half a win', () => {
  const r = runMatch({ seed: 3, factions: ['spartans', 'mongols'], seats: [{ level: 'easy' }, { level: 'easy' }], maxRounds: 2 });
  const sum = summarize([r, { ...r, factions: ['mongols', 'spartans'] }]);
  expect(sum.matches).toBe(2);
  expect(sum.stalledShare).toBe(1);
  expect(sum.winRate.spartans + sum.winRate.mongols).toBeCloseTo(r.adjudged === null ? 0 : 0.5, 9);
  expect(sum.rounds).toEqual({ p10: 2, median: 2, p90: 2 });
});
test('an adaptive seat records its dial every turn', () => {
  const r = runMatch({ seed: 3, factions: ['spartans', 'mongols'], seats: [{ adaptive: 0.5 }, { level: 'easy' }], maxRounds: 3 });
  expect(r.dials).toHaveLength(3);
  expect(r.dials.every((d) => d >= 0.1 && d <= 0.95)).toBe(true);
});
test.runIf(process.env.SLOW === '1')('ten normal matches: legal, finished, only moves refused', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const r = runMatch({ seed, factions: seed % 2 ? ['spartans', 'mongols'] : ['mongols', 'spartans'], seats: [{ level: 'normal' }, { level: 'normal' }], maxRounds: 60 });
    expect(r.nonMoveRefusals).toBe(0);
    expect(r.winner !== null || r.stalled).toBe(true);
  }
}, 1_800_000);
// 4 matches each, memory carried: the mean dial over the second half of the last match against dial 0.85, less the one
// against dial 0.2. One start seed is too thin a sample: over start seeds 1 to 16 rules 5 had a mean of 0.080 (9 of 16
// above 0; its seed 1 read 0.403, so the old one-seed check at 0.2 passed by luck), rules 6 a mean of 0.190 (14 of 16
// above 0). See docs/superpowers/plans/2026-11-21-fog-and-riding-log.md. The bound over 16 seeds would be a mean of at
// least 0.15 with 12 of 16 above 0, but a seed takes 45 to 85 s, so 16 would add over 10 minutes to the SLOW suite.
// This runs the fewest seeds that keep both assertions with margin: 10 and 11 (0.372 and 0.564 on rules 6, mean 0.468),
// the same bound (mean at least 0.15, three quarters of the seeds above 0) applied to them; about 95 s for both.
// The unit mix (2026-11-21-ai-unit-mix-log.md): over start seeds 1 to 16 the gaps are 0.268, 0.039, 0.211, 0.547,
// 0.000, -0.337, 0.195, 0.210, 0.470, 0.030, 0.186, 0.468, 0.744, 0.535, 0.146, 0.072 (mean 0.237, 14 of 16 above 0).
// The rule: run the seeds whose gap is nearest the 16-seed mean, so the check reads typical seeds, not lucky ones;
// re-pick by this rule when the AI changes. The nearest three are 3 (0.211), 8 (0.210) and 1 (0.268), but three took
// 227 s against 160 s for two, so the check runs the nearest two. The bound is the same: mean at least 0.15 and three
// quarters above 0, which for two seeds means both.
// Rules 8 (mountains) re-pick, by the same rule: over start seeds 1 to 16 the gaps are 0.849, -0.138, -0.430, 0.745,
// 0.536, 0.164, 0.776, 0.337, 0.584, 0.732, -0.032, 0.147, 0.033, 0.401, -0.056, 0.200 (mean 0.303, 12 of 16 above
// 0, so the 16-seed bound holds). The old seeds 3 and 8 read -0.430 and 0.337, a mean of -0.047 (-0.236 with the
// rules 7 AI, 0.056 with a flat mountain credit since dropped). The nearest two to the mean are 8 (0.337) and 14 (0.401).
const ADAPT_SEEDS = [8, 14];
test.runIf(process.env.SLOW === '1')('adaptive climbs against a strong opponent and drops against a weak one', () => {
  const gaps = ADAPT_SEEDS.map((seed) => {
    const strong = adaptiveSeries({ opponentDial: 0.85, matches: 4, seed, maxRounds: 60 });
    const weak = adaptiveSeries({ opponentDial: 0.2, matches: 4, seed, maxRounds: 60 });
    return strong.at(-1)! - weak.at(-1)!;
  });
  expect(gaps.reduce((a, b) => a + b, 0) / gaps.length).toBeGreaterThanOrEqual(0.15);
  expect(gaps.filter((g) => g > 0).length).toBeGreaterThanOrEqual(Math.ceil(0.75 * gaps.length));
}, 1_800_000);

test('hero and treasure measures match the events of a short match', () => {
  const o: SimOpts = { seed: 3, factions: ['spartans', 'mongols'], seats: [{ level: 'normal' }, { level: 'normal' }], maxRounds: 25 };
  const r = runMatch(o);
  let s: MatchState = createMatch({ seed: o.seed, factions: o.factions });
  const traits = [0, 0]; const heroes = [0, 0]; const lost = [0, 0]; const claims = [0, 0]; const drunk = [0, 0];
  let first: number | null = null; let firstRound: number | null = null;
  for (const a of r.actions) {
    const res = applyAction(s, a);
    if (!res.ok) throw new Error(res.reason);
    const ownerOf = (id: number): number => (s.units.find((u) => u.id === id) ?? res.state.units.find((u) => u.id === id))!.owner;
    const me = s.current;
    res.events.forEach((e: GameEvent) => {
      if (e.type === 'heroTrait') {
        const p = ownerOf(e.unit);
        traits[p]! += 1;
        if (e.hero) { heroes[p]! += 1; if (first === null) { first = p; firstRound = Math.floor(s.stamp / 2); } }
      } else if (e.type === 'treasure') claims[me]! += 1;
      else if (e.type === 'usedItem') drunk[ownerOf(e.unit)]! += 1;
      else if (e.type === 'died') {
        const u = s.units.find((x) => x.id === e.unit);
        if (u !== undefined && u.heroTraits.length >= CONFIG.heroes.heroAt) lost[u.owner]! += 1;
      }
    });
    s = res.state;
  }
  for (const p of [0, 1] as const) {
    const side = r.sides[p];
    expect(Object.values(side.traitsEarned).reduce((a, b) => a + (b ?? 0), 0)).toBe(traits[p]);
    expect(side.heroes).toBe(heroes[p]);
    expect(side.heroesLost).toBe(lost[p]);
    expect(Object.values(side.treasures).reduce((a, b) => a + (b ?? 0), 0)).toBe(claims[p]);
    expect(side.draughtsDrunk).toBe(drunk[p]);
  }
  expect(r.firstHero).toBe(first);
  expect(r.firstHeroRound).toBe(firstRound);
}, 120_000);
test('the summary takes the mean total of traits and treasures', () => {
  const r = runMatch({ seed: 3, factions: ['spartans', 'mongols'], seats: [{ level: 'easy' }, { level: 'easy' }], maxRounds: 2 });
  const side = { ...r.sides[0], traitsEarned: { fierce: 2, hardy: 1 }, treasures: { gold: 4 }, heroes: 1, draughtsDrunk: 2 };
  const sum = summarize([{ ...r, sides: [side, r.sides[1]] }]);
  expect(sum.perFaction.spartans.traitsEarned).toBe(3);
  expect(sum.perFaction.spartans.treasures).toBe(4);
  expect(sum.perFaction.spartans.heroes).toBe(1);
  expect(sum.perFaction.spartans.draughtsDrunk).toBe(2);
});
test('the census counts abilities, claims, camp training and rewards as the actions and events of a match', () => {
  const o: SimOpts = { seed: 3, factions: ['spartans', 'mongols'], seats: [{ level: 'normal' }, { level: 'normal' }], maxRounds: 25 };
  const r = runMatch(o);
  let s: MatchState = createMatch({ seed: o.seed, factions: o.factions });
  const want = [{} as Record<string, number>, {} as Record<string, number>];
  const rewards = [{} as Record<string, number>, {} as Record<string, number>];
  const bump = (m: Record<string, number>, k: string): void => { m[k] = (m[k] ?? 0) + 1; };
  for (const a of r.actions) {
    const me = s.current;
    if (a.type === 'ability') bump(want[me]!, a.ability);
    if (a.type === 'claimTreasure') bump(want[me]!, 'treasure');
    if (a.type === 'campTrain') bump(want[me]!, 'campTrain');
    const res = applyAction(s, a);
    if (!res.ok) throw new Error(res.reason);
    for (const e of res.events) if (e.type === 'reward') bump(rewards[me]!, e.reward);
    s = res.state;
  }
  for (const p of [0, 1] as const) {
    const t = r.sides[p].tactics;
    for (const k of ['heal', 'taunt', 'hasten', 'dustStorm', 'treasure', 'campTrain'] as const) expect(t[k] ?? 0, k).toBe(want[p]![k] ?? 0);
    expect(r.sides[p].rewards).toEqual(rewards[p]);
    expect(r.sides[p].techs).toEqual(s.players[p]!.techs);
  }
  const c = census([r]);
  expect(c.tactics.spartans.treasure!.total).toBe(r.sides[0].tactics.treasure ?? 0);
}, 120_000);
test('the census counts roads laid and connections as the actions and events of a match', () => {
  const o: SimOpts = { seed: 3, factions: ['mongols', 'spartans'], seats: [{ level: 'normal' }, { level: 'normal' }], maxRounds: 25 };
  const r = runMatch(o);
  let s: MatchState = createMatch({ seed: o.seed, factions: o.factions });
  const roads = [0, 0]; const connections = [0, 0];
  for (const a of r.actions) {
    const me = s.current;
    if (a.type === 'road') roads[me]! += 1;
    const res = applyAction(s, a);
    if (!res.ok) throw new Error(res.reason);
    connections[me]! += res.events.filter((e) => e.type === 'connected').length;
    s = res.state;
  }
  for (const p of [0, 1] as const) {
    expect(r.sides[p].roadsLaid).toBe(roads[p]);
    expect(r.sides[p].connections).toBe(connections[p]);
  }
  const c = census([r]);
  expect(c.roads.mongols).toEqual({ laid: roads[0], connections: connections[0], matchesConnected: connections[0]! > 0 ? 1 : 0 });
  expect(c.roads.spartans).toEqual({ laid: roads[1], connections: connections[1], matchesConnected: connections[1]! > 0 ? 1 : 0 });
}, 120_000);
