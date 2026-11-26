import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { createMatch, playerView } from '../../engine';
import type { HexKey, MatchState } from '../../engine';
import { Board } from './Board';
import { buildScene } from './scene';
import type { TrackLook } from './tracks';

// tracks3d: a developer page of every track look side by side, for the close-up sheet. Open it with ?tracks=3d (the
// 3D look) or ?tracks=svg. All fields, nobody on them. Rows, top to bottom (one blank row between): footprints, hoof
// prints, wheel ruts at wear steps 1, 2 and 3 left to right; the path under heavy mixed traffic (flattened, then
// beaten); and a road whose wear rises from a light road (left) to a busy one (right). Each mark runs east to west.

const EW = (1 << 0) | (1 << 3); // engine directions 0 and 3: east and west
const none = { level: 0, edges: 0 };
const look = (p: Partial<TrackLook>): TrackLook => ({ foot: none, hoof: none, wheel: none, path: 0, road: 0, ...p });

/** The sheet's tiles: column (-3 to 3) and row (-3 to 3), turned into axial keys that line up on screen. */
const at = (col: number, row: number): HexKey => `${col - Math.round(row / 2)},${row}`;

export function sheetTracks(): { tracks: Map<HexKey, TrackLook>; roads: HexKey[] } {
  const tracks = new Map<HexKey, TrackLook>();
  const kinds = ['foot', 'hoof', 'wheel'] as const;
  kinds.forEach((kind, i) => {
    for (const level of [1, 2, 3]) tracks.set(at(level * 2 - 4, -3 + i * 2), look({ [kind]: { level, edges: EW } }));
  });
  // The path row: mixed traffic, the path flattened (1) then beaten (2), and the busiest mix.
  tracks.set(at(-2, 3), look({ foot: { level: 2, edges: EW }, hoof: { level: 2, edges: EW }, path: 1 }));
  tracks.set(at(0, 3), look({ foot: { level: 3, edges: EW }, hoof: { level: 2, edges: EW }, wheel: { level: 1, edges: EW }, path: 2 }));
  tracks.set(at(2, 3), look({ foot: { level: 3, edges: EW }, hoof: { level: 3, edges: EW }, wheel: { level: 3, edges: EW }, path: 2 }));
  // The road row (row 5): its wear rises west to east, from a light road to the busiest.
  const roads: HexKey[] = [];
  const wear = [0, 0, 1, 1, 2, 3, 3];
  for (let c = -3; c <= 3; c++) {
    const k = at(c, 5);
    roads.push(k);
    tracks.set(k, look({ road: wear[c + 3]! }));
  }
  return { tracks, roads };
}

function sheetState(roads: readonly HexKey[]): MatchState {
  const s = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
  for (const k of Object.keys(s.tiles)) {
    s.tiles[k] = { ...s.tiles[k]!, terrain: 'field', resource: null, building: null, harvested: false, road: roads.includes(k), village: false, treasure: false, cityId: null };
  }
  s.cities = [];
  s.units = [];
  const all = Object.keys(s.tiles).sort();
  for (const p of s.players) p.explored = all;
  return s;
}

export function TracksSheet(p: { look3d: boolean }): ReactElement {
  const { items, radius } = useMemo(() => {
    const { tracks, roads } = sheetTracks();
    const s = sheetState(roads);
    const view = { ...playerView(s, 0), visible: Object.keys(s.tiles).sort() };
    return { items: buildScene({ view, radius: s.radius, marks: {}, selectedUnit: null, spentUnits: new Set(), tracks }), radius: s.radius };
  }, []);
  return (
    <main className="board-demo" data-testid="tracks-sheet">
      <Board items={items} radius={radius} factions={['spartans', 'mongols']} focus="0,0" viewer={0} terrain3d={p.look3d} seed={7} onTap={() => {}} />
    </main>
  );
}
