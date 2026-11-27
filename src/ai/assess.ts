// The AI's reading of a believed state: where it is in danger, what it wants, and how good a position is.
import {
  CONFIG, FACTIONS, UNITS, ambushes, attackOf, blockadeLoss, attackReach, baseAttackOf, coverAt, damageFor, distance, isHero, isHidden, key,
  maxHpOf, maxMp, mountainStep, strikeDamage, growthNeeded, mirror, parseKey, playerIncome, range, restHealAt, statsOf, visibleTiles,
} from '../engine';
import type { City, HexKey, MatchState, PlayerId, Unit, UnitTypeId } from '../engine';
import type { Persona, Skill } from './types';

const WARRIOR_DEF = 3;            // danger is measured against a Warrior's defence
const VILLAGE_VALUE = 10;
const CAPITAL_VALUE = 14;
const TREASURE_VALUE = 9;         // a site holds more than gold since stage 2
const DEFEND_VALUE = 15;
const EXPLORE_VALUE = 3;
const DEFEND_RADIUS = 3;
const STANDING_ON_PRIZE = 6;       // a unit on a village, an enemy city or a treasure: it can take it next turn
const REST_SHARE = 0.5;           // share of the health a hurt unit would heal where it stands, in worth
const LATE_REST_SHARE = 0.5;      // part of that credit for a unit that moved or acted: it heals the turn after next
const EXPLORED_WEIGHT = 0.1;
const OBJECTIVE_PULL = 0.8;         // per tile nearer the most attractive objective (value less distance)
const PRESS_SHARE = 3;            // own cities at least this many times the enemy's known ones: the army presses on
const PRESS_PULL = 3;             // and the pull toward enemy cities is this many times as strong
const LATE_ROUND = 25;            // from this round on every side presses a little more each round
const LATE_PRESS = 0.15;          // per round past LATE_ROUND, so a deadlock at round 45 pulls four times as hard
const NO_COST_WORTH = 8;
const GARRISON_SHARE = 0.5;       // an enemy unit on its own city tile also carries this share of the city's worth
const GARRISON_HOLD = 3;          // an own unit on an own city tile holds it at this many times persona.hold
const STRIKE_SHARE = 0.5;         // share of its best attack's value a unit that can still attack is worth
const EXPOSED_SHARE = 0.5;        // share of an own city's worth lost while it stands empty within a seen enemy's move
const FOLLOW_SHARE = 0.75;        // share of a broken bond's loss forgiven while the partner can still follow
const BOND_CAP = 4;               // formation weight one unit can have: two hoplite partners, as the phalanx cap
export const GOLD_WEIGHT = 0.25;  // valueOf's weight on gold (times skill.economy)
const BLOCKADE_WEIGHT = 3;        // rules 8: per gold a blockade of an enemy city cuts (times skill.economy), as income is weighed
const HERO_TRAIT_WORTH = 3;       // per trait a unit has earned or found
const HERO_WORTH = 3;             // more again for a hero
const LEVEL_WORTH = 10;           // per own city level, and per share of the way to the next, times skill.economy: a level
                                  // brings a reward and room for a unit, so growth is bought on the way, not only for the last step
const STEADY_VALUE = 1;           // per own unit a steady unit shields from a lure
const STEADY_CAP = 2;
const TAUNT_VALUE = 1.5;          // a taunt that turns an enemy's blow onto a Hoplite
const BADLY_WOUNDED = 0.4;        // a unit at or below this share of its health is badly wounded
const WOUNDED_CARE = 3;           // its danger weight is at least this times skill.focus
const WOUNDED_PULL_CUT = 0.75;    // and its objective pull is cut by this share times skill.focus
const ITEM_WORTH = 1;             // a carried draught (Task 8: 2 kept hard from drinking for a kill)

// Its gold cost; a unit that cannot be bought (champion, support) counts as 8.
export function unitWorth(type: UnitTypeId): number {
  return UNITS[type].cost ?? NO_COST_WORTH;
}

// What the unit itself is worth: its type's worth plus its traits, its hero status and a carried draught. The danger
// term scales with it, so heroes are kept out of reach and enemy heroes are hit first.
export function unitValue(u: Unit): number {
  return unitWorth(u.type) + HERO_TRAIT_WORTH * u.heroTraits.length + (isHero(u) ? HERO_WORTH : 0)
    + (u.item !== null ? ITEM_WORTH : 0);
}

const cityWorth = (c: City): number => 12 + 4 * c.level;
const has = (u: Unit, t: string): boolean => (UNITS[u.type].traits as readonly string[]).includes(t);
const isMounted = (u: Unit): boolean => has(u, 'mounted');

