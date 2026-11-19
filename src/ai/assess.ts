// The AI's reading of a believed state: where it is in danger, what it wants, and how good a position is.
import {
  CONFIG, UNITS, attackOf, coverAt, damageFor, distance, key, maxMp, mirror, parseKey, playerIncome, range,
} from '../engine';
import type { City, Hex, HexKey, MatchState, PlayerId, Unit, UnitTypeId } from '../engine';
import type { Persona, Skill } from './types';

const WARRIOR_DEF = 3;            // danger is measured against a Warrior's defence
const VILLAGE_VALUE = 10;
const CAPITAL_VALUE = 14;
const TREASURE_VALUE = 6;
const DEFEND_VALUE = 15;
const EXPLORE_VALUE = 3;
const DEFEND_RADIUS = 3;
const STANDING_ON_PRIZE = 6;
const EXPLORED_WEIGHT = 0.1;
const OBJECTIVE_PULL = 0.3;
const NO_COST_WORTH = 8;

// Its gold cost; a unit that cannot be bought (champion, support) counts as 8.
export function unitWorth(type: UnitTypeId): number {
  return UNITS[type].cost ?? NO_COST_WORTH;
}

const cityWorth = (c: City): number => 12 + 4 * c.level;
const isMounted = (u: Unit): boolean => UNITS[u.type].traits.includes('mounted');

// Tiles from which a unit could attack next turn: full movement (ignoring terrain) plus its range.
function threatReach(b: MatchState, u: Unit): number {
  return maxMp(b, u) / 2 + UNITS[u.type].range;
}

// Most damage seen enemies could deal to a Warrior-defence unit on each tile next turn. Tiles left
// out are safe; read with `?? 0`.
export type DangerMap = Record<HexKey, number>;

export function dangerMap(b: MatchState, me: PlayerId): DangerMap {
  const out: DangerMap = {};
  for (const e of b.units) {
    if (e.owner === me || UNITS[e.type].atk === 0 || UNITS[e.type].range === 0) continue;
    const atk = attackOf(b, e);
    for (const h of range(parseKey(e.pos), threatReach(b, e))) {
      const k = key(h);
      const tile = b.tiles[k];
      if (tile === undefined || tile.terrain === 'water') continue;
      const cover = coverAt(b, { ...e, owner: me, pos: k });   // as if one of ours stood there
      out[k] = (out[k] ?? 0) + damageFor(atk, WARRIOR_DEF, cover);
    }
  }
  return out;
}

export interface Objective {
  at: HexKey;
  kind: 'village' | 'enemyCity' | 'enemyCapital' | 'treasure' | 'explore' | 'defend';
  value: number;
}

// Places worth going to, most valuable first, then by key and kind. One entry per tile and kind.
export function objectives(b: MatchState, me: PlayerId, persona: Persona): Objective[] {
  const explored = new Set(b.players[me]?.explored ?? []);
  const cityAtKey = new Map(b.cities.map((c) => [c.pos, c]));
  const found = new Map<string, Objective>();
  const add = (o: Objective): void => {
    const id = `${o.kind}@${o.at}`;
    if ((found.get(id)?.value ?? -Infinity) < o.value) found.set(id, o);
  };
  const capitals = new Set<HexKey>();
  for (const p of b.players) {
    if (p === undefined || p.id === me || !p.alive) continue;
    const at = CONFIG.capitals[p.id];
    if (at !== undefined && b.tiles[at] !== undefined) capitals.add(at);
  }

  for (const k of explored) {
    const tile = b.tiles[k];
    if (tile === undefined) continue;
    if (tile.village && !cityAtKey.has(k)) {
      add({ at: k, kind: 'village', value: VILLAGE_VALUE * (1 + persona.spread / 6) });
      const m = key(mirror(parseKey(k)));
      if (b.tiles[m] !== undefined && !explored.has(m)) add({ at: m, kind: 'explore', value: EXPLORE_VALUE });
    }
    if (tile.treasure) add({ at: k, kind: 'treasure', value: TREASURE_VALUE });
  }
  for (const c of b.cities) {
    if (c.owner === me || capitals.has(c.pos)) continue;
    add({ at: c.pos, kind: 'enemyCity', value: cityWorth(c) });
  }
  for (const at of capitals) {
    const c = cityAtKey.get(at);
    if (!explored.has(at)) add({ at, kind: 'enemyCapital', value: CAPITAL_VALUE });
    else if (c !== undefined && c.owner !== me) add({ at, kind: 'enemyCapital', value: Math.max(CAPITAL_VALUE, cityWorth(c)) });
  }
  const enemies = b.units.filter((u) => u.owner !== me).map((u) => parseKey(u.pos));
  const unexplored = Object.keys(b.tiles).filter((k) => !explored.has(k));
  for (const c of b.cities) {
    if (c.owner !== me) continue;
    const at = parseKey(c.pos);
    if (enemies.some((e) => distance(at, e) <= DEFEND_RADIUS)) add({ at: c.pos, kind: 'defend', value: DEFEND_VALUE });
    let best: HexKey | null = null;
    let bestD = Infinity;
    for (const k of unexplored) {
      const d = distance(at, parseKey(k));
      if (d < bestD || (d === bestD && best !== null && k < best)) { best = k; bestD = d; }
    }
    if (best !== null) add({ at: best, kind: 'explore', value: EXPLORE_VALUE });
  }
  return [...found.values()].sort((a, c) => c.value - a.value
    || (a.at < c.at ? -1 : a.at > c.at ? 1 : 0)
    || (a.kind < c.kind ? -1 : a.kind > c.kind ? 1 : 0));
}

