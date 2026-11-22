import { deepFreeze } from './freeze';
import type { FactionId, TechId, Trait, UnitTypeId } from '../types';

export interface UnitDef {
  atk: number; def: number; range: number; move: number; hp: number; sight: number;
  cost: number | null; tech: TechId | null; faction: FactionId | null; traits: readonly Trait[];
}

// rules 8, one row each, in the rules table order
export const UNITS: Record<UnitTypeId, UnitDef> = deepFreeze({
  warrior: { atk: 4, def: 3, range: 1, move: 1, hp: 10, sight: 1, cost: 2, tech: null, faction: null, traits: [] },
  spearman: { atk: 4, def: 4, range: 1, move: 1, hp: 10, sight: 1, cost: 3, tech: 'bronze', faction: null, traits: ['steadfast'] },
  swordsman: { atk: 5, def: 4, range: 1, move: 1, hp: 15, sight: 1, cost: 5, tech: 'smithing', faction: null, traits: ['doubleStrike'] },
  defender: { atk: 2, def: 9, range: 1, move: 1, hp: 20, sight: 1, cost: 3, tech: 'shieldwork', faction: null, traits: [] },
  archer: { atk: 4, def: 2, range: 2, move: 1, hp: 10, sight: 2, cost: 3, tech: 'hunting', faction: null, traits: [] },
  horseman: { atk: 4, def: 2, range: 1, move: 2, hp: 10, sight: 2, cost: 3, tech: 'riding', faction: null, traits: ['retreat', 'mounted'] },
  knight: { atk: 6, def: 3, range: 1, move: 3, hp: 15, sight: 2, cost: 6, tech: 'chivalry', faction: null, traits: ['chain', 'mounted'] },
  catapult: { atk: 6, def: 1, range: 3, move: 1, hp: 10, sight: 1, cost: 6, tech: 'engineering', faction: null, traits: ['splash', 'siege'] },
  hoplite: { atk: 4, def: 5, range: 1, move: 1, hp: 15, sight: 1, cost: 3, tech: 'bronze', faction: 'spartans', traits: ['steadfast', 'phalanx'] },
  kingsGuard: { atk: 6, def: 6, range: 1, move: 1, hp: 20, sight: 2, cost: null, tech: null, faction: 'spartans', traits: ['unbowed'] },
  piper: { atk: 2, def: 3, range: 1, move: 1, hp: 10, sight: 2, cost: null, tech: null, faction: 'spartans', traits: ['heal', 'steady', 'taunt'] },
  scout: { atk: 2, def: 1, range: 1, move: 2, hp: 5, sight: 1, cost: 2, tech: null, faction: 'spartans', traits: ['hidden', 'noCityCapture', 'pathfinder'] },
  horseArcher: { atk: 3, def: 2, range: 2, move: 2, hp: 10, sight: 2, cost: 5, tech: 'riding', faction: 'mongols', traits: ['retreat', 'mounted'] },
  khansGuard: { atk: 6, def: 4, range: 1, move: 3, hp: 20, sight: 2, cost: null, tech: null, faction: 'mongols', traits: ['chain', 'inspire', 'mounted'] },
  skyCaller: { atk: 2, def: 2, range: 1, move: 2, hp: 10, sight: 2, cost: null, tech: null, faction: 'mongols', traits: ['heal', 'hasten', 'dustStorm', 'mounted'] },
  camp: { atk: 0, def: 3, range: 0, move: 1, hp: 15, sight: 1, cost: 6, tech: 'roads', faction: 'mongols', traits: ['camp'] },
  sellsword: { atk: 5, def: 3, range: 1, move: 1, hp: 15, sight: 1, cost: null, tech: null, faction: null, traits: [] },
});