// The engine's health factor on attack: a wounded unit hits softer, unless it is unbowed.
export function healthFactor(u: Unit): number {
  if (has(u, 'unbowed')) return 1;
  const max = maxHpOf(u);
  return (u.hp + max) / (2 * max);
}

// A unit can still move this turn (the early checks reachable makes).
export function canMove(u: Unit): boolean {
  return !u.fresh && u.mp > 0 && (!u.acted || has(u, 'retreat'));
}

// What an enemy unit is worth to remove: its own worth, plus a share of its city when it garrisons one.
function enemyWorth(b: MatchState, e: Unit): number {
  const city = b.cities.find((c) => c.pos === e.pos);
  return unitValue(e) + (city !== undefined && city.owner === e.owner ? GARRISON_SHARE * cityWorth(city) : 0);
}

// rules 11: the AI's estimate of a hit by its own unit `attacker` on `target` at effective attack effAtk: the engine's
// strikeDamage with the ambush the engine would judge (from the believed state), and the bow formula only when the
// owner knows Archery and the target is 2 or more tiles away. The engine's bowShot ignores Archery, so a Skirmisher
// without it, which walks up and fights in melee, would otherwise be costed as a bow shot; its hit is worked as from
// the target's own tile (no bow, no long shot), as a melee hit is. Units without the bow or ambush trait get exactly
// strikeDamage, so the Spartan and Mongol estimates do not change.
export function strikeEstimate(b: MatchState, target: Unit, attacker: Unit, effAtk: number): number {
  const ambush = ambushes(b, attacker, target);
  const shoots = b.players[attacker.owner]?.techs.includes('archery') === true
    && distance(parseKey(attacker.pos), parseKey(target.pos)) >= 2;
  const from = has(attacker, 'bow') && !shoots ? { ...attacker, pos: target.pos } : attacker;
  return strikeDamage(b, target, from, effAtk, ambush);
}

// The value of the best attack u could make from where it stands, if it can still attack this turn:
// the target's worth times the share of its health the hit takes. Base attack (traits, but no inspire or myth
// touch), so that moving one unit never changes another unit's term.
function strikeOf(b: MatchState, u: Unit): number {
  const def = UNITS[u.type];
  if (u.fresh || u.attacks <= 0 || def.atk === 0 || def.range === 0) return 0;
  const at = parseKey(u.pos);
  const atk = baseAttackOf(u) * healthFactor(u);
  let best = 0;
  for (const e of b.units) {
    // the engine's reach: from a mountain a ranged unit has a tile more (rules 8), which is how the AI values a peak. A
    // flat credit for standing on one (1, 0.5, or 1 only near a seen enemy) left one or two hard matches stalled at 60
    // rounds in character.test.ts, so there is none.
    if (e.owner === u.owner || distance(at, parseKey(e.pos)) > attackReach(b, u)) continue;
    const dmg = strikeEstimate(b, e, u, atk);   // the engine's damage, with the momentum cut (rules 7), the long shot cut (rules 8) and the ambush (rules 11)
    best = Math.max(best, enemyWorth(b, e) * Math.min(dmg, e.hp) / maxHpOf(e));
  }
  return STRIKE_SHARE * best;
}

