// The AI's reading of a believed state: where it is in danger, what it wants, and how good a position is.
import {
  CONFIG, UNITS, attackOf, coverAt, damageFor, defenceOf, distance, key, maxMp, mirror, parseKey, playerIncome, range,
  restHealAt,
} from '../engine';
import type { City, HexKey, MatchState, PlayerId, Unit, UnitTypeId } from '../engine';
import type { Persona, Skill } from './types';

const WARRIOR_DEF = 3;            // danger is measured against a Warrior's defence
const VILLAGE_VALUE = 10;
const CAPITAL_VALUE = 14;
const TREASURE_VALUE = 6;
const DEFEND_VALUE = 15;
const EXPLORE_VALUE = 3;
const DEFEND_RADIUS = 3;
const STANDING_ON_PRIZE = 6;       // a unit on a village, an enemy city or a treasure: it can take it next turn
const REST_SHARE = 0.5;           // share of the health a hurt unit would heal where it stands, in worth
const EXPLORED_WEIGHT = 0.1;
const OBJECTIVE_PULL = 0.8;         // per tile nearer the most attractive objective (value less distance)
const NO_COST_WORTH = 8;
const GARRISON_SHARE = 0.5;       // an enemy unit on its own city tile also carries this share of the city's worth
const GARRISON_HOLD = 3;          // an own unit on an own city tile holds it at this many times persona.hold
const STRIKE_SHARE = 0.5;         // share of its best attack's value a unit that can still attack is worth
const EXPOSED_SHARE = 0.5;        // share of an own city's worth lost while it stands empty within a seen enemy's move
const FOLLOW_SHARE = 0.75;        // share of a broken bond's loss forgiven while the partner can still follow
const BOND_CAP = 4;               // formation weight one unit can have: two hoplite partners, as the phalanx cap
export const GOLD_WEIGHT = 0.25;  // valueOf's weight on gold (times skill.economy)

// Its gold cost; a unit that cannot be bought (champion, support) counts as 8.
export function unitWorth(type: UnitTypeId): number {
  return UNITS[type].cost ?? NO_COST_WORTH;
}

const cityWorth = (c: City): number => 12 + 4 * c.level;
const has = (u: Unit, t: string): boolean => (UNITS[u.type].traits as readonly string[]).includes(t);
const isMounted = (u: Unit): boolean => has(u, 'mounted');

// The engine's health factor on attack: a wounded unit hits softer, unless it is unbowed.
export function healthFactor(u: Unit): number {
  if (has(u, 'unbowed')) return 1;
  const max = UNITS[u.type].hp;
  return (u.hp + max) / (2 * max);
}

// A unit can still move this turn (the early checks reachable makes).
export function canMove(u: Unit): boolean {
  return !u.fresh && u.mp > 0 && (!u.acted || has(u, 'retreat'));
}

// What an enemy unit is worth to remove: its own worth, plus a share of its city when it garrisons one.
function enemyWorth(b: MatchState, e: Unit): number {
  const city = b.cities.find((c) => c.pos === e.pos);
  return unitWorth(e.type) + (city !== undefined && city.owner === e.owner ? GARRISON_SHARE * cityWorth(city) : 0);
}

// The value of the best attack u could make from where it stands, if it can still attack this turn:
// the target's worth times the share of its health the hit takes. Base attack (no inspire), so that
// moving one unit never changes another unit's term.
function strikeOf(b: MatchState, u: Unit): number {
  const def = UNITS[u.type];
  if (u.fresh || u.attacks <= 0 || def.atk === 0 || def.range === 0) return 0;
  const at = parseKey(u.pos);
  const atk = def.atk * healthFactor(u);
  let best = 0;
  for (const e of b.units) {
    if (e.owner === u.owner || distance(at, parseKey(e.pos)) > def.range) continue;
    const dmg = damageFor(atk, defenceOf(b, e), coverAt(b, e));
    best = Math.max(best, enemyWorth(b, e) * Math.min(dmg, e.hp) / UNITS[e.type].hp);
  }
  return STRIKE_SHARE * best;
}

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

