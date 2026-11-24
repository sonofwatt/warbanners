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
  commands: Command[]; onCommand: (c: Command) => void;
}

export function TilePanel(p: TilePanelProps): ReactElement {
  return (
    <section className="panel tile-panel">
      <CardHead
        picture={<TilePicture terrain={p.terrain} resource={p.resource} building={p.building} />} title={T.terrain[p.terrain]}
        actions={<CommandList commands={p.commands} onCommand={p.onCommand} />}
      >
        {p.terrain === 'mountain' ? <p className="blurb">{T.ui.mountainBlurb}</p> : null}
      </CardHead>
      <Stats stats={[
        { icon: <PeakIcon />, label: T.ui.terrain, value: T.terrain[p.terrain] },
        { icon: <WheatIcon />, label: T.ui.resourceWord, value: p.resource === null ? T.ui.none : T.resource[p.resource] },
        { icon: <HutIcon />, label: T.ui.buildingWord, value: p.building === null ? T.ui.none : T.building[p.building] },
        { icon: <RoadIcon />, label: T.ui.roadWord, value: p.road ? T.ui.yes : T.ui.no },
      ]} />
    </section>
  );
}
