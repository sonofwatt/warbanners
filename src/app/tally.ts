import { applyAction, createMatch } from '../engine';
import type { Action, GameEvent, MatchSettings, MatchState, PlayerId } from '../engine';
import { roundOf } from './record';
import type { MatchRecord } from './record';

// One side's numbers for one match. `taken` is the other side's `dealt`.
export interface Tally { dealt: number; taken: number; kills: number; deaths: number; cities: number; heroes: number; treasures: number }
export interface MatchTallies { tallies: [Tally, Tally]; rounds: number; winner: PlayerId | null }

export const emptyTally = (): Tally => ({ dealt: 0, taken: 0, kills: 0, deaths: 0, cities: 0, heroes: 0, treasures: 0 });

// Replays a match from its settings and counts the engine's own events for each seat. Owners are read from the state
// before each action, since a unit that dies is gone after it. A refused action ends the count: the match stopped there.
export function matchTallies(settings: MatchSettings, actions: readonly Action[]): MatchTallies {
  const t: [Tally, Tally] = [emptyTally(), emptyTally()];
  let s: MatchState = createMatch(settings);
  for (const a of actions) {
    const r = applyAction(s, a);
    if (!r.ok) break;
    tallyStep(t, s, r.state, r.events);
    s = r.state;
  }
  t[0].taken = t[1].dealt;
  t[1].taken = t[0].dealt;
  return { tallies: t, rounds: roundOf(s), winner: s.winner };
}

// One action's events added to the counts (`taken` is filled in at the end, from the other side's `dealt`).
export function tallyStep(t: [Tally, Tally], before: MatchState, after: MatchState, events: readonly GameEvent[]): void {
  const other = (p: PlayerId): 0 | 1 => (p === 0 ? 1 : 0);
  const side = (p: PlayerId): Tally => t[p === 0 ? 0 : 1];
  const ownerOf = (id: number): PlayerId =>
    before.units.find(u => u.id === id)?.owner ?? after.units.find(u => u.id === id)?.owner ?? before.current;
  for (const e of events) {
    switch (e.type) {
      case 'attacked': {
        const atk = ownerOf(e.unit);
        side(atk).dealt += e.damage;
        side(other(atk)).dealt += e.counter;
        break;
      }
      case 'splashed': side(before.current).dealt += e.damage; break;
      // rules 11: a snare's damage is dealt by its owner, the other side of the unit that stepped on it
      case 'snared': side(other(ownerOf(e.unit))).dealt += e.damage; break;
      case 'died': {
        const owner = ownerOf(e.unit);
        side(owner).deaths += 1;
        side(other(owner)).kills += 1;
        break;
      }
      case 'captured': side(e.by).cities += 1; break;
      case 'heroTrait': if (e.hero) side(ownerOf(e.unit)).heroes += 1; break;
      case 'treasure': side(before.current).treasures += 1; break;
      default: break;
    }
  }
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
