// The AI's brain: plans one whole turn from what its player can know, inside a fixed work budget.
import {
  CONFIG, UNITS, abilityTargets, addGrowth, applyAction, attackOf, attackTargets, buildRefusal, campTrainRefusal,
  canCapture, canClaimTreasure, canHunker, canResearch, canUseItem, damageFor, defenceOf, distance, maxHpOf, harvestRefusal, key, lureApplies, neighbors,
  parseKey, reachable, roadRefusal, rngInt, strikeDamage, techPrice, trainRefusal, unitCapacity, unitCost, unitsOf, wallsRefusal,
} from '../engine';
import type { AbilityId, Action, BuildingId, City, GameEvent, HexKey, MatchState, Unit, UnitTypeId } from '../engine';
import { GOLD_WEIGHT, canMove, dangerMap, exposureCost, followCredit, healthFactor, moveScore, objectives, tauntCredit, unitValue, unitWorth, valueOf } from './assess';
import type { Ctx } from './assess';
import { aiInputFor, believedState, viewKey } from './input';
import { availableTypes, chooseReward, chooseTech, chooseUnit } from './mix';
import { PERSONAS } from './persona';
import { connectingChains } from './roads';
import { skillFor } from './skill';
import { LEVEL_DIAL } from './types';
import type { AiInput, Persona } from './types';

export interface PlanOpts {
  dial: number; seed: number;
  refused: readonly Action[];      // actions the real match refused earlier this turn; never planned again
  now?: () => number; deadlineMs?: number;   // safety net only; both absent in tests and simulations
}
export interface Plan {
  actions: Action[];               // always ends with { type: 'endTurn' }; never contains resign
  expect: string[];                // expect[i] = viewKey of the believed state after actions[i]
  evals: number; cutShort: boolean;
}

const ABILITY_IDS: readonly AbilityId[] = ['heal', 'taunt', 'hasten', 'dustStorm'];
const BUILDINGS = Object.keys(CONFIG.buildings) as BuildingId[];
const WEIGHT_SCALE = 1_000_000;      // softmax weights are rounded to integers so every machine picks alike
const MAX_STEPS_PER_UNIT = 8;        // a unit acts a few times at most (move, attack, move); a guard, not a rule
const ECONOMY_THRESHOLD = 0.5;       // value per gold an economy action must reach, divided by skill.economy
const NORMAL_FOCUS = skillFor(LEVEL_DIAL.normal).focus;   // the unit mix reads what it sees as given at normal
const KILL_FLAT = 2;                // a kill's bonus: this much plus a share of the victim's worth, times skill.focus
const KILL_SHARE = 0.25;
const LURE_EDGE = 0.001;             // a safe lure scores this much above its plain twin, so a hard AI takes it

type Applied = { state: MatchState; events: GameEvent[] };
interface Cand {
  action: Action;
  base: number;                      // the action's own score
  score: number;                     // with what the unit would do after it
  result?: Applied;                  // the probe of this exact action on the state it was listed for
  strike?: Applied;                  // a drink's best attack after it, probed on result.state and counted in base
  enemyCity?: boolean;
  treasure?: boolean;                // a treasure claim, always taken (its draw is unknown, so it cannot be scored)
}

class OutOfTime extends Error {}

// The believed state with `n` growth added to each listed city, through the engine's own addGrowth on copies
// of those cities (its cityLevel events are dropped: they only matter to the match, not to a valuation).
export function withGrowth(b: MatchState, ids: readonly number[], n: number): MatchState {
  const cities = b.cities.map((c) => {
    if (!ids.includes(c.id)) return c;
    const g = { ...c, pendingRewards: [...c.pendingRewards] };
    addGrowth(b, g, n, []);
    return g;
  });
  return { ...b, cities };
}

const has = (u: Unit, t: string): boolean => (UNITS[u.type].traits as readonly string[]).includes(t);
const unitIn = (s: MatchState, id: number): Unit | undefined => s.units.find((u) => u.id === id);

// The same action whatever order its fields were written in.
function actionKey(a: Action): string {
  const rec = a as unknown as Record<string, unknown>;
  return JSON.stringify(Object.keys(rec).filter((k) => rec[k] !== undefined).sort().map((k) => [k, rec[k]]));
}

