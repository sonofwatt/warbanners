// Pure selection and tap logic. Every order comes from the engine's legal actions: nothing here decides what is allowed.
import { legalActions, maxHpOf, mountainStep } from '../engine';
import type { AbilityId, Action, BuildingId, HexKey, MatchState, PlayerId, PlayerView, TechId, UnitTypeId } from '../engine';
import { aiInputFor, believedState } from '../ai/input';
import type { Mark } from './board/mark';

export type Hit = { unit: number | null; hex: HexKey | null };
export type Armed = { kind: 'ability'; ability: AbilityId } | { kind: 'campTrain'; unitType: UnitTypeId };
export type Selection =
  | { kind: 'none' }
  | { kind: 'unit'; id: number; armed: Armed | null; askLure: HexKey | null }
  | { kind: 'city'; id: number }
  | { kind: 'tile'; at: HexKey };
export const NONE: Selection = { kind: 'none' };

export interface ActionIndex {
  moves: Record<number, HexKey[]>; attacks: Record<number, HexKey[]>; lures: Record<number, HexKey[]>;
  abilities: Record<number, Partial<Record<AbilityId, HexKey[]>>>;
  captures: number[]; claims: number[]; items: number[];   // items: unit ids with a legal useItem (not counted in activeUnits)
  hunkers: number[];                                       // unit ids with a legal hunker (not counted in activeUnits)
  unhunkers: number[];                                     // rules 9: hunkered unit ids with a legal unhunker (not counted in activeUnits)
  campTrain: Record<number, Partial<Record<UnitTypeId, HexKey[]>>>;
  train: Record<number, UnitTypeId[]>; walls: number[]; rewards: number[];
  harvest: HexKey[]; build: Record<HexKey, BuildingId[]>; road: HexKey[]; research: TechId[];
  activeUnits: number[];   // own units with a move, attack, ability, capture, treasure claim or camp training left
}

// What the screen offers the viewer: the legal actions of the state the viewer can believe in, built from what the
// viewer knows, exactly as the AI plans. So a move an unseen enemy blocks is offered (and refused when tried), and
// no gap in the highlights gives the enemy away. Nothing is offered off the viewer's turn. The store's taps and the
// match screen's highlights both come from here, so they cannot disagree.
export function offered(state: MatchState, viewer: PlayerId): ActionIndex {
  if (state.current !== viewer || state.winner !== null) return indexActions([]);
  return indexActions(legalActions(believedState(aiInputFor(state, viewer))));
}

// Whether `action` is one the screen offers the viewer (whatever the order of its fields).
export function isOffered(state: MatchState, viewer: PlayerId, action: Action): boolean {
  if (state.current !== viewer || state.winner !== null) return false;
  const k = canonical(action);
  return legalActions(believedState(aiInputFor(state, viewer))).some((a) => canonical(a) === k);
}
const canonical = (a: Action): string => JSON.stringify(Object.entries(a).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));

function push<T>(map: Record<number | string, T[]>, k: number | string, v: T): void {
  const list = map[k] ?? (map[k] = []);
  if (!list.includes(v)) list.push(v);
}

