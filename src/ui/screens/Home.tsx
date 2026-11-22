import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { installAdvice } from '../../app/platform';
import type { OnlineEntry } from '../../app/onlineList';
import type { SaveSummary } from '../../app/saves';
import { useApp } from '../../app/useApp';
import { ACCENT, playerColour } from '../art/palette';
import { BannerMark, BannerTile, InfoIcon } from '../icons';
import { T, fill } from '../text';
import { HomeScene } from './HomeScene';
import { NoticeLine } from './NoticeLine';

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
      <div className="save-banners" aria-hidden="true">
        <BannerMark colour={playerColour(fa)} accent={ACCENT[fa]} />
        <BannerMark colour={playerColour(fb)} accent={ACCENT[fb]} />
      </div>
      <div className="save-text">
        <p className="save-names">{fill(T.ui.versusLine, { a, fa: T.faction[fa], b, fb: T.faction[fb] })}</p>
        {save.over ? null : <p className="save-turn">{fill(T.ui.turnLine, { n: save.round, name: names })}</p>}
        {!save.resumable ? <p className="save-old">{T.ui.fromOlder}</p> : null}
      </div>
      <div className="save-buttons">
        {save.resumable ? (
          <button type="button" className="primary" data-testid="continue" onClick={() => resume(save.id)}>{save.over ? T.ui.seeResult : T.ui.continueButton}</button>
        ) : null}
        {asking ? (
          <span className="confirm">
            <span>{T.ui.deleteAsk}</span>
            <button type="button" className="danger" data-testid="delete-yes" onClick={() => removeSave(save.id)}>{T.ui.deleteYes}</button>
            <button type="button" data-testid="delete-no" onClick={() => setAsking(false)}>{T.ui.deleteNo}</button>
          </span>
        ) : (
          <button type="button" className="quiet danger-text" data-testid="delete" onClick={() => setAsking(true)}>{T.ui.deleteButton}</button>
        )}
      </div>
    </li>
  );
}

// One online match this phone knows, in the same card as a save: who it is with, whose turn, and the way back in.
function OnlineRow({ entry }: { entry: OnlineEntry }): ReactElement {
  const openRoom = useApp((s) => s.openRoom);
  const forgetRoom = useApp((s) => s.forgetRoom);
  const [asking, setAsking] = useState(false);
  const [fa, fb] = entry.factions;
  const other = entry.names[entry.seat === 0 ? 1 : 0] ?? '';
  const toMove = entry.names[entry.current] ?? '';
  return (
    <li className="save online-row" data-testid="online-row">
      <div className="save-banners" aria-hidden="true">
        <BannerMark colour={playerColour(fa)} accent={ACCENT[fa]} />
        <BannerMark colour={playerColour(fb)} accent={ACCENT[fb]} />
      </div>
      <div className="save-text">
        <p className="save-names">{other === '' ? T.ui.onlineLobby : fill(T.ui.onlineWith, { name: other })}</p>
        {entry.over || other === '' ? null : <p className="save-turn">{fill(T.ui.turnLine, { n: entry.round, name: toMove })}</p>}
      </div>
      <div className="save-buttons">
        <button type="button" className="primary" data-testid="online-continue" onClick={() => openRoom(entry.code)}>{entry.over ? T.ui.seeResult : T.ui.continueButton}</button>
        {asking ? (
          <span className="confirm">
            <span>{T.ui.forgetAsk}</span>
            <button type="button" className="danger" data-testid="forget-yes" onClick={() => forgetRoom(entry.code)}>{T.ui.forgetYes}</button>
            <button type="button" data-testid="forget-no" onClick={() => setAsking(false)}>{T.ui.deleteNo}</button>
          </span>
        ) : (
          <button type="button" className="quiet danger-text" data-testid="forget" onClick={() => setAsking(true)}>{T.ui.forgetButton}</button>
        )}
      </div>
    </li>
  );
}

// Re-reads the connection when the browser says it changed, so the online buttons wake up without a reload.
function useConnectionChanges(): void {
  const [, bump] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const on = (): void => bump((n) => n + 1);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); };
  }, []);
}

