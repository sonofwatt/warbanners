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

// The owner's capital, if `city` is joined to it by roads and its owner's cities, or undefined. A player holds at most
// one capital (a captured capital is an ordinary city for its captor, rules 12).
function connectedCapital(s: MatchState, city: City): City | undefined {
  const capital = s.cities.find((c) => c.owner === city.owner && c.capital);
  if (capital === undefined || capital.id === city.id) return undefined;
  return chainFrom(s, city.owner, city.pos).has(capital.pos) ? capital : undefined;
}

// rules 6 (rules version 7): is a non-capital city joined to its owner's capital?
export function isConnected(s: MatchState, city: City): boolean {
  return !city.capital && connectedCapital(s, city) !== undefined;
}

// rules 6 (rules version 7): the first time each of `player`'s cities is connected, it and its owner's capital each gain
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
