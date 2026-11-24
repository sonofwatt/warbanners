import { CONFIG } from './data/config';
import { FACTIONS } from './data/factions';
import { UNITS } from './data/units';
import { distance, parseKey } from './hex';
import type { HexKey } from './hex';
import { isSteadied } from './abilities';
import { applyCredits, credit, maxHpOf, mythTouched } from './heroes';
import type { Credits } from './heroes';
import { hunkerDef } from './hunker';
import { cityAt, hasTrait, isEnterable, removeUnit, tileAt, unitAt, unitById } from './state';
import { maxMp, mountainStep } from './movement';
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

// Friendly phalanx units next to a phalanx unit (0 for any other unit).
function phalanxMates(s: MatchState, u: Unit): number {
  if (!hasTrait(u, 'phalanx')) return 0;
  const here = parseKey(u.pos);
  return s.units.filter((n) => n.id !== u.id && n.owner === u.owner && hasTrait(n, 'phalanx')
    && distance(here, parseKey(n.pos)) === 1).length;
}

// Base defence plus Hardy and the myth touch, plus the phalanx bonus: each adjacent friendly phalanx unit, up to the cap.
export function defenceOf(s: MatchState, u: Unit): number {
  const base = UNITS[u.type].def + (u.heroTraits.includes('hardy') ? CONFIG.heroes.hardyDef : 0)
    + (mythTouched(s, u) ? CONFIG.heroes.mythDef : 0);
  return base + Math.min(CONFIG.phalanxMax, phalanxMates(s, u) * CONFIG.phalanxBonus);
}

// rules 7, phalanx brace: a phalanx unit with at least CONFIG.brace.mates friendly phalanx units beside it.
export function isBraced(s: MatchState, u: Unit): boolean {
  return phalanxMates(s, u) >= CONFIG.brace.mates;
}

// rules 7: the brace counts only when a chain unit attacks the braced unit.
export function bracedAgainst(s: MatchState, target: Unit, attacker: Unit): boolean {
  return hasTrait(attacker, 'chain') && isBraced(s, target);
}

// rules 7: the defence a unit has when this attacker attacks it: defenceOf plus the hunker bonus, plus the brace
// against a chain attacker (cover multiplies after). Never used for a counter-attack.
export function guardOf(s: MatchState, u: Unit, attacker: Unit): number {
  return defenceOf(s, u) + hunkerDef(u) + (bracedAgainst(s, u, attacker) ? CONFIG.brace.def : 0);
}

// rules 7: the momentum a chain attacker pays to kill this target: its type's price, or the braced price for a braced
// Hoplite (judged as the attack is made).
export function momentumPrice(s: MatchState, target: Unit, attacker: Unit): number {
  return bracedAgainst(s, target, attacker) ? CONFIG.momentum.bracedPrice : CONFIG.momentum.price[target.type];
}

// rules 7: the points of momentum this attacker lacks to pay for this target; 0 when it can pay or has no chain.
export function momentumShort(s: MatchState, target: Unit, attacker: Unit): number {
  if (!hasTrait(attacker, 'chain')) return 0;
  return Math.max(0, momentumPrice(s, target, attacker) - attacker.momentum);
}