export function Home({ onCheck, install }: HomeProps): ReactElement {
  const saves = useApp((s) => s.saves);
  const notice = useApp((s) => s.notice);
  const update = useApp((s) => s.update);
  const openSetup = useApp((s) => s.openSetup);
  const dismissNotice = useApp((s) => s.dismissNotice);
  const applyUpdate = useApp((s) => s.applyUpdate);
  const onlineList = useApp((s) => s.onlineList);
  const openOnline = useApp((s) => s.openOnline);
  const openJoin = useApp((s) => s.openJoin);
  const onlineBlocked = useApp((s) => s.onlineBlocked);
  useConnectionChanges();

  useEffect(() => { onCheck?.(); }, [onCheck]);

  const advice = install === undefined ? 'none' : installAdvice(install);
  const sorted = [...saves].sort((x, y) => y.updatedAt - x.updatedAt);
  const blocked = onlineBlocked();
  // The update notice names the online match it would put at risk.
  const other = (e: OnlineEntry): string => e.names[e.seat === 0 ? 1 : 0] ?? '';
  const going = onlineList.find((e) => !e.over && other(e) !== '');
  const goingWith = going === undefined ? '' : other(going);
  return (
    <div className="screen home">
      <header className="home-hero">
        <BannerTile colour={playerColour('spartans')} accent={ACCENT.spartans} />
        <div>
          <h1>{T.ui.appName}</h1>
          <p className="tagline">{T.ui.tagline}</p>
          <details className="whats-new"><summary>{T.ui.whatsNewLabel}</summary><p>{T.ui.whatsNew}</p></details>
        </div>
      </header>
      {notice === 'updateDuringOnline' ? (
        <NoticeLine
          notice={notice} onDismiss={dismissNotice} values={{ name: goingWith }}
          text={going === undefined ? T.ui.updateDuringLobby : undefined}
          action={{ label: T.ui.updateButton, testid: 'update-anyway', onClick: () => applyUpdate(true) }}
        />
      ) : notice !== null ? <NoticeLine notice={notice} onDismiss={dismissNotice} /> : null}
      <button type="button" className="primary big" data-testid="new-match" onClick={openSetup}>{T.ui.newMatch}</button>
      <div className="home-online">
        <button type="button" className="paper" data-testid="play-online" disabled={blocked !== null} onClick={openOnline}>{T.ui.playOnline}</button>
        <button type="button" className="paper" data-testid="join-with-code" disabled={blocked !== null} onClick={openJoin}>{T.ui.joinWithCode}</button>
      </div>
      {blocked !== null ? <p className="hint" data-testid="online-why">{T.ui[blocked]}</p> : null}
      <h2>{T.ui.savedMatches}</h2>
      {sorted.length === 0 ? <p className="empty">{T.ui.noSaves}</p> : <ul className="saves">{sorted.map((s) => <SaveRow key={s.id} save={s} />)}</ul>}
      {onlineList.length > 0 ? (
        <>
          <h2>{T.ui.onlineMatches}</h2>
          <ul className="saves">{onlineList.map((e) => <OnlineRow key={e.code} entry={e} />)}</ul>
        </>
      ) : null}
      <HomeScene />
      <div className="home-status">
        {update.updateReady ? (
          <p className="notice" data-testid="update-ready">
            <InfoIcon />
            <span>{T.ui.updateReady}</span>
            <button type="button" className="primary" data-testid="update" onClick={() => applyUpdate()}>{T.ui.updateButton}</button>
          </p>
        ) : null}
        {update.offlineReady ? <p data-testid="offline-ready" className="hint">{T.ui.offlineReady}</p> : null}
        {advice === 'prompt' ? (
          <p className="notice" data-testid="install"><InfoIcon /><span>{fill(T.ui.installHint, { name: T.ui.appName })}</span><button type="button" onClick={install?.prompt}>{T.ui.installButton}</button></p>
        ) : null}
        {advice === 'iosShare' ? <p data-testid="install-ios" className="hint">{T.ui.installIphone}</p> : null}
      </div>
    </div>
  );
}
