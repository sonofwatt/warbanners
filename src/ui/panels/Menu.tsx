import { useState } from 'react';
import type { ReactElement } from 'react';
import { CloseIcon, FlagIcon, HomeIcon, MenuIcon, SpeakerIcon } from '../icons';
import { T } from '../text';
import { Version } from '../Version';

export interface MenuProps { soundOn: boolean; onToggleSound: () => void; onResign: () => void; resignDisabled?: boolean; onHome: () => void; onClose: () => void; onlineNote?: string }

export function Menu(p: MenuProps): ReactElement {
  const [asking, setAsking] = useState(false);
  return (
    <section className="sheet menu" aria-label={T.ui.menu}>
      <div className="sheet-head">
        <h2><MenuIcon />{T.ui.menu}</h2>
      </div>
      <button type="button" className="menu-item" data-testid="toggle-sound" aria-pressed={p.soundOn} onClick={p.onToggleSound}>
        <SpeakerIcon on={p.soundOn} />{p.soundOn ? T.ui.soundOn : T.ui.soundOff}
      </button>
      {asking ? (
        <div className="confirm">
          <p>{T.ui.resignAsk}</p>
          <button type="button" className="danger" data-testid="resign-yes" onClick={p.onResign}>{T.ui.resignYes}</button>
          <button type="button" data-testid="resign-no" onClick={() => setAsking(false)}>{T.ui.resignNo}</button>
        </div>
      ) : (
        <button type="button" className="menu-item danger-text" data-testid="resign" disabled={p.resignDisabled === true} onClick={() => setAsking(true)}><FlagIcon />{T.ui.resign}</button>
      )}
      <button type="button" className="menu-item" data-testid="go-home" onClick={p.onHome}><HomeIcon />{T.ui.home}</button>
      {p.onlineNote !== undefined ? <p className="menu-note" data-testid="online-note">{p.onlineNote}</p> : null}
      <button type="button" className="menu-item quiet" data-testid="close-sheet" onClick={p.onClose}><CloseIcon />{T.ui.close}</button>
      <Version as="p" />
    </section>
  );
}
