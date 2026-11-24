import type { FactionId } from '../engine';
import type { Persona } from './types';

// Task 12b (tuning log): Spartan hold 1 to 0.6, since garrisons that sit on a city tile block its training and
// leave the army short (Spartan share 41.5% to 46.5%); 0.6 is the lowest that still keeps a garrison home on a
// march. Mongol formation 0.3 to -0.25: riders now prefer to spread out rather than bunch, so the Spartans are the
// faction that holds lines (adjacentShare gap 0.08 to 0.20).
// The mix (2026-11-21-ai-unit-mix-log.md) is the army each side aims for, as relative shares of units: Spartans lean on
// the Hoplite line, Mongols on riders; every type either side can train has a share, so each gets trained as the army
// grows past its favourites, and mix.ts adds the counters to what is seen.
// Rules 8's tree (2026-11-24): each order follows the rules 7 one through the new tree. Spartans open Spears (the
// Hoplite, which their start no longer gives), then the Defender's and Swordsman's rows; Mongols open Riding (riders and
// the Camp, which their start no longer gives), then the Farm, the Archer's row and Chivalry. Walls (Mongols only) and
// Fishing (no unit, one harvest) come last for the side that gets nothing else from them. Each order
// starts with the faction's own start tech, so it names every tech once.
export const PERSONAS: Record<FactionId, Persona> = {
  spartans: {
    formation: 1.5, hold: 0.6, spread: 2, raid: 0, forestPenalty: 0,
    techOrder: [
      'prospecting', 'spears', 'foraging', 'defence', 'smithing', 'gathering', 'farming', 'trapping', 'archery', 'mining', 'riding',
      'logging', 'granary', 'siege', 'orchards', 'chivalry', 'foundry', 'plantations', 'milling', 'fishing', 'walls',
    ],
    mix: { hoplite: 6.5, warrior: 0.5, spearman: 0.6, archer: 1.2, defender: 0.8, swordsman: 1, scout: 0.8, catapult: 0.6, horseman: 0.4, knight: 0.6 },
    counter: 1,
  },
  mongols: {
    formation: -0.25, hold: 0.2, spread: 6, raid: 3, forestPenalty: 1,
    techOrder: [
      'gathering', 'riding', 'farming', 'trapping', 'foraging', 'archery', 'chivalry', 'prospecting', 'logging', 'granary', 'defence',
      'walls', 'spears', 'siege', 'smithing', 'orchards', 'mining', 'plantations', 'milling', 'foundry', 'fishing',
    ],
    mix: { horseArcher: 4, horseman: 2.5, knight: 2, camp: 1.2, warrior: 0.5, archer: 0.6, spearman: 0.4, defender: 1, swordsman: 0.4, catapult: 0.4 },
    counter: 1,
  },
};
