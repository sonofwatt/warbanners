import type { FactionId } from '../engine';
import type { Persona } from './types';

// Task 12b (tuning log): Spartan hold 1 to 0.6, since garrisons that sit on a city tile block its training and
// leave the army short (Spartan share 41.5% to 46.5%); 0.6 is the lowest that still keeps a garrison home on a
// march. Mongol formation 0.3 to -0.25: riders now prefer to spread out rather than bunch, so the Spartans are the
// faction that holds lines (adjacentShare gap 0.08 to 0.20).
export const PERSONAS: Record<FactionId, Persona> = {
  spartans: {
    formation: 1.5, hold: 0.6, spread: 2, raid: 0, forestPenalty: 0,
    techOrder: ['bronze', 'shieldwork', 'foraging', 'smithing', 'farming', 'hunting', 'riding', 'forestry', 'roads', 'markets', 'engineering', 'chivalry'],
    trainOrder: ['hoplite', 'warrior', 'archer', 'defender', 'swordsman', 'scout'],
    rewardPick: { 2: 0, 3: 0, 4: 0, 5: 0 },
  },
  mongols: {
    formation: -0.25, hold: 0.2, spread: 6, raid: 3, forestPenalty: 1,
    techOrder: ['riding', 'roads', 'foraging', 'hunting', 'farming', 'chivalry', 'bronze', 'forestry', 'markets', 'shieldwork', 'engineering', 'smithing'],
    trainOrder: ['horseArcher', 'horseman', 'warrior', 'camp', 'knight', 'archer'],
    rewardPick: { 2: 1, 3: 1, 4: 1, 5: 1 },
  },
};
