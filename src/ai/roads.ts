// The AI's road planner: the cheapest chain of roads that would join each of its unlinked cities to a capital.
// It reads the believed state only, and its idea of what carries a chain is the engine's (src/engine/connect.ts).
import { CONFIG, key, neighbors, parseKey } from '../engine';
import type { City, HexKey, MatchState, PlayerId } from '../engine';

export interface Chain {
  city: number;          // the unlinked city the chain joins
  capital: number;       // the capital it reaches
  build: HexKey[];       // the tiles that still need a road, in order from the city towards the capital
}

// The engine's carrying rule: one of the owner's cities, or a road outside every other player's territory.
function carries(b: MatchState, me: PlayerId, k: HexKey, cityAt: Map<HexKey, City>): boolean {
  const city = cityAt.get(k);
  if (city !== undefined) return city.owner === me;
  const t = b.tiles[k];
  if (t === undefined || !t.road) return false;
  return t.cityId === null || b.cities.find((c) => c.id === t.cityId)?.owner === me;
}

// Could `me` lay a road here, gold and tech aside? The engine's roadRefusal tile tests: explored, field or forest,
// no road and no city yet, own or unclaimed land.
function buildable(b: MatchState, me: PlayerId, k: HexKey, explored: Set<HexKey>, cityAt: Map<HexKey, City>): boolean {
  if (!explored.has(k) || cityAt.has(k)) return false;
  const t = b.tiles[k];
  if (t === undefined || t.road || (t.terrain !== 'field' && t.terrain !== 'forest')) return false;
  return t.cityId === null || b.cities.find((c) => c.id === t.cityId)?.owner === me;
}

// For each of `me`'s unlinked non-capital cities that some chain could join, the chain with the fewest new roads
// (a 0-1 search: carrying tiles are free, buildable ones cost one road). A city already joined (nothing to build)
// is left out, since the engine pays it after the next action anyway. Without the roads tech there are none.
export function connectingChains(b: MatchState, me: PlayerId): Chain[] {
  const self = b.players[me];
  if (self === undefined || !self.techs.includes(CONFIG.road.tech)) return [];
  const cityAt = new Map(b.cities.map((c) => [c.pos, c]));
  const explored = new Set(self.explored);
  const out: Chain[] = [];
  for (const city of [...b.cities].sort((x, y) => x.id - y.id)) {
    if (city.owner !== me || city.capital || city.linked) continue;
    const chain = cheapest(b, me, city, explored, cityAt);
    if (chain !== null && chain.build.length > 0) out.push(chain);
  }
  return out;
}

function cheapest(b: MatchState, me: PlayerId, city: City, explored: Set<HexKey>, cityAt: Map<HexKey, City>): Chain | null {
  const cost = new Map<HexKey, number>([[city.pos, 0]]);
  const prev = new Map<HexKey, HexKey>();
  const done = new Set<HexKey>();
  const deque: HexKey[] = [city.pos];
  while (deque.length > 0) {
    const k = deque.shift()!;
    if (done.has(k)) continue;
    done.add(k);
    const here = cityAt.get(k);
    if (here !== undefined && here.capital && here.owner === me && k !== city.pos) {
      const build: HexKey[] = [];
      for (let at: HexKey | undefined = k; at !== undefined; at = prev.get(at)) if (!carries(b, me, at, cityAt)) build.push(at);
      return { city: city.id, capital: here.id, build: build.reverse() };
    }
    for (const n of neighbors(parseKey(k))) {
      const nk = key(n);
      if (done.has(nk)) continue;
      const step = carries(b, me, nk, cityAt) ? 0 : buildable(b, me, nk, explored, cityAt) ? 1 : null;
      if (step === null) continue;
      const c = cost.get(k)! + step;
      if (c >= (cost.get(nk) ?? Infinity)) continue;
      cost.set(nk, c); prev.set(nk, k);
      if (step === 0) deque.unshift(nk); else deque.push(nk);
    }
  }
  return null;
}
