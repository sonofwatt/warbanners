import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { UNITS } from '../../engine';
import type { FactionId, UnitTypeId } from '../../engine';
import { BootIcon, CoinIcon, HeartIcon, LockIcon, RangeIcon, ShieldIcon, SwordIcon } from '../icons';
import { T } from '../text';
import { Stats } from './Card';
import type { Command } from './commands';
import { UnitPicture } from './Picture';

// A city's units to train: a row of pictures that scrolls sideways. Tapping one opens its card under the row (its
// numbers, what it does and its traits) with the button that trains it; tapping it again closes the card. A unit the
// city cannot train now stays in the row, faded, and its card says why.
export function UnitShop({ commands, faction, onCommand }: { commands: Command[]; faction: FactionId; onCommand: (c: Command) => void }): ReactElement | null {
  const [picked, setPicked] = useState<UnitTypeId | null>(null);
  const shop = useRef<HTMLDivElement>(null);
  // A picked unit's card opens under the row; bring the row and the card's head (its Train button) into view.
  useEffect(() => { if (picked !== null) shop.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, [picked]);
  if (commands.length === 0) return null;
  const chosen = commands.find((c) => c.unit === picked);
  return (
    <div className="shop" ref={shop}>
      <ul className="shop-strip" aria-label={T.ui.trainUnits}>
        {commands.map((c) => {
          const type = c.unit!;
          return (
            <li key={c.id}>
              <button
                type="button" className={`shop-item${c.enabled ? '' : ' unready'}`} data-testid={`shop-${type}`}
                aria-pressed={picked === type} onClick={() => setPicked(picked === type ? null : type)}
              >
                <span className="shop-picture"><UnitPicture type={type} faction={faction} />{c.enabled ? null : <LockIcon />}</span>
                <span className="shop-name">{T.unit[type].name}</span>
                <span className="cost"><CoinIcon />{c.cost}<span className="vh">{` ${T.ui.gold.toLowerCase()}`}</span></span>
              </button>
            </li>
          );
        })}
      </ul>
      {chosen === undefined ? <p className="shop-hint">{T.ui.shopHint}</p> : <ShopCard command={chosen} onCommand={onCommand} />}
    </div>
  );
}

function ShopCard({ command, onCommand }: { command: Command; onCommand: (c: Command) => void }): ReactElement {
  const type = command.unit!;
  const def = UNITS[type];
  return (
    <section className="shop-card" aria-label={T.unit[type].name}>
      <div className="shop-card-top">
        <h3>{T.unit[type].name}</h3>
        <div className="command">
          <button type="button" className="primary" data-testid={`cmd-${command.id}`} disabled={!command.enabled} onClick={() => onCommand(command)}>
            <span className="command-label">{T.ui.train}</span>
            <span className="cost"><CoinIcon />{command.cost}<span className="vh">{` ${T.ui.gold.toLowerCase()}`}</span></span>
          </button>
          {command.why !== null ? <small className="why">{command.why}</small> : null}
        </div>
      </div>
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
