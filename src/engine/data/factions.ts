import { deepFreeze } from './freeze';
import type { FactionId, UnitTypeId } from '../types';

// The tech each faction starts with is in the tech tree (data/techs.ts, TreeDef.start).
export interface FactionDef {
  startUnit: UnitTypeId; champion: UnitTypeId; support: UnitTypeId;
  cityCover: number; canBuildWalls: boolean; growthExtra: number; mountedMoveBonus: number; mountedDiscount: number;
  forestStopsMounted: boolean; relayRiders: boolean; tributeVillage: number; tributeCityBase: number; canLure: boolean;
  // mountedMoveBonus is in half-points (rules 6; whole tiles before). territoryRiding, rules 6: mounted units ride by
  // territory: no mountedMoveBonus on a move that starts in enemy territory
  territoryRiding: boolean;
  // rules 8: relay riding (relayRiders: a step onto an own territory tile costs CONFIG.relayCost) for mounted units only
  relayMountedOnly: boolean;
  canBuildRoads: boolean;                // rules 8: may build roads (roads already on the map work for everyone)
  // rules 8: holding the tree's walls tech eases a blockade of every city (CONFIG.blockade.cutSpartanTech); for the
  // Spartans, who build no walls, the tech is named Deep stores on screen
  blockadeStores: boolean;
  agoge: boolean;                        // earns traits from the lower agogeThresholds
  mythTouch: boolean;                    // a hero beside another hero of its owner has +1 attack and +1 defence
  // rules 9: a further change to the growth a city needs to level up, from level growthExtraLateFrom on (on top of
  // growthExtra, which counts from CONFIG.growthExtraFrom)
  growthExtraLate: number; growthExtraLateFrom: number;
  levelTwoGrowth: number;                // rules 9: growth points a city of the faction gains the moment it reaches level 2
}

// rules 13
export const FACTIONS: Record<FactionId, FactionDef> = deepFreeze({
  spartans: {
    startUnit: 'scout', champion: 'kingsGuard', support: 'piper',
    cityCover: 2, canBuildWalls: false, growthExtra: -1, mountedMoveBonus: 0, mountedDiscount: 0,
    forestStopsMounted: false, relayRiders: false, territoryRiding: false, relayMountedOnly: false, canBuildRoads: true, blockadeStores: true, tributeVillage: 0, tributeCityBase: 0, canLure: false, agoge: true, mythTouch: true,
    // rules 9: with no discount on leaving level 1 (CONFIG.growthExtraFrom 2), a Spartan city gains 1 growth the moment
    // it reaches level 2 and needs 1 more growth less from level 3 on: 2 to leave level 1, then 2, 2, and L-1 to leave
    // level L, with the first of the level 2 bar given (2026-11-25-rules9-report.md)
    growthExtraLate: -1, growthExtraLateFrom: 3, levelTwoGrowth: 1,
  },
  mongols: {
    startUnit: 'horseman', champion: 'khansGuard', support: 'skyCaller',
    cityCover: 1.5, canBuildWalls: true, growthExtra: 0, mountedMoveBonus: 0, mountedDiscount: 1,
    // rules 8: no riding bonus (it was a half-point, ridden by territory) and relay riding for mounted units only.
    // growthExtra 0 (1 before rules 8): Mongol cities level as fast as anyone's, for the connection growth they lost
    // with their roads, and tribute 4 (3 before rules 8) for a village or a city's base (2026-11-24-rules8-tuning-report.md)
    forestStopsMounted: true, relayRiders: true, territoryRiding: false, relayMountedOnly: true, canBuildRoads: false, blockadeStores: false, tributeVillage: 4, tributeCityBase: 4, canLure: true, agoge: false, mythTouch: false,
    growthExtraLate: 0, growthExtraLateFrom: 3, levelTwoGrowth: 0,
  },
});
