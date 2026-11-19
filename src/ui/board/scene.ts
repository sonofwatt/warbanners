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
  roadLinks: number[]; // directions where the neighbour has a road or a city
  mark: Mark | null;
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
  selectedUnit: number | null;
  spentUnits: ReadonlySet<number>; // own units with nothing left to do this turn
}

const HALF_WIDTH = 13; // board units either side of a figure's centre line
const FOOT = 6; // how far a figure's hit box reaches below its tile centre

/** The draw list, back to front. A tile comes before the units standing on it. */
export function buildScene(input: SceneInput): SceneItem[] {
  const { view, radius, marks, selectedUnit, spentUnits } = input;
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
        city: null, owner: null, borderEdges: [], roadLinks: [], mark: marks[k] ?? null,
      });
    } else {
      const owner = ownerOf(k);
      const city = cityAt.get(k) ?? null;
      const borderEdges: number[] = [];
      const roadLinks: number[] = [];
      neighbors(parseKey(k)).forEach((n, dir) => {
        const nk = key(n);
        if (owner !== null && (!onBoard.has(nk) || ownerOf(nk) !== owner)) borderEdges.push(dir);
        const nt = view.tiles[nk];
        if (tile.road && nt && (nt.road || cityAt.has(nk))) roadLinks.push(dir);
      });
      out.push({
        kind: 'tile', key: k, at, fog: false, tile, veiled: !visible.has(k),
        city, owner, borderEdges, roadLinks, mark: marks[k] ?? null,
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
