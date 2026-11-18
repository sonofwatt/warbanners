import type { TechId } from '../types';

export interface TechDef { tier: 1 | 2 | 3; requires: TechId | null; }

// rules 7: four branches of three tiers
export const TECHS: Record<TechId, TechDef> = {
  foraging: { tier: 1, requires: null },
  farming: { tier: 2, requires: 'foraging' },
  markets: { tier: 3, requires: 'farming' },
  riding: { tier: 1, requires: null },
  roads: { tier: 2, requires: 'riding' },
  chivalry: { tier: 3, requires: 'roads' },
  hunting: { tier: 1, requires: null },
  forestry: { tier: 2, requires: 'hunting' },
  engineering: { tier: 3, requires: 'forestry' },
  bronze: { tier: 1, requires: null },
  shieldwork: { tier: 2, requires: 'bronze' },
  smithing: { tier: 3, requires: 'shieldwork' },
};
