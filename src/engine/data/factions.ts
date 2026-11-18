import type { FactionId, TechId, UnitTypeId } from '../types';

export interface FactionDef {
  startTech: TechId; startUnit: UnitTypeId; champion: UnitTypeId; support: UnitTypeId;
  cityCover: number; canBuildWalls: boolean; growthExtra: number; mountedMoveBonus: number; mountedDiscount: number;
  forestStopsMounted: boolean; relayRiders: boolean; tributeVillage: number; tributeCityBase: number; canLure: boolean;
}

// rules 13
export const FACTIONS: Record<FactionId, FactionDef> = {
  spartans: {
    startTech: 'bronze', startUnit: 'warrior', champion: 'kingsGuard', support: 'piper',
    cityCover: 2, canBuildWalls: false, growthExtra: 0, mountedMoveBonus: 0, mountedDiscount: 0,
    forestStopsMounted: false, relayRiders: false, tributeVillage: 0, tributeCityBase: 0, canLure: false,
  },
  mongols: {
    startTech: 'riding', startUnit: 'horseman', champion: 'khansGuard', support: 'skyCaller',
    cityCover: 1.5, canBuildWalls: true, growthExtra: 1, mountedMoveBonus: 1, mountedDiscount: 1,
    forestStopsMounted: true, relayRiders: true, tributeVillage: 3, tributeCityBase: 3, canLure: true,
  },
};
