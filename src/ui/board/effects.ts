import { playerView } from '../../engine';
import { hexesBetween, slideMs3d } from './motion';
import { T } from '../text';
import type { GameEvent, HexKey, MatchState, PlayerId, UnitTypeId } from '../../engine';

export type Effect =
  | { kind: 'number'; at: HexKey; text: string; tone: 'hurt' | 'heal' | 'gold' | 'hero' | 'find'; delay: number; ms?: number }
  // A melee or ranged attack: the attacker leans from its tile toward the target's. `target` is the unit attacked,
  // `counter` whether it struck back (the 3D look plays the exchange; the svg shows the lunge and the numbers).
  | { kind: 'lunge'; unit: number; from: HexKey; toward: HexKey; delay: number; target: number; counter: boolean }
  // A unit seen to change tile (a move, a lure, an advance after a kill): drawn by the board's slide, not here. The
  // delay lets an advance wait for the blow that cleared the tile; it takes no slot, so it moves no other effect.
  | { kind: 'move'; unit: number; unitType: UnitTypeId; from: HexKey; to: HexKey; delay: number }
  | { kind: 'fall'; unit: number; unitType: UnitTypeId; owner: PlayerId; at: HexKey; delay: number }
  | { kind: 'burst'; at: HexKey; tone: 'build' | 'capture' | 'level' | 'treasure'; delay: number };

export const EFFECT_MS = 450;
export const MAX_TOTAL_MS = 1200;
/** What a claimed treasure gave stays up three times as long as other effects, so it can be read. */
export const TREASURE_TEXT_MS = EFFECT_MS * 3;
/** How long one effect plays: its own time, or EFFECT_MS. */
export const effectMs = (f: Effect): number => (f.kind === 'number' ? f.ms ?? EFFECT_MS : EFFECT_MS);
const STEP_MS = 120;
const COUNTER_MS = 150;

// What one viewer may be shown of one action: the tiles they see after it, and the units they could see before it
// or can see after it. The match screen's effects and sound, and the pause after an AI action, all use this.
// Each action is asked about twice (the store's pause, then the match screen), and working it out builds two whole
// views: the answer is kept with the states of the action, which never change, and shared. Callers only read it.
// Both states are held weakly (a WeakMap keyed by the state after, holding a WeakMap keyed by the state before),
// so the answers never keep a match's earlier states alive.
export interface Seen { visible: ReadonlySet<HexKey>; seenUnits: ReadonlySet<number>; visibleBefore: ReadonlySet<HexKey> }
const asked = new WeakMap<MatchState, WeakMap<MatchState, Map<PlayerId, Seen>>>();
export function seenBy(before: MatchState, after: MatchState, viewer: PlayerId): Seen {
  let byBefore = asked.get(after);
  if (byBefore === undefined) asked.set(after, (byBefore = new WeakMap()));
  let byViewer = byBefore.get(before);
  if (byViewer === undefined) byBefore.set(before, (byViewer = new Map()));
  const hit = byViewer.get(viewer);
  if (hit !== undefined) return hit;
  const now = playerView(after, viewer);
  const was = playerView(before, viewer);
  const seen = {
    visible: new Set(now.visible),
    seenUnits: new Set([...was.units, ...now.units].map((u) => u.id)),
    visibleBefore: new Set(was.visible),
  };
  byViewer.set(viewer, seen);
  return seen;
}

// The tile of a city, from the state after the action or else before it. Effects and sound both place a city event
// by this, so they cannot disagree about where it is.
export function cityTile(before: MatchState, after: MatchState, id: number): HexKey | undefined {
  return (after.cities.find((x) => x.id === id) ?? before.cities.find((x) => x.id === id))?.pos;
}

