// Bulk AI-against-AI matches for tuning: plays whole matches with the real turn driver and measures each side.
import { CONFIG, UNITS, createMatch, distance, isHero, parseKey } from '../engine';
import type { Action, FactionId, HeroTraitId, MatchState, PlayerId, TreasureOutcome, UnitTypeId } from '../engine';
import { adaptStep, betweenMatches, gapOf, standingOf } from './adapt';
import type { AdaptState } from './adapt';
import { runAiTurn } from './driver';
import { LEVEL_DIAL } from './types';
import type { AiLevel } from './types';

export type SeatSpec = { level: Exclude<AiLevel, 'adaptive'> } | { dial: number } | { adaptive: number };   // adaptive: its starting dial
export interface SimOpts { seed: number; factions: [FactionId, FactionId]; seats: [SeatSpec, SeatSpec]; maxRounds: number }
export interface SideMetrics {
  cities: number; citiesAtRound10: number; unitsTrained: Partial<Record<UnitTypeId, number>>;
  attacks: number; kills: number; lures: number; lureOntoCapturable: number; luredCaptures: number;
  raidRetreats: number; mountedAttacks: number; adjacentShare: number; forestEntriesWithLittleMp: number;
  traitsEarned: Partial<Record<HeroTraitId, number>>; heroes: number; heroesLost: number;
  treasures: Partial<Record<TreasureOutcome, number>>; draughtsDrunk: number;
  chainKills: number;    // kills made by a chain unit (Knight, Khan's Guard) with its own attack
  chainSweeps: number;   // turns in which one unit made CHAIN_SWEEP_KILLS or more kills
  doubleKills: number;   // turns in which one unit made 2 or more kills
}
export interface SimResult {
  seed: number; factions: [FactionId, FactionId]; winner: PlayerId | null; stalled: boolean; adjudged: PlayerId | null;
  rounds: number; refusals: number; nonMoveRefusals: number; replans: number; dials: number[]; sides: [SideMetrics, SideMetrics];
  firstHero: PlayerId | null; firstHeroRound: number | null;   // the owner of the first unit to reach hero status, and the round
  actions: Action[];                                           // every action played, in order
}

const ROUND_FOR_CITIES = 10;
export const CHAIN_SWEEP_KILLS = 3;

const roundsOf = (s: MatchState): number => Math.floor(s.stamp / 2);
const isMounted = (t: UnitTypeId): boolean => (UNITS[t].traits as readonly string[]).includes('mounted');
const isChain = (t: UnitTypeId): boolean => (UNITS[t].traits as readonly string[]).includes('chain');
const citiesOf = (s: MatchState, p: PlayerId): number => s.cities.filter((c) => c.owner === p).length;

function emptySide(): SideMetrics {
  return {
    cities: 0, citiesAtRound10: 0, unitsTrained: {}, attacks: 0, kills: 0, lures: 0, lureOntoCapturable: 0, luredCaptures: 0,
    raidRetreats: 0, mountedAttacks: 0, adjacentShare: 0, forestEntriesWithLittleMp: 0,
    traitsEarned: {}, heroes: 0, heroesLost: 0, treasures: {}, draughtsDrunk: 0, chainKills: 0, chainSweeps: 0, doubleKills: 0,
  };
}

// The share of p's units that stand next to another of p's units.
function adjacentShareOf(s: MatchState, p: PlayerId): number | null {
  const own = s.units.filter((u) => u.owner === p);
  if (own.length === 0) return null;
  const next = own.filter((u) => own.some((o) => o.id !== u.id && distance(parseKey(u.pos), parseKey(o.pos)) === 1));
  return next.length / own.length;
}

// A tile a unit of `p` could capture: a village with no city on it, or a city p does not own.
function capturableFor(s: MatchState, p: PlayerId, k: string): boolean {
  const city = s.cities.find((c) => c.pos === k);
  if (city !== undefined) return city.owner !== p;
  return s.tiles[k]?.village === true;
}

function seatDial(spec: SeatSpec): number {
  if ('level' in spec) return LEVEL_DIAL[spec.level];
  if ('dial' in spec) return spec.dial;
  return spec.adaptive;
}

