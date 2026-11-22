import { CONFIG } from './data/config';
import { FACTIONS } from './data/factions';
import { UNITS } from './data/units';
import { distance, parseKey } from './hex';
import type { HexKey } from './hex';
import { isSteadied } from './abilities';
import { applyCredits, credit, maxHpOf, mythTouched } from './heroes';
import type { Credits } from './heroes';
import { cityAt, hasTrait, isEnterable, removeUnit, tileAt, unitAt, unitById } from './state';
import { maxMp } from './movement';
import { noteHurt } from './wear';
import { canSeeUnit, unitSight, visibleTiles } from './vision';
import type { Action, Handler, MatchState, Unit } from './types';

// rules 2: terrain cover, or the city value when the unit stands in its owner's city
export function coverAt(s: MatchState, defender: Unit): number {
  const city = cityAt(s, defender.pos);
  if (city !== undefined && city.owner === defender.owner) {
    const base = FACTIONS[s.players[defender.owner]!.faction].cityCover;
    return city.walls ? Math.max(base, CONFIG.wallsCover) : base;
  }
  const tile = tileAt(s, defender.pos);
  return tile === undefined ? 1 : CONFIG.terrain[tile.terrain].cover;
}

// The type's attack plus Fierce: no neighbour bonuses.
export function baseAttackOf(u: Unit): number {
  return UNITS[u.type].atk + (u.heroTraits.includes('fierce') ? CONFIG.heroes.fierceAtk : 0);
}

// rules 11 and stage 2: base attack, plus the myth touch, plus inspire for a mounted unit beside a friendly inspire unit
export function attackOf(s: MatchState, u: Unit): number {
  const base = baseAttackOf(u) + (mythTouched(s, u) ? CONFIG.heroes.mythAtk : 0);
  if (!hasTrait(u, 'mounted')) return base;
  const here = parseKey(u.pos);
  const inspired = s.units.some((n) => n.id !== u.id && n.owner === u.owner && hasTrait(n, 'inspire')
    && distance(here, parseKey(n.pos)) === 1);
  return inspired ? base + CONFIG.inspireAtk : base;
}

// Base defence plus Hardy and the myth touch, plus the phalanx bonus: each adjacent friendly phalanx unit, up to the cap.
export function defenceOf(s: MatchState, u: Unit): number {
  const base = UNITS[u.type].def + (u.heroTraits.includes('hardy') ? CONFIG.heroes.hardyDef : 0)
    + (mythTouched(s, u) ? CONFIG.heroes.mythDef : 0);
  if (!hasTrait(u, 'phalanx')) return base;
  const here = parseKey(u.pos);
  const mates = s.units.filter((n) => n.id !== u.id && n.owner === u.owner && hasTrait(n, 'phalanx')
    && distance(here, parseKey(n.pos)) === 1).length;
  return base + Math.min(CONFIG.phalanxMax, mates * CONFIG.phalanxBonus);
}

// rules 10
export function damageFor(effAtk: number, def: number, cover: number): number {
  return Math.max(1, Math.round(CONFIG.damageScale * effAtk * effAtk / (effAtk + def * cover)));
}

function healthFactor(u: Unit): number {
  if (hasTrait(u, 'unbowed')) return 1;
  const maxHp = maxHpOf(u);
  return (u.hp + maxHp) / (2 * maxHp);
}

function reachOf(u: Unit): number {
  return u.blinded ? CONFIG.blindedReach : UNITS[u.type].range;
}

// rules 13: a lure may be recorded when this attacker hits this target (the target must also survive)
export function lureApplies(s: MatchState, attacker: Unit, target: Unit): boolean {
  return FACTIONS[s.players[attacker.owner]!.faction].canLure && hasTrait(attacker, 'retreat') && !attacker.fresh
    && !isSteadied(s, target) && cityAt(s, target.pos) === undefined;
}

// rules 10: tiles holding an enemy this unit may attack now
export function attackTargets(s: MatchState, unitId: number): HexKey[] {
  const u = unitById(s, unitId);
  if (u === undefined || u.owner !== s.current || u.fresh || u.attacks <= 0) return [];
  const def = UNITS[u.type];
  if (def.range === 0 || def.atk === 0) return [];
  if (hasTrait(u, 'siege') && u.moved) return [];
  const reach = reachOf(u);
  const from = parseKey(u.pos);
  const visible = visibleTiles(s, u.owner);
  const legal = s.units
    .filter((t) => t.owner !== u.owner && canSeeUnit(s, u.owner, t, visible) && distance(from, parseKey(t.pos)) <= reach);
  // A taunted unit must pick a phalanx unit when one is in reach.
  const phalanx = u.taunted ? legal.filter((t) => hasTrait(t, 'phalanx')) : [];
  return (phalanx.length > 0 ? phalanx : legal).map((t) => t.pos).sort();
}

