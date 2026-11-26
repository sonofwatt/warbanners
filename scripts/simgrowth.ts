// How each faction's cities grew in a batch of AI matches: when the capital and other cities levelled, which rewards
// were taken, where growth came from, cities won and lost, and the economy round by round. Reads the JSON lines of
// `npm run sim:ai -- ... --json out.jsonl --actions`, replayed with this checkout's engine, so run it from a copy with
// the same rules as the batch (a batch from other rules does not replay).
// npx tsx scripts/simgrowth.ts out.jsonl [more.jsonl ...]
import { readFileSync } from 'node:fs';
import { applyAction, createMatch, growthNeeded, playerIncome } from '../src/engine/index';
import type { Action, City, FactionId, MatchState, PlayerId } from '../src/engine/index';

type Line = { seed: number; factions: [FactionId, FactionId]; winner: PlayerId | null; adjudged: PlayerId | null; actions: Action[] };

const ROUNDS = [2, 4, 6, 8, 10, 12, 15, 20, 25, 30, 40];
const KEYS = ['cities', 'levels', 'units', 'gold', 'income', 'capLevel', 'trained', 'spentTrain', 'spentResearch', 'spentGrowth'] as const;
type Key = typeof KEYS[number];

type Acc = {
  sides: number; wins: number;
  capReach: Record<number, number[]>;     // round the capital first reached level L (sides that did)
  otherToL2: number[];                     // rounds from gaining a non-capital city to its level 2 (cities that got there)
  otherGained: number; otherReachedL2: number;
  rewards: Record<string, number>;
  growthBy: Record<string, number>;        // growth points by source
  gainedVillage: number; gainedEnemy: number; lost: number;
  firstGainRound: number[];                // round of the first village capture
  at: Record<number, Record<Key, number[]>>;
};
const fresh = (): Acc => ({
  sides: 0, wins: 0, capReach: {}, otherToL2: [], otherGained: 0, otherReachedL2: 0, rewards: {}, growthBy: {},
  gainedVillage: 0, gainedEnemy: 0, lost: 0, firstGainRound: [], at: {},
});
const add = (r: Record<string, number>, k: string, v: number): void => { r[k] = (r[k] ?? 0) + v; };

