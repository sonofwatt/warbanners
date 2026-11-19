import type { ReactElement } from 'react';
import { FACTIONS, UNITS } from '../../engine';
import type { FactionId, UnitTypeId } from '../../engine';
import { T } from '../text';
import { CommandList } from './CommandList';
import type { Command } from './commands';

export interface UnitPanelProps {
  type: UnitTypeId; hp: number; faction: FactionId; commands: Command[]; onCommand: (c: Command) => void;
}

// An enemy unit gets the same card with an empty command list.
export function UnitPanel({ type, hp, faction, commands, onCommand }: UnitPanelProps): ReactElement {
  const def = UNITS[type];
  const move = def.move + (def.traits.includes('mounted') && def.faction === null ? FACTIONS[faction].mountedMoveBonus : 0);
  return (
    <section className="panel unit-panel">
      <h2>{T.unit[type].name}</h2>
      <p>{T.unit[type].blurb}</p>
      <dl>
        <dt>{T.ui.health}</dt><dd>{`${hp}/${def.hp}`}</dd>
        <dt>{T.ui.attackStat}</dt><dd>{def.atk}</dd>
        <dt>{T.ui.defence}</dt><dd>{def.def}</dd>
        <dt>{T.ui.movement}</dt><dd>{move}</dd>
        <dt>{T.ui.range}</dt><dd>{def.range}</dd>
      </dl>
      <ul className="traits">
        {def.traits.map((t) => <li key={t}><strong>{T.trait[t].name}</strong>{` ${T.trait[t].blurb}`}</li>)}
      </ul>
      <CommandList commands={commands} onCommand={onCommand} />
    </section>
  );
}
