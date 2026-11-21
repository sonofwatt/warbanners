import { CONFIG } from './data/config';
import { FACTIONS } from './data/factions';
import { UNITS } from './data/units';
import { distance, parseKey } from './hex';
import { hasTrait } from './state';
import { DEEDS } from './types';
import type { DeedId, Deeds, GameEvent, HeroTraitId, MatchState, Unit } from './types';

export function freshDeeds(): Deeds {
  return { fight: 0, march: 0, survive: 0, rest: 0 };
}

// Deed points a unit needs for the deed's trait: the lower agoge table for a faction that has the agoge.
export function thresholdOf(s: MatchState, u: Unit, deed: DeedId): number {
  const agoge = FACTIONS[s.players[u.owner]!.faction].agoge;
  return (agoge ? CONFIG.heroes.agogeThresholds : CONFIG.heroes.thresholds)[deed];
}

// Every unit but the Camp (a yurt is no hero) can earn traits.
export function canEarnTraits(u: Unit): boolean {
  return !hasTrait(u, 'camp');
}

export function isHero(u: Unit): boolean {
  return u.heroTraits.length >= CONFIG.heroes.heroAt;
}

// A unit's own maximum health: its type's health, plus Fierce. UNITS[t].hp stays the spawn health.
export function maxHpOf(u: Unit): number {
  return UNITS[u.type].hp + (u.heroTraits.includes('fierce') ? CONFIG.heroes.fierceHp : 0);
}

// The faction rule: a hero beside another hero of the same owner, when its faction has the myth touch.
export function mythTouched(s: MatchState, u: Unit): boolean {
  if (!FACTIONS[s.players[u.owner]!.faction].mythTouch || !isHero(u)) return false;
  const here = parseKey(u.pos);
  return s.units.some((n) => n.id !== u.id && n.owner === u.owner && isHero(n) && distance(here, parseKey(n.pos)) === 1);
}

// False when the unit holds the trait, is at the cap, or cannot earn traits.
export function grantTrait(_s: MatchState, u: Unit, trait: HeroTraitId, ev: GameEvent[]): boolean {
  if (!canEarnTraits(u) || u.heroTraits.includes(trait) || u.heroTraits.length >= CONFIG.heroes.maxTraits) return false;
  u.heroTraits.push(trait);
  if (trait === 'fierce') u.hp += CONFIG.heroes.fierceHp;   // the new health is healed at once
  ev.push({ type: 'heroTrait', unit: u.id, trait, hero: u.heroTraits.length === CONFIG.heroes.heroAt });
  return true;
}

// Adds deed points (a Camp counts them too), then grants the deed's trait if the total has reached its threshold.
// A caller that adds several deeds in one action calls this in DEEDS order, so traits come in deed order.
export function addDeed(s: MatchState, u: Unit, deed: DeedId, points: number, ev: GameEvent[]): void {
  u.deeds[deed] += points;
  if (u.deeds[deed] >= thresholdOf(s, u, deed)) grantTrait(s, u, CONFIG.heroes.traitFor[deed], ev);
}

// Deed points an action earns, gathered per unit and applied at the end of the action in DEEDS order, so one
// action that crosses several thresholds grants its traits in deed order whatever order the credits arrived in.
export type Credits = Map<Unit, Partial<Deeds>>;

export function credit(credits: Credits, u: Unit, deed: DeedId, points: number): void {
  const mine = credits.get(u) ?? {};
  mine[deed] = (mine[deed] ?? 0) + points;
  credits.set(u, mine);
}

export function applyCredits(s: MatchState, credits: Credits, ev: GameEvent[]): void {
  for (const [u, mine] of credits) {
    for (const deed of DEEDS) {
      const points = mine[deed];
      if (points !== undefined && points > 0) addDeed(s, u, deed, points, ev);
    }
  }
}