function study(file: string): Record<FactionId, Acc> {
  const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Line);
  const acc: Record<FactionId, Acc> = { spartans: fresh(), mongols: fresh() };
  for (const l of lines) {
    let s: MatchState = createMatch({ seed: l.seed, factions: l.factions });
    const gainedAt = new Map<number, number>();           // city id -> round its present owner gained it (non-capital)
    const capReached = [new Set<number>(), new Set<number>()];
    const firstGain: (number | null)[] = [null, null];
    const run: Record<Key, number>[] = [0, 1].map(() => Object.fromEntries(KEYS.map((k) => [k, 0])) as Record<Key, number>);
    const snapped = new Set<string>();
    for (const p of [0, 1] as const) {
      const f = l.factions[p];
      acc[f].sides += 1;
      if ((l.winner ?? l.adjudged) === p) acc[f].wins += 1;
    }
    const snap = (round: number): void => {
      for (const p of [0, 1] as const) {
        const key = `${p}:${round}`;
        if (snapped.has(key)) continue;
        snapped.add(key);
        const f = l.factions[p];
        const mine = s.cities.filter((c) => c.owner === p);
        const v: Record<Key, number> = {
          ...run[p]!,
          cities: mine.length,
          levels: mine.reduce((a, c) => a + c.level, 0),
          units: s.units.filter((u) => u.owner === p).length,
          gold: s.players[p]!.gold,
          income: playerIncome(s, p),
          capLevel: mine.find((c) => c.capital)?.level ?? 0,
        };
        const at = (acc[f].at[round] ??= Object.fromEntries(KEYS.map((k) => [k, []])) as unknown as Record<Key, number[]>);
        for (const k of KEYS) at[k].push(v[k]);
      }
    };
    for (const a of l.actions) {
      const me = s.current;
      const round = Math.floor(s.stamp / 2);
      const gold = s.players[me]!.gold;
      const before = new Map(s.cities.map((c) => [c.id, { owner: c.owner, growth: c.growth, level: c.level }]));
      const r = applyAction(s, a);
      if (!r.ok) continue;
      const spent = gold - r.state.players[me]!.gold;
      if (a.type === 'train' || a.type === 'campTrain') { run[me]!.trained += 1; run[me]!.spentTrain += spent; }
      if (a.type === 'research') run[me]!.spentResearch += spent;
      if (a.type === 'harvest' || a.type === 'build') run[me]!.spentGrowth += Math.max(0, spent);
      for (const e of r.events) {
        if (e.type === 'cityLevel') {
          const c = r.state.cities.find((x) => x.id === e.city)!;
          const fo = l.factions[c.owner]!;
          if (c.capital && !capReached[c.owner]!.has(e.level)) {
            capReached[c.owner]!.add(e.level);
            (acc[fo].capReach[e.level] ??= []).push(round);
          }
          if (!c.capital && e.level === 2 && gainedAt.has(c.id)) {
            acc[fo].otherToL2.push(round - gainedAt.get(c.id)!); acc[fo].otherReachedL2 += 1; gainedAt.delete(c.id);
          }
        } else if (e.type === 'reward') {
          const c = r.state.cities.find((x) => x.id === e.city)!;
          add(acc[l.factions[c.owner]!].rewards, e.reward, 1);
        } else if (e.type === 'captured') {
          const was = before.get(e.city);
          const fb = l.factions[e.by]!;
          if (was === undefined) {
            acc[fb].gainedVillage += 1;
            if (firstGain[e.by] === null) { firstGain[e.by] = round; acc[fb].firstGainRound.push(round); }
          } else { acc[fb].gainedEnemy += 1; acc[l.factions[was.owner]!].lost += 1; }
          acc[fb].otherGained += 1;
          gainedAt.set(e.city, round);
        }
      }
      // growth by the action that brought it: each own city's growth gained, levels crossed included
      const source = r.events.some((e) => e.type === 'connected') ? 'connection' : a.type === 'chooseReward' ? 'reward' : a.type;
      for (const c of r.state.cities) {
        const b = before.get(c.id);
        if (b === undefined || b.owner !== c.owner) continue;
        let g = c.growth - b.growth;
        for (let L = b.level; L < c.level; L++) g += growthNeeded(s, { ...c, level: L } as City);
        if (g > 0) add(acc[l.factions[c.owner]!].growthBy, source, g);
      }
      s = r.state;
      // snapshot each player at the end of their own turn
      if (a.type === 'endTurn') {
        for (const R of ROUNDS) if (round === R) snap(R);
      }
    }
    // a match that ended before a round carries the end position forward for both sides
    for (const R of ROUNDS) snap(R);
  }
  return acc;
}

const f1 = (x: number): string => x.toFixed(1);
const f2 = (x: number): string => x.toFixed(2);
const mean = (xs: number[]): number => (xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length);
const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); return s.length === 0 ? NaN : s[Math.floor(s.length / 2)]!; };

function report(name: string, acc: Record<FactionId, Acc>): void {
  console.log(`#### ${name}`);
  for (const f of ['spartans', 'mongols'] as const) {
    const a = acc[f]; const n = a.sides || 1;
    console.log(`== ${f}: ${a.sides} sides, won ${a.wins}`);
    console.log(`  capital reaches level (share of sides, median round): ${[2, 3, 4, 5, 6].map((L) => `L${L} ${f2((a.capReach[L] ?? []).length / n)} r${median(a.capReach[L] ?? [])}`).join('  ')}`);
    console.log(`  other cities: gained ${f2(a.otherGained / n)} (villages ${f2(a.gainedVillage / n)}, enemy cities ${f2(a.gainedEnemy / n)}), lost ${f2(a.lost / n)};`
      + ` reached level 2 ${f2(a.otherReachedL2 / n)} (${f1(100 * a.otherReachedL2 / (a.otherGained || 1))}%), rounds to level 2 mean ${f1(mean(a.otherToL2))} median ${median(a.otherToL2)}`);
    console.log(`  first village captured: median round ${median(a.firstGainRound)} (${f2(a.firstGainRound.length / n)} of sides)`);
    console.log(`  rewards per match: ${Object.entries(a.rewards).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${f2(v / n)}`).join(', ')}`);
    console.log(`  growth per match by source: ${Object.entries(a.growthBy).map(([k, v]) => `${k} ${f2(v / n)}`).join(', ')}`);
    console.log(`  by round (mean): ${KEYS.join(' / ')}`);
    for (const R of ROUNDS) {
      const at = a.at[R]; if (at === undefined) continue;
      console.log(`    r${String(R).padEnd(3)} ${KEYS.map((k) => f2(mean(at[k]))).join(' / ')}`);
    }
  }
}

const files = process.argv.slice(2);
const studied = files.map((f) => study(f));
files.forEach((f, i) => report(f, studied[i]!));
