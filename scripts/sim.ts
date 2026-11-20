// Plays one random match from the public engine exports and prints a single summary line.
// Usage: npm run sim -- <seed> [maxTurns=200]
import { applyAction, createMatch, hashState, legalActions, rngInt } from '../src/engine/index';
import type { Action } from '../src/engine/index';

const MAX_ACTIONS_PER_TURN = 40;

const seed = Number(process.argv[2] ?? 1);
const maxTurns = Number(process.argv[3] ?? 200);
if (!Number.isInteger(seed) || !Number.isInteger(maxTurns) || maxTurns < 0) {
  console.error('usage: npm run sim -- <seed> [maxTurns=200]');
  process.exit(1);
}

let s = createMatch({ seed, factions: ['spartans', 'mongols'] });
let pick = seed;
let turns = 0;
const play = (a: Action): void => {
  const r = applyAction(s, a);
  if (!r.ok) throw new Error(`engine refused a legal action ${JSON.stringify(a)}: ${r.reason}`);
  s = r.state;
};

while (s.winner === null && turns < maxTurns) {
  for (let n = 0; n < MAX_ACTIONS_PER_TURN && s.winner === null; n++) {
    const acts = legalActions(s).filter((a) => a.type !== 'resign' && a.type !== 'endTurn');
    if (acts.length === 0) break;
    const [i, next] = rngInt(pick, acts.length);
    pick = next;
    play(acts[i]!);
  }
  if (s.winner === null) play({ type: 'endTurn' });
  turns += 1;
}

const sides = s.players
  .map((p) => `p${p.id}(${p.faction}) cities=${s.cities.filter((c) => c.owner === p.id).length} units=${s.units.filter((u) => u.owner === p.id).length}`)
  .join(' ');
console.log(`seed=${seed} turns=${turns} winner=${s.winner === null ? 'none' : s.winner} ${sides} hash=${hashState(s)}`);
