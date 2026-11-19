import type { FactionId } from '../engine';
import type { Persona } from './types';

export const PERSONAS: Record<FactionId, Persona> = {
  spartans: {
    formation: 1.5, hold: 1, spread: 2, raid: 0, forestPenalty: 0,
    techOrder: ['bronze', 'shieldwork', 'foraging', 'smithing', 'farming', 'hunting', 'riding', 'forestry', 'roads', 'markets', 'engineering', 'chivalry'],
    trainOrder: ['hoplite', 'warrior', 'archer', 'defender', 'swordsman', 'scout'],
    rewardPick: { 2: 0, 3: 0, 4: 0, 5: 0 },
  },
  mongols: {
    formation: 0.3, hold: 0.2, spread: 6, raid: 3, forestPenalty: 1,
    techOrder: ['riding', 'roads', 'foraging', 'hunting', 'farming', 'chivalry', 'bronze', 'forestry', 'markets', 'shieldwork', 'engineering', 'smithing'],
    trainOrder: ['horseArcher', 'horseman', 'warrior', 'camp', 'knight', 'archer'],
    rewardPick: { 2: 1, 3: 1, 4: 1, 5: 1 },
  },
};
