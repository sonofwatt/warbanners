import type { ReactElement } from 'react';
import { FACTIONS, UNITS } from '../../engine';
import type { FactionId, UnitTypeId } from '../../engine';
import { BootIcon, HeartIcon, RangeIcon, ShieldIcon, SwordIcon } from '../icons';
import { T } from '../text';
import { CardHead, Stats } from './Card';
import { CommandList } from './CommandList';
import type { Command } from './commands';
import { UnitPicture } from './Picture';

export interface UnitPanelProps {
  type: UnitTypeId; hp: number; faction: FactionId; commands: Command[]; onCommand: (c: Command) => void;
}

// An enemy unit gets the same card with an empty command list.
export function UnitPanel({ type, hp, faction, commands, onCommand }: UnitPanelProps): ReactElement {
  const def = UNITS[type];
  const mounted = def.traits.includes('mounted');
  const move = def.move + (mounted ? FACTIONS[faction].mountedMoveBonus : 0);
  const scouts = mounted && FACTIONS[faction].scoutingRiders;      // rules 13, a faction rule rather than a trait
  return (
    <section className="panel unit-panel">
      <CardHead picture={<UnitPicture type={type} faction={faction} />} title={T.unit[type].name} faction={faction}>
        <p className="blurb">{T.unit[type].blurb}</p>
      </CardHead>
      <Stats stats={[
        { icon: <HeartIcon />, label: T.ui.health, value: `${hp}/${def.hp}` },
        { icon: <SwordIcon />, label: T.ui.attackStat, value: def.atk },
        { icon: <ShieldIcon />, label: T.ui.defence, value: def.def },
        { icon: <BootIcon />, label: T.ui.movement, value: move },
        { icon: <RangeIcon />, label: T.ui.range, value: def.range },
      ]} />
      {def.traits.length > 0 ? (
        <ul className="traits" aria-label={T.ui.traits}>
          {def.traits.map((t) => <li key={t}><strong>{T.trait[t].name}</strong><span>{T.trait[t].blurb}</span></li>)}
          {scouts ? <li key="scoutingRiders"><strong>{T.ui.scoutingRiders}</strong><span>{T.ui.scoutingRidersBlurb}</span></li> : null}
        </ul>
      ) : null}
      <CommandList commands={commands} onCommand={onCommand} />
    </section>
  );
}
