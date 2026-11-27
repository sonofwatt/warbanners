import { applyAction, createMatch } from '../engine';
import type { Action, MatchSettings, MatchState, PlayerId } from '../engine';
import { roundOf } from './record';
import type { MatchRecord } from './record';

// One side's numbers for one match. `taken` is the other side's `dealt`.
export interface Tally { dealt: number; taken: number; kills: number; deaths: number; cities: number; heroes: number; treasures: number }
// Kept apart from Tally, which the stats store saves and checks key by key. villages: villages taken (a capture of a
// city that did not exist before); wiped: factions whose last city this seat took (a resign wipes out nobody).
export interface Conquest { villages: number; wiped: number }
export interface MatchTallies { tallies: [Tally, Tally]; conquest: [Conquest, Conquest]; rounds: number; winner: PlayerId | null }

export const emptyTally = (): Tally => ({ dealt: 0, taken: 0, kills: 0, deaths: 0, cities: 0, heroes: 0, treasures: 0 });

// Replays a match from its settings and counts the engine's own events for each seat. Owners are read from the state
// before each action, since a unit that dies is gone after it. A refused action ends the count: the match stopped there.
export function matchTallies(settings: MatchSettings, actions: readonly Action[]): MatchTallies {
  return talliesFrom(createMatch(settings), actions);
}

// The same count from any starting state, for tests that build an endgame by hand.
export function talliesFrom(start: MatchState, actions: readonly Action[]): MatchTallies {
  const t: [Tally, Tally] = [emptyTally(), emptyTally()];
  const c: [Conquest, Conquest] = [{ villages: 0, wiped: 0 }, { villages: 0, wiped: 0 }];
  let s: MatchState = start;
  const other = (p: PlayerId): 0 | 1 => (p === 0 ? 1 : 0);
  const side = (p: PlayerId): Tally => t[p === 0 ? 0 : 1];
  for (const a of actions) {
    const before = s;
    const r = applyAction(s, a);
    if (!r.ok) break;
    const ownerOf = (id: number): PlayerId =>
      before.units.find(u => u.id === id)?.owner ?? r.state.units.find(u => u.id === id)?.owner ?? before.current;
    for (const e of r.events) {
      switch (e.type) {
        case 'attacked': {
          const atk = ownerOf(e.unit);
          side(atk).dealt += e.damage;
          side(other(atk)).dealt += e.counter;
          break;
        }
        case 'splashed': side(before.current).dealt += e.damage; break;
        case 'died': {
          const owner = ownerOf(e.unit);
          side(owner).deaths += 1;
          side(other(owner)).kills += 1;
          break;
        }
        case 'captured':
          side(e.by).cities += 1;
          if (!before.cities.some(x => x.id === e.city)) c[e.by === 0 ? 0 : 1].villages += 1;
          break;
        case 'eliminated': if (a.type === 'capture') c[before.current === 0 ? 0 : 1].wiped += 1; break;
        case 'heroTrait': if (e.hero) side(ownerOf(e.unit)).heroes += 1; break;
        case 'treasure': side(before.current).treasures += 1; break;
        default: break;
      }
    }
    s = r.state;
  }
  t[0].taken = t[1].dealt;
  t[1].taken = t[0].dealt;
  return { tallies: t, conquest: c, rounds: roundOf(s), winner: s.winner };
}

// The last few counts, by match and length, so the end of a match is replayed once for both the stats and the result
// screen, and an online result redrawn on every session update is not replayed again.
const CACHE_SIZE = 4;
const cache = new Map<string, MatchTallies>();
export function cachedTallies(record: MatchRecord): MatchTallies {
  const key = `${record.id}@${record.createdAt}#${record.actions.length}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const t = matchTallies(record.settings, record.actions);
  cache.set(key, t);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return t;
}
