import { FACTIONS, RULES_VERSION, startTech, key, mirror, parseKey, playerView, range } from '../engine';
import type { HexKey, MatchState, Player, PlayerId, TechId, Tile } from '../engine';
import type { AiInput, Rival } from './types';

const ARCHERY_BELIEF_TURNS = 4;    // rules 11: a Woodland rival this many turns in is believed to know Archery

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
  return { terrain, resource: null, building: null, harvested: false, road: false, village: false, treasure: false, cityId: null };
}

// A playable engine state rebuilt from the input: unknown tiles are guessed, unseen units are absent. rules 11: the
// player's own snares are copied in (the view holds no other), so its planning knows where they are; absent when none.
// A rival is believed to know only its starting tech, except that a Woodland rival (a faction that hides in forests)
// with ARCHERY_BELIEF_TURNS turns taken is believed to know Archery too, so its Skirmishers are costed as shooting.
// That is a planning guess: the UI passes guess: false, so a card never shows a guess as fact.
export function believedState(input: AiInput, opts: { guess?: boolean } = {}): MatchState {
  const guess = opts.guess ?? true;
  const tiles: Record<HexKey, Tile> = {};
  for (const h of range({ q: 0, r: 0 }, input.radius)) tiles[key(h)] = guessTile(input, key(h));
  const players: Player[] = [];
  players[input.me] = structuredClone(input.self);
  for (const r of input.rivals) {
    const techs: TechId[] = [startTech(r.faction)];
    if (guess && FACTIONS[r.faction].forestHidden && r.turnsTaken >= ARCHERY_BELIEF_TURNS && !techs.includes('archery')) techs.push('archery');
    players[r.id] = {
      id: r.id, faction: r.faction, gold: 0, techs, explored: [],
      alive: r.alive, turnsTaken: r.turnsTaken,
    };
  }
  const units = structuredClone(input.view.units);
  const cities = structuredClone(input.view.cities);
  const b: MatchState = {
    rulesVersion: RULES_VERSION, seed: 0, rng: 1, radius: input.radius, tiles, cities, units, players,
    current: input.me, stamp: input.stamp,
    nextUnitId: units.reduce((m, u) => Math.max(m, u.id + 1), 0),
    nextCityId: cities.reduce((m, c) => Math.max(m, c.id + 1), 0),
    winner: null,
  };
  const snares = (input.view.snares ?? []).filter((n) => n.owner === input.me);
  if (snares.length > 0) b.snares = structuredClone(snares);
  return b;
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
    snares: view.snares,             // rules 11: the player's own only; left out of the key when it has none
  });
}
