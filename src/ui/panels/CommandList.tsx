import type { ReactElement } from 'react';
import type { Command } from './commands';
import { CoinIcon } from '../icons';
import { T } from '../text';

// The buttons for a list of commands. A disabled command stays visible and says why.
export function CommandList({ commands, onCommand }: { commands: Command[]; onCommand: (c: Command) => void }): ReactElement | null {
  if (commands.length === 0) return null;
  return (
    <div className="commands">
      {commands.map((c) => (
        <div className="command" key={c.id}>
          <button type="button" data-testid={`cmd-${c.id}`} disabled={!c.enabled} onClick={() => onCommand(c)}>
            <span className="command-label">{c.label}</span>
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