export function runMatch(o: SimOpts): SimResult {
  let s = createMatch({ seed: o.seed, factions: o.factions });
  const sides: [SideMetrics, SideMetrics] = [emptySide(), emptySide()];
  const adapt: (AdaptState | null)[] = o.seats.map((spec) => ('adaptive' in spec ? { dial: spec.adaptive, trend: 0 } : null));
  const shares: number[][] = [[], []];
  const lured = new Map<number, string>();       // unit id -> the capturable tile a lure pulled it onto
  const dials: number[] = [];
  let refusals = 0; let nonMoveRefusals = 0; let replans = 0;
  let citiesAt10: [number, number] | null = null;
  const actions: Action[] = [];
  let firstHero: PlayerId | null = null; let firstHeroRound: number | null = null;

  while (s.winner === null && roundsOf(s) < o.maxRounds) {
    const me = s.current;
    const side = sides[me]!;
    let dial = seatDial(o.seats[me]!);
    const a = adapt[me];
    if (a !== undefined && a !== null) {
      const next = adaptStep(a, gapOf(s, me));
      adapt[me] = next; dial = next.dial; dials.push(dial);
    }
    const log = runAiTurn(s, { player: me, dial, salt: o.seed * 2 + me });
    refusals += log.refused.length;
    nonMoveRefusals += log.refused.filter((x: Action) => x.type !== 'move').length;
    replans += log.replans;

    const attackedBy = new Set<number>();
    const killsBy = new Map<number, number>();   // this turn's kills by each of my attacking units
    for (const step of log.steps) {
      const { action, events, before } = step;
      const attacker = action.type === 'attack' ? before.units.find((x) => x.id === action.unit) : undefined;
      actions.push(action);
      if (action.type === 'endTurn') {
        const share = adjacentShareOf(before, me);
        if (share !== null) shares[me]!.push(share);
      }   // no continue: a turn start can earn a trait (Watchful), and its events come with the endTurn
      if (action.type === 'train' || action.type === 'campTrain') {
        side.unitsTrained[action.unitType] = (side.unitsTrained[action.unitType] ?? 0) + 1;
      }
      if (action.type === 'attack') {
        side.attacks += 1;
        const u = before.units.find((x) => x.id === action.unit);
        if (u !== undefined && isMounted(u.type)) { side.mountedAttacks += 1; attackedBy.add(u.id); }
      }
      if (action.type === 'move') {
        const u = before.units.find((x) => x.id === action.unit);
        if (u !== undefined && attackedBy.has(u.id)) { side.raidRetreats += 1; attackedBy.delete(u.id); }
        if (u !== undefined && isMounted(u.type) && before.tiles[action.to]?.terrain === 'forest'
          && u.mp < CONFIG.terrain.forest.enterCost) side.forestEntriesWithLittleMp += 1;
      }
      if (action.type === 'capture') {
        const u = before.units.find((x) => x.id === action.unit);
        if (u !== undefined && lured.get(u.id) === u.pos) side.luredCaptures += 1;
      }
      for (const e of events) {
        if (e.type === 'died') {
          const dead = before.units.find((x) => x.id === e.unit);
          if (dead !== undefined && dead.owner !== me) {
            side.kills += 1;
            if (attacker !== undefined) {
              killsBy.set(attacker.id, (killsBy.get(attacker.id) ?? 0) + 1);
              if (isChain(attacker.type)) side.chainKills += 1;
            }
          }
          if (dead !== undefined && isHero(dead)) sides[dead.owner]!.heroesLost += 1;
        } else if (e.type === 'heroTrait') {
          // a unit a treasure just spawned is not in `before`; it belongs to the player acting
          const owner = before.units.find((x) => x.id === e.unit)?.owner ?? me;
          const mine = sides[owner]!;
          mine.traitsEarned[e.trait] = (mine.traitsEarned[e.trait] ?? 0) + 1;
          if (e.hero) {
            mine.heroes += 1;
            if (firstHero === null) { firstHero = owner; firstHeroRound = roundsOf(before); }
          }
        } else if (e.type === 'treasure') {
          side.treasures[e.outcome] = (side.treasures[e.outcome] ?? 0) + 1;
        } else if (e.type === 'usedItem') {
          const owner = before.units.find((x) => x.id === e.unit)?.owner;
          if (owner !== undefined && e.item === 'draught') sides[owner]!.draughtsDrunk += 1;
        } else if (e.type === 'lured') {
          side.lures += 1;
          const target = before.units.find((x) => x.id === e.unit);
          if (target !== undefined && capturableFor(before, target.owner, e.to)) {
            side.lureOntoCapturable += 1;
            lured.set(e.unit, e.to);
          }
        }
      }
    }
    for (const n of killsBy.values()) {
      if (n >= CHAIN_SWEEP_KILLS) side.chainSweeps += 1;
      if (n >= 2) side.doubleKills += 1;
    }
    s = log.state;
    if (citiesAt10 === null && roundsOf(s) >= ROUND_FOR_CITIES) citiesAt10 = [citiesOf(s, 0), citiesOf(s, 1)];
  }

  const stalled = s.winner === null;
  let adjudged: PlayerId | null = null;
  if (stalled) {
    const a0 = standingOf(s, 0); const a1 = standingOf(s, 1);
    adjudged = a0 > a1 ? 0 : a1 > a0 ? 1 : null;
  }
  const at10 = citiesAt10 ?? [citiesOf(s, 0), citiesOf(s, 1)];
  for (const p of [0, 1] as const) {
    sides[p].cities = citiesOf(s, p);
    sides[p].citiesAtRound10 = at10[p];
    const sh = shares[p]!;
    sides[p].adjacentShare = sh.length === 0 ? 0 : sh.reduce((x, y) => x + y, 0) / sh.length;
  }
  return {
    seed: o.seed, factions: o.factions, winner: s.winner, stalled, adjudged, rounds: roundsOf(s),
    refusals, nonMoveRefusals, replans, dials, sides, firstHero, firstHeroRound, actions,
  };
}

