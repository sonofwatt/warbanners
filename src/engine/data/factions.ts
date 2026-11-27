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
  // rules 9: the level the faction's capital starts the match at. It never levelled up, so it has no reward pending;
  // income, unit capacity and growth needs follow the level as for any city.
  capitalStartLevel: number;
  // rules 11 (Woodland Nations); off for the Spartans and Mongols
  forestStride: boolean;                 // a forest costs the faction's units a field's cost
  forestHidden: boolean;                 // its units standing on a forest are hidden
  harvestGold: number;                   // gold paid back on every harvest
  buildingGrowthCut: number;             // growth per building minus this, never below 1
  championFromLevel: number;             // the champion or support reward comes from this level
  replaces: Partial<Record<UnitTypeId, UnitTypeId>>; // shared units the faction cannot train, and what takes their place
  extraStartUnit: UnitTypeId | null;     // a second start unit, placed on or next to the capital
}

// rules 13
export const FACTIONS: Record<FactionId, FactionDef> = deepFreeze({
  spartans: {
    startUnit: 'scout', champion: 'kingsGuard', support: 'piper',
    // rules 9 (David, 2026-11-25): the capital starts at level 2, and from level 2 on a Spartan city needs 1 growth less
    // than anyone's (growthExtra -1 from CONFIG.growthExtraFrom 2): 2 to leave level 1, then L to leave level L
    cityCover: 2, canBuildWalls: false, growthExtra: -1, mountedMoveBonus: 0, mountedDiscount: 0, capitalStartLevel: 2,
    forestStopsMounted: false, relayRiders: false, territoryRiding: false, relayMountedOnly: false, canBuildRoads: true, blockadeStores: true, tributeVillage: 0, tributeCityBase: 0, canLure: false, agoge: true, mythTouch: true,
    forestStride: false, forestHidden: false, harvestGold: 0, buildingGrowthCut: 0, championFromLevel: 5, replaces: {}, extraStartUnit: null,
  },
  mongols: {
    startUnit: 'horseman', champion: 'khansGuard', support: 'skyCaller',
    cityCover: 1.5, canBuildWalls: true, growthExtra: 0, mountedMoveBonus: 0, mountedDiscount: 1, capitalStartLevel: 1,
    // rules 8: no riding bonus (it was a half-point, ridden by territory) and relay riding for mounted units only.
    // growthExtra 0 (1 before rules 8): Mongol cities level as fast as anyone's, for the connection growth they lost
    // with their roads, and tribute 4 (3 before rules 8) for a village or a city's base (2026-11-24-rules8-tuning-report.md)
    forestStopsMounted: true, relayRiders: true, territoryRiding: false, relayMountedOnly: true, canBuildRoads: false, blockadeStores: false, tributeVillage: 4, tributeCityBase: 4, canLure: true, agoge: false, mythTouch: false,
    forestStride: false, forestHidden: false, harvestGold: 0, buildingGrowthCut: 0, championFromLevel: 5, replaces: {}, extraStartUnit: null,
  },
  // rules 11: the Woodland Nations (docs/superpowers/specs/2026-11-26-woodland-nations-faction.md section 2)
  woodland: {
    startUnit: 'skirmisher', extraStartUnit: 'trapper', champion: 'warChief', support: 'smokeKeeper',
    cityCover: 1.5, canBuildWalls: true, growthExtra: 0, mountedMoveBonus: 0, mountedDiscount: 0, capitalStartLevel: 1,
    forestStopsMounted: false, relayRiders: false, territoryRiding: false, relayMountedOnly: false, canBuildRoads: true,
    blockadeStores: false, tributeVillage: 0, tributeCityBase: 0, canLure: false, agoge: false, mythTouch: false,
    // buildingGrowthCut 0 (was 1 in the spec): David's call of 2026-11-27, full building growth for the Spartans pair
    forestStride: true, forestHidden: true, harvestGold: 3, buildingGrowthCut: 0, championFromLevel: 4,
    replaces: { warrior: 'skirmisher', archer: 'woodlandHunter' },
  },
});
