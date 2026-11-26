import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type { FactionId } from '../../engine';
import { playerColour } from '../art/palette';
import { T } from '../text';

// The parts every selection card shares: a head with the picture, the name and a line under it, and a grid of
// numbers, each with a small picture. The stats keep a plain dt and dd per number, so a reader announces the pair.

// The head row is the picture, the name (with `badge` under it) and, on the right, the card's action buttons; the
// description and anything else in `children` sits under that row, across the card's full width.
// `corners`: small badges laid over the picture's bottom corners (a city's link to its capital, its level).
export function CardHead(p: {
  picture: ReactElement; title: string; faction?: FactionId; badge?: ReactNode; actions?: ReactNode; children?: ReactNode; corners?: ReactNode;
}): ReactElement {
  const tag = p.faction === undefined ? null : (
    <span className="tag" style={{ '--tag': playerColour(p.faction).main } as CSSProperties}>{T.faction[p.faction]}</span>
  );
  return (
    <header className="card-head">
      <div className="card-top">
        <div className="picture-frame">{p.picture}{p.corners}</div>
        <div className="card-title">
          <h2>{p.title}{tag}</h2>
          {p.badge}
        </div>
        {p.actions !== undefined && p.actions !== null ? <div className="card-actions">{p.actions}</div> : null}
      </div>
      {p.children}
    </header>
  );
}

export interface Stat { icon: ReactElement; label: string; value: ReactNode }

// The length of the longest word in a value: the stat's type shrinks to fit that word on one line (theme.css), so a
// narrow card never breaks a word. A value that is not plain text counts as short.
const longestWord = (v: ReactNode): number =>
  typeof v === 'string' || typeof v === 'number' ? Math.max(1, ...String(v).split(/\s+/).map((w) => w.length)) : 1;

export function Stats({ stats }: { stats: Stat[] }): ReactElement {
  return (
    <dl className="stats">
      {stats.map((s) => (
        <div className="stat" key={s.label} style={{ '--chars': longestWord(s.value) } as CSSProperties}>
          <dt>{s.icon}{s.label}</dt><dd>{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}
