import type { FactionId } from '../engine';
import type { Persona } from './types';

// Task 12b (tuning log): Spartan hold 1 to 0.6, since garrisons that sit on a city tile block its training and
// leave the army short (Spartan share 41.5% to 46.5%); 0.6 is the lowest that still keeps a garrison home on a
// march. Mongol formation 0.3 to -0.25: riders now prefer to spread out rather than bunch, so the Spartans are the
// faction that holds lines (adjacentShare gap 0.08 to 0.20).
// The mix (2026-11-21-ai-unit-mix-log.md) is the army each side aims for, as relative shares of units: Spartans lean on
// the Hoplite line, Mongols on riders; every type either side can train has a share, so each gets trained as the army
// grows past its favourites, and mix.ts adds the counters to what is seen.
export const PERSONAS: Record<FactionId, Persona> = {
  spartans: {
    formation: 1.5, hold: 0.6, spread: 2, raid: 0, forestPenalty: 0,
    techOrder: ['bronze', 'shieldwork', 'foraging', 'smithing', 'farming', 'hunting', 'riding', 'forestry', 'roads', 'markets', 'engineering', 'chivalry'],
    mix: { hoplite: 6.5, warrior: 0.5, spearman: 0.6, archer: 1.2, defender: 0.8, swordsman: 1, scout: 0.8, catapult: 0.6, horseman: 0.4, knight: 0.6 },
    counter: 1,
  },
  mongols: {
    formation: -0.25, hold: 0.2, spread: 6, raid: 3, forestPenalty: 1,
    techOrder: ['riding', 'roads', 'foraging', 'hunting', 'farming', 'chivalry', 'bronze', 'forestry', 'markets', 'shieldwork', 'engineering', 'smithing'],
    mix: { horseArcher: 4, horseman: 2.5, knight: 2, camp: 1.2, warrior: 0.5, archer: 0.6, spearman: 0.4, defender: 1, swordsman: 0.4, catapult: 0.4 },
    counter: 1,
  },
};
