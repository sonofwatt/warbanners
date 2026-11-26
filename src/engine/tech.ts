import { CONFIG } from './data/config';
import { TECHS, TECH_TREE } from './data/techs';
import { hasOwn } from './state';
import type { Action, BuildingId, FactionId, Handler, MatchState, PlayerId, Resource, TechId, UnitTypeId } from './types';

// What the tree in play (CONFIG.techTree) says a unit, harvest or building needs. null: a unit needs no tech; a
// harvest or building the tree does not have.
export function unitTech(type: UnitTypeId): TechId | null { return TECH_TREE.units[type] ?? null; }
export function harvestTech(resource: Resource): TechId | null { return TECH_TREE.harvest[resource] ?? null; }
export function buildingTech(building: BuildingId): TechId | null { return TECH_TREE.buildings[building]?.tech ?? null; }
export function startTech(faction: FactionId): TechId { return TECH_TREE.start[faction]; }
export function wallsTech(): TechId { return TECH_TREE.walls; }
export function roadTech(): TechId { return TECH_TREE.road; }

// rules 7: base price by tier, plus one per tier for every city beyond the first. rules 8: the tier is the column.
export function techPrice(s: MatchState, p: PlayerId, tech: TechId): number {
  const tier = TECHS[tech]!.tier;
  const cities = s.cities.filter((c) => c.owner === p).length;
  return CONFIG.techBase[tier - 1]! + (Math.max(cities, 1) - 1) * tier;
}

export function canResearch(s: MatchState, p: PlayerId, tech: TechId): boolean {
  if (typeof tech !== 'string' || !hasOwn(TECHS, tech)) return false;
  const player = s.players[p];
  if (player === undefined || player.techs.includes(tech)) return false;
  const need = TECHS[tech]!.requires;
  if (need !== null && !player.techs.includes(need)) return false;
  return player.gold >= techPrice(s, p, tech);
}

export const researchHandler: Handler<Extract<Action, { type: 'research' }>> = (s, a, ev) => {
  if (!canResearch(s, s.current, a.tech)) return 'cannot research that';
  const player = s.players[s.current]!;
  player.gold -= techPrice(s, s.current, a.tech);
  player.techs.push(a.tech);
  ev.push({ type: 'researched', tech: a.tech });
  return null;
};
