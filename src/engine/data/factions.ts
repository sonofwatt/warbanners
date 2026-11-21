import { deepFreeze } from './freeze';
import type { FactionId, TechId, UnitTypeId } from '../types';

export interface FactionDef {
  startTech: TechId; startUnit: UnitTypeId; champion: UnitTypeId; support: UnitTypeId;
  cityCover: number; canBuildWalls: boolean; growthExtra: number; mountedMoveBonus: number; mountedDiscount: number;
  forestStopsMounted: boolean; scoutingRiders: boolean; relayRiders: boolean; tributeVillage: number; tributeCityBase: number; canLure: boolean;
  agoge: boolean;                        // earns traits from the lower agogeThresholds
}

// rules 13
export const FACTIONS: Record<FactionId, FactionDef> = deepFreeze({
  spartans: {
    startTech: 'bronze', startUnit: 'scout', champion: 'kingsGuard', support: 'piper',
    cityCover: 2, canBuildWalls: false, growthExtra: 0, mountedMoveBonus: 0, mountedDiscount: 0,
    forestStopsMounted: false, scoutingRiders: false, relayRiders: false, tributeVillage: 0, tributeCityBase: 0, canLure: false, agoge: true,
  },
  mongols: {
    startTech: 'riding', startUnit: 'horseman', champion: 'khansGuard', support: 'skyCaller',
    cityCover: 1.5, canBuildWalls: true, growthExtra: 1, mountedMoveBonus: 1, mountedDiscount: 1,
    forestStopsMounted: true, scoutingRiders: true, relayRiders: true, tributeVillage: 3, tributeCityBase: 3, canLure: true, agoge: false,
  },
});