export interface Ctx {
  me: PlayerId; skill: Skill; persona: Persona;
  danger: DangerMap; goals: Objective[];
  hurt: Set<number>;               // enemy unit ids hit this turn (read by the planner)
}

// Weight of the bond between two adjacent own units for the formation term.
const pairWeight = (a: Unit, c: Unit): number => (a.type === 'hoplite' && c.type === 'hoplite' ? 2 : 1);

// Formation pairs `u` makes with the other own units, as if it stood on `at`.
function formationOf(b: MatchState, u: Unit, at: Hex): number {
  let n = 0;
  for (const o of b.units) {
    if (o.id !== u.id && o.owner === u.owner && distance(at, parseKey(o.pos)) === 1) n += pairWeight(u, o);
  }
  return n;
}

// Every value term that belongs to one own unit, except formation (a pair term) and exploring.
function unitTerms(b: MatchState, ctx: Ctx, u: Unit): number {
  const { persona, skill, danger, goals, me } = ctx;
  const at = parseKey(u.pos);
  const tile = b.tiles[u.pos];
  const city = b.cities.find((c) => c.pos === u.pos);
  const worth = unitWorth(u.type);
  const hpShare = u.hp / UNITS[u.type].hp;
  let v = worth * hpShare;

  if ((city !== undefined && city.owner !== me) || (city === undefined && tile?.village === true)) v += STANDING_ON_PRIZE;

  const threat = danger[u.pos] ?? 0;
  v -= skill.danger * worth * Math.min(1, threat / u.hp);

  const ownTerritory = tile !== undefined && tile.cityId !== null
    && b.cities.some((c) => c.id === tile.cityId && c.owner === me);
  if (ownTerritory || b.cities.some((c) => c.owner === me && distance(at, parseKey(c.pos)) <= 1)) v += persona.hold;
  if (isMounted(u) && u.acted && threat === 0) v += persona.raid;
  if (isMounted(u) && tile?.terrain === 'forest') v -= persona.forestPenalty;

  if (goals.length > 0) {
    const reach = threatReach(b, u);
    const engaged = b.units.some((e) => e.owner !== me && distance(at, parseKey(e.pos)) <= reach);
    if (!engaged) {
      let nearest = Infinity;
      for (const g of goals) nearest = Math.min(nearest, distance(at, parseKey(g.at)));
      v -= OBJECTIVE_PULL * nearest;
    }
  }
  return v;
}

// How good the believed state is for ctx.me; higher is better.
export function valueOf(b: MatchState, ctx: Ctx): number {
  const { me, persona, skill } = ctx;
  const self = b.players[me];
  if (self === undefined) throw new Error(`no player ${me}`);
  let v = 0;
  let growth = 0;
  for (const c of b.cities) {
    const worth = cityWorth(c) + persona.spread;
    if (c.owner === me) { v += worth; growth += c.growth; } else v -= worth;
  }
  v += skill.economy * (3 * playerIncome(b, me) + 0.25 * self.gold + 3 * self.techs.length + growth);
  v += EXPLORED_WEIGHT * self.explored.length;

  let pairs = 0;
  for (const u of b.units) {
    if (u.owner !== me) { v -= unitWorth(u.type) * u.hp / UNITS[u.type].hp; continue; }
    v += unitTerms(b, ctx, u);
    pairs += formationOf(b, u, parseKey(u.pos));
  }
  v += persona.formation * pairs / 2;          // every pair was counted from both ends
  return v;
}

// The change in valueOf if the unit ended on `to` with `mpLeft` half-points, plus one point for
// each tile its sight there would newly explore. Works without applyAction.
export function moveScore(b: MatchState, ctx: Ctx, unitId: number, to: HexKey, mpLeft: number): number {
  const u = b.units.find((x) => x.id === unitId);
  if (u === undefined) throw new Error(`no unit ${unitId}`);
  const moved: Unit = { ...u, pos: to, mp: mpLeft, moved: true };
  const there = parseKey(to);
  let score = unitTerms(b, ctx, moved) - unitTerms(b, ctx, u);
  score += ctx.persona.formation * (formationOf(b, u, there) - formationOf(b, u, parseKey(u.pos)));

  const explored = new Set(b.players[ctx.me]?.explored ?? []);
  const sight = UNITS[u.type].sight + (b.tiles[to]?.terrain === 'mountain' ? CONFIG.mountainSightBonus : 0);
  for (const h of range(there, sight)) {
    const k = key(h);
    if (b.tiles[k] !== undefined && !explored.has(k)) score += 1;
  }
  return score;
}