// Could this unit kill a seen enemy this turn, judged by the damage formula alone (no probe)?
function canKillThisTurn(b: MatchState, u: Unit): boolean {
  if (u.fresh || u.attacks <= 0 || UNITS[u.type].atk === 0 || UNITS[u.type].range === 0) return false;
  const reach = (canMove(u) ? u.mp / 2 : 0) + UNITS[u.type].range;
  const at = parseKey(u.pos);
  const atk = attackOf(b, u) * healthFactor(u);
  return b.units.some((e) => e.owner !== u.owner && distance(at, parseKey(e.pos)) <= reach
    && strikeDamage(b, e, u, atk) >= e.hp);
}

// Units are taken killers first, then ranged, melee, supports, the Camp, the rest.
function unitRank(b: MatchState, u: Unit): number {
  if (canKillThisTurn(b, u)) return 0;
  const def = UNITS[u.type];
  if (has(u, 'heal')) return 3;
  if (has(u, 'camp')) return 4;
  if (def.atk > 0 && def.range >= 2) return 1;
  if (def.atk > 0 && def.range === 1) return 2;
  return 5;
}

// Tiles a lure could pull the target onto when the attacker next moves (every candidate, to be safe).
function lureDestinations(attackerAt: HexKey, targetAt: HexKey): HexKey[] {
  const a = parseKey(attackerAt);
  const t = parseKey(targetAt);
  if (distance(a, t) === 1) return [attackerAt];
  return neighbors(t).filter((n) => distance(a, n) === 1).map(key);
}

class TurnPlanner {
  private b: MatchState;
  private readonly ctx: Ctx;
  private readonly me: number;
  private readonly work: number;     // budget for everything except the final endTurn
  private readonly refused: Set<string>;
  private readonly start: number;
  private rng: number;
  private evals = 0;
  private cutShort = false;
  private readonly actions: Action[] = [];
  private readonly expect: string[] = [];
  // Gold a garrison's step off its city tile relied on this turn, by city id: the training phase spends it
  // there first, and no other garrison may count on it.
  private readonly pledged = new Map<number, number>();
  // The persona the unit mix reads: its counter weight grows with the skill, exactly as given at normal.
  private readonly mixPersona: Persona;

  constructor(input: AiInput, private readonly opts: PlanOpts) {
    this.b = believedState(input);
    this.me = input.me;
    const persona = PERSONAS[input.self.faction];
    this.ctx = {
      me: this.me, skill: skillFor(opts.dial), persona,
      danger: dangerMap(this.b, this.me), goals: objectives(this.b, this.me, persona), hurt: new Set(),
    };
    this.mixPersona = { ...persona, counter: persona.counter * this.ctx.skill.focus / NORMAL_FOCUS };
    this.work = this.ctx.skill.evals - 1;
    this.refused = new Set(opts.refused.map(actionKey));
    this.rng = opts.seed >>> 0;
    this.start = opts.now?.() ?? 0;
  }

  run(): Plan {
    try {
      this.rewards();
      this.research();
      this.units();
      this.rewards();                // a capture or a kill this turn may have levelled a city
      this.training();
      this.economy();
      this.rewards();                // and growth bought in the economy phase; left unchosen, the engine takes option 0
    } catch (e) {
      if (!(e instanceof OutOfTime)) throw e;
      this.cutShort = true;
    }
    this.endTurn();
    return { actions: this.actions, expect: this.expect, evals: this.evals, cutShort: this.cutShort };
  }

  // ---- budget and bookkeeping ----

  private checkClock(): void {
    const { now, deadlineMs } = this.opts;
    if (now !== undefined && deadlineMs !== undefined && now() - this.start > deadlineMs) throw new OutOfTime();
  }

  private spend(): void {
    if (this.evals + 1 > this.work) throw new OutOfTime();
    this.evals += 1;
  }

  private allowed(a: Action): boolean {
    return !this.refused.has(actionKey(a));
  }