// How long the viewer needs to watch one action: until its last effect ends, or one slide for a seen unit that
// moved (moves are drawn by the board's slide, not by an effect). 0 when the viewer can see none of it. In the 3D
// look (`look3d`) a move is watched until its walk has ended too, as the figure turns and then travels.
export function watchMs(events: readonly GameEvent[], before: MatchState, after: MatchState, viewer: PlayerId, look3d = false): number {
  const { visible, seenUnits, visibleBefore } = seenBy(before, after, viewer);
  const all = effectsFor(events, before, after, visible, seenUnits, viewer, visibleBefore);
  const list = all.filter((f) => f.kind !== 'move');
  const moved = events.some((e) => (e.type === 'moved' || e.type === 'lured' || e.type === 'advanced') && seenUnits.has(e.unit));
  const walks = look3d ? all.flatMap((f) => (f.kind === 'move' ? [f.delay + slideMs3d(f.unitType, hexesBetween(f.from, f.to))] : [])) : [];
  if (list.length === 0) return Math.max(moved ? EFFECT_MS : 0, ...walks);
  return Math.max(...list.map((f) => f.delay + effectMs(f)), ...walks);
}

// Turn the events of one action into short on-board effects. The state is already final;
// these only decorate it. Secrecy: an effect on a tile outside `visible` is dropped, and so is any
// effect about a unit outside `seenUnits` (the ids the viewer could see before the action or can see
// after it), since a hidden unit may stand unseen on a visible tile. What a treasure held is told in words to the
// player who claimed it only; the other side sees the plain burst.
// `visibleBefore` (the tiles the viewer saw before the action) lets the blows, moves and falls of units the viewer
// saw play out on tiles the action itself took out of sight: a unit killed takes its sight with it, but the viewer
// watched it fall, and saw its killer strike from where it stood.
export function effectsFor(
  events: readonly GameEvent[],
  before: MatchState,
  after: MatchState,
  visible: ReadonlySet<HexKey>,
  seenUnits: ReadonlySet<number>,
  viewer: PlayerId,
  visibleBefore?: ReadonlySet<HexKey>,
): Effect[] {
  // Last known tile of every unit, followed through moves and lures within this list.
  const pos = new Map<number, HexKey>();
  for (const u of after.units) pos.set(u.id, u.pos);
  for (const u of before.units) pos.set(u.id, u.pos);
  const unitPos = (id: number): HexKey | undefined => pos.get(id);

  const out: Effect[] = [];
  const seen = (at: HexKey | undefined): at is HexKey => at !== undefined && visible.has(at);
  const watched = (at: HexKey | undefined): at is HexKey => seen(at) || (at !== undefined && visibleBefore?.has(at) === true);
  const known = (id: number): boolean => seenUnits.has(id);
  let slot = 0;
  for (const e of events) {
    const delay = slot * STEP_MS;
    const mine: Effect[] = [];
    switch (e.type) {
      case 'moved':
      case 'lured':
      case 'advanced': {
        pos.set(e.unit, e.to);
        const u = after.units.find((x) => x.id === e.unit) ?? before.units.find((x) => x.id === e.unit);
        // Only a move that ends in sight; one that starts in the fog is drawn as the unit appearing, so its start
        // is not told (it stands as its end).
        if (u !== undefined && known(e.unit) && seen(e.to)) {
          mine.push({ kind: 'move', unit: e.unit, unitType: u.type, from: watched(e.from) ? e.from : e.to, to: e.to, delay });
        }
        break;
      }
      case 'attacked': {
        const from = unitPos(e.unit);
        const to = unitPos(e.target);
        // A lunge shows both tiles, so it needs both to be visible.
        if (watched(from) && watched(to) && known(e.unit) && known(e.target)) {
          mine.push({ kind: 'lunge', unit: e.unit, from, toward: to, delay, target: e.target, counter: e.counter > 0 });
        }
        if (watched(to) && known(e.target)) mine.push({ kind: 'number', at: to, text: `-${e.damage}`, tone: 'hurt', delay });
        if (e.counter > 0 && watched(from) && known(e.unit)) {
          mine.push({ kind: 'number', at: from, text: `-${e.counter}`, tone: 'hurt', delay: delay + COUNTER_MS });
        }
        break;
      }
      case 'momentum': {
        const at = unitPos(e.unit);
        if (at && known(e.unit)) mine.push({ kind: 'number', at, text: T.ui.momentumSpent(e.spent), tone: 'hero', delay });
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
        if (u && watched(at) && known(u.id)) mine.push({ kind: 'fall', unit: u.id, unitType: u.type, owner: u.owner, at, delay });
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
      case 'restHealed': {                 // rules 8: a hunkered unit healed at the end of its owner's turn
        const at = unitPos(e.unit);
        if (seen(at) && known(e.unit)) mine.push({ kind: 'number', at, text: `+${e.hp}`, tone: 'heal', delay });
        break;
      }
      case 'treasure': {
        if (e.outcome === 'gold') {
          const gain = (after.players[before.current]?.gold ?? 0) - (before.players[before.current]?.gold ?? 0);
          if (gain > 0) mine.push({ kind: 'number', at: e.at, text: `+${gain}`, tone: 'gold', delay, ms: TREASURE_TEXT_MS });
          else mine.push({ kind: 'burst', at: e.at, tone: 'treasure', delay });
        } else if (before.current === viewer) {
          // The find words are the claimer's alone; the other side keeps the plain burst.
          const text = e.outcome === 'relic' && e.trait !== undefined ? T.heroTrait[e.trait].name : T.treasure[e.outcome];
          mine.push({ kind: 'number', at: e.at, text, tone: 'find', delay, ms: TREASURE_TEXT_MS });
        } else mine.push({ kind: 'burst', at: e.at, tone: 'treasure', delay });
        break;
      }
      case 'heroTrait': {
        const at = unitPos(e.unit);
        if (at && known(e.unit)) mine.push({ kind: 'number', at, text: T.heroTrait[e.trait].name, tone: 'hero', delay });
        break;
      }
      case 'chainEnded': {
        const at = unitPos(e.unit);
        if (at && known(e.unit)) mine.push({ kind: 'number', at, text: T.ui.chainEnded, tone: 'hero', delay });
        break;
      }
      case 'captured': {
        const at = cityTile(before, after, e.city);
        if (at) mine.push({ kind: 'burst', at, tone: 'capture', delay });
        break;
      }
      case 'blockaded': {                  // rules 8: shown to the city's owner only, as its turn starts
        const at = cityTile(before, after, e.city);
        const owner = after.cities.find((c) => c.id === e.city)?.owner;
        if (at && owner === viewer && e.gold > 0) mine.push({ kind: 'number', at, text: T.ui.blockadeCut(e.gold), tone: 'hurt', delay });
        break;
      }
      case 'cityLevel': {
        const at = cityTile(before, after, e.city);
        if (at) mine.push({ kind: 'burst', at, tone: 'level', delay });
        break;
      }
      case 'built':
        mine.push({ kind: 'burst', at: e.at, tone: 'build', delay });
        break;
      default:
        break;
    }
    // Only effects on visible tiles count, so a hidden event leaves no gap in the timing. A move takes no slot.
    const shown = mine.filter((f) => f.kind === 'lunge' || f.kind === 'move' || (f.kind === 'fall' || (f.kind === 'number' && f.tone === 'hurt') ? watched(f.at) : seen(f.at)));
    if (shown.length > 0) {
      out.push(...shown);
      if (shown.some((f) => f.kind !== 'move')) slot += 1;
    }
  }

  // Pull the delays in so that nothing ends after MAX_TOTAL_MS.
  const latest = Math.max(0, ...out.map((f) => f.delay));
  const room = MAX_TOTAL_MS - EFFECT_MS;
  if (latest <= room) return out;
  const scale = room / latest;
  return out.map((f) => ({ ...f, delay: Math.floor(f.delay * scale) }));
}
