import type { ReactElement } from 'react';
import type { TechId } from '../../engine';
import { CheckIcon, CloseIcon, CoinIcon, FlaskIcon, LockIcon } from '../icons';
import { T } from '../text';
import type { TechRow } from './commands';

const STATUS = { owned: T.ui.statusOwned, ready: T.ui.statusReady, costly: T.ui.statusCostly, locked: T.ui.statusLocked } as const;

function Badge({ row }: { row: TechRow }): ReactElement {
  return (
    <span className="tech-badge" aria-hidden="true">
      {row.status === 'owned' ? <CheckIcon /> : row.status === 'locked' ? <LockIcon /> : <span className="tier">{row.tier}</span>}
    </span>
  );
}

function Price({ n }: { n: number }): ReactElement {
  return <span className="price"><CoinIcon />{n}<span className="vh">{` ${T.ui.gold.toLowerCase()}`}</span></span>;
}

// Four branches, each a ladder of three tiers climbed from the top. A rung shows at a glance whether it is
// known (a tick on green), ready (a gold Research button with its price), too costly now (its price, quiet)
// or locked (a padlock, faded).
export function TechSheet({ rows, onResearch, onClose }: { rows: TechRow[]; onResearch: (t: TechId) => void; onClose: () => void }): ReactElement {
  const branches = [0, 1, 2, 3].map((b) => rows.filter((r) => r.branch === b));
  return (
    <section className="sheet tech-sheet" aria-label={T.ui.techTitle}>
      <div className="sheet-head">
        <h2><FlaskIcon />{T.ui.techTitle}</h2>
        <button type="button" className="quiet" data-testid="close-sheet" onClick={onClose}><CloseIcon /><span className="btn-label">{T.ui.close}</span></button>
      </div>
      <div className="branches">
        {branches.map((branch, b) => (
          <ol className="branch" key={b}>
            {branch.map((r) => (
              <li key={r.tech} className={`tech ${r.status}`} data-testid={`tech-${r.tech}`}>
                <Badge row={r} />
                <div className="tech-info">
                  <strong>{T.tech[r.tech]}</strong>
                  <small>{`${T.ui.unlocks}: ${r.unlocks.join(', ')}`}</small>
                </div>
                {r.status === 'ready' ? (
                  <button type="button" className="primary" data-testid={`research-${r.tech}`} onClick={() => onResearch(r.tech)}>
                    {T.ui.research}<Price n={r.price} />
                  </button>
                ) : (
                  <span className="tech-state">
                    {r.status === 'owned' ? null : <Price n={r.price} />}
                    <small>{STATUS[r.status]}</small>
                  </span>
                )}
              </li>
            ))}
          </ol>
        ))}
      </div>
    </section>
  );
}
