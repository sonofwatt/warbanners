import { CONFIG } from './data/config';
import { distance, key, parseKey, range } from './hex';
import type { HexKey } from './hex';
import { addDeed, maxHpOf } from './heroes';
import { drankThisTurn } from './items';
import { hasOwn, hasTrait, tileAt, unitAt, unitById } from './state';
import { canSeeUnit, visibleTiles } from './vision';
import { ABILITIES } from './types';
import type { AbilityId, Action, Handler, MatchState, Unit } from './types';

// attacks that an ability may not spend: a drunk draught's extra one is for attacking only
function abilityReserve(s: MatchState, u: Unit): number {
  return drankThisTurn(s, u) ? 1 : 0;
}

function isAbility(v: unknown): v is AbilityId {
  return typeof v === 'string' && ABILITIES.includes(v as AbilityId);
}

// rules 11 and 13: tiles an ability may be aimed at now
export function abilityTargets(s: MatchState, unitId: number, ability: AbilityId): HexKey[] {
  if (!isAbility(ability)) return [];
  const u = unitById(s, unitId);
  if (u === undefined || u.owner !== s.current || u.fresh || u.attacks <= abilityReserve(s, u) || !hasTrait(u, ability)) return [];
  const here = parseKey(u.pos);
  let found: Unit[] = [];
  if (ability === 'heal') {
    found = s.units.filter((t) => t.id !== u.id && t.owner === u.owner && distance(here, parseKey(t.pos)) === 1
      && t.hp < maxHpOf(t));
  } else if (ability === 'taunt') {
    const visible = visibleTiles(s, u.owner);
    found = s.units.filter((t) => t.owner !== u.owner && distance(here, parseKey(t.pos)) <= CONFIG.tauntRange
      && canSeeUnit(s, u.owner, t, visible));
  } else if (ability === 'hasten') {
    found = s.units.filter((t) => t.id !== u.id && t.owner === u.owner && distance(here, parseKey(t.pos)) === 1
      && hasTrait(t, 'mounted') && !t.fresh);
  } else {
    return dustStormTiles(s, u);
  }
  return found.map((t) => t.pos).sort();
}

// Enemy units a dust storm on this tile would blind: on it or next to it, seen or not.
function stormVictims(s: MatchState, owner: number, k: HexKey): Unit[] {
  const centre = parseKey(k);
  return s.units.filter((t) => t.owner !== owner && distance(centre, parseKey(t.pos)) <= 1);
}

// A dust storm may be aimed at a tile in range with a unit the caster's owner can see on or beside it.
function dustStormTiles(s: MatchState, u: Unit): HexKey[] {
  const out: HexKey[] = [];
  const visible = visibleTiles(s, u.owner);
  for (const h of range(parseKey(u.pos), CONFIG.dustStormRange)) {
    const k = key(h);
    if (tileAt(s, k) === undefined) continue;
    if (stormVictims(s, u.owner, k).some((t) => canSeeUnit(s, u.owner, t, visible))) out.push(k);
  }
  return out.sort();
}

export const abilityHandler: Handler<Extract<Action, { type: 'ability' }>> = (s, a, ev) => {
  if (typeof a.unit !== 'number' || typeof a.target !== 'string' || !isAbility(a.ability)) return 'bad ability';
  const u = unitById(s, a.unit);
  if (u === undefined) return 'no such unit';
  if (u.owner !== s.current) return 'not your unit';
  if (!hasTrait(u, a.ability)) return 'unit lacks that ability';
  if (u.attacks <= abilityReserve(s, u)) return 'no attacks left';
  if (!hasOwn(s.tiles, a.target) || !abilityTargets(s, u.id, a.ability).includes(a.target)) return 'bad target';
  ev.push({ type: 'ability', unit: u.id, ability: a.ability, target: a.target });
  if (a.ability === 'dustStorm') {
    for (const v of stormVictims(s, u.owner, a.target)) v.blinded = true;
  } else {
    const target = unitAt(s, a.target)!;
    if (a.ability === 'heal') {
      const before = target.hp;
      const bonus = target.hunkered ? CONFIG.hunker.abilityHealBonus : 0;   // rules 7
      target.hp = Math.min(maxHpOf(target), target.hp + CONFIG.abilityHeal + bonus);
      if (target.hp > before && !target.fresh) addDeed(s, target, 'survive', 1, ev);
    }
    else if (a.ability === 'taunt') target.taunted = true;
    else target.mp += CONFIG.hastenMp;
  }
  u.attacks -= 1;
  u.mp = 0;
  u.acted = true;
  return null;
};

// rules 11: a friendly unit with the steady trait stands next to u
export function isSteadied(s: MatchState, u: Unit): boolean {
  const here = parseKey(u.pos);
  return s.units.some((n) => n.id !== u.id && n.owner === u.owner && hasTrait(n, 'steady')
    && distance(here, parseKey(n.pos)) === 1);
}