// An own city with no unit on its tile that a seen enemy could walk into next turn (full movement,
// ignoring terrain): it could be lost. The unit standing on it is what keeps it.
function exposed(b: MatchState, c: City): boolean {
  if (b.units.some((u) => u.pos === c.pos)) return false;
  const at = parseKey(c.pos);
  return b.units.some((e) => e.owner !== c.owner && UNITS[e.type].move > 0 && distance(at, parseKey(e.pos)) <= maxMp(b, e) / 2);
}

// What valueOf takes off for this own city while it stands exposed, or 0 when it does not.
export function exposureCost(b: MatchState, ctx: Ctx, c: City): number {
  return c.owner === ctx.me && exposed(b, c) ? EXPOSED_SHARE * (cityWorth(c) + ctx.persona.spread) : 0;
}

// Weight of the bond between two adjacent own units for the formation term.
const pairWeight = (a: Unit, c: Unit): number => (a.type === 'hoplite' && c.type === 'hoplite' ? 2 : 1);

const bond = (a: Unit, c: Unit): number => (distance(parseKey(a.pos), parseKey(c.pos)) === 1 ? pairWeight(a, c) : 0);

// The formation term before the persona weight: every own unit's bonds, each unit capped at BOND_CAP,
// halved because every bond is counted from both ends. A garrison (a unit on an own city tile) holds the
// city, not the line, so it bonds with nobody and never pins a neighbour at home.
function formationTotal(b: MatchState, units: readonly Unit[], me: PlayerId): number {
  const ownCity = new Set(b.cities.filter((c) => c.owner === me).map((c) => c.pos));
  const own = units.filter((u) => u.owner === me && !ownCity.has(u.pos));
  let total = 0;
  for (const u of own) {
    let n = 0;
    for (const o of own) if (o.id !== u.id) n += bond(u, o);
    total += Math.min(BOND_CAP, n);
  }
  return total / 2;
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

  if ((city !== undefined && city.owner !== me) || (city === undefined && tile?.village === true)) {
    v += STANDING_ON_PRIZE * (1 + persona.spread / 6);
  }
  if (tile?.treasure === true) v += STANDING_ON_PRIZE;

  // Rest: a hurt unit is worth more where resting would heal it more (own land, away from seen enemies). Only one
  // that has neither moved nor acted this turn: any other will not heal when its next turn starts.
  const missing = UNITS[u.type].hp - u.hp;
  if (missing > 0 && !u.moved && !u.acted) v += REST_SHARE * worth * Math.min(missing, restHealAt(b, u)) / UNITS[u.type].hp;

  const threat = danger[u.pos] ?? 0;
  v -= skill.danger * worth * Math.min(1, threat / u.hp);

  // Hold: a garrison on an own city tile always; inside the territory or next to an own city only while
  // that city is threatened (has a defend objective). Elsewhere the army is free to march.
  if (city !== undefined && city.owner === me) v += GARRISON_HOLD * persona.hold;
  else {
    const threatened = (c: City): boolean => c.owner === me && goals.some((g) => g.kind === 'defend' && g.at === c.pos);
    if (b.cities.some((c) => threatened(c) && (c.id === tile?.cityId || distance(at, parseKey(c.pos)) <= 1))) v += persona.hold;
  }
  if (isMounted(u) && u.acted && threat === 0) v += persona.raid;
  if (isMounted(u) && tile?.terrain === 'forest') v -= persona.forestPenalty;
  v += strikeOf(b, u);

  // The pull of the most attractive objective, its value less its distance. While a seen enemy is in
  // reach only cities (to take or to defend) still pull, so a fight never makes the army forget them.
  const reach = threatReach(b, u);
  const engaged = b.units.some((e) => e.owner !== me && distance(at, parseKey(e.pos)) <= reach);
  let pull = -Infinity;
  for (const g of goals) {
    if (engaged && g.kind !== 'enemyCity' && g.kind !== 'enemyCapital' && g.kind !== 'defend') continue;
    pull = Math.max(pull, g.value - distance(at, parseKey(g.at)));
  }
  if (pull > -Infinity) v += OBJECTIVE_PULL * pull;
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
    if (c.owner === me) {
      v += worth; growth += c.growth;
      v -= exposureCost(b, ctx, c);
    } else v -= worth;
  }
  v += skill.economy * (3 * playerIncome(b, me) + GOLD_WEIGHT * self.gold + 3 * self.techs.length + growth);
  v += EXPLORED_WEIGHT * self.explored.length;

  for (const u of b.units) {
    if (u.owner !== me) { v -= enemyWorth(b, u) * u.hp / UNITS[u.type].hp; continue; }
    v += unitTerms(b, ctx, u);
  }
  v += persona.formation * formationTotal(b, b.units, me);
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
  const after = b.units.map((x) => (x.id === unitId ? moved : x));
  score += ctx.persona.formation * (formationTotal(b, after, ctx.me) - formationTotal(b, b.units, ctx.me));
  for (const c of b.cities) {
    if (c.pos === u.pos || c.pos === to) score -= exposureCost({ ...b, units: after }, ctx, c) - exposureCost(b, ctx, c);
  }

  const explored = new Set(b.players[ctx.me]?.explored ?? []);
  const sight = UNITS[u.type].sight + (b.tiles[to]?.terrain === 'mountain' ? CONFIG.mountainSightBonus : 0);
  for (const h of range(there, sight)) {
    const k = key(h);
    if (b.tiles[k] !== undefined && !explored.has(k)) score += 1;
  }
  return score;
}

