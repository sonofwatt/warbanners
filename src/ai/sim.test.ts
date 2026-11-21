import { expect, test } from 'vitest';
import { adaptiveSeries, runMatch, summarize } from './sim';
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
test.runIf(process.env.SLOW === '1')('adaptive climbs against a strong opponent and drops against a weak one', () => {
  // 4 matches each, memory carried: mean dial over the second half of the last match vs dial 0.85 exceeds the one vs dial 0.2 by at least 0.2
  const strong = adaptiveSeries({ opponentDial: 0.85, matches: 4, seed: 1, maxRounds: 60 });
  const weak = adaptiveSeries({ opponentDial: 0.2, matches: 4, seed: 1, maxRounds: 60 });
  expect(strong.at(-1)! - weak.at(-1)!).toBeGreaterThanOrEqual(0.2);
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
