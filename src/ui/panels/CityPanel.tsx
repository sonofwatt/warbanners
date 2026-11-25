import { useState } from 'react';
import type { ReactElement } from 'react';
import type { FactionId, UnitTypeId } from '../../engine';
import { CoinsIcon, PeopleIcon, SproutIcon, StarIcon, WallIcon } from '../icons';
import { T } from '../text';
import { CardHead, Stats } from './Card';
import type { Stat } from './Card';
import { CommandList } from './CommandList';
import type { Command } from './commands';
import { CityPicture } from './Picture';
import { UnitShop } from './UnitShop';

export interface CityPanelProps {
  level: number; walls: boolean; capital?: boolean;
  /** The owner's people, for the picture; the card has no picture without it. */
  faction?: FactionId;
  // Only for the viewer's own city: an enemy city shows just what the board shows (level, walls).
  growth?: number; growthNeeded?: number; units?: number; capacity?: number; income?: number;
  /** rules 8: blockaded, and the gold the blockade will cut from this city's next income. */
  blockade?: number;
  commands: Command[]; onCommand: (c: Command) => void;
}

export function CityPanel(p: CityPanelProps): ReactElement {
  const stats: Stat[] = [{ icon: <StarIcon />, label: T.ui.level, value: p.level }];
  if (p.growth !== undefined && p.growthNeeded !== undefined) stats.push({ icon: <SproutIcon />, label: T.ui.growth, value: `${p.growth}/${p.growthNeeded}` });
  if (p.units !== undefined && p.capacity !== undefined) stats.push({ icon: <PeopleIcon />, label: T.ui.unitsHeld, value: `${p.units}/${p.capacity}` });
  if (p.income !== undefined) stats.push({ icon: <CoinsIcon />, label: T.ui.incomeWord, value: `+${p.income}` });
  if (p.blockade !== undefined) stats.push({ icon: <CoinsIcon />, label: T.ui.blockaded, value: T.ui.blockadeCut(p.blockade) });
  stats.push({ icon: <WallIcon />, label: T.ui.walls, value: p.walls ? T.ui.yes : T.ui.no });
  // Units to train go in the row of pictures; the walls and the level rewards stay buttons in the head. A picked
  // unit's Train button joins them at the top right, where every card keeps its actions.
  const [picked, setPicked] = useState<UnitTypeId | null>(null);
  const train = p.commands.filter((c) => c.unit !== undefined);
  const chosen = train.find((c) => c.unit === picked);
  const others = p.commands.filter((c) => c.unit === undefined);
  const actions = chosen === undefined ? others : [{ ...chosen, label: T.ui.train }, ...others];
  const title = p.capital === true ? T.ui.capitalTitle : T.ui.cityTitle;
  const picture = p.faction === undefined ? null : <CityPicture faction={p.faction} level={p.level} capital={p.capital === true} walls={p.walls} />;
  // The top of the card (what a collapsed card shows): the name, the actions and the row of units to train. The
  // picked unit's card and the city's numbers show when the card is pulled up.
  return (
    <section className="panel city-panel">
      <div className="card-peek">
        {picture !== null
          ? <CardHead picture={picture} title={title} faction={p.faction} actions={<CommandList commands={actions} primary={chosen?.id} onCommand={p.onCommand} />} />
          : <><h2>{title}</h2><CommandList commands={others} onCommand={p.onCommand} /></>}
        {p.faction !== undefined ? <UnitShop part="strip" commands={train} faction={p.faction} picked={picked} onPick={setPicked} /> : null}
      </div>
      <div className="card-more">
        {p.faction !== undefined ? <UnitShop part="details" commands={train} faction={p.faction} picked={picked} onPick={setPicked} /> : null}
        <Stats stats={stats} />
      </div>
    </section>
  );
}