export function indexActions(actions: readonly Action[]): ActionIndex {
  const ix: ActionIndex = {
    moves: {}, attacks: {}, lures: {}, abilities: {}, captures: [], claims: [], items: [], hunkers: [], unhunkers: [], campTrain: {}, train: {},
    walls: [], rewards: [], harvest: [], build: {}, road: [], research: [], activeUnits: [],
  };
  const active = new Set<number>();
  for (const a of actions) {
    switch (a.type) {
      case 'move': push(ix.moves, a.unit, a.to); active.add(a.unit); break;
      case 'attack':
        push(ix.attacks, a.unit, a.target);
        if (a.lure === true) push(ix.lures, a.unit, a.target);
        active.add(a.unit); break;
      case 'ability': {
        const per = ix.abilities[a.unit] ?? (ix.abilities[a.unit] = {});
        const list = per[a.ability] ?? (per[a.ability] = []);
        if (!list.includes(a.target)) list.push(a.target);
        active.add(a.unit); break;
      }
      case 'capture': if (!ix.captures.includes(a.unit)) ix.captures.push(a.unit); active.add(a.unit); break;
      case 'claimTreasure': if (!ix.claims.includes(a.unit)) ix.claims.push(a.unit); active.add(a.unit); break;
      case 'useItem': if (!ix.items.includes(a.unit)) ix.items.push(a.unit); break;
      case 'hunker': if (!ix.hunkers.includes(a.unit)) ix.hunkers.push(a.unit); break;
      case 'unhunker': if (!ix.unhunkers.includes(a.unit)) ix.unhunkers.push(a.unit); break;
      case 'campTrain': {
        const per = ix.campTrain[a.unit] ?? (ix.campTrain[a.unit] = {});
        const list = per[a.unitType] ?? (per[a.unitType] = []);
        if (!list.includes(a.to)) list.push(a.to);
        active.add(a.unit); break;
      }
      case 'train': push(ix.train, a.city, a.unitType); break;
      case 'buildWalls': if (!ix.walls.includes(a.city)) ix.walls.push(a.city); break;
      case 'chooseReward': if (!ix.rewards.includes(a.city)) ix.rewards.push(a.city); break;
      case 'harvest': if (!ix.harvest.includes(a.at)) ix.harvest.push(a.at); break;
      case 'build': push(ix.build, a.at, a.building); break;
      case 'road': if (!ix.road.includes(a.at)) ix.road.push(a.at); break;
      case 'research': if (!ix.research.includes(a.tech)) ix.research.push(a.tech); break;
      default: break;
    }
  }
  ix.activeUnits = [...active].sort((x, y) => x - y);
  return ix;
}

const unitById = (view: PlayerView, id: number) => view.units.find((u) => u.id === id);
const isMine = (view: PlayerView, u: { owner: number } | undefined) => u !== undefined && u.owner === view.player;

function armedTargets(sel: Extract<Selection, { kind: 'unit' }>, ix: ActionIndex): HexKey[] {
  const a = sel.armed;
  if (a === null) return [];
  return (a.kind === 'ability' ? ix.abilities[sel.id]?.[a.ability] : ix.campTrain[sel.id]?.[a.unitType]) ?? [];
}

// Tiles where one of my units can capture or claim a treasure now: they glow gold whatever is selected.
export function readyTiles(view: PlayerView, ix: ActionIndex): HexKey[] {
  const out = new Set<HexKey>();
  for (const id of [...ix.captures, ...ix.claims]) {
    const u = unitById(view, id);
    if (isMine(view, u) && u !== undefined) out.add(u.pos);
  }
  return [...out].sort();
}

export function marksFor(sel: Selection, view: PlayerView, ix: ActionIndex): Record<HexKey, Mark> {
  const marks: Record<HexKey, Mark> = {};
  if (sel.kind === 'none') {
    // nothing selected: no marks (ready tiles glow on their own layer)
  } else if (sel.kind === 'unit') {
    const u = unitById(view, sel.id);
    if (u === undefined) return marks;
    marks[u.pos] = 'selected';
    if (!isMine(view, u)) return marks;
    if (sel.armed !== null) {
      for (const h of armedTargets(sel, ix)) marks[h] = 'ability';
    } else if (sel.askLure !== null) {
      marks[sel.askLure] = 'attack';
    } else {
      // A move that ends the unit's turn: onto or off a mountain (rules 8), or a pathfinder's step into the fog (rules 6:
      // the view holds only explored tiles)
      for (const h of ix.moves[sel.id] ?? []) {
        marks[h] = mountainStep(view, u.pos, h) || !Object.hasOwn(view.tiles, h) ? 'moveEnds' : 'move';
      }
      for (const h of ix.attacks[sel.id] ?? []) marks[h] = 'attack';
    }
  } else if (sel.kind === 'city') {
    const c = view.cities.find((x) => x.id === sel.id);
    if (c !== undefined) marks[c.pos] = 'selected';
  } else {
    marks[sel.at] = 'selected';
  }
  return marks;
}