  // One engine probe of a listed action. A refusal means the planner listed something illegal: a bug.
  private probe(s: MatchState, a: Action): Applied {
    this.spend();
    const r = applyAction(s, a);
    if (!r.ok) throw new Error(`the believed engine refused a planned action ${JSON.stringify(a)}: ${r.reason}`);
    return r;
  }

  private commit(a: Action, done?: Applied): void {
    const r = done ?? this.probe(this.b, a);
    const exploredBefore = this.b.players[this.me]!.explored.length;
    this.b = r.state;
    this.actions.push(a);
    this.expect.push(viewKey(aiInputFor(this.b, this.me)));
    if (a.type === 'attack') {
      const victim = r.events.find((e) => e.type === 'attacked');
      if (victim?.type === 'attacked' && unitIn(this.b, victim.target) !== undefined) this.ctx.hurt.add(victim.target);
    }
    const changed = r.events.some((e) => e.type === 'died' || e.type === 'captured' || e.type === 'treasure')
      || this.b.players[this.me]!.explored.length !== exploredBefore;
    if (changed) {
      this.ctx.danger = dangerMap(this.b, this.me);
      this.ctx.goals = objectives(this.b, this.me, this.ctx.persona);
    }
  }

  private endTurn(): void {
    const a: Action = { type: 'endTurn' };
    if (this.b.winner !== null) {
      // The believed state thinks the match is won (only seen cities count there); the real match decides.
      this.actions.push(a);
      this.expect.push(viewKey(aiInputFor(this.b, this.me)));
      return;
    }
    this.evals += 1;                 // reserved by `work`
    const r = applyAction(this.b, a);
    if (!r.ok) throw new Error(`the believed engine refused endTurn: ${r.reason}`);
    this.b = r.state;
    this.actions.push(a);
    this.expect.push(viewKey(aiInputFor(this.b, this.me)));
  }

  private live(): boolean {
    return this.b.winner === null;
  }

  // ---- phases ----

  private rewards(): void {
    for (const c of [...this.b.cities].sort((x, y) => x.id - y.id)) {
      for (;;) {
        const city = this.b.cities.find((x) => x.id === c.id);
        const level = city?.pendingRewards[0];
        if (city === undefined || city.owner !== this.me || level === undefined || !this.live()) break;
        const pick = chooseReward(this.b, this.me, city, level);
        const choice = ([pick, 1 - pick] as const).find((ch) => this.allowed({ type: 'chooseReward', city: c.id, choice: ch as 0 | 1 }));
        if (choice === undefined) break;
        this.checkClock();
        this.commit({ type: 'chooseReward', city: c.id, choice: choice as 0 | 1 });
      }
    }
  }

  // The type the training phase would train in this city on state s (mix.ts), or null.
  private unitFor(s: MatchState, city: City): UnitTypeId | null {
    const threatened = this.ctx.goals.some((g) => g.kind === 'defend' && g.at === city.pos);
    return chooseUnit(s, this.me, this.mixPersona, {
      threatened,
      fits: (t) => trainRefusal(s, city.id, t) === null && this.allowed({ type: 'train', city: city.id, unitType: t }),
    });
  }

  private cheapestUnit(): number {
    const costs = availableTypes(this.b, this.me).filter((t) => (this.ctx.persona.mix[t] ?? 0) > 0)
      .map((t) => unitCost(this.b, this.me, t) ?? Infinity);
    return costs.length === 0 ? 0 : Math.min(...costs);
  }

  private anyCityHasRoom(): boolean {
    return this.b.cities.some((c) => c.owner === this.me && unitsOf(this.b, c.id) < unitCapacity(c));
  }

  private research(): void {
    const open = this.ctx.persona.techOrder.filter((t) => canResearch(this.b, this.me, t) && this.allowed({ type: 'research', tech: t }));
    const tech = chooseTech(this.b, this.me, this.mixPersona, open) ?? undefined;
    if (tech === undefined || !this.live()) return;
    const left = this.b.players[this.me]!.gold - techPrice(this.b, this.me, tech);
    if (left < this.cheapestUnit() && this.anyCityHasRoom()) return;
    this.checkClock();
    this.commit({ type: 'research', tech });
  }

