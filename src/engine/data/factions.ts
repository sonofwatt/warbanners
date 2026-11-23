import { deepFreeze } from './freeze';
import type { FactionId, TechId, UnitTypeId } from '../types';

export interface FactionDef {
  startTech: TechId; startUnit: UnitTypeId; champion: UnitTypeId; support: UnitTypeId;
  cityCover: number; canBuildWalls: boolean; growthExtra: number; mountedMoveBonus: number; mountedDiscount: number;
  forestStopsMounted: boolean; relayRiders: boolean; tributeVillage: number; tributeCityBase: number; canLure: boolean;
  // mountedMoveBonus is in half-points (rules 6; whole tiles before). territoryRiding, rules 6: mounted units ride by
  // territory: no mountedMoveBonus on a move that starts in enemy territory
  territoryRiding: boolean;
  agoge: boolean;                        // earns traits from the lower agogeThresholds
  mythTouch: boolean;                    // a hero beside another hero of its owner has +1 attack and +1 defence
}

// rules 13
export const FACTIONS: Record<FactionId, FactionDef> = deepFreeze({
  spartans: {
    startTech: 'bronze', startUnit: 'scout', champion: 'kingsGuard', support: 'piper',
    cityCover: 2, canBuildWalls: false, growthExtra: -1, mountedMoveBonus: 0, mountedDiscount: 0,
    forestStopsMounted: false, relayRiders: false, territoryRiding: false, tributeVillage: 0, tributeCityBase: 0, canLure: false, agoge: true, mythTouch: true,
  },
  mongols: {
    startTech: 'riding', startUnit: 'horseman', champion: 'khansGuard', support: 'skyCaller',
    cityCover: 1.5, canBuildWalls: true, growthExtra: 1, mountedMoveBonus: 1, mountedDiscount: 1,
    forestStopsMounted: true, relayRiders: true, territoryRiding: true, tributeVillage: 3, tributeCityBase: 3, canLure: true, agoge: false, mythTouch: false,
  },
});
