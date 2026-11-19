import type { ReactElement } from 'react';
import type { TechId } from '../../engine';
import { T } from '../text';
import type { TechRow } from './commands';

const STATUS = { owned: T.ui.statusOwned, ready: T.ui.statusReady, costly: T.ui.statusCostly, locked: T.ui.statusLocked } as const;

export function TechSheet({ rows, onResearch, onClose }: { rows: TechRow[]; onResearch: (t: TechId) => void; onClose: () => void }): ReactElement {
  const branches = [0, 1, 2, 3].map((b) => rows.filter((r) => r.branch === b));
  return (
    <section className="sheet tech-sheet">
      <button type="button" data-testid="close-sheet" onClick={onClose}>{T.ui.close}</button>
      {branches.map((branch, b) => (
        <ol className="branch" key={b}>
          {branch.map((r) => (
            <li key={r.tech} className={`tech ${r.status}`} data-testid={`tech-${r.tech}`}>
              <strong>{T.tech[r.tech]}</strong>
              <span>{`${r.price} ${T.ui.gold.toLowerCase()}`}</span>
              <span>{STATUS[r.status]}</span>
              <small>{`${T.ui.unlocks}: ${r.unlocks.join(', ')}`}</small>
              {r.status === 'ready' ? <button type="button" data-testid={`research-${r.tech}`} onClick={() => onResearch(r.tech)}>{T.ui.research}</button> : null}
            </li>
          ))}
        </ol>
      ))}
    </section>
  );
}
