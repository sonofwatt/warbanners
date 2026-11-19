import { FACTIONS, RULES_VERSION, key, mirror, parseKey, playerView, range } from '../engine';
import type { HexKey, MatchState, Player, PlayerId, Tile } from '../engine';
import type { AiInput, Rival } from './types';

// The only AI function that reads a real match state. It copies out what the player could know.
export function aiInputFor(state: MatchState, player: PlayerId): AiInput {
  const self = state.players[player];
  if (self === undefined) throw new Error(`no player ${player}`);
  const rivals: Rival[] = state.players
    .filter((p) => p.id !== player)
    .map((p) => ({ id: p.id, faction: p.faction, alive: p.alive, turnsTaken: p.turnsTaken }));
  return {
    me: player, self: structuredClone(self), rivals, stamp: state.stamp, radius: state.radius,
    view: playerView(state, player),
  };
}

function guessTile(input: AiInput, k: HexKey): Tile {
  const seen = input.view.tiles[k];
  if (seen !== undefined) return structuredClone(seen);
  const terrain = input.view.tiles[key(mirror(parseKey(k)))]?.terrain ?? 'field';
  return { terrain, resource: null, building: null, road: false, village: false, treasure: false, cityId: null };
}

// A playable engine state rebuilt from the input: unknown tiles are guessed, unseen units are absent.
export function believedState(input: AiInput): MatchState {
  const tiles: Record<HexKey, Tile> = {};
  for (const h of range({ q: 0, r: 0 }, input.radius)) tiles[key(h)] = guessTile(input, key(h));
  const players: Player[] = [];
  players[input.me] = structuredClone(input.self);
  for (const r of input.rivals) {
    players[r.id] = {
      id: r.id, faction: r.faction, gold: 0, techs: [FACTIONS[r.faction].startTech], explored: [],
      alive: r.alive, turnsTaken: r.turnsTaken,
    };
  }
  const units = structuredClone(input.view.units);
  const cities = structuredClone(input.view.cities);
  return {
    rulesVersion: RULES_VERSION, seed: 0, rng: 1, radius: input.radius, tiles, cities, units, players,
    current: input.me, stamp: input.stamp,
    nextUnitId: units.reduce((m, u) => Math.max(m, u.id + 1), 0),
    nextCityId: cities.reduce((m, c) => Math.max(m, c.id + 1), 0),
    winner: null,
  };
}

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// What the AI can see, in a form two states can be compared by. Unit ids are left out on purpose.
export function viewKey(input: AiInput): string {
  const { view, self } = input;
  return JSON.stringify({
    gold: self.gold, techs: self.techs, explored: self.explored,
    tiles: Object.keys(view.tiles).sort(byKey).map((k) => [k, view.tiles[k]]),
    cities: [...view.cities].sort((a, b) => byKey(a.pos, b.pos)),
    units: [...view.units].sort((a, b) => byKey(a.pos, b.pos))
      .map((u) => { const { id: _id, ...rest } = u; return rest; }),
  });
}
