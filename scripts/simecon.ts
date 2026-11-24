// Where each faction's gold went in a batch of AI matches: research (which techs, in which round), harvests, buildings,
// walls, roads and training. Reads the JSON lines of `npm run sim:ai -- ... --json out.jsonl --actions`.
// npx tsx scripts/simecon.ts out.jsonl
import { readFileSync } from 'node:fs';
import { applyAction, createMatch } from '../src/engine/index';
import type { Action, FactionId, MatchState, PlayerId } from '../src/engine/index';

type Line = { seed: number; factions: [FactionId, FactionId]; winner: PlayerId | null; adjudged: PlayerId | null; actions: Action[] };
const lines = readFileSync(process.argv[2]!, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Line);

type Acc = {
  sides: number; wins: number;
  techRound: Record<string, number[]>;           // rounds a tech was bought in, one per side that bought it
  firstTechs: Record<string, number>;            // the first three techs bought, as a sequence
  spend: Record<string, number>;                 // gold by kind
  count: Record<string, number>;                 // actions by kind (harvest:fish, build:farm, ...)
  goldAt: Record<number, number[]>;              // unspent gold at the end of the turn, by round
  blockaded: number; blockadeGold: number; blockadeSides: number;   // rules 8: turns a city of this side started blockaded, gold cut, sides with any
};
const acc: Record<FactionId, Acc> = {
  spartans: { sides: 0, wins: 0, techRound: {}, firstTechs: {}, spend: {}, count: {}, goldAt: {}, blockaded: 0, blockadeGold: 0, blockadeSides: 0 },
  mongols: { sides: 0, wins: 0, techRound: {}, firstTechs: {}, spend: {}, count: {}, goldAt: {}, blockaded: 0, blockadeGold: 0, blockadeSides: 0 },
};
const add = (r: Record<string, number>, k: string, v: number): void => { r[k] = (r[k] ?? 0) + v; };

for (const l of lines) {
  let s: MatchState = createMatch({ seed: l.seed, factions: l.factions });
  const bought: string[][] = [[], []];
  const hit = [false, false];
  for (const p of [0, 1] as const) {
    const f = l.factions[p];
    acc[f].sides += 1;
    if ((l.winner ?? l.adjudged) === p) acc[f].wins += 1;
  }
  for (const a of l.actions) {
    const me = s.current;
    const f = l.factions[me]!;
    const round = Math.floor(s.stamp / 2);
    const gold = s.players[me]!.gold;
    const r = applyAction(s, a);
    if (!r.ok) continue;
    for (const e of r.events) {
      if (e.type !== 'blockaded') continue;
      const owner = r.state.cities.find((c) => c.id === e.city)!.owner;
      const fo = l.factions[owner]!;
      acc[fo].blockaded += 1; acc[fo].blockadeGold += e.gold; hit[owner] = true;
    }
    const spent = gold - r.state.players[me]!.gold;
    let kind: string | null = null;
    if (a.type === 'research') { kind = 'research'; (acc[f].techRound[a.tech] ??= []).push(round); bought[me]!.push(a.tech); add(acc[f].count, `research:${a.tech}`, 1); }
    else if (a.type === 'harvest') { kind = 'harvest'; add(acc[f].count, `harvest:${s.tiles[a.at]!.resource}`, 1); }
    else if (a.type === 'build') { kind = 'build'; add(acc[f].count, `build:${a.building}`, 1); }
    else if (a.type === 'buildWalls') { kind = 'walls'; add(acc[f].count, 'walls', 1); }
    else if (a.type === 'road') { kind = 'road'; add(acc[f].count, 'road', 1); }
    else if (a.type === 'train' || a.type === 'campTrain') { kind = 'train'; }
    else if (a.type === 'endTurn') (acc[f].goldAt[round] ??= []).push(gold);
    if (kind !== null && spent > 0) add(acc[f].spend, kind, spent);
    s = r.state;
  }
  for (const p of [0, 1] as const) if (hit[p]) acc[l.factions[p]].blockadeSides += 1;
  for (const p of [0, 1] as const) add(acc[l.factions[p]].firstTechs, bought[p]!.slice(0, 3).join(' > ') || '(none)', 1);
}

const f1 = (x: number): string => x.toFixed(1);
const f2 = (x: number): string => x.toFixed(2);
for (const f of ['spartans', 'mongols'] as const) {
  const a = acc[f];
  const n = a.sides || 1;
  console.log(`== ${f}: ${a.sides} sides, won ${a.wins}`);
  console.log(`  gold spent per match: ${Object.entries(a.spend).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${f1(v / n)}`).join(', ')}`);
  console.log('  techs (share of sides that bought it, median round):');
  for (const [t, rs] of Object.entries(a.techRound).sort((x, y) => y[1].length - x[1].length)) {
    const sorted = [...rs].sort((x, y) => x - y);
    console.log(`    ${t.padEnd(12)} ${f2(rs.length / n)}  round ${sorted[Math.floor(sorted.length / 2)]}`);
  }
  console.log(`  first three techs: ${Object.entries(a.firstTechs).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => `${k} (${v})`).join('; ')}`);
  console.log(`  actions per match: ${Object.entries(a.count).filter(([k]) => !k.startsWith('research:')).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${f2(v / n)}`).join(', ')}`);
  const gl = [5, 10, 15, 20, 30].map((r) => { const g = a.goldAt[r] ?? []; return `r${r} ${g.length === 0 ? '-' : f1(g.reduce((x, y) => x + y, 0) / g.length)}`; });
  console.log(`  blockaded (its own cities): city-turns per match ${f2(a.blockaded / n)}, gold cut per match ${f2(a.blockadeGold / n)}, matches with any ${f2(a.blockadeSides / n)}`);
  console.log(`  unspent gold at end of turn: ${gl.join(', ')}`);
}