  private units(): void {
    const taken = new Set<number>();
    for (;;) {
      if (!this.live()) return;
      let next: Unit | undefined;
      let nextRank = Infinity;
      for (const u of this.b.units) {
        if (u.owner !== this.me || taken.has(u.id)) continue;
        const r = unitRank(this.b, u);
        if (next === undefined || r < nextRank || (r === nextRank && u.id < next.id)) { next = u; nextRank = r; }
      }
      if (next === undefined) return;
      taken.add(next.id);
      if (has(next, 'camp') && this.campCanTrain(next)) continue;   // it trains in the training phase instead
      for (let step = 0; step < MAX_STEPS_PER_UNIT; step++) {
        this.checkClock();
        const c = this.decide(next.id);
        if (step === 0 && this.hunkers(next.id, c)) { this.commit({ type: 'hunker', unit: next.id }); break; }
        if (c === null) break;
        const refill = c.action.type === 'move' ? this.refill(unitIn(this.b, next.id)!) : null;
        this.commit(c.action, c.result);
        if (refill !== null) this.pledged.set(refill.city.id, unitCost(this.b, this.me, refill.type)!);   // refill only names types with a cost
        if (unitIn(this.b, next.id) === undefined || !this.live()) break;
      }
    }
  }

  private training(): void {
    if (!this.live()) return;
    // Cities a garrison stepped out of, counting on a trained unit, are served first.
    const order = [...this.b.cities].sort((x, y) => Number(this.pledged.has(y.id)) - Number(this.pledged.has(x.id)) || x.id - y.id);
    for (const c of order) {
      if (c.owner !== this.me) continue;
      const type = this.unitFor(this.b, c);
      if (type === null) continue;
      this.checkClock();
      this.commit({ type: 'train', city: c.id, unitType: type });
    }
    for (const camp of [...this.b.units].sort((x, y) => x.id - y.id)) {
      if (camp.owner !== this.me || !has(camp, 'camp')) continue;
      const a = this.campTraining(camp);
      if (a === null) continue;
      this.checkClock();
      this.commit(a);
    }
  }

  // The type mix.ts picks for a Camp, onto the free neighbour nearest the top objective.
  private campTraining(camp: Unit): Action | null {
    const goal = this.ctx.goals[0];
    const spots = neighbors(parseKey(camp.pos)).map(key).sort((x, y) => {
      const dx = goal === undefined ? 0 : distance(parseKey(x), parseKey(goal.at));
      const dy = goal === undefined ? 0 : distance(parseKey(y), parseKey(goal.at));
      return dx - dy || (x < y ? -1 : x > y ? 1 : 0);
    });
    const spotFor = (unitType: UnitTypeId): HexKey | undefined => spots.find((to) => campTrainRefusal(this.b, camp.id, unitType, to) === null
      && this.allowed({ type: 'campTrain', unit: camp.id, unitType, to }));
    const unitType = chooseUnit(this.b, this.me, this.mixPersona, { threatened: false, exclude: 'camp', fits: (t) => spotFor(t) !== undefined });
    if (unitType === null) return null;
    return { type: 'campTrain', unit: camp.id, unitType, to: spotFor(unitType)! };
  }

  private campCanTrain(camp: Unit): boolean {
    return this.campTraining(camp) !== null;
  }