export interface Summary {
  matches: number; winRate: Record<FactionId, number>; seatWinRate: [number, number]; stalledShare: number;
  rounds: { p10: number; median: number; p90: number }; perFaction: Record<FactionId, Record<keyof SideMetrics, number>>;
}

// A win counts 1, a stall adjudged to that side counts half.
function credit(r: SimResult, p: PlayerId): number {
  if (r.winner !== null) return r.winner === p ? 1 : 0;
  return r.adjudged === p ? 0.5 : 0;
}

// Nearest-rank percentile of sorted values.
function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i]!;
}

const METRIC_KEYS: (keyof SideMetrics)[] = [
  'cities', 'citiesAtRound10', 'unitsTrained', 'attacks', 'kills', 'lures', 'lureOntoCapturable', 'luredCaptures',
  'raidRetreats', 'mountedAttacks', 'adjacentShare', 'forestEntriesWithLittleMp',
  'traitsEarned', 'heroes', 'heroesLost', 'treasures', 'draughtsDrunk', 'chainKills', 'chainSweeps', 'doubleKills',
];

const total = (r: Partial<Record<string, number>>): number => Object.values(r).reduce((a: number, b) => a + (b ?? 0), 0);

// Means per match; unitsTrained, traitsEarned and treasures are the mean of their totals.
export function summarize(results: readonly SimResult[]): Summary {
  const n = results.length;
  const factions: FactionId[] = ['spartans', 'mongols'];
  const winRate = { spartans: 0, mongols: 0 } as Record<FactionId, number>;
  const seatWinRate: [number, number] = [0, 0];
  const sums = {} as Record<FactionId, Record<keyof SideMetrics, number>>;
  const counts = { spartans: 0, mongols: 0 } as Record<FactionId, number>;
  for (const f of factions) sums[f] = Object.fromEntries(METRIC_KEYS.map((k) => [k, 0])) as Record<keyof SideMetrics, number>;
  for (const r of results) {
    for (const p of [0, 1] as const) {
      const f = r.factions[p];
      const c = credit(r, p);
      winRate[f] += c; seatWinRate[p] += c; counts[f] += 1;
      const side = r.sides[p];
      for (const k of METRIC_KEYS) {
        const v = k === 'unitsTrained' || k === 'traitsEarned' || k === 'treasures' ? total(side[k]) : side[k] as number;
        sums[f][k] += v;
      }
    }
  }
  const perFaction = {} as Record<FactionId, Record<keyof SideMetrics, number>>;
  for (const f of factions) {
    perFaction[f] = Object.fromEntries(METRIC_KEYS.map((k) => [k, counts[f] === 0 ? 0 : sums[f][k] / counts[f]])) as Record<keyof SideMetrics, number>;
    // a faction's share of the matches it played
    winRate[f] = counts[f] === 0 ? 0 : winRate[f] / counts[f];
  }
  const rounds = results.map((r) => r.rounds).sort((a, b) => a - b);
  return {
    matches: n, winRate,
    seatWinRate: [n === 0 ? 0 : seatWinRate[0] / n, n === 0 ? 0 : seatWinRate[1] / n],
    stalledShare: n === 0 ? 0 : results.filter((r) => r.stalled).length / n,
    rounds: { p10: percentile(rounds, 0.1), median: percentile(rounds, 0.5), p90: percentile(rounds, 0.9) },
    perFaction,
  };
}

// An adaptive seat against a fixed dial over several matches, its dial carried from match to match the way the
// app carries it. Returns, per match, the mean of its dial over the second half of that match's turns.
export function adaptiveSeries(o: { opponentDial: number; matches: number; seed: number; maxRounds: number; start?: number }): number[] {
  let dial = o.start ?? 0.5;
  const out: number[] = [];
  for (let i = 0; i < o.matches; i++) {
    const seat = i % 2;                                         // the adaptive seat alternates, and so do the factions
    const factions: [FactionId, FactionId] = i % 4 < 2 ? ['spartans', 'mongols'] : ['mongols', 'spartans'];
    const seats: [SeatSpec, SeatSpec] = seat === 0
      ? [{ adaptive: dial }, { dial: o.opponentDial }] : [{ dial: o.opponentDial }, { adaptive: dial }];
    const r = runMatch({ seed: o.seed + i, factions, seats, maxRounds: o.maxRounds });
    const half = r.dials.slice(Math.floor(r.dials.length / 2));
    out.push(half.length === 0 ? dial : half.reduce((a, b) => a + b, 0) / half.length);
    const last = r.dials.at(-1) ?? dial;
    const won = r.winner ?? r.adjudged;
    dial = betweenMatches(last, won === null ? 'none' : won === seat ? 'ai' : 'person');
  }
  return out;
}
