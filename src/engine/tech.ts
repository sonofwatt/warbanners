import { CONFIG } from './data/config';
import { TECHS } from './data/techs';
import { hasOwn } from './state';
import type { Action, Handler, MatchState, PlayerId, TechId } from './types';

// rules 7: base price by tier, plus one per tier for every city beyond the first
export function techPrice(s: MatchState, p: PlayerId, tech: TechId): number {
  const tier = TECHS[tech].tier;
  const cities = s.cities.filter((c) => c.owner === p).length;
  return CONFIG.techBase[tier - 1]! + (Math.max(cities, 1) - 1) * tier;
}

export function canResearch(s: MatchState, p: PlayerId, tech: TechId): boolean {
  if (typeof tech !== 'string' || !hasOwn(TECHS, tech)) return false;
  const player = s.players[p];
  if (player === undefined || player.techs.includes(tech)) return false;
  const need = TECHS[tech].requires;
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
