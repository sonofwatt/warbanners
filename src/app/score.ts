import { FACTIONS, isConnected } from '../engine';
import type { MatchState, PlayerId } from '../engine';
import { LEVEL_DIAL } from '../ai/types';
import type { AiLevel } from '../ai/types';
import { roundOf } from './record';
import type { MatchRecord } from './record';
import type { MatchTallies } from './tally';

// The score sheet on the result screen: one player's match as points. Our own numbers, set in
// docs/superpowers/specs/2026-11-27-score-sheet-design.md; nothing here is a rule, and the engine never reads it.
export const SCORE = {
  turnLimit: 60,      // a win scores perTurn for every turn before this one
  perTurn: 20,
  kill: 10, loss: -5, tile: 1, village: 40, treasure: 30,
  level: 10,          // per level above 1, for every city held at the end
  road: 25,           // per city joined to the capital by road
  allRoads: 150,      // once more when every city is joined
  wiped: 200,         // per faction whose last city this player took
} as const;

export type ScoreKey = 'victory' | 'kills' | 'losses' | 'explored' | 'villages' | 'treasures' | 'cities' | 'roads' | 'wiped';
// count: what was counted (the winning turn, units, tiles, cities); of: out of how many; best: the highest city level.
export interface ScoreLine { key: ScoreKey; count: number; of?: number; best?: number; points: number }
export interface ScoreSheet {
  seat: PlayerId;
  lines: ScoreLine[];
  subtotal: number;
  difficulty: { level: AiLevel; factor: number; points: number } | null;   // null in a match between two people
  total: number;
}

// Easy 1.0, normal 1.5, hard 2.0, and an adaptive AI by where its dial finished, to one decimal.
export function difficultyFactor(dial: number): number {
  return Math.round(10 * (1 + (dial - LEVEL_DIAL.easy) / (LEVEL_DIAL.hard - LEVEL_DIAL.easy))) / 10;
}

export function scoreSheet(record: MatchRecord, state: MatchState, t: MatchTallies, seat: PlayerId): ScoreSheet {
  const tally = t.tallies[seat === 0 ? 0 : 1];
  const conquest = t.conquest[seat === 0 ? 0 : 1];
  const won = state.winner === seat;
  const round = won ? roundOf(state) : 0;
  const cities = state.cities.filter((c) => c.owner === seat);
  const others = cities.filter((c) => !c.capital);
  const joined = others.filter((c) => isConnected(state, c)).length;

  const lines: ScoreLine[] = [
    { key: 'victory', count: round, points: won ? SCORE.perTurn * Math.max(0, SCORE.turnLimit - round) : 0 },
    { key: 'kills', count: tally.kills, points: SCORE.kill * tally.kills },
    { key: 'losses', count: tally.deaths, points: SCORE.loss * tally.deaths },
  ];
  const explored = state.players[seat]?.explored.length ?? 0;
  lines.push({ key: 'explored', count: explored, of: Object.keys(state.tiles).length, points: SCORE.tile * explored });
  lines.push({ key: 'villages', count: conquest.villages, points: SCORE.village * conquest.villages });
  lines.push({ key: 'treasures', count: tally.treasures, points: SCORE.treasure * tally.treasures });
  lines.push({
    key: 'cities', count: cities.length, best: cities.reduce((m, c) => Math.max(m, c.level), 0),
    points: SCORE.level * cities.reduce((n, c) => n + c.level - 1, 0),
  });
  // A faction that builds no roads is not marked down for its rules: the line is left out.
  if (FACTIONS[record.settings.factions[seat === 0 ? 0 : 1]].canBuildRoads) {
    const all = others.length > 0 && joined === others.length;
    lines.push({ key: 'roads', count: joined, of: others.length, points: SCORE.road * joined + (all ? SCORE.allRoads : 0) });
  }
  lines.push({ key: 'wiped', count: conquest.wiped, points: SCORE.wiped * conquest.wiped });

  const subtotal = lines.reduce((n, l) => n + l.points, 0);
  const rival = record.players.find((p, i) => i !== seat && p.kind === 'ai');
  let difficulty: ScoreSheet['difficulty'] = null;
  if (rival?.kind === 'ai') {
    const factor = difficultyFactor(rival.level === 'adaptive' ? rival.adapt.dial : LEVEL_DIAL[rival.level]);
    difficulty = { level: rival.level, factor, points: subtotal > 0 ? Math.round(subtotal * (factor - 1)) : 0 };
  }
  return { seat, lines, subtotal, difficulty, total: Math.max(0, subtotal + (difficulty?.points ?? 0)) };
}

// A sheet for every person in the match, the winner's first. The AI gets none.
export function scoreSheets(record: MatchRecord, state: MatchState, t: MatchTallies): ScoreSheet[] {
  const seats = record.players.flatMap((p, i) => (p.kind === 'human' ? [i] : []));
  seats.sort((a, b) => Number(b === state.winner) - Number(a === state.winner) || a - b);
  return seats.map((seat) => scoreSheet(record, state, t, seat));
}