export function tap(sel: Selection, hit: Hit, view: PlayerView, ix: ActionIndex): { selection: Selection; action: Action | null } {
  const hex = hit.hex;
  if (hex === null) return { selection: NONE, action: null };

  if (sel.kind === 'unit' && isMine(view, unitById(view, sel.id))) {
    const id = sel.id;
    const keep = (): Selection => ({ kind: 'unit', id, armed: null, askLure: null });
    if (sel.armed !== null) {
      if (armedTargets(sel, ix).includes(hex)) {
        const a = sel.armed;
        const action: Action = a.kind === 'ability'
          ? { type: 'ability', unit: id, ability: a.ability, target: hex }
          : { type: 'campTrain', unit: id, unitType: a.unitType, to: hex };
        return { selection: keep(), action };
      }
      return { selection: keep(), action: null };
    }
    if ((ix.attacks[id] ?? []).includes(hex)) {
      // A second tap on the enemy the panel is already asking about takes the primary option: a plain attack.
      if (sel.askLure === hex) return { selection: sel, action: { type: 'attack', unit: id, target: hex } };
      if ((ix.lures[id] ?? []).includes(hex)) return { selection: { kind: 'unit', id, armed: null, askLure: hex }, action: null };
      return { selection: sel, action: { type: 'attack', unit: id, target: hex } };
    }
    if ((ix.moves[id] ?? []).includes(hex)) return { selection: sel, action: { type: 'move', unit: id, to: hex } };
  }

  const city = view.cities.find((c) => c.pos === hex);
  const hitUnit = hit.unit === null ? undefined : unitById(view, hit.unit);
  const mine = isMine(view, hitUnit) ? hitUnit : view.units.find((u) => u.pos === hex && u.owner === view.player);
  if (mine !== undefined) {
    // A tile holding my own unit cycles: the unit, then the ground under it (the city there, mine or not, else the
    // tile), then nothing. A city tile takes no harvest, building or road, so the city's panel is the tile's panel
    // there; a capture stays on the unit's panel.
    if (sel.kind === 'unit' && sel.id === mine.id) {
      return { selection: city !== undefined ? { kind: 'city', id: city.id } : { kind: 'tile', at: hex }, action: null };
    }
    if (sel.kind === 'city' && city !== undefined && sel.id === city.id) return { selection: NONE, action: null };
    if (sel.kind === 'tile' && sel.at === hex) return { selection: NONE, action: null };
    return { selection: { kind: 'unit', id: mine.id, armed: null, askLure: null }, action: null };
  }
  if (hitUnit !== undefined) return { selection: { kind: 'unit', id: hitUnit.id, armed: null, askLure: null }, action: null };
  if (city !== undefined) {
    return { selection: sel.kind === 'city' && sel.id === city.id ? NONE : { kind: 'city', id: city.id }, action: null };
  }
  // With a unit selected, a tap on bare ground (no unit, no city, nothing it can act on) only clears the selection;
  // the tile card opens on the next tap. Both looks reach this through the store's tap.
  if (sel.kind === 'unit') return { selection: NONE, action: null };
  if (view.tiles[hex] !== undefined) {
    return { selection: sel.kind === 'tile' && sel.at === hex ? NONE : { kind: 'tile', at: hex }, action: null };
  }
  return { selection: NONE, action: null };
}

// Next unit: the viewer's units that can still act, in id order. The one after the selected unit, wrapping round;
// the first when the selection is anything else. Null when none can act. With a view, a unit that is hunkered and
// below full health is resting to heal and is skipped; if that leaves none, the answer is null, as when none can act.
export function nextUnit(sel: Selection, ix: ActionIndex, view?: PlayerView): Selection | null {
  const resting = (id: number): boolean => {
    const u = view === undefined ? undefined : unitById(view, id);
    return u !== undefined && u.hunkered && u.hp < maxHpOf(u);
  };
  const list = ix.activeUnits.filter((id) => !resting(id));
  if (list.length === 0) return null;
  // The wrap starts from the selected unit's place among all active units, so a skipped selected unit still moves on.
  const all = ix.activeUnits;
  const from = sel.kind === 'unit' ? all.indexOf(sel.id) : -1;
  for (let i = 1; i <= all.length; i++) {
    const id = all[(from + i + all.length) % all.length]!;
    if (!resting(id)) return { kind: 'unit', id, armed: null, askLure: null };
  }
  return null;
}

export function afterAction(sel: Selection, view: PlayerView, ix: ActionIndex): Selection {
  if (sel.kind === 'unit') {
    return isMine(view, unitById(view, sel.id)) && ix.activeUnits.includes(sel.id)
      ? { kind: 'unit', id: sel.id, armed: null, askLure: null } : NONE;
  }
  return sel;
}

export function spentUnits(view: PlayerView, ix: ActionIndex): Set<number> {
  return new Set(view.units.filter((u) => u.owner === view.player && !ix.activeUnits.includes(u.id)).map((u) => u.id));
}
