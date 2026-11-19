import { playerView } from '../../engine';
import type { GameEvent, HexKey, MatchState, PlayerId, UnitTypeId } from '../../engine';

export type Effect =
  | { kind: 'number'; at: HexKey; text: string; tone: 'hurt' | 'heal' | 'gold'; delay: number }
  | { kind: 'lunge'; unit: number; toward: HexKey; delay: number }
  | { kind: 'fall'; unitType: UnitTypeId; owner: PlayerId; at: HexKey; delay: number }
  | { kind: 'burst'; at: HexKey; tone: 'build' | 'capture' | 'level' | 'treasure'; delay: number };

export const EFFECT_MS = 450;
export const MAX_TOTAL_MS = 1200;
const STEP_MS = 120;
const COUNTER_MS = 150;

// What one viewer may be shown of one action: the tiles they see after it, and the units they could see before it
// or can see after it. The match screen's effects and sound, and the pause after an AI action, all use this.
export function seenBy(before: MatchState, after: MatchState, viewer: PlayerId): { visible: Set<HexKey>; seenUnits: Set<number> } {
  const now = playerView(after, viewer);
  return {
    visible: new Set(now.visible),
    seenUnits: new Set([...playerView(before, viewer).units, ...now.units].map((u) => u.id)),
  };
}

// How long the viewer needs to watch one action: until its last effect ends, or one slide for a seen unit that
// moved (moves are drawn by the board's slide, not by an effect). 0 when the viewer can see none of it.
export function watchMs(events: readonly GameEvent[], before: MatchState, after: MatchState, viewer: PlayerId): number {
  const { visible, seenUnits } = seenBy(before, after, viewer);
  const list = effectsFor(events, before, after, visible, seenUnits);
  const moved = events.some((e) => (e.type === 'moved' || e.type === 'lured') && seenUnits.has(e.unit));
  if (list.length === 0) return moved ? EFFECT_MS : 0;
  return Math.max(...list.map((f) => f.delay)) + EFFECT_MS;
}

// Turn the events of one action into short on-board effects. The state is already final;
// these only decorate it. Secrecy: an effect on a tile outside `visible` is dropped, and so is any
// effect about a unit outside `seenUnits` (the ids the viewer could see before the action or can see
// after it), since a hidden unit may stand unseen on a visible tile.
export function effectsFor(
  events: readonly GameEvent[],
  before: MatchState,
  after: MatchState,
  visible: ReadonlySet<HexKey>,
  seenUnits: ReadonlySet<number>,
): Effect[] {
  // Last known tile of every unit, followed through moves and lures within this list.
  const pos = new Map<number, HexKey>();
  for (const u of after.units) pos.set(u.id, u.pos);
  for (const u of before.units) pos.set(u.id, u.pos);
  const unitPos = (id: number): HexKey | undefined => pos.get(id);

  const out: Effect[] = [];
  const seen = (at: HexKey | undefined): at is HexKey => at !== undefined && visible.has(at);
  const known = (id: number): boolean => seenUnits.has(id);
  let slot = 0;
  for (const e of events) {
    const delay = slot * STEP_MS;
    const mine: Effect[] = [];
    switch (e.type) {
      case 'moved':
      case 'lured':
        pos.set(e.unit, e.to);
        break;
      case 'attacked': {
        const from = unitPos(e.unit);
        const to = unitPos(e.target);
        // A lunge shows both tiles, so it needs both to be visible.
        if (seen(from) && seen(to) && known(e.unit) && known(e.target)) mine.push({ kind: 'lunge', unit: e.unit, toward: to, delay });
        if (seen(to) && known(e.target)) mine.push({ kind: 'number', at: to, text: `-${e.damage}`, tone: 'hurt', delay });
        if (e.counter > 0 && seen(from) && known(e.unit)) {
          mine.push({ kind: 'number', at: from, text: `-${e.counter}`, tone: 'hurt', delay: delay + COUNTER_MS });
        }
        break;
      }
      case 'splashed': {
        const at = unitPos(e.target);
        if (at && known(e.target)) mine.push({ kind: 'number', at, text: `-${e.damage}`, tone: 'hurt', delay });
        break;
      }
      case 'died': {
        const u = before.units.find((x) => x.id === e.unit);
        const at = unitPos(e.unit);
        if (u && at && known(u.id)) mine.push({ kind: 'fall', unitType: u.type, owner: u.owner, at, delay });
        break;
      }
      case 'ability': {
        if (e.ability !== 'heal') break;
        const was = before.units.find((u) => u.pos === e.target);
        const now = was && after.units.find((u) => u.id === was.id);
        const gain = was && now ? now.hp - was.hp : 0;
        if (was && gain > 0 && known(was.id)) mine.push({ kind: 'number', at: e.target, text: `+${gain}`, tone: 'heal', delay });
        break;
      }
      case 'treasure': {
        if (e.outcome === 'gold') {
          const gain = (after.players[before.current]?.gold ?? 0) - (before.players[before.current]?.gold ?? 0);
          if (gain > 0) mine.push({ kind: 'number', at: e.at, text: `+${gain}`, tone: 'gold', delay });
          else mine.push({ kind: 'burst', at: e.at, tone: 'treasure', delay });
        } else mine.push({ kind: 'burst', at: e.at, tone: 'treasure', delay });
        break;
      }
      case 'captured': {
        const c = after.cities.find((x) => x.id === e.city) ?? before.cities.find((x) => x.id === e.city);
        if (c) mine.push({ kind: 'burst', at: c.pos, tone: 'capture', delay });
        break;
      }
      case 'cityLevel': {
        const c = after.cities.find((x) => x.id === e.city) ?? before.cities.find((x) => x.id === e.city);
        if (c) mine.push({ kind: 'burst', at: c.pos, tone: 'level', delay });
        break;
      }
      case 'built':
        mine.push({ kind: 'burst', at: e.at, tone: 'build', delay });
        break;
      default:
        break;
    }
    // Only effects on visible tiles count, so a hidden event leaves no gap in the timing.
    const shown = mine.filter((f) => f.kind === 'lunge' || seen(f.at));
    if (shown.length > 0) {
      out.push(...shown);
      slot += 1;
    }
  }

  // Pull the delays in so that nothing ends after MAX_TOTAL_MS.
  const latest = Math.max(0, ...out.map((f) => f.delay));
  const room = MAX_TOTAL_MS - EFFECT_MS;
  if (latest <= room) return out;
  const scale = room / latest;
  return out.map((f) => ({ ...f, delay: Math.floor(f.delay * scale) }));
}