// Tiles from which a unit could attack next turn: full movement (ignoring terrain) plus its range. Whole tiles: since
// rules 6 a Mongol rider has an odd number of half-points, and a fractional radius made `range` list no real tile, so
// the danger map left out every Mongol rider.
function threatReach(b: MatchState, u: Unit): number {
  return Math.floor(maxMp(b, u) / 2) + UNITS[u.type].range;
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

// rules 11: whether an own unit stands hidden by Woodland cover or a veil, so a seen enemy must first come within the
// reveal range before it can strike. The hidden trait (the Spartan Scout) is left out: its estimate is as before rules 11.
function coverHidden(b: MatchState, u: Unit): boolean {
  return !has(u, 'hidden') && isHidden(b, u);
}

// rules 11: the danger on a hidden own unit's tile `at`: as dangerMap, but only from seen enemies that can come within
// the reveal range next turn (full movement, ignoring terrain), since an enemy cannot attack what it cannot see.
export function hiddenDanger(b: MatchState, me: PlayerId, at: HexKey): number {
  const there = parseKey(at);
  let out = 0;
  for (const e of b.units) {
    if (e.owner === me || UNITS[e.type].atk === 0 || UNITS[e.type].range === 0) continue;
    // a deliberate rough reach, as threatReach: full movement ignoring terrain, then a strike from no farther than it sees
    const reach = Math.floor(maxMp(b, e) / 2) + Math.min(UNITS[e.type].range, CONFIG.hiddenRevealRange);
    if (distance(parseKey(e.pos), there) > reach) continue;
    out += damageFor(attackOf(b, e), WARRIOR_DEF, coverAt(b, { ...e, owner: me, pos: at }));
  }
  return out;
}

// The danger valueOf weighs for the own unit u: the danger map on its tile, or, rules 11, for a unit hidden by Woodland
// cover or a smoke's veil, no more than hiddenDanger there (an enemy must come close to see it before it can strike).
export function threatOn(b: MatchState, me: PlayerId, danger: DangerMap, u: Unit): number {
  return coverHidden(b, u) ? Math.min(danger[u.pos] ?? 0, hiddenDanger(b, me, u.pos)) : danger[u.pos] ?? 0;
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
  // A rival's capital: a seen city of theirs that is one, or their starting tile while it is unexplored. Since rules 7 a
  // taken capital is an ordinary city and the loser's capital moves, so a seen start tile counts only while it is one.
  const capitals = new Set<HexKey>();
  for (const p of b.players) {
    if (p === undefined || p.id === me || !p.alive) continue;
    const at = CONFIG.capitals[p.id];
    if (at !== undefined && b.tiles[at] !== undefined && !explored.has(at)) capitals.add(at);
  }
  for (const c of b.cities) if (c.owner !== me && c.capital && b.players[c.owner]?.alive === true) capitals.add(c.pos);

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
  return b.units.some((e) => e.owner !== c.owner && UNITS[e.type].move > 0 && !UNITS[e.type].traits.includes('noCityCapture') && distance(at, parseKey(e.pos)) <= maxMp(b, e) / 2);
}

// What valueOf takes off for this own city while it stands exposed, or 0 when it does not.
export function exposureCost(b: MatchState, ctx: Ctx, c: City): number {
  return c.owner === ctx.me && exposed(b, c) ? EXPOSED_SHARE * (cityWorth(c) + ctx.persona.spread) : 0;
}

// Weight of the bond between two adjacent own units for the formation term: two Hoplites, or two heroes of a
// faction with the myth touch, bond twice as strongly.
function pairWeight(b: MatchState, a: Unit, c: Unit): number {
  if (a.type === 'hoplite' && c.type === 'hoplite') return 2;
  const faction = b.players[a.owner]?.faction;
  return faction !== undefined && FACTIONS[faction].mythTouch && isHero(a) && isHero(c) ? 2 : 1;
}

const bond = (b: MatchState, a: Unit, c: Unit): number =>
  (distance(parseKey(a.pos), parseKey(c.pos)) === 1 ? pairWeight(b, a, c) : 0);

// The formation term before the persona weight: every own unit's bonds, each unit capped at BOND_CAP,
// halved because every bond is counted from both ends. A garrison (a unit on an own city tile) holds the
// city, not the line, so it bonds with nobody and never pins a neighbour at home.
function formationTotal(b: MatchState, units: readonly Unit[], me: PlayerId): number {
  const ownCity = new Set(b.cities.filter((c) => c.owner === me).map((c) => c.pos));
  const own = units.filter((u) => u.owner === me && !ownCity.has(u.pos));
  let total = 0;
  for (const u of own) {
    let n = 0;
    for (const o of own) if (o.id !== u.id) n += bond(b, u, o);
    total += Math.min(BOND_CAP, n);
  }
  return total / 2;
}

// The visible-tile set the rest term needs, computed at most once per evaluation of a state and only if asked for.
type Visible = () => ReadonlySet<HexKey>;
function lazyVisible(b: MatchState, me: PlayerId): Visible {
  let set: ReadonlySet<HexKey> | undefined;
  return () => (set ??= visibleTiles(b, me));
}

// A steady unit (the Piper) keeps the units beside it from being lured: worth this much for each own unit beside it
// that a seen luring enemy could reach next turn, up to STEADY_CAP of them.
function steadyCredit(b: MatchState, u: Unit): number {
  const lurers = b.units.filter((e) => e.owner !== u.owner && has(e, 'retreat')
    && FACTIONS[b.players[e.owner]?.faction ?? 'spartans'].canLure);
  if (lurers.length === 0) return 0;
  const at = parseKey(u.pos);
  const shielded = b.units.filter((o) => o.owner === u.owner && o.id !== u.id && distance(at, parseKey(o.pos)) === 1
    && lurers.some((e) => distance(parseKey(e.pos), parseKey(o.pos)) <= threatReach(b, e))).length;
  return STEADY_VALUE * Math.min(STEADY_CAP, shielded);
}

// A taunt makes the enemy on `at` attack only a phalanx unit (the Hoplite) while one is in its range. Worth
// TAUNT_VALUE when an own phalanx unit and another own unit are both within its reach next turn, so the taunt turns
// its blow from the weaker unit onto the Hoplite; 0 otherwise. valueOf has no term for it, so the planner adds it.
export function tauntCredit(b: MatchState, me: PlayerId, at: HexKey): number {
  const e = b.units.find((x) => x.pos === at && x.owner !== me);
  if (e === undefined || e.taunted) return 0;
  const reach = threatReach(b, e);
  const near = b.units.filter((o) => o.owner === me && distance(parseKey(o.pos), parseKey(at)) <= reach);
  return near.some((o) => has(o, 'phalanx')) && near.some((o) => !has(o, 'phalanx')) ? TAUNT_VALUE : 0;
}

// Every value term that belongs to one own unit, except formation (a pair term) and exploring.
function unitTerms(b: MatchState, ctx: Ctx, u: Unit, visible: Visible): number {
  const { persona, skill, danger, goals, me } = ctx;
  const at = parseKey(u.pos);
  const tile = b.tiles[u.pos];
  const city = b.cities.find((c) => c.pos === u.pos);
  const worth = unitValue(u);
  const maxHp = maxHpOf(u);
  const hpShare = u.hp / maxHp;
  let v = worth * hpShare;

  if ((city !== undefined && city.owner !== me && !UNITS[u.type].traits.includes('noCityCapture')) || (city === undefined && tile?.village === true)) {
    v += STANDING_ON_PRIZE * (1 + persona.spread / 6);
  }
  if (tile?.treasure === true) v += STANDING_ON_PRIZE;

  // Rest: a hurt unit is worth more where resting would heal it more (own land, away from seen enemies). One that
  // moved or acted this turn will not heal when its next turn starts, only the turn after if it rests then, so it
  // gets part of the credit: enough that a hurt unit walks to better healing ground.
  const missing = maxHp - u.hp;
  if (missing > 0) {
    const share = u.moved || u.acted ? REST_SHARE * LATE_REST_SHARE : REST_SHARE;
    v += share * worth * Math.min(missing, restHealAt(b, u, visible())) / maxHp;
  }

  // A badly wounded unit keeps out of reach even at the skill levels that weigh danger little: it falls back to heal.
  // rules 8: a hunkered unit heals as its owner's turn ends, so the enemy's coming turn meets it with that heal in.
  const threat = threatOn(b, me, danger, u);
  const care = hpShare <= BADLY_WOUNDED ? Math.max(skill.danger, WOUNDED_CARE * skill.focus) : skill.danger;
  const met = u.hunkered && CONFIG.hunker.healAtTurnEnd ? Math.min(maxHp, u.hp + restHealAt(b, u, visible())) : u.hp;
  v -= care * worth * Math.min(1, threat / met);

  // Hold: a garrison on an own city tile always; inside the territory or next to an own city only while
  // that city is threatened (has a defend objective). Elsewhere the army is free to march.
  if (city !== undefined && city.owner === me) v += GARRISON_HOLD * persona.hold;
  else {
    const threatened = (c: City): boolean => c.owner === me && goals.some((g) => g.kind === 'defend' && g.at === c.pos);
    if (b.cities.some((c) => threatened(c) && (c.id === tile?.cityId || distance(at, parseKey(c.pos)) <= 1))) v += persona.hold;
  }
  // rules 8: a rider that climbed a mountain has acted only by climbing, so the climb alone is no raid
  const climbed = u.turnEnded && tile?.terrain === 'mountain';
  if (isMounted(u) && u.acted && !climbed && threat === 0) v += persona.raid;
  if (isMounted(u) && tile?.terrain === 'forest') v -= persona.forestPenalty;
  if (has(u, 'steady')) v += steadyCredit(b, u);
  v += strikeOf(b, u);

  // The pull of the most attractive objective, its value less its distance. While a seen enemy is in
  // reach only cities (to take or to defend) still pull, so a fight never makes the army forget them.
  const reach = threatReach(b, u);
  const engaged = b.units.some((e) => e.owner !== me && distance(at, parseKey(e.pos)) <= reach);
  const noCapture = UNITS[u.type].traits.includes('noCityCapture');
  let pull = -Infinity;
  for (const g of goals) {
    if (engaged && g.kind !== 'enemyCity' && g.kind !== 'enemyCapital' && g.kind !== 'defend') continue;
    if (noCapture && (g.kind === 'enemyCity' || g.kind === 'enemyCapital')) continue;   // it can never take one
    pull = Math.max(pull, g.value - distance(at, parseKey(g.at)));
  }
  // A badly wounded unit is pulled less toward its goals, more so as the skill rises, so it falls back to heal.
  const drive = hpShare <= BADLY_WOUNDED ? 1 - WOUNDED_PULL_CUT * skill.focus : 1;
  if (pull > -Infinity) v += OBJECTIVE_PULL * drive * pull * pressOf(b, me);
  return v;
}

// A side that holds PRESS_SHARE times the enemy's known cities presses on to finish the match: its pull toward its
// goals outweighs the formation and garrison terms that otherwise keep a big army at home. Stalled sims (2026-11-24)
// ended with 50 units spread over seven cities beside an enemy's last one. Past LATE_ROUND both sides press harder
// each round, which breaks the even deadlocks (four cities each, armies at home) that made most of the other stalls.
export function pressOf(b: MatchState, me: PlayerId): number {
  let own = 0; let theirs = 0;
  for (const c of b.cities) if (c.owner === me) own += 1; else theirs += 1;
  const late = 1 + LATE_PRESS * Math.max(0, Math.floor(b.stamp / 2) - LATE_ROUND);
  return Math.max(late, theirs > 0 && own >= PRESS_SHARE * theirs ? PRESS_PULL : 1);
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
      v += worth; growth += c.growth + LEVEL_WORTH * (c.level + c.growth / growthNeeded(b, c));
      v -= exposureCost(b, ctx, c);
    } else v -= worth;
  }
  // rules 8: income is counted after the blockades of own cities, and every blockaded enemy city is worth its cut
  let cut = 0;
  for (const p of b.players) if (p.id !== me) cut += blockadeLoss(b, p.id);
  v += skill.economy * (3 * (playerIncome(b, me) - blockadeLoss(b, me)) + BLOCKADE_WEIGHT * cut + GOLD_WEIGHT * self.gold + 3 * self.techs.length + growth);
  v += EXPLORED_WEIGHT * self.explored.length;

  const visible = lazyVisible(b, me);
  for (const u of b.units) {
    if (u.owner !== me) { v -= enemyWorth(b, u) * u.hp / maxHpOf(u); continue; }
    v += unitTerms(b, ctx, u, visible);
  }
  v += persona.formation * formationTotal(b, b.units, me);
  return v;
}