// The damage this attacker's hit does to this target at effective attack effAtk: the formula against its guard and
// cover, less 1 per missing point of momentum (rules 7), never below 1. The attack itself and every estimate use it.
// Last, the long shot cut (rules 8) for a shot from a mountain beyond the attacker's normal range.
export function strikeDamage(s: MatchState, target: Unit, attacker: Unit, effAtk: number): number {
  const full = damageFor(effAtk, guardOf(s, target, attacker), coverAt(s, target));
  const dmg = Math.max(1, full - momentumShort(s, target, attacker));
  return longShot(s, attacker, target) ? Math.max(1, Math.round(dmg * CONFIG.mountain.longShotScale)) : dmg;
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

// The reach a unit counter-attacks with: its type's range, or the blinded reach. No mountain bonus (rules 8).
function counterReach(u: Unit): number {
  return u.blinded ? CONFIG.blindedReach : UNITS[u.type].range;
}

// rules 8: the extra reach a unit has for its own attacks where it stands: rangeBonus for a ranged unit (range 2 or
// more) on a mountain, else 0. Blindness wins (attackReach).
export function mountainReach(s: MatchState, u: Unit): number {
  return UNITS[u.type].range >= 2 && tileAt(s, u.pos)?.terrain === 'mountain' ? CONFIG.mountain.rangeBonus : 0;
}

// rules 10 and 8: how far a unit's own attacks reach: the blinded reach, or its type's range plus the mountain bonus.
export function attackReach(s: MatchState, u: Unit): number {
  return u.blinded ? CONFIG.blindedReach : UNITS[u.type].range + mountainReach(s, u);
}

// rules 8: is this a long shot, one that uses the mountain's extra tile (the target is beyond the normal range)?
export function longShot(s: MatchState, attacker: Unit, target: Unit): boolean {
  return !attacker.blinded && mountainReach(s, attacker) > 0
    && distance(parseKey(attacker.pos), parseKey(target.pos)) > UNITS[attacker.type].range;
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
  const reach = attackReach(s, u);
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
  // rules 7: the price and the shortfall are judged now, before the target can fall
  const price = momentumPrice(s, target, attacker);
  const short = momentumShort(s, target, attacker);
  const damage = strikeDamage(s, target, attacker, effAtk);
  if (short > 0) attacker.momentum = 0;                     // a short attack spends what is left, kill or not
  target.hp -= damage;
  const targetDied = target.hp <= 0;

  // The counter is worked out first so the one `attacked` event can carry it.
  let counter = 0;
  if (!targetDied && attackOf(s, target) > 0 && !hasTrait(target, 'siege')
    && distance(parseKey(attacker.pos), parseKey(target.pos)) <= counterReach(target)) {
    const f = hasTrait(target, 'steadfast') ? CONFIG.steadfastFactor : CONFIG.counterFactor;
    const cAtk = attackOf(s, target) * f * healthFactor(target);
    counter = damageFor(cAtk, defenceOf(s, attacker), 1);
    if (attacker.heroTraits.includes('watchful')) counter = Math.max(1, counter - CONFIG.heroes.agilityCut);   // agility
  }
  ev.push({ type: 'attacked', unit: attacker.id, target: target.id, damage, counter });
  let kills = 0;                                  // units this attack killed, for the attacker's fight deed
  let chainGranted = 0;                           // extra attacks the chain trait granted for those kills
  let climbed = false;                            // rules 8: the advance stepped onto or off a mountain
  const splashed: Unit[] = [];

  if (targetDied) {
    removeUnit(s, target.id);
    ev.push({ type: 'died', unit: target.id });
    kills += 1;
    // rules 7: a chain unit pays the kill's price out of its momentum and gets one more attack. A short attack pays
    // nothing more and gets none: the chain ends. Its event follows the advance, so it shows where the rider ends up.
    const chain = hasTrait(attacker, 'chain');
    const paid = chain && short === 0;
    if (paid) {
      attacker.momentum -= price;
      attacker.attacks += 1;
      chainGranted += 1;
    }
    // rules 10: a melee killer steps into the emptied tile, at no movement cost
    if (UNITS[attacker.type].range === 1 && !hasTrait(attacker, 'splash') && isEnterable(s, tileKey) && unitAt(s, tileKey) === undefined) {
      attacker.pos = tileKey; attacker.enteredTurn = s.stamp;
      ev.push({ type: 'advanced', unit: attacker.id, from: attackerFrom, to: tileKey });
      climbed = mountainStep(s, attackerFrom, tileKey);
    }
    if (paid && price > 0) ev.push({ type: 'momentum', unit: attacker.id, spent: price, left: attacker.momentum });
    if (chain && !paid) ev.push({ type: 'chainEnded', unit: attacker.id });
  }

  if (hasTrait(attacker, 'splash')) {
    const splash = Math.max(1, Math.round(damage / CONFIG.splashDivisor));
    const centre = parseKey(tileKey);
    for (const n of s.units) {
      if (n.owner === attacker.owner || distance(centre, parseKey(n.pos)) !== 1) continue;
      n.hp -= splash;
      ev.push({ type: 'splashed', target: n.id, damage: splash });
      if (n.hp <= 0) { removeUnit(s, n.id); ev.push({ type: 'died', unit: n.id }); kills += 1; } else splashed.push(n);
    }
  }

  let attackerDied = false;
  if (counter > 0) {
    attacker.hp -= counter;
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
  let chainTakenBack = false;
  if (CONFIG.levelUpEndsChain && chainGranted > 0 && attacker.heroTraits.length > traitsBefore) {
    attacker.attacks -= chainGranted;
    chainTakenBack = true;
    ev.push({ type: 'chainEnded', unit: attacker.id });
  }

  attacker.attacks -= 1;
  attacker.acted = true;
  if (!hasTrait(attacker, 'retreat')) attacker.mp = 0;

  // rules 8: a kill advance onto or off a mountain ends the turn as a climb does: no chain attack, no retreat move.
  // The kill still counts (deeds above, momentum paid).
  if (climbed) {
    if (chainGranted > 0 && !chainTakenBack) ev.push({ type: 'chainEnded', unit: attacker.id });
    attacker.mp = 0; attacker.bonusMp = 0; attacker.attacks = 0; attacker.itemTurn = s.stamp; attacker.turnEnded = true;
  }

  // rules 13: a lure is recorded only when both survive and lureApplies; otherwise the request is ignored
  const survivor = unitById(s, target.id);
  if (a.lure === true && survivor !== undefined && !targetDied && lureApplies(s, attacker, survivor)) {
    attacker.lure = { target: survivor.id, from: attackerFrom };
  }
  return null;
};

export interface UnitStats { atk: number; def: number; maxHp: number; move: number; sight: number; range: number }

// A unit's own numbers with its traits and its faction's mounted bonus, and no neighbour bonuses (no inspire,
// phalanx or myth touch). `move` is in tiles; maxMp stays in half-points. Sight and range count the mountain it stands
// on (range: rules 8, for a ranged unit), not blindness.
export function statsOf(s: MatchState, u: Unit): UnitStats {
  const def = UNITS[u.type];
  return {
    atk: baseAttackOf(u), def: def.def + (u.heroTraits.includes('hardy') ? CONFIG.heroes.hardyDef : 0),
    maxHp: maxHpOf(u), move: maxMp(s, u) / 2, sight: unitSight(s, u), range: def.range + mountainReach(s, u),
  };
}
