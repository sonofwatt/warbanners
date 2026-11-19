import type { ReactElement } from 'react';
import { roundOf } from '../../app/record';
import { useApp } from '../../app/useApp';
import { T, fill } from '../text';

export function Result(): ReactElement | null {
  const record = useApp((s) => s.record);
  const state = useApp((s) => s.state);
  const goHome = useApp((s) => s.goHome);
  if (record === null || state === null || state.winner === null) return null;
  const resigned = record.actions[record.actions.length - 1]?.type === 'resign';
  const winner = record.players[state.winner]?.name ?? '';
  return (
    <div className="screen result">
      <h1 data-testid="winner">{fill(T.ui.wins, { name: winner })}</h1>
      <p>{fill(T.ui.endedOn, { n: roundOf(state) })}</p>
      <p>{resigned ? T.ui.byResignation : T.ui.byLastCity}</p>
      <button type="button" className="primary" data-testid="result-home" onClick={goHome}>{T.ui.homeButton}</button>
    </div>
  );
}