// The change in valueOf if the unit ended on `to` with `mpLeft` half-points, plus one point for
// each tile its sight there would newly explore. Works without applyAction.
export function moveScore(b: MatchState, ctx: Ctx, unitId: number, to: HexKey, mpLeft: number): number {
  const u = b.units.find((x) => x.id === unitId);
  if (u === undefined) throw new Error(`no unit ${unitId}`);
  // rules 8: a step onto or off a mountain ends the unit's turn as the engine ends it, so it cannot attack after it
  const moved: Unit = mountainStep(b, u.pos, to)
    ? { ...u, pos: to, mp: 0, bonusMp: 0, attacks: 0, moved: true, acted: true, itemTurn: b.stamp, turnEnded: true }
    : { ...u, pos: to, mp: mpLeft, moved: true };
  const there = parseKey(to);
  const after = b.units.map((x) => (x.id === unitId ? moved : x));
  let score = unitTerms(b, ctx, moved, lazyVisible({ ...b, units: after }, ctx.me)) - unitTerms(b, ctx, u, lazyVisible(b, ctx.me));
  score += ctx.persona.formation * (formationTotal(b, after, ctx.me) - formationTotal(b, b.units, ctx.me));
  for (const c of b.cities) {
    if (c.pos === u.pos || c.pos === to) score -= exposureCost({ ...b, units: after }, ctx, c) - exposureCost(b, ctx, c);
  }

  const explored = new Set(b.players[ctx.me]?.explored ?? []);
  const sight = statsOf(b, moved).sight;            // with Watchful and the mountain bonus where it ends
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
    const w = pairWeight(b, u, o);
    broken += w;
    if (!o.moved && canMove(o) && distance(there, at) - 1 <= o.mp / 2) followable += w;
  }
  if (followable === 0) return 0;
  const moved: Unit = { ...u, pos: to, mp: mpLeft, moved: true };
  const after = b.units.map((x) => (x.id === unitId ? moved : x));
  const loss = ctx.persona.formation * (formationTotal(b, b.units, ctx.me) - formationTotal(b, after, ctx.me));
  return loss <= 0 ? 0 : FOLLOW_SHARE * loss * followable / broken;
}