  // Harvest, build, walls and roads while the best one's value gain per gold reaches the threshold. A road is
  // worth nothing to valueOf until it completes a connection, so a road is scored by the chain it belongs to: the
  // cheapest chain that would join an unlinked city to a capital (roads.ts), valued at the growth the connection
  // pays both cities, divided by the gold the whole remaining chain costs. Its next tile is laid while that ratio
  // clears the threshold, one tile per pass and re-planned after each, so gold goes only to chains that pay.
  private economy(): void {
    const need = ECONOMY_THRESHOLD / this.ctx.skill.economy;
    for (;;) {
      if (!this.live()) return;
      this.checkClock();
      const list: Action[] = [];
      for (const at of Object.keys(this.b.tiles).sort()) {
        if (harvestRefusal(this.b, at) === null) list.push({ type: 'harvest', at });
        for (const building of BUILDINGS) if (buildRefusal(this.b, at, building) === null) list.push({ type: 'build', at, building });
      }
      for (const c of [...this.b.cities].sort((x, y) => x.id - y.id)) {
        if (c.owner === this.me && wallsRefusal(this.b, c.id) === null) list.push({ type: 'buildWalls', city: c.id });
      }
      const fresh = (s: MatchState): Ctx => ({ ...this.ctx, danger: dangerMap(s, this.me) });
      const before = valueOf(this.b, fresh(this.b));
      const gold = this.b.players[this.me]!.gold;
      let best: { a: Action; r: Applied; ratio: number } | null = null;
      const road = this.roadCandidate(before, fresh(this.b), gold);
      try {
        for (const a of list) {
          if (!this.allowed(a)) continue;
          const r = this.probe(this.b, a);
          const cost = gold - r.state.players[this.me]!.gold;
          if (cost <= 0) continue;
          const gain = valueOf(r.state, fresh(r.state)) - before + GOLD_WEIGHT * this.ctx.skill.economy * cost;
          const ratio = gain / cost;
          if (best === null || ratio > best.ratio) best = { a, r, ratio };
        }
        if (road !== null && road.ratio >= need && (best === null || road.ratio > best.ratio)) {
          best = { a: road.a, r: this.probe(this.b, road.a), ratio: road.ratio };
        }
      } catch (e) {
        // Out of budget partway: the best action found so far is already probed, so it costs nothing more.
        if (e instanceof OutOfTime && best !== null && best.ratio >= need) this.commit(best.a, best.r);
        throw e;
      }
      if (best === null || best.ratio < need) return;
      this.commit(best.a, best.r);
    }
  }

  // The best next road tile: for each chain connectingChains finds, the value of the growth its connection pays
  // (connectGrowth to the city and to the capital, through valueOf, so it is in the units harvest and buildings are
  // scored in) over the gold the chain still costs. Only a chain whose next tile can be laid now is a candidate.
  private roadCandidate(before: number, ctx: Ctx, gold: number): { a: Action; ratio: number } | null {
    if (gold < CONFIG.road.cost || CONFIG.connectGrowth <= 0) return null;
    let best: { a: Action; ratio: number } | null = null;
    for (const chain of connectingChains(this.b, this.me)) {
      const at = chain.build.find((k) => roadRefusal(this.b, k) === null);
      if (at === undefined) continue;
      const a: Action = { type: 'road', at };
      if (!this.allowed(a)) continue;
      const paid = withGrowth(this.b, [chain.city, chain.capital], CONFIG.connectGrowth);
      const ratio = (valueOf(paid, ctx) - before) / (chain.build.length * CONFIG.road.cost);
      if (best === null || ratio > best.ratio) best = { a, ratio };
    }
    return best;
  }

  // ---- one unit ----

  // Rules 7: whether the unit hunkers instead of the plan c, which is not an attack, ability, capture or claim (a
  // good one of those is always taken). Only with an enemy able to reach it: a garrison on an own city holds there
  // instead of walking off when the danger on its tile is at least a third of its health, and a wounded unit that cannot
  // reach a tile out of reach hunkers where it stands. Units beside a city, and garrisons under a light threat, were
  // tried too: they stalled seeded matches (6 spartans at normal, 6 mongols at hard, in character.test.ts).
  private hunkers(id: number, c: Cand | null): boolean {
    if (c !== null && c.action.type !== 'move') return false;
    const u = unitIn(this.b, id);
    if (u === undefined || !canHunker(this.b, id) || !this.allowed({ type: 'hunker', unit: id })) return false;
    const danger = this.ctx.danger;
    if ((danger[u.pos] ?? 0) <= 0) return false;
    // A move that sets up an attack this turn is left to the plan: no hunker while a seen enemy is in strike reach,
    // unless its counter alone would kill the unit (a hopeless charge, which the plan never makes).
    if (c !== null && UNITS[u.type].atk > 0 && u.attacks > 0) {
      const from = [u.pos, ...(canMove(u) ? Object.keys(reachable(this.b, id)) : [])].map(parseKey);
      const survivable = (e: Unit): boolean => UNITS[e.type].range === 0
        || damageFor(attackOf(this.b, e) * CONFIG.counterFactor * healthFactor(e), defenceOf(this.b, u), 1) < u.hp;
      const strikes = this.b.units.filter((e) => e.owner !== this.me && survivable(e));
      if (strikes.some((e) => from.some((f) => distance(f, parseKey(e.pos)) <= UNITS[u.type].range))) return false;
    }
    if (this.b.cities.some((x) => x.owner === this.me && x.pos === u.pos) && 3 * (danger[u.pos] ?? 0) >= u.hp) return true;
    if (u.hp >= maxHpOf(u)) return false;
    return c === null || (danger[(c.action as { to: HexKey }).to] ?? 0) > 0;
  }

