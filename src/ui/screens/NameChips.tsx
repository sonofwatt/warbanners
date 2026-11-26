import type { ReactElement } from 'react';
import { T, fill } from '../text';

const SHOWN = 6;

// Names typed on this phone before, as buttons under a name field. A name already in a field is left out.
export function NameChips({ names, taken, onPick, testid = 'name-chip' }: {
  names: readonly string[]; taken: readonly string[]; onPick: (name: string) => void; testid?: string;
}): ReactElement | null {
  const shown = names.filter((n) => !taken.includes(n)).slice(0, SHOWN);
  if (shown.length === 0) return null;
  return (
    <div className="chips name-chips" role="group" aria-label={T.stats.recentNames}>
      {shown.map((n) => (
        <button key={n} type="button" className="chip" data-testid={testid} aria-label={fill(T.stats.usedName, { name: n })} onClick={() => onPick(n)}>{n}</button>
      ))}
    </div>
  );
}
