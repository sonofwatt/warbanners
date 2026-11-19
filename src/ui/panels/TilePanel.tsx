import type { ReactElement } from 'react';
import type { BuildingId, Resource, Terrain } from '../../engine';
import { T } from '../text';
import { CommandList } from './CommandList';
import type { Command } from './commands';

export interface TilePanelProps {
  terrain: Terrain; resource: Resource | null; building: BuildingId | null; road: boolean;
  commands: Command[]; onCommand: (c: Command) => void;
}

export function TilePanel(p: TilePanelProps): ReactElement {
  return (
    <section className="panel tile-panel">
      <h2>{T.terrain[p.terrain]}</h2>
      <dl>
        <dt>{T.ui.terrain}</dt><dd>{T.terrain[p.terrain]}</dd>
        <dt>{T.ui.resourceWord}</dt><dd>{p.resource === null ? T.ui.none : T.resource[p.resource]}</dd>
        <dt>{T.ui.buildingWord}</dt><dd>{p.building === null ? T.ui.none : T.building[p.building]}</dd>
        <dt>{T.ui.roadWord}</dt><dd>{p.road ? T.ui.yes : T.ui.no}</dd>
      </dl>
      <CommandList commands={p.commands} onCommand={p.onCommand} />
    </section>
  );
}
