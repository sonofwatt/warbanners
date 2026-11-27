import type { ReactElement } from 'react';
import type { BuildingId, Resource, Terrain } from '../../engine';
import { HutIcon, PeakIcon, RoadIcon, WheatIcon } from '../icons';
import { T } from '../text';
import { CardHead, Stats } from './Card';
import { CommandList } from './CommandList';
import type { Command } from './commands';
import { TilePicture } from './Picture';

export interface TilePanelProps {
  terrain: Terrain; resource: Resource | null; building: BuildingId | null; road: boolean;
  harvested?: boolean;                   // rules 8: the resource was harvested and stays, for building on
  village?: boolean;                     // an unclaimed village stands here (a captured one is a city, with its own card)
  treasure?: boolean;                    // a treasure chest waits here
  commands: Command[]; onCommand: (c: Command) => void;
}

/** What the card is called: the village or the chest standing on the tile, else its terrain. */
export function tileTitle(p: Pick<TilePanelProps, 'terrain' | 'building' | 'village' | 'treasure'>): string {
  if (p.building === null && p.village === true) return T.ui.village;
  if (p.building === null && p.treasure === true) return T.ui.treasureChest;
  return T.terrain[p.terrain];
}

export function TilePanel(p: TilePanelProps): ReactElement {
  // A village stands where a building would; a chest is something to take, so it shows where a resource would.
  const building = p.building !== null ? T.building[p.building] : p.village === true ? T.ui.village : T.ui.none;
  const resource = p.resource !== null
    ? (p.harvested === true ? `${T.resource[p.resource]} (${T.ui.harvestedTag})` : T.resource[p.resource])
    : p.treasure === true ? T.ui.chest : T.ui.none;
  return (
    <section className="panel tile-panel">
      <div className="card-peek">
      <CardHead
        picture={<TilePicture terrain={p.terrain} resource={p.resource} building={p.building} harvested={p.harvested} village={p.village} treasure={p.treasure} />}
        title={tileTitle(p)}
        actions={<CommandList commands={p.commands} onCommand={p.onCommand} />}
      />
      <Stats stats={[
        { icon: <PeakIcon />, label: T.ui.terrain, value: T.terrain[p.terrain] },
        { icon: <WheatIcon />, label: T.ui.resourceWord, value: resource },
        { icon: <HutIcon />, label: T.ui.buildingWord, value: building },
        { icon: <RoadIcon />, label: T.ui.roadWord, value: p.road ? T.ui.yes : T.ui.no },
      ]} />
      </div>
      {p.terrain === 'mountain' || (p.harvested === true && p.resource !== null && p.building === null) ? (
        <div className="card-more">
          {p.terrain === 'mountain' ? <p className="blurb">{T.ui.mountainBlurb}</p> : null}
          {p.harvested === true && p.resource !== null && p.building === null ? <p className="blurb">{T.ui.harvestedBlurb}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
