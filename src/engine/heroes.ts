import { CONFIG } from './data/config';
import { FACTIONS } from './data/factions';
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

// False when the unit holds the trait, is at the cap, or cannot earn traits.
export function grantTrait(_s: MatchState, u: Unit, trait: HeroTraitId, ev: GameEvent[]): boolean {
  if (!canEarnTraits(u) || u.heroTraits.includes(trait) || u.heroTraits.length >= CONFIG.heroes.maxTraits) return false;
  u.heroTraits.push(trait);
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