  // Gold already pledged to refill other cities' tiles whose garrison stepped out this turn. A pledge
  // lapses once an own unit stands on that tile again, since the city can no longer train there.
  private pledgedElsewhere(cityId: number): number {
    let gold = 0;
    for (const [id, cost] of this.pledged) {
      const c = this.b.cities.find((x) => x.id === id);
      if (id !== cityId && c !== undefined && !this.b.units.some((x) => x.pos === c.pos)) gold += cost;
    }
    return gold;
  }

  // When the unit stands on an own city tile that could train this turn if it stepped off: the city, the
  // type the training phase would pick, and the state with the unit off the tile. The training phase's
  // own check, run on the gold left after other garrisons' pledges, so no gold is counted on twice.
  private refill(u: Unit): { city: City; type: UnitTypeId; vacated: MatchState } | null {
    const city = this.b.cities.find((c) => c.pos === u.pos && c.owner === this.me);
    if (city === undefined) return null;
    const promised = this.pledgedElsewhere(city.id);
    const vacated: MatchState = {
      ...this.b,
      units: this.b.units.map((x) => (x.id === u.id ? { ...x, pos: '' } : x)),
      players: this.b.players.map((p) => (p.id === this.me ? { ...p, gold: p.gold - promised } : p)),
    };
    const type = this.unitFor(vacated, city);
    return type === null ? null : { city, type, vacated };
  }

  // What stepping off this tile is worth when the city could then train: the value the trained unit would
  // add (its worth less the gold term), plus the exposure the step costs in moveScore, since the trained
  // unit will stand on the tile and hold the city.
  private vacateBonus(u: Unit): number {
    const r = this.refill(u);
    if (r === null) return 0;
    // trainRefusal returned null for this type, and it refuses any type without a cost, so the cost is defined.
    return unitWorth(r.type) - GOLD_WEIGHT * this.ctx.skill.economy * unitCost(this.b, this.me, r.type)!
      + exposureCost(r.vacated, this.ctx, r.city);
  }

  private scoreAfter(s: MatchState, base: number, r: Applied, targetId: number | null): number {
    const killed = r.events.some((e) => e.type === 'died' && unitIn(s, e.unit)?.owner !== this.me);
    const ctx = killed ? { ...this.ctx, danger: dangerMap(r.state, this.me) } : this.ctx;
    const focus = targetId !== null && this.ctx.hurt.has(targetId) ? this.ctx.skill.focus * 2 : 0;
    // A kill is preferred over chip damage, more so the stronger the victim: a habit that grows with the skill.
    let kill = 0;
    for (const e of r.events) {
      if (e.type !== 'died') continue;
      const dead = unitIn(s, e.unit);
      if (dead !== undefined && dead.owner !== this.me) kill += this.ctx.skill.focus * (KILL_FLAT + KILL_SHARE * unitValue(dead));
    }
    return valueOf(r.state, ctx) - base + focus + kill;
  }

  // Best follow-up move score for the unit on state s, or 0 when staying is better.
  private bestMove(s: MatchState, id: number): number {
    const u = unitIn(s, id);
    if (u === undefined || !canMove(u)) return 0;
    this.spend();
    let best = 0;
    for (const [to, left] of Object.entries(reachable(s, id))) {
      if (this.allowed({ type: 'move', unit: id, to })) best = Math.max(best, moveScore(s, this.ctx, id, to, left));
    }
    return best;
  }

