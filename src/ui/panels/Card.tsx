import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type { FactionId } from '../../engine';
import { playerColour } from '../art/palette';
import { T } from '../text';

// The parts every selection card shares: a head with the picture, the name and a line under it, and a grid of
// numbers, each with a small picture. The stats keep a plain dt and dd per number, so a reader announces the pair.

export function CardHead(p: { picture: ReactElement; title: string; faction?: FactionId; children?: ReactNode }): ReactElement {
  const tag = p.faction === undefined ? null : (
    <span className="tag" style={{ '--tag': playerColour(p.faction).main } as CSSProperties}>{T.faction[p.faction]}</span>
  );
  return (
    <header className="card-head">
      <div className="picture-frame">{p.picture}</div>
      <div className="card-title">
        <h2>{p.title}{tag}</h2>
        {p.children}
      </div>
    </header>
  );
}

export interface Stat { icon: ReactElement; label: string; value: ReactNode }

export function Stats({ stats }: { stats: Stat[] }): ReactElement {
  return (
    <dl className="stats">
      {stats.map((s) => (
        <div className="stat" key={s.label}>
          <dt>{s.icon}{s.label}</dt><dd>{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}
