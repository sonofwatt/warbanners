import { scrollWithin } from '../scrollWithin';
import { useEffect, useRef } from 'react';
import type { MutableRefObject, ReactElement } from 'react';
import { BRANCHES } from '../../engine';
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

function Rung({ r, focus, focused, onResearch }: {
  r: TechRow; focus: TechId | null | undefined; focused: MutableRefObject<HTMLLIElement | null>; onResearch: (t: TechId) => void;
}): ReactElement {
  return (
    <li className={`tech ${r.status}${r.tech === focus ? ' focus' : ''}`} data-testid={`tech-${r.tech}`}
      ref={r.tech === focus ? focused : undefined} aria-current={r.tech === focus ? 'true' : undefined}>
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
  );
}

// rules 8: five branches. Each starts with its column 1 tech, which forks into a top row (units, and the Walls) and a
// bottom row (tile improvements), each climbed left to right on a wide sheet and top to bottom on a narrow one. A rung
// shows at a glance whether it is known (a tick on green), ready (a gold Research button with its price), too costly
// now (its price, quiet) or locked (a padlock, faded). Opened from a command that needs a tech, the sheet scrolls to
// that tech and rings it. A branch with no column 2 yet (Waters) says more is to come.
export function TechSheet({ rows, focus, onResearch, onClose }: {
  rows: TechRow[]; focus?: TechId | null; onResearch: (t: TechId) => void; onClose: () => void;
}): ReactElement {
  const focused = useRef<HTMLLIElement | null>(null);
  useEffect(() => { if (focused.current !== null) scrollWithin(focused.current, 'center'); }, [focus]);
  const branches = BRANCHES.map((b) => ({ b, rows: rows.filter((r) => r.branch === b) })).filter((x) => x.rows.length > 0);
  const rung = (r: TechRow): ReactElement => <Rung key={r.tech} r={r} focus={focus} focused={focused} onResearch={onResearch} />;
  return (
    <section className="sheet tech-sheet" aria-label={T.ui.techTitle}>
      <div className="sheet-head">
        <h2><FlaskIcon />{T.ui.techTitle}</h2>
        <button type="button" className="quiet" data-testid="close-sheet" onClick={onClose}><CloseIcon /><span className="btn-label">{T.ui.close}</span></button>
      </div>
      <div className="branches">
        {branches.map(({ b, rows: br }) => {
          const head = br.filter((r) => r.tier === 1);
          const top = br.filter((r) => r.tier > 1 && r.row !== 'bottom');
          const bottom = br.filter((r) => r.tier > 1 && r.row === 'bottom');
          return (
            <section className="branch" key={b} data-testid={`branch-${b}`} aria-label={T.branch[b]}>
              <h3 className="branch-name">{T.branch[b]}</h3>
              <ol className="rungs head">{head.map(rung)}</ol>
              {top.length + bottom.length === 0 ? <p className="branch-later">{T.ui.branchLater}</p> : (
                <div className="fork">
                  {top.length > 0 ? <ol className="rungs row top" aria-label={T.ui.rowTop}>{top.map(rung)}</ol> : null}
                  {bottom.length > 0 ? <ol className="rungs row bottom" aria-label={T.ui.rowBottom}>{bottom.map(rung)}</ol> : null}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
