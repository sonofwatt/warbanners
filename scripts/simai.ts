// Bulk AI-against-AI matches with a summary block, for tuning.
// npm run sim:ai -- --matches 100 --seed 1 --a normal --b hard --max-rounds 60 --swap --jobs 3 [--factions woodland,mongols] [--json out.jsonl [--actions]]
// npm run sim:adaptive -- --matches 6 [--seed 1] [--max-rounds 60]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { TACTICS, adaptiveSeries, census, runMatch, summarize } from '../src/ai/sim';
import type { SeatSpec, SimOpts, SimResult } from '../src/ai/sim';
import { FACTIONS, HERO_TRAITS } from '../src/engine/index';
import type { FactionId, TreasureOutcome } from '../src/engine/index';

const argv = process.argv.slice(2);
const flag = (name: string): boolean => argv.includes(`--${name}`);
function opt(name: string, fallback: string): string {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : fallback;
}
function seatOf(text: string): SeatSpec {
  if (text === 'easy' || text === 'normal' || text === 'hard') return { level: text };
  const dial = Number(text);
  if (!Number.isFinite(dial)) throw new Error(`a seat is easy, normal, hard or a dial number, not ${text}`);
  return { dial };
}

const matches = Number(opt('matches', '100'));
const seed = Number(opt('seed', '1'));
const maxRounds = Number(opt('max-rounds', '60'));

if (flag('adaptive')) {
  for (const opponentDial of [0.2, 0.85]) {
    const means = adaptiveSeries({ opponentDial, matches, seed, maxRounds });
    console.log(`adaptive vs dial ${opponentDial}: mean dial over each match's second half: ${means.map((m) => m.toFixed(3)).join(' ')}`);
  }
  process.exit(0);
}

const seats: [SeatSpec, SeatSpec] = [seatOf(opt('a', 'normal')), seatOf(opt('b', 'normal'))];
// rules 11: the pair of factions to play (the first takes seat a; --swap exchanges them, as for the default pair)
function factionsOf(text: string): [FactionId, FactionId] {
  const pair = text.split(',');
  if (pair.length !== 2 || pair.some((f) => !Object.hasOwn(FACTIONS, f))) {
    throw new Error(`--factions takes two of ${Object.keys(FACTIONS).join(', ')}, comma separated, not ${text}`);
  }
  return pair as [FactionId, FactionId];
}
const pairing = factionsOf(opt('factions', 'spartans,mongols'));
const played = [...new Set(pairing)];
const swap = flag('swap');
const jobs = Math.max(1, Number(opt('jobs', '1')));

// Every match this run plays, in order: each seed, then (with --swap) the same seed with the factions exchanged.
const all: SimOpts[] = [];
for (let i = 0; i < matches; i++) {
  all.push({ seed: seed + i, factions: pairing, seats, maxRounds });
  if (swap) all.push({ seed: seed + i, factions: [pairing[1], pairing[0]], seats, maxRounds });
}

const shard = opt('shard', '');
if (shard !== '') {
  // A child: plays its share and writes one JSON line per match, with its index in the whole run.
  const [i, n] = shard.split('/').map(Number) as [number, number];
  all.forEach((o, index) => {
    if (index % n !== i) return;
    const { actions, ...rest } = runMatch(o);
    process.stdout.write(`${JSON.stringify({ index, ...rest, ...(flag('actions') ? { actions } : {}) })}\n`);
  });
  process.exit(0);
}

type Line = SimResult & { index: number };

function runShards(): Promise<Line[]> {
  const script = process.argv[1]!;
  const rest = argv.filter((_, k) => !(argv[k] === '--jobs' || argv[k - 1] === '--jobs' || argv[k] === '--json' || argv[k - 1] === '--json'));
  const children = Array.from({ length: jobs }, (_, i) => new Promise<Line[]>((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, script, ...rest, '--shard', `${i}/${jobs}`], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      out += d;
      process.stderr.write(`\r${(out.match(/\n/g) ?? []).length} matches from shard ${i}   `);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) { reject(new Error(`shard ${i} exited with ${code}`)); return; }
      resolve(out.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Line));
    });
  }));
  return Promise.all(children).then((parts) => parts.flat().sort((a, b) => a.index - b.index));
}

const pct = (x: number): string => `${(100 * x).toFixed(1)}%`;
const f2 = (x: number): string => x.toFixed(2);