  // Everything the unit could do next on state s, each scored as the change it makes. Filtered by the
  // two safety rules and the refused list. `retreatMove` scores a retreat unit's attack with its best move after.
  private candidates(s: MatchState, id: number, retreatMove: boolean): Cand[] {
    const u = unitIn(s, id);
    if (u === undefined) return [];
    const out: Cand[] = [];
    const base = valueOf(s, this.ctx);
    const push = (c: Cand): void => { if (this.allowed(c.action)) out.push(c); };

    if (canCapture(s, id)) {
      const a: Action = { type: 'capture', unit: id };
      if (this.allowed(a)) {
        const r = this.probe(s, a);
        const score = this.scoreAfter(s, base, r, null);
        const city = s.cities.find((c) => c.pos === u.pos);
        push({ action: a, base: score, score, result: r, enemyCity: city !== undefined && city.owner !== this.me });
      }
    }

    if (canClaimTreasure(s, id)) {
      const a: Action = { type: 'claimTreasure', unit: id };
      if (this.allowed(a)) {
        const r = this.probe(s, a);
        const score = this.scoreAfter(s, base, r, null);
        push({ action: a, base: score, score, result: r, treasure: true });
      }
    }

    // An attack is scored on the state its probe leaves, so a melee kill's step into the tile is in the score.
    for (const target of attackTargets(s, id)) {
      const plain: Action = { type: 'attack', unit: id, target };
      const victim = s.units.find((t) => t.pos === target)!;
      const lure: Action = { type: 'attack', unit: id, target, lure: true };
      const lureListed = lureApplies(s, u, victim);
      if (!this.allowed(plain) && !(lureListed && this.allowed(lure))) continue;
      const r = this.probe(s, plain);
      const died = new Set(r.events.flatMap((e) => (e.type === 'died' ? [e.unit] : [])));
      if (died.has(id) && !died.has(victim.id)) continue;            // a hopeless charge
      let score = this.scoreAfter(s, base, r, victim.id);
      const own = score;
      if (retreatMove && has(u, 'retreat') && !died.has(id)) score += this.bestMove(r.state, id);
      push({ action: plain, base: own, score, result: r });
      // A lure pulls only when the attacker moves on afterwards, and never onto a village or a city tile.
      const movesOn = (unitIn(r.state, id)?.mp ?? 0) > 0;
      const safePull = lureDestinations(u.pos, target).every((k) => !s.tiles[k]?.village && !s.cities.some((c) => c.pos === k));
      if (lureListed && movesOn && !died.has(victim.id) && safePull) push({ action: lure, base: own, score });
    }

    // A drink is scored together with the best attack it opens, from before the drink to after that attack, so the
    // draught is drunk when the strike pays for its worth. With no attack after it there is no drink candidate.
    const drink: Action = { type: 'useItem', unit: id };
    if (canUseItem(s, id) && this.allowed(drink)) {
      const rd = this.probe(s, drink);
      let best: Cand | null = null;
      for (const target of attackTargets(rd.state, id)) {
        const a: Action = { type: 'attack', unit: id, target };
        if (!this.allowed(a)) continue;
        const victim = rd.state.units.find((t) => t.pos === target)!;
        const ra = this.probe(rd.state, a);
        const died = new Set(ra.events.flatMap((e) => (e.type === 'died' ? [e.unit] : [])));
        if (died.has(id) && !died.has(victim.id)) continue;          // a hopeless charge
        const score = this.scoreAfter(s, base, ra, victim.id);
        if (best === null || score > best.score) best = { action: drink, base: score, score, result: rd, strike: ra };
      }
      if (best !== null) push(best);
    }

    for (const ability of ABILITY_IDS) {
      if (!has(u, ability)) continue;
      for (const target of abilityTargets(s, id, ability)) {
        const a: Action = { type: 'ability', unit: id, ability, target };
        if (!this.allowed(a)) continue;
        const r = this.probe(s, a);
        const targetId = s.units.find((t) => t.pos === target && t.owner !== this.me)?.id ?? null;
        const score = this.scoreAfter(s, base, r, targetId) + (ability === 'taunt' ? tauntCredit(s, this.me, target) : 0);
        push({ action: a, base: score, score, result: r });
      }
    }

    if (canMove(u)) {
      this.spend();
      const bonus = s === this.b ? this.vacateBonus(u) : 0;
      const reach = reachable(s, id);
      // A move scores its change in valueOf, plus the follow credit (assess.ts) for a first step out of a
      // line the others can still close, plus the vacate bonus when the city would train onto the tile.
      for (const to of Object.keys(reach).sort()) {
        const score = moveScore(s, this.ctx, id, to, reach[to]!) + followCredit(s, this.ctx, id, to, reach[to]!) + bonus;
        push({ action: { type: 'move', unit: id, to }, base: score, score });
      }
    }
    return out;
  }

