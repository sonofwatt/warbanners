import type { ReactElement } from 'react';
import { T } from '../text';
import { CommandList } from './CommandList';
import type { Command } from './commands';

export interface CityPanelProps {
  level: number; growth: number; growthNeeded: number; units: number; capacity: number; income: number; walls: boolean;
  commands: Command[]; onCommand: (c: Command) => void;
}

export function CityPanel(p: CityPanelProps): ReactElement {
  return (
    <section className="panel city-panel">
      <dl>
        <dt>{T.ui.level}</dt><dd>{p.level}</dd>
        <dt>{T.ui.growth}</dt><dd>{`${p.growth}/${p.growthNeeded}`}</dd>
        <dt>{T.ui.unitsHeld}</dt><dd>{`${p.units}/${p.capacity}`}</dd>
        <dt>{T.ui.incomeWord}</dt><dd>{`+${p.income}`}</dd>
        <dt>{T.ui.walls}</dt><dd>{p.walls ? T.ui.yes : T.ui.no}</dd>
      </dl>
      <CommandList commands={p.commands} onCommand={p.onCommand} />
    </section>
  );
}
