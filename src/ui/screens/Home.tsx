import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { installAdvice } from '../../app/platform';
import type { SaveSummary } from '../../app/saves';
import { useApp } from '../../app/useApp';
import { T, fill } from '../text';

export interface HomeProps {
  // Wired by main.tsx; Home asks for a check each time it appears and offers the saved install prompt.
  onCheck?: () => void;
  install?: { ua: string; standalone: boolean; canPrompt: boolean; prompt: () => void };
}

function SaveRow({ save }: { save: SaveSummary }): ReactElement {
  const resume = useApp((s) => s.resume);
  const removeSave = useApp((s) => s.removeSave);
  const [asking, setAsking] = useState(false);
  const [a, b] = save.names, [fa, fb] = save.factions;
  const names = save.current === 0 ? a : b;
  return (
    <li className="save" data-testid="save">
      <p className="save-names">{fill(T.ui.versusLine, { a, fa: T.faction[fa], b, fb: T.faction[fb] })}</p>
      <p className="save-turn">{save.over ? '' : fill(T.ui.turnLine, { n: save.round, name: names })}</p>
      {!save.resumable ? <p className="save-old">{T.ui.fromOlder}</p> : null}
      <div className="save-buttons">
        {save.resumable ? (
          <button type="button" data-testid="continue" onClick={() => resume(save.id)}>{save.over ? T.ui.seeResult : T.ui.continueButton}</button>
        ) : null}
        {asking ? (
          <span className="confirm">
            <span>{T.ui.deleteAsk}</span>
            <button type="button" data-testid="delete-yes" onClick={() => removeSave(save.id)}>{T.ui.deleteYes}</button>
            <button type="button" data-testid="delete-no" onClick={() => setAsking(false)}>{T.ui.deleteNo}</button>
          </span>
        ) : (
          <button type="button" data-testid="delete" onClick={() => setAsking(true)}>{T.ui.deleteButton}</button>
        )}
      </div>
    </li>
  );
}

export function Home({ onCheck, install }: HomeProps): ReactElement {
  const saves = useApp((s) => s.saves);
  const notice = useApp((s) => s.notice);
  const update = useApp((s) => s.update);
  const openSetup = useApp((s) => s.openSetup);
  const dismissNotice = useApp((s) => s.dismissNotice);
  const applyUpdate = useApp((s) => s.applyUpdate);

  useEffect(() => { onCheck?.(); }, [onCheck]);

  const advice = install === undefined ? 'none' : installAdvice(install);
  const sorted = [...saves].sort((x, y) => y.updatedAt - x.updatedAt);
  return (
    <div className="screen home">
      <h1>{T.ui.appName}</h1>
      {notice !== null ? (
        <p className="notice" data-testid="notice" role="status">
          <span>{T.ui[notice]}</span>
          <button type="button" data-testid="dismiss-notice" onClick={dismissNotice}>{T.ui.dismiss}</button>
        </p>
      ) : null}
      <button type="button" className="primary" data-testid="new-match" onClick={openSetup}>{T.ui.newMatch}</button>
      <h2>{T.ui.savedMatches}</h2>
      {sorted.length === 0 ? <p className="muted">{T.ui.noSaves}</p> : <ul className="saves">{sorted.map((s) => <SaveRow key={s.id} save={s} />)}</ul>}
      <div className="home-status">
        {update.updateReady ? (
          <p data-testid="update-ready">
            <span>{T.ui.updateReady}</span>
            <button type="button" data-testid="update" onClick={applyUpdate}>{T.ui.updateButton}</button>
          </p>
        ) : null}
        {update.offlineReady ? <p data-testid="offline-ready" className="muted">{T.ui.offlineReady}</p> : null}
        {advice === 'prompt' ? (
          <p data-testid="install"><button type="button" onClick={install?.prompt}>{T.ui.installButton}</button></p>
        ) : null}
        {advice === 'iosShare' ? <p data-testid="install-ios" className="muted">{T.ui.installIphone}</p> : null}
      </div>
    </div>
  );
}
