import { CONFIG } from './data/config';
import { addGrowth } from './economy';
import { key, neighbors, parseKey } from './hex';
import type { HexKey } from './hex';
import { cityAt, cityById, tileAt } from './state';
import type { City, GameEvent, MatchState, PlayerId } from './types';

// rules 6 (rules version 7): a tile carries a chain for `owner` when it is one of the owner's cities, or a road outside
// every other player's territory (roads in neutral land count; an enemy cannot ride your roads into a bonus).
function carries(s: MatchState, owner: PlayerId, k: HexKey): boolean {
  const city = cityAt(s, k);
  if (city !== undefined) return city.owner === owner;
  const t = tileAt(s, k);
  if (t === undefined || !t.road) return false;
  return t.cityId === null || cityById(s, t.cityId)?.owner === owner;
}

// Every tile joined to `from` by a chain of adjacent carrying tiles, `from` included.
function chainFrom(s: MatchState, owner: PlayerId, from: HexKey): Set<HexKey> {
  const seen = new Set<HexKey>([from]);
  const todo: HexKey[] = [from];
  while (todo.length > 0) {
    const k = todo.pop()!;
    for (const n of neighbors(parseKey(k))) {
      const nk = key(n);
      if (!seen.has(nk) && carries(s, owner, nk)) { seen.add(nk); todo.push(nk); }
    }
  }
  return seen;
}

// The capital (lowest id first) that `city` is joined to by roads and its owner's cities, or undefined. A captured
// capital keeps its capital flag, so a player may hold more than one.
function connectedCapital(s: MatchState, city: City): City | undefined {
  const chain = chainFrom(s, city.owner, city.pos);
  return s.cities
    .filter((c) => c.owner === city.owner && c.capital && c.id !== city.id && chain.has(c.pos))
    .sort((a, b) => a.id - b.id)[0];
}

// rules 6 (rules version 7): is a non-capital city joined to one of its owner's capitals?
export function isConnected(s: MatchState, city: City): boolean {
  return !city.capital && connectedCapital(s, city) !== undefined;
}

// rules 6 (rules version 7): the first time each of `player`'s cities is connected, it and the capital it reaches each gain
// CONFIG.connectGrowth growth (levels and rewards follow as usual). Once per city per owner; never taken back.
export function payConnections(s: MatchState, player: PlayerId, ev: GameEvent[]): void {
  if ((CONFIG.connectGrowth as number) === 0) return;        // replays rules 6
  for (const city of [...s.cities].sort((a, b) => a.id - b.id)) {
    if (city.owner !== player || city.linked) continue;
    const capital = connectedCapital(s, city);
    if (capital === undefined) continue;
    city.linked = true;
    ev.push({ type: 'connected', city: city.id, capital: capital.id });
    addGrowth(s, city, CONFIG.connectGrowth, ev);
    addGrowth(s, capital, CONFIG.connectGrowth, ev);
  }
}