const lines = await runShards();
process.stderr.write('\n');
const json = opt('json', '');
if (json !== '') writeFileSync(json, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');   // lines carry actions only with --actions
const results: SimResult[] = lines.map(({ index: _index, ...r }) => ({ ...r, actions: r.actions ?? [] }));
const s = summarize(results);
const per = s.perFaction;
const trained = (f: FactionId): string => {
  const sum: Record<string, number> = {};
  for (const r of results) for (const p of [0, 1] as const) {
    if (r.factions[p] !== f) continue;
    for (const [t, n] of Object.entries(r.sides[p].unitsTrained)) sum[t] = (sum[t] ?? 0) + (n ?? 0);
  }
  const played = results.length;
  return Object.entries(sum).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${f2(n / played)}`).join(', ');
};
const refusals = results.reduce((a, r) => a + r.refusals, 0);
const nonMove = results.reduce((a, r) => a + r.nonMoveRefusals, 0);
const replans = results.reduce((a, r) => a + r.replans, 0);
const share = (a: number, b: number): string => (b === 0 ? 'n/a' : pct(a / b));
const n = results.length;
const heroMeans = [0, 1].map((p) => results.reduce((a, r) => a + r.sides[p]!.heroes, 0) / (n || 1));
const withHero = results.filter((r) => r.sides[0].heroes + r.sides[1].heroes > 0).length;
const firstHeroMatches = results.filter((r) => r.firstHero !== null && (r.winner ?? r.adjudged) !== null);
const firstHeroWins = firstHeroMatches.filter((r) => (r.winner ?? r.adjudged) === r.firstHero).length;
const traitLine = (f: FactionId): string => {
  const sum: Record<string, number> = {};
  for (const r of results) for (const p of [0, 1] as const) {
    if (r.factions[p] !== f) continue;
    for (const [t, c] of Object.entries(r.sides[p].traitsEarned)) sum[t] = (sum[t] ?? 0) + (c ?? 0);
  }
  const played = results.length;
  return HERO_TRAITS.map((t) => `${t} ${f2((sum[t] ?? 0) / (played || 1))}`).join(', ');
};
const treasureSum: Partial<Record<TreasureOutcome, number>> = {};
let claimed = 0; let drunk = 0;
for (const r of results) for (const p of [0, 1] as const) {
  for (const [o, c] of Object.entries(r.sides[p].treasures) as [TreasureOutcome, number][]) {
    treasureSum[o] = (treasureSum[o] ?? 0) + c; claimed += c;
  }
  drunk += r.sides[p].draughtsDrunk;
}
const draughtsFound = treasureSum.draught ?? 0;
const heroLines = [
  `heroes per match: first seat ${f2(heroMeans[0]!)}  second seat ${f2(heroMeans[1]!)}  both ${f2(heroMeans[0]! + heroMeans[1]!)}`
    + `  (lost per match ${f2(results.reduce((a, r) => a + r.sides[0].heroesLost + r.sides[1].heroesLost, 0) / (n || 1))})`,
  `matches with at least one hero ${share(withHero, n)}  first hero's side won ${share(firstHeroWins, firstHeroMatches.length)} of ${firstHeroMatches.length} decided`,
  ...played.map((f) => `${f} traits per match: ${traitLine(f)}  (total ${f2(per[f].traitsEarned)}, heroes ${f2(per[f].heroes)})`),
  `treasures claimed per match ${f2(claimed / (n || 1))}: ${Object.entries(treasureSum).sort((a, b) => b[1] - a[1]).map(([o, c]) => `${o} ${f2(c / (n || 1))}`).join(', ')}`,
  `draughts drunk ${drunk} of ${draughtsFound} found (${share(drunk, draughtsFound)})`,
];
const sumOf = (k: 'kills' | 'chainKills' | 'chainSweeps' | 'doubleKills'): number => results.reduce((a, r) => a + r.sides[0][k] + r.sides[1][k], 0);
const chainLine = `chain: sweeps (one unit, 3+ kills in a turn) per 100 matches ${f2(100 * sumOf('chainSweeps') / (n || 1))}  (2+ kills ${f2(100 * sumOf('doubleKills') / (n || 1))})`
  + `  chain kills per match ${f2(sumOf('chainKills') / (n || 1))}  chain-unit kill share ${share(sumOf('chainKills'), sumOf('kills'))}`
  + `  knights trained per match ${f2(results.reduce((a, r) => a + (r.sides[0].unitsTrained.knight ?? 0) + (r.sides[1].unitsTrained.knight ?? 0), 0) / (n || 1))}`;
const travel = (f: FactionId): string => {
  let tiles = 0; let turns = 0;
  for (const r of results) for (const p of [0, 1] as const) {
    if (r.factions[p] !== f) continue;
    tiles += r.sides[p].mountedTiles; turns += r.sides[p].mountedTurns;
  }
  return turns === 0 ? 'n/a' : f2(tiles / turns);
};
const cen = census(results);
const ratio = (a: number, b: number): string => `${a}/${b} ${share(a, b)}`;
const censusLines = played.flatMap((f) => [
  `census ${f} units (matches trained / matches with the tech, per match): ${Object.entries(cen.units[f])
    .map(([t, r]) => `${t} ${ratio(r!.trained, r!.had)} ${f2(r!.total / (n || 1))}`).join(', ')}`,
  `census ${f} knights where chivalry: ${ratio(cen.chivalry[f].knights, cen.chivalry[f].had)}`
    + `  rewards: ${Object.entries(cen.rewards[f]).map(([w, c]) => `${w} ${c}`).join(', ')}`
    + `  level 5 champion share ${share(cen.rewards[f].champion ?? 0, (cen.rewards[f].champion ?? 0) + (cen.rewards[f].support ?? 0))}`,
  `census ${f} tactics (matches used / matches possible, uses per match): ${TACTICS
    .filter((t) => (cen.tactics[f][t]?.possible ?? 0) > 0)
    .map((t) => { const r = cen.tactics[f][t]!; return `${t} ${ratio(r.used, r.possible)} ${f2(r.total / (n || 1))}`; }).join(', ')}`,
]);
const roadLines = played.map((f) => {
  const r = cen.roads[f];
  const played = results.filter((x) => x.factions.includes(f)).length;
  return `census ${f} roads: laid per match ${f2(r.laid / (played || 1))}  connections per match ${f2(r.connections / (played || 1))}`
    + `  matches with a connection ${ratio(r.matchesConnected, played)}`;
});
const classic = played.includes('spartans') && played.includes('mongols');
const travelLine = `travel: tiles moved per mounted unit per turn  ${(classic ? ['mongols', 'spartans'] as FactionId[] : played).map((f) => `${f} ${travel(f)}`).join('  ')}`;
console.log([
  `matches ${s.matches}  seats a=${opt('a', 'normal')} b=${opt('b', 'normal')}  seed ${seed}  max rounds ${maxRounds}${swap ? '  swap' : ''}`,
  s.mirror !== null
    ? `win share by seat (${s.mirror} v ${s.mirror}): first ${pct(s.seatWinRate[0])}  second ${pct(s.seatWinRate[1])}  (adjudged stalls count half)`
    : `win share: ${played.map((f) => `${f} ${pct(s.winRate[f])}`).join('  ')}  (adjudged stalls count half)`,
  `seat win share: first ${pct(s.seatWinRate[0])}  second ${pct(s.seatWinRate[1])}`,
  `stalled ${pct(s.stalledShare)}  rounds p10 ${s.rounds.p10}  median ${s.rounds.median}  p90 ${s.rounds.p90}`,
  `refusals ${refusals} (not moves ${nonMove})  replans ${replans}`,
  ...played.map((f) => {
    const m = per[f];
    return `${f}: cities ${f2(m.cities)}  at round 10 ${f2(m.citiesAtRound10)}  trained ${f2(m.unitsTrained)}  attacks ${f2(m.attacks)}  kills ${f2(m.kills)}`
      + `  mounted attacks ${f2(m.mountedAttacks)}  raid retreats ${f2(m.raidRetreats)}  adjacent ${f2(m.adjacentShare)}`
      + `  lures ${f2(m.lures)} onto capturable ${f2(m.lureOntoCapturable)} lured captures ${f2(m.luredCaptures)}  forest entries short of mp ${f2(m.forestEntriesWithLittleMp)}`
      + `\n  trained per match: ${trained(f)}`;
  }),
  ...(classic ? [`spartan adjacent minus mongol ${f2(per.spartans.adjacentShare - per.mongols.adjacentShare)}`
    + `  mongol cities at round 10 minus spartan ${f2(per.mongols.citiesAtRound10 - per.spartans.citiesAtRound10)}`
    + `  mongol raid retreats / mounted attacks ${f2(per.mongols.mountedAttacks === 0 ? 0 : per.mongols.raidRetreats / per.mongols.mountedAttacks)}`] : []),
  ...heroLines,
  chainLine,
  travelLine,
  ...censusLines,
  ...roadLines,
].join('\n'));
