import type { ReactElement } from 'react';
import { UNITS } from '../../engine';
import type { FactionId, UnitTypeId } from '../../engine';
import { BootIcon, CoinIcon, HeartIcon, LockIcon, RangeIcon, ShieldIcon, SwordIcon } from '../icons';
import { T } from '../text';
import { Stats } from './Card';
import type { Command } from './commands';
import { UnitPicture } from './Picture';

// A city's units to train: a row of pictures that scrolls sideways. Tapping one opens its card under the row (its
// numbers, what it does and its traits) and puts its Train button in the city card's head (CityPanel); tapping it
// again closes the card. A unit the city cannot train now stays in the row, faded, and its card says why.
export function UnitShop({ commands, faction, picked, onPick }: {
  commands: Command[]; faction: FactionId; picked: UnitTypeId | null; onPick: (t: UnitTypeId | null) => void;
}): ReactElement | null {
  if (commands.length === 0) return null;
  const chosen = commands.find((c) => c.unit === picked);
  return (
    <div className="shop">
      <ul className="shop-strip" aria-label={T.ui.trainUnits}>
        {commands.map((c) => {
          const type = c.unit!;
          return (
            <li key={c.id}>
              <button
                type="button" className={`shop-item${c.enabled ? '' : ' unready'}`} data-testid={`shop-${type}`}
                aria-pressed={picked === type} onClick={() => onPick(picked === type ? null : type)}
              >
                <span className="shop-picture"><UnitPicture type={type} faction={faction} />{c.enabled ? null : <LockIcon />}</span>
                <span className="shop-name">{T.unit[type].name}</span>
                <span className="cost"><CoinIcon />{c.cost}<span className="vh">{` ${T.ui.gold.toLowerCase()}`}</span></span>
              </button>
            </li>
          );
        })}
      </ul>
      {chosen === undefined ? <p className="shop-hint">{T.ui.shopHint}</p> : <ShopCard command={chosen} />}
    </div>
  );
}

function ShopCard({ command }: { command: Command }): ReactElement {
  const type = command.unit!;
  const def = UNITS[type];
  return (
    <section className="shop-card" aria-label={T.unit[type].name}>
      <h3>{T.unit[type].name}</h3>
      <p className="blurb">{T.unit[type].blurb}</p>
      <Stats stats={[
        { icon: <HeartIcon />, label: T.ui.health, value: def.hp },
        { icon: <SwordIcon />, label: T.ui.attackStat, value: def.atk },
        { icon: <ShieldIcon />, label: T.ui.defence, value: def.def },
        { icon: <BootIcon />, label: T.ui.movement, value: def.move },
        { icon: <RangeIcon />, label: T.ui.range, value: def.range },
      ]} />
      {def.traits.length > 0 ? (
        <ul className="traits" aria-label={T.ui.traits}>
          {def.traits.map((t) => <li key={t}><strong>{T.trait[t].name}</strong><span>{T.trait[t].blurb}</span></li>)}
        </ul>
      ) : null}
    </section>
  );
}
