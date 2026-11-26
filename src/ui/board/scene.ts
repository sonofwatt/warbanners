import { key, neighbors, parseKey } from '../../engine';
import type { City, HexKey, PlayerId, PlayerView, Tile, Unit } from '../../engine';
import { FIGURE_H, boardKeys, boardToHex, hexToBoard } from './layout';
import type { Pt } from './layout';
import type { Mark } from './mark';

export interface SceneTile {
  kind: 'tile';
  key: HexKey;
  at: Pt;
  fog: boolean; // never explored: nothing else about the tile is set
  tile: Tile | null;
  veiled: boolean;
  city: City | null; // a city standing on this tile
  owner: PlayerId | null; // owner of the city whose territory this tile is in
  borderEdges: number[]; // directions (engine DIRS order) where the neighbour has a different owner
  // The selected city's land (`SceneInput.cityLand`): null on any other tile, else the directions where the
  // neighbour is not in that city's territory.
  cityEdges: number[] | null;
  roadLinks: number[]; // directions where the neighbour has a road or a city
  mark: Mark | null;
  ready: boolean; // one of the viewer's units can capture or claim a treasure here: it glows gold under any mark
  occupied: boolean; // a unit the viewer can see stands on it (a treasure there is drawn beside the figure)
  // tracks3d: a busy road's wear step here (roadWear.ts, 1 to 3), and for each of `roadLinks` its wear where it meets
  // that neighbour (the busier of the two), so a widened road meets its neighbour at one width. Left out: a light road.
  roadLevel?: number;
  roadWear?: number[];
}
export interface SceneUnit {
  kind: 'unit';
  unit: Unit;
  at: Pt;
  mine: boolean;
  spent: boolean;
  selected: boolean;
}
export type SceneItem = SceneTile | SceneUnit;
export interface SceneInput {
  view: PlayerView;
  radius: number;
  marks: Readonly<Record<HexKey, Mark>>;
  ready?: ReadonlySet<HexKey>; // tiles that glow gold (none when left out)
  selectedUnit: number | null;
  spentUnits: ReadonlySet<number>; // own units with nothing left to do this turn
  // The city whose land is outlined (the selected city, either player's), drawn on the explored tiles the viewer
  // knows to be its territory, the same knowledge the faction borders show.
  cityLand?: number | null;
  // tracks3d: each busy road's wear step from the traffic the viewer has seen (roadWear.ts). None when left out.
  roadWear?: ReadonlyMap<HexKey, number>;
}

const HALF_WIDTH = 13; // board units either side of a figure's centre line
const FOOT = 6; // how far a figure's hit box reaches below its tile centre

/** The draw list, back to front. A tile comes before the units standing on it. */
export function buildScene(input: SceneInput): SceneItem[] {
  const { view, radius, marks, selectedUnit, spentUnits } = input;
  const land = input.cityLand ?? null;
  const ready = input.ready ?? new Set<HexKey>();
  const board = boardKeys(radius);
  const onBoard = new Set<HexKey>(board);
  const visible = new Set(view.visible);
  const cityById = new Map(view.cities.map((c) => [c.id, c]));
  const cityAt = new Map(view.cities.map((c) => [c.pos, c]));

  const ownerOf = (k: HexKey): PlayerId | null => {
    const id = view.tiles[k]?.cityId;
    return id == null ? null : (cityById.get(id)?.owner ?? null);
  };

  const unitsAt = new Map<HexKey, Unit[]>();
  for (const u of view.units) {
    const list = unitsAt.get(u.pos);
    if (list) list.push(u);
    else unitsAt.set(u.pos, [u]);
  }

  const out: SceneItem[] = [];
  for (const k of board) {
    const tile = view.tiles[k] ?? null;
    const at = hexToBoard(k);
    if (tile === null) {
      out.push({
        kind: 'tile', key: k, at, fog: true, tile: null, veiled: false,
        city: null, owner: null, borderEdges: [], cityEdges: null, roadLinks: [], mark: marks[k] ?? null, ready: ready.has(k), occupied: false,
      });
    } else {
      const owner = ownerOf(k);
      const city = cityAt.get(k) ?? null;
      const borderEdges: number[] = [];
      const roadLinks: number[] = [];
      const inLand = land !== null && tile.cityId === land;
      const cityEdges: number[] | null = inLand ? [] : null;
      const level = tile.road && !cityAt.has(k) ? input.roadWear?.get(k) ?? 0 : 0;
      const roadWear: number[] = [];
      neighbors(parseKey(k)).forEach((n, dir) => {
        const nk = key(n);
        if (owner !== null && (!onBoard.has(nk) || ownerOf(nk) !== owner)) borderEdges.push(dir);
        if (cityEdges !== null && (!onBoard.has(nk) || view.tiles[nk]?.cityId !== land)) cityEdges.push(dir);
        const nt = view.tiles[nk];
        if (tile.road && nt && (nt.road || cityAt.has(nk))) {
          roadLinks.push(dir);
          const other = nt.road && !cityAt.has(nk) ? input.roadWear?.get(nk) ?? 0 : 0;
          roadWear.push(Math.max(level, other));
        }
      });
      out.push({
        kind: 'tile', key: k, at, fog: false, tile, veiled: !visible.has(k),
        city, owner, borderEdges, cityEdges, roadLinks, mark: marks[k] ?? null, ready: ready.has(k), occupied: unitsAt.has(k),
        ...(level > 0 || roadWear.some((w) => w > 0) ? { roadLevel: level, roadWear } : {}),
      });
    }
    for (const unit of (unitsAt.get(k) ?? []).slice().sort((a, b) => a.id - b.id)) {
      out.push({
        kind: 'unit', unit, at, mine: unit.owner === view.player,
        spent: spentUnits.has(unit.id), selected: unit.id === selectedUnit,
      });
    }
  }
  return out;
}

/** What a board point hits: units first (front to back), else the hex under it. */
export function pick(
  items: readonly SceneItem[],
  p: Pt,
  radius: number,
): { unit: number | null; hex: HexKey | null } {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!;
    if (it.kind !== 'unit') continue;
    if (Math.abs(p.x - it.at.x) <= HALF_WIDTH && p.y >= it.at.y - FIGURE_H && p.y <= it.at.y + FOOT) {
      return { unit: it.unit.id, hex: it.unit.pos };
    }
  }
  const hex = boardToHex(p);
  const { q, r } = parseKey(hex);
  const onBoard = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= radius;
  return { unit: null, hex: onBoard ? hex : null };
}