// The follow credit: a planner score added to a move, on top of its moveScore, so a line can advance.
// What it credits: the part of the move's formation loss that comes from bonds broken with own units
// that have not moved yet this turn and could still step next to `to` (full movement, ignoring terrain),
// times FOLLOW_SHARE, and only for the unit's first move this turn. A block moves one unit at a time, so
// without it the first step out of a line always pays for a bond the next unit will restore, and the
// line never moves. A step too far for the others to keep up earns nothing. The share is taken of the
// whole formation change, so where BOND_CAP binds a third unit the forgiven amount is approximate.
// Why it is scored outside valueOf: it is about what may happen next, not the position. Inside valueOf
// it would either remove the reason to close a gap or charge later movers for bonds they never had,
// and a move's score would stop being a change in position. So valueOf and moveScore leave it out, and
// only the planner (plan.ts, move candidates) adds it.
export function followCredit(b: MatchState, ctx: Ctx, unitId: number, to: HexKey, mpLeft: number): number {
  const u = b.units.find((x) => x.id === unitId);
  if (u === undefined) throw new Error(`no unit ${unitId}`);
  if (u.moved) return 0;                      // only a first step out of the line, so no unit walks in circles
  const from = parseKey(u.pos);
  const there = parseKey(to);
  let broken = 0;
  let followable = 0;
  for (const o of b.units) {
    if (o.id === u.id || o.owner !== u.owner) continue;
    const at = parseKey(o.pos);
    if (distance(from, at) !== 1 || distance(there, at) === 1) continue;
    const w = pairWeight(u, o);
    broken += w;
    if (!o.moved && canMove(o) && distance(there, at) - 1 <= o.mp / 2) followable += w;
  }
  if (followable === 0) return 0;
  const moved: Unit = { ...u, pos: to, mp: mpLeft, moved: true };
  const after = b.units.map((x) => (x.id === unitId ? moved : x));
  const loss = ctx.persona.formation * (formationTotal(b, b.units, ctx.me) - formationTotal(b, after, ctx.me));
  return loss <= 0 ? 0 : FOLLOW_SHARE * loss * followable / broken;
}
