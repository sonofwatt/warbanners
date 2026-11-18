import { CONFIG } from './data/config';
import { FACTIONS } from './data/factions';
import { UNITS } from './data/units';
import { distance, parseKey } from './hex';
import type { HexKey } from './hex';
import { cityAt, hasTrait, removeUnit, tileAt, unitAt, unitById } from './state';
import { canSeeUnit } from './vision';
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

// Base attack. Inspire is added by a later task.
export function attackOf(_s: MatchState, u: Unit): number {
  return UNITS[u.type].atk;
}

// Base defence. Phalanx is added by a later task.
export function defenceOf(_s: MatchState, u: Unit): number {
  return UNITS[u.type].def;
}

// rules 10
export function damageFor(effAtk: number, def: number, cover: number): number {
  return Math.max(1, Math.round(CONFIG.damageScale * effAtk * effAtk / (effAtk + def * cover)));
}

function healthFactor(u: Unit): number {
  const maxHp = UNITS[u.type].hp;
  return (u.hp + maxHp) / (2 * maxHp);
}

function reachOf(u: Unit): number {
  return u.blinded ? 1 : UNITS[u.type].range;
}

// rules 10: tiles holding an enemy this unit may attack now
export function attackTargets(s: MatchState, unitId: number): HexKey[] {
  const u = unitById(s, unitId);
  if (u === undefined || u.owner !== s.current || u.attacks <= 0) return [];
  const def = UNITS[u.type];
  if (def.range === 0 || def.atk === 0) return [];
  if (hasTrait(u, 'siege') && u.moved) return [];
  const reach = reachOf(u);
  const from = parseKey(u.pos);
  return s.units
    .filter((t) => t.owner !== u.owner && canSeeUnit(s, u.owner, t) && distance(from, parseKey(t.pos)) <= reach)
    .map((t) => t.pos)
    .sort();
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

  const effAtk = attackOf(s, attacker) * healthFactor(attacker);
  const damage = damageFor(effAtk, defenceOf(s, target), coverAt(s, target));
  target.hp -= damage;
  const targetDied = target.hp <= 0;

  // The counter is worked out first so the one `attacked` event can carry it.
  let counter = 0;
  if (!targetDied && attackOf(s, target) > 0 && !hasTrait(target, 'siege')
    && distance(parseKey(attacker.pos), parseKey(target.pos)) <= reachOf(target)) {
    const f = hasTrait(target, 'steadfast') ? CONFIG.steadfastFactor : CONFIG.counterFactor;
    const cAtk = attackOf(s, target) * f * healthFactor(target);
    counter = damageFor(cAtk, defenceOf(s, attacker), 1);
  }
  ev.push({ type: 'attacked', unit: attacker.id, target: target.id, damage, counter });

  if (targetDied) {
    removeUnit(s, target.id);
    ev.push({ type: 'died', unit: target.id });
    if (hasTrait(attacker, 'chain')) attacker.attacks += 1;
  }

  if (hasTrait(attacker, 'splash')) {
    const splash = Math.max(1, Math.round(damage / CONFIG.splashDivisor));
    const centre = parseKey(tileKey);
    for (const n of s.units) {
      if (n.owner === attacker.owner || distance(centre, parseKey(n.pos)) !== 1) continue;
      n.hp -= splash;
      ev.push({ type: 'splashed', target: n.id, damage: splash });
      if (n.hp <= 0) { removeUnit(s, n.id); ev.push({ type: 'died', unit: n.id }); }
    }
  }

  if (counter > 0) {
    attacker.hp -= counter;
    if (attacker.hp <= 0) {
      removeUnit(s, attacker.id);
      ev.push({ type: 'died', unit: attacker.id });
      return null;
    }
  }

  attacker.attacks -= 1;
  attacker.acted = true;
  if (!hasTrait(attacker, 'retreat')) attacker.mp = 0;
  return null;
};