export const attackHandler: Handler<Extract<Action, { type: 'attack' }>> = (s, a, ev) => {
  if (typeof a.unit !== 'number' || typeof a.target !== 'string') return 'bad attack';
  const attacker = unitById(s, a.unit);
  if (attacker === undefined) return 'no such unit';
  if (attacker.owner !== s.current) return 'not your unit';
  if (attacker.attacks <= 0) return 'no attacks left';
  if (!attackTargets(s, attacker.id).includes(a.target)) return 'cannot attack that tile';
  const target = unitAt(s, a.target)!;
  const tileKey = target.pos;
  const attackerFrom = attacker.pos;

  const effAtk = attackOf(s, attacker) * healthFactor(attacker);
  const damage = damageFor(effAtk, defenceOf(s, target), coverAt(s, target));
  target.hp -= damage;
  const targetDied = target.hp <= 0;
  attacker.wear.battles += 1;
  target.wear.battles += 1;
  if (!targetDied) noteHurt(target, maxHpOf(target));

  // The counter is worked out first so the one `attacked` event can carry it.
  let counter = 0;
  if (!targetDied && attackOf(s, target) > 0 && !hasTrait(target, 'siege')
    && distance(parseKey(attacker.pos), parseKey(target.pos)) <= reachOf(target)) {
    const f = hasTrait(target, 'steadfast') ? CONFIG.steadfastFactor : CONFIG.counterFactor;
    const cAtk = attackOf(s, target) * f * healthFactor(target);
    counter = damageFor(cAtk, defenceOf(s, attacker), 1);
    if (attacker.heroTraits.includes('watchful')) counter = Math.max(1, counter - CONFIG.heroes.agilityCut);   // agility
  }
  ev.push({ type: 'attacked', unit: attacker.id, target: target.id, damage, counter });
  let kills = 0;                                  // units this attack killed, for the attacker's fight deed
  let chainGranted = 0;                           // extra attacks the chain trait granted for those kills
  const splashed: Unit[] = [];

  if (targetDied) {
    removeUnit(s, target.id);
    ev.push({ type: 'died', unit: target.id });
    kills += 1;
    // rules 5: the kill costs a chain unit health, never below 1, then grants the extra attack. Its event follows the
    // advance, so the number shows where the rider ends up.
    let chainLost = 0;
    if (hasTrait(attacker, 'chain')) {
      chainLost = Math.max(0, Math.min(CONFIG.chainKillCost, attacker.hp - 1));
      attacker.hp -= chainLost;
      if (chainLost > 0) noteHurt(attacker, maxHpOf(attacker));
      attacker.attacks += 1;
      chainGranted += 1;
    }
    // rules 10: a melee killer steps into the emptied tile, at no movement cost
    if (UNITS[attacker.type].range === 1 && !hasTrait(attacker, 'splash') && isEnterable(s, tileKey) && unitAt(s, tileKey) === undefined) {
      attacker.pos = tileKey; attacker.enteredTurn = s.stamp;
      ev.push({ type: 'advanced', unit: attacker.id, from: attackerFrom, to: tileKey });
    }
    if (chainLost > 0) ev.push({ type: 'chainCost', unit: attacker.id, damage: chainLost });
  }

  if (hasTrait(attacker, 'splash')) {
    const splash = Math.max(1, Math.round(damage / CONFIG.splashDivisor));
    const centre = parseKey(tileKey);
    for (const n of s.units) {
      if (n.owner === attacker.owner || distance(centre, parseKey(n.pos)) !== 1) continue;
      n.hp -= splash;
      n.wear.battles += 1;
      if (n.hp > 0) noteHurt(n, maxHpOf(n));
      ev.push({ type: 'splashed', target: n.id, damage: splash });
      if (n.hp <= 0) { removeUnit(s, n.id); ev.push({ type: 'died', unit: n.id }); kills += 1; } else splashed.push(n);
    }
  }

  let attackerDied = false;
  if (counter > 0) {
    attacker.hp -= counter;
    if (attacker.hp > 0) noteHurt(attacker, maxHpOf(attacker));
    if (attacker.hp <= 0) {
      removeUnit(s, attacker.id);
      ev.push({ type: 'died', unit: attacker.id });
      attackerDied = true;
    }
  }

  // Deeds (rules 4): fight for a living attacker, survive for each unit that lived through a hit (never a fresh
  // one), and a kill for the defender whose counter killed the attacker.
  const credits: Credits = new Map();
  const heroes = CONFIG.heroes;
  if (!attackerDied) credit(credits, attacker, 'fight', heroes.fightPerAttack + kills * heroes.fightPerKill);
  if (!targetDied && !target.fresh) credit(credits, target, 'survive', 1);
  for (const n of splashed) if (!n.fresh) credit(credits, n, 'survive', 1);
  if (counter > 0 && !attackerDied && !attacker.fresh) credit(credits, attacker, 'survive', 1);
  if (attackerDied) credit(credits, target, 'fight', heroes.fightPerKill);
  const traitsBefore = attacker.heroTraits.length;
  applyCredits(s, credits, ev);
  if (attackerDied) return null;

  // rules 6: a hero trait earned from this attack ends the chain: the kill's extra attack is taken back
  if (CONFIG.levelUpEndsChain && chainGranted > 0 && attacker.heroTraits.length > traitsBefore) {
    attacker.attacks -= chainGranted;
    ev.push({ type: 'chainEnded', unit: attacker.id });
  }

  attacker.attacks -= 1;
  attacker.acted = true;
  if (!hasTrait(attacker, 'retreat')) attacker.mp = 0;

  // rules 13: a lure is recorded only when both survive and lureApplies; otherwise the request is ignored
  const survivor = unitById(s, target.id);
  if (a.lure === true && survivor !== undefined && !targetDied && lureApplies(s, attacker, survivor)) {
    attacker.lure = { target: survivor.id, from: attackerFrom };
  }
  return null;
};

export interface UnitStats { atk: number; def: number; maxHp: number; move: number; sight: number; range: number }

// A unit's own numbers with its traits and its faction's mounted bonus, and no neighbour bonuses (no inspire,
// phalanx or myth touch). `move` is in tiles; maxMp stays in half-points.
export function statsOf(s: MatchState, u: Unit): UnitStats {
  const def = UNITS[u.type];
  return {
    atk: baseAttackOf(u), def: def.def + (u.heroTraits.includes('hardy') ? CONFIG.heroes.hardyDef : 0),
    maxHp: maxHpOf(u), move: maxMp(s, u) / 2, sight: unitSight(s, u), range: def.range,
  };
}
