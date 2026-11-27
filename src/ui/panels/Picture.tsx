import type { ReactElement, ReactNode } from 'react';
import type { BuildingId, FactionId, Resource, Terrain, Tile, UnitTypeId } from '../../engine';
import { FIGURES } from '../art/factionUnits';
import { CityMark } from '../art/features';
import { factionLook } from '../art/palette';
import type { Ground, Look } from '../art/palette';
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

// `look`: the owner's colours in this match (the second seat of a mirror match has its own); the faction's if left out.
export function UnitPicture({ type, faction, look }: { type: UnitTypeId; faction: FactionId; look?: Look }): ReactElement {
  const l = look ?? factionLook(faction);
  return <OnTile ground="grass">{FIGURES[type]({ colour: l.colour, accent: l.accent })}</OnTile>;
}

export function CityPicture({ faction, level, capital, walls, look }: { faction: FactionId; level: number; capital: boolean; walls: boolean; look?: Look }): ReactElement {
  return (
    <OnTile ground="sand">
      <CityMark faction={faction} colour={(look ?? factionLook(faction)).colour} accent={(look ?? factionLook(faction)).accent} level={level} capital={capital} walls={walls} pending={false} />
    </OnTile>
  );
}

export function TilePicture({ terrain, resource, building, harvested = false }: { terrain: Terrain; resource: Resource | null; building: BuildingId | null; harvested?: boolean }): ReactElement {
  const tile: Tile = { terrain, resource, building, harvested, road: false, village: false, treasure: false, cityId: null };
  return (
    <OnTile ground={groundFor(tile, false)}>
      <TileArt k="0,0" tile={tile} />
    </OnTile>
  );
}
