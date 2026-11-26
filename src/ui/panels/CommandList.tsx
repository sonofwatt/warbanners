import type { ReactElement } from 'react';
import type { Command } from './commands';
import { CoinIcon, FlaskIcon, ShieldIcon } from '../icons';
import { T } from '../text';

// The buttons for a list of commands. A disabled command stays visible and says why. One that waits only on a
// tech looks disabled but can still be tapped, and opens the tech tree at what it needs.
// `primary` names the command drawn as the card's main button (a city's Train).
export function CommandList({ commands, onCommand, primary }: { commands: Command[]; onCommand: (c: Command) => void; primary?: string }): ReactElement | null {
  if (commands.length === 0) return null;
  return (
    <div className="commands">
      {commands.map((c) => (
        <div className="command" key={c.id}>
          <button type="button" data-testid={`cmd-${c.id}`} disabled={!c.enabled && c.tech === undefined} title={c.hint}
            className={[c.id === primary ? 'primary' : '', !c.enabled && c.tech !== undefined ? 'needs-tech' : '', c.pressed === true ? 'pressed' : ''].join(' ').trim() || undefined}
            aria-pressed={c.pressed === true ? true : undefined}
            onClick={() => onCommand(c)}>
            {c.pressed === true ? <ShieldIcon /> : null}
            <span className="command-label">{c.label}</span>
            {!c.enabled && c.tech !== undefined ? <FlaskIcon /> : null}
            {c.cost !== null ? (
              <span className="cost">
                <CoinIcon />
                {c.cost}
                <span className="vh">{` ${T.ui.gold.toLowerCase()}`}</span>
              </span>
            ) : null}
          </button>
          {c.why !== null ? <small className="why">{c.why}</small> : null}
        </div>
      ))}
    </div>
  );
}
