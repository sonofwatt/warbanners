import { applyAction, legalActions } from './apply';
import { CONFIG } from './data/config';
import { UNITS } from './data/units';
import { key, range } from './hex';
import { rngInt } from './rng';
import { ridingBonus } from './movement';
import { createMatch, foundCity, freshAttacks, spawnUnit } from './state';
import { RULES_VERSION } from './types';
import type {
  Action, City, FactionId, MatchState, PlayerId, Result, TechId, Tile, TreasureOutcome, Unit, UnitTypeId,
} from './types';

// Every tile starts explored by both players (rules 9: a move may not pass through an unexplored tile), unless
// `unexplored` is set, which leaves both explored sets empty.
export function blankMatch(opts?: { radius?: number; factions?: [FactionId, FactionId]; unexplored?: boolean }): MatchState {
  const radius = opts?.radius ?? 4;
  const factions = opts?.factions ?? ['spartans', 'mongols'];
  const tiles: Record<string, Tile> = {};
  for (const h of range({ q: 0, r: 0 }, radius)) {
    tiles[key(h)] = {
      terrain: 'field', resource: null, building: null, harvested: false, road: false, village: false,
      treasure: false, cityId: null,
    };
  }
  const explored = (): string[] => (opts?.unexplored === true ? [] : Object.keys(tiles).sort());
  return {
    rulesVersion: RULES_VERSION, seed: 0, rng: 1, radius, tiles, cities: [], units: [],
    players: factions.map((faction, i) => ({
      id: i, faction, gold: 20, techs: [], explored: explored(), alive: true, turnsTaken: 0,
    })),
    current: 0, stamp: 5, nextUnitId: 0, nextCityId: 0, winner: null,
  };
}

export function addUnit(
  s: MatchState, type: UnitTypeId, owner: PlayerId, q: number, r: number, patch?: Partial<Unit>,
): Unit {
  const u = spawnUnit(s, type, owner, key({ q, r }), null);
  u.mp = 2 * UNITS[type].move;
  u.bonusMp = ridingBonus(s, u);
  u.attacks = freshAttacks(type);
  u.enteredTurn = 0;
  u.fresh = false;
  Object.assign(u, patch);
  return u;
}

export function addCity(s: MatchState, owner: PlayerId, q: number, r: number, patch?: Partial<City>): City {
  const c = foundCity(s, owner, key({ q, r }), false);
  c.linked = patch?.capital === true;                  // a capital starts linked, as foundCity makes it
  Object.assign(c, patch);
  return c;
}

export function setTile(s: MatchState, q: number, r: number, patch: Partial<Tile>): void {
  const t = s.tiles[key({ q, r })];
  if (t === undefined) throw new Error(`no tile at ${q},${r}`);
  Object.assign(t, patch);
}

export function give(s: MatchState, player: PlayerId, ...techs: TechId[]): void {
  const p = s.players[player];
  if (p === undefined) throw new Error(`no player ${player}`);
  for (const t of techs) if (!p.techs.includes(t)) p.techs.push(t);
}

export function must(r: Result): MatchState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

// An rng state whose first draw over the treasure table gives `outcome`, so a retuned table breaks no test.
export function rngFor(outcome: TreasureOutcome): number {
  const want = CONFIG.treasure.table.indexOf(outcome);
  if (want < 0) throw new Error(`the treasure table has no ${outcome}`);
  let st = 1;
  while (rngInt(st, CONFIG.treasure.table.length)[0] !== want) st++;
  return st;
}

const MAX_ACTIONS_PER_TURN = 40;

// The same random playout as scripts/sim.ts: up to 40 random non-end actions, then endTurn, for
// `playerTurns` end-of-turns (fewer if the match ends first). The pick stream starts at the seed.
// Also returns every action played, so a test can replay the playout.
export function randomPlayoutLog(seed: number, playerTurns: number): { state: MatchState; actions: Action[] } {
  let s = createMatch({ seed, factions: ['spartans', 'mongols'] });
  const actions: Action[] = [];
  let pick = seed;
  const play = (a: Action): void => {
    const r = applyAction(s, a);
    if (!r.ok) throw new Error(`engine refused a legal action ${JSON.stringify(a)}: ${r.reason}`);
    s = r.state;
    actions.push(a);
  };
  for (let turns = 0; s.winner === null && turns < playerTurns; turns++) {
    for (let n = 0; n < MAX_ACTIONS_PER_TURN && s.winner === null; n++) {
      const acts = legalActions(s).filter((a) => a.type !== 'resign' && a.type !== 'endTurn');
      if (acts.length === 0) break;
      const [i, next] = rngInt(pick, acts.length);
      pick = next;
      play(acts[i]!);
    }
    if (s.winner === null) play({ type: 'endTurn' });
  }
  return { state: s, actions };
}

export function randomPlayout(seed: number, playerTurns: number): MatchState {
  return randomPlayoutLog(seed, playerTurns).state;
}
