import type { ReactElement } from 'react';
import { T } from '../text';
import { CommandList } from './CommandList';
import type { Command } from './commands';

export interface CityPanelProps {
  level: number; walls: boolean; capital?: boolean;
  // Only for the viewer's own city: an enemy city shows just what the board shows (level, walls).
  growth?: number; growthNeeded?: number; units?: number; capacity?: number; income?: number;
  commands: Command[]; onCommand: (c: Command) => void;
}

export function CityPanel(p: CityPanelProps): ReactElement {
  return (
    <section className="panel city-panel">
      <h2>{p.capital === true ? T.ui.capitalTitle : T.ui.cityTitle}</h2>
      <dl>
        <dt>{T.ui.level}</dt><dd>{p.level}</dd>
        {p.growth !== undefined && p.growthNeeded !== undefined ? <><dt>{T.ui.growth}</dt><dd>{`${p.growth}/${p.growthNeeded}`}</dd></> : null}
        {p.units !== undefined && p.capacity !== undefined ? <><dt>{T.ui.unitsHeld}</dt><dd>{`${p.units}/${p.capacity}`}</dd></> : null}
        {p.income !== undefined ? <><dt>{T.ui.incomeWord}</dt><dd>{`+${p.income}`}</dd></> : null}
        <dt>{T.ui.walls}</dt><dd>{p.walls ? T.ui.yes : T.ui.no}</dd>
      </dl>
      <CommandList commands={p.commands} onCommand={p.onCommand} />
    </section>
  );
}
