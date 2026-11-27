import type { ReactElement, ReactNode } from 'react';
import type { BuildingId, FactionId, Resource, Terrain, Tile, UnitTypeId } from '../../engine';
import { FIGURES } from '../art/factionUnits';
import { CityMark } from '../art/features';
import { ACCENT, playerColour } from '../art/palette';
import type { Ground } from '../art/palette';
import { TileBase, groundFor } from '../art/tiles';
import { TileArt } from '../board/Board';

// The picture at the top of a selection card: the selected thing drawn with the board's own art, standing on
// one thick tile. Decorative: the card's heading names it.

function OnTile({ ground, children }: { ground: Ground; children?: ReactNode }): ReactElement {
  return (
    <svg className="picture" viewBox="-31 -40 62 66" aria-hidden="true" focusable="false">
      <TileBase ground={ground} />
      {children}
    </svg>
  );
}

export function UnitPicture({ type, faction }: { type: UnitTypeId; faction: FactionId }): ReactElement {
  return <OnTile ground="grass">{FIGURES[type]({ colour: playerColour(faction), accent: ACCENT[faction] })}</OnTile>;
}

export function CityPicture({ faction, level, capital, walls }: { faction: FactionId; level: number; capital: boolean; walls: boolean }): ReactElement {
  return (
    <OnTile ground="sand">
      <CityMark faction={faction} colour={playerColour(faction)} level={level} capital={capital} walls={walls} pending={false} />
    </OnTile>
  );
}

export function TilePicture({ terrain, resource, building, harvested = false, village = false, treasure = false }: {
  terrain: Terrain; resource: Resource | null; building: BuildingId | null; harvested?: boolean; village?: boolean; treasure?: boolean;
}): ReactElement {
  const tile: Tile = { terrain, resource, building, harvested, road: false, village, treasure, cityId: null };
  return (
    <OnTile ground={groundFor(tile, false)}>
      <TileArt k="0,0" tile={tile} />
    </OnTile>
  );
}