  // The total of up to `steps` greedy best actions for the unit, starting on state s.
  private followUps(s: MatchState, id: number, steps: number): number {
    let total = 0;
    for (let i = 0; i < steps; i++) {
      const cands = this.candidates(s, id, false);
      let best: Cand | undefined;
      for (const c of cands) if (best === undefined || c.base > best.base) best = c;
      if (best === undefined || best.base <= 0) break;
      total += best.base;
      if (i + 1 < steps) s = (best.strike ?? best.result ?? this.probe(s, best.action)).state;
      if (unitIn(s, id) === undefined) break;
    }
    return total;
  }

  private decide(id: number): Cand | null {
    const cands = this.candidates(this.b, id, true);
    const city = cands.find((c) => c.enemyCity === true);
    if (city !== undefined) return city;                       // an enemy city is always taken
    const treasure = cands.find((c) => c.treasure === true);
    if (treasure !== undefined) return treasure;               // and so is a treasure the unit has waited on
    const { lookahead, topK } = this.ctx.skill;
    if (lookahead > 0) {
      const top = cands.map((c, i) => ({ c, i })).sort((x, y) => y.c.score - x.c.score || x.i - y.i).slice(0, topK + 1);
      for (const { c } of top) {
        if (c.action.type === 'attack' && c.action.lure === true) continue;   // scored as its plain twin
        c.result ??= this.probe(this.b, c.action);
        const after = (c.strike ?? c.result).state;               // a drink follows up after its attack, never twice
        c.score = c.base + (unitIn(after, id) === undefined ? 0 : this.followUps(after, id, lookahead));
      }
    }
    // A lure is scored as its plain twin, a hair above it, so the tie the twin would win by list order goes to the lure.
    for (const c of cands) {
      if (c.action.type === 'attack' && c.action.lure === true) {
        const twin = cands.find((t) => t.action.type === 'attack' && t.action.target === (c.action as { target: HexKey }).target && t.action.lure !== true);
        if (twin !== undefined) c.score = twin.score + LURE_EDGE;
      }
    }
    return this.choose(cands);
  }

  // Among positive candidates within `margin` of the best, the best `topK`, drawn with softmax weights.
  private choose(cands: Cand[]): Cand | null {
    const pool = cands.map((c, i) => ({ c, i })).filter((x) => x.c.score > 0)
      .sort((x, y) => y.c.score - x.c.score || x.i - y.i);
    const first = pool[0];
    if (first === undefined) return null;
    const { margin, topK, temperature } = this.ctx.skill;
    const near = pool.filter((x) => x.c.score >= first.c.score - margin).slice(0, topK);
    if (near.length === 1) return first.c;
    const weights = near.map((x) => Math.round(WEIGHT_SCALE * Math.exp((x.c.score - first.c.score) / temperature)));
    const total = weights.reduce((a, w) => a + w, 0);
    const [roll, next] = rngInt(this.rng, total);
    this.rng = next;
    let acc = 0;
    for (let i = 0; i < near.length; i++) {
      acc += weights[i]!;
      if (roll < acc) {
        const picked = near[i]!.c;
        // a lure's probe is of its plain twin, so it is applied afresh
        return picked.action.type === 'attack' && picked.action.lure === true ? { ...picked, result: undefined } : picked;
      }
    }
    return first.c;
  }
}

// The ordered actions for one whole turn. Same input and options give the same plan.
export function planTurn(input: AiInput, opts: PlanOpts): Plan {
  return new TurnPlanner(input, opts).run();
}
