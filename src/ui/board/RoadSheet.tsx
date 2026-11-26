import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { createMatch, playerView } from '../../engine';
import type { HexKey, MatchState, Terrain } from '../../engine';
import { Board } from './Board';
import { buildScene } from './scene';

// tracks3d: a developer page of roads at every wear step, for the close-up sheet. Open it with ?roads=3d (the 3D
// look) or ?roads=svg. Nobody on the map. Two straight roads run west to east, their wear rising from a light road
// (west) to the busiest (east): the upper one over fields, the lower one through forest. Below them, a road worn to
// step 2 all along, with a light tile at each end.

/** The sheet's tiles: column and row, turned into axial keys that line up on screen. */
const at = (col: number, row: number): HexKey => `${col - Math.round(row / 2)},${row}`;
const RISING = [0, 0, 1, 1, 2, 3, 3];

export function sheetRoads(): { wear: Map<HexKey, number>; roads: HexKey[]; forest: HexKey[] } {
  const wear = new Map<HexKey, number>();
  const roads: HexKey[] = [];
  const forest: HexKey[] = [];
  for (const [row, ground] of [[-3, 'field'], [0, 'forest']] as const) {
    for (let c = -3; c <= 3; c++) {
      const k = at(c, row);
      roads.push(k);
      if (ground === 'forest') forest.push(k, at(c, row - 1), at(c, row + 1));
      if (RISING[c + 3]! > 0) wear.set(k, RISING[c + 3]!);
    }
  }
  // A third road (row 3) worn to step 2 all along, with a light tile at each end.
  for (let c = -3; c <= 3; c++) { roads.push(at(c, 3)); if (Math.abs(c) < 3) wear.set(at(c, 3), 2); }
  return { wear, roads, forest };
}

function sheetState(roads: readonly HexKey[], forest: readonly HexKey[]): MatchState {
  const s = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
  for (const k of Object.keys(s.tiles)) {
    const terrain: Terrain = forest.includes(k) ? 'forest' : 'field';
    s.tiles[k] = { ...s.tiles[k]!, terrain, resource: null, building: null, harvested: false, road: roads.includes(k), village: false, treasure: false, cityId: null };
  }
  s.cities = [];
  s.units = [];
  const all = Object.keys(s.tiles).sort();
  for (const p of s.players) p.explored = all;
  return s;
}

export function RoadSheet(p: { look3d: boolean }): ReactElement {
  const { items, radius } = useMemo(() => {
    const { wear, roads, forest } = sheetRoads();
    const s = sheetState(roads, forest);
    const view = { ...playerView(s, 0), visible: Object.keys(s.tiles).sort() };
    return { items: buildScene({ view, radius: s.radius, marks: {}, selectedUnit: null, spentUnits: new Set(), roadWear: wear }), radius: s.radius };
  }, []);
  return (
    <main className="board-demo" data-testid="road-sheet">
      <Board items={items} radius={radius} factions={['spartans', 'mongols']} focus="0,0" viewer={0} terrain3d={p.look3d} seed={7} onTap={() => {}} />
    </main>
  );
}
