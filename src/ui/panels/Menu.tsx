import { useState } from 'react';
import type { ReactElement } from 'react';
import { T } from '../text';

export interface MenuProps { soundOn: boolean; onToggleSound: () => void; onResign: () => void; onHome: () => void; onClose: () => void }

export function Menu(p: MenuProps): ReactElement {
  const [asking, setAsking] = useState(false);
  return (
    <section className="sheet menu">
      <h2>{T.ui.menu}</h2>
      <button type="button" data-testid="toggle-sound" onClick={p.onToggleSound}>{p.soundOn ? T.ui.soundOn : T.ui.soundOff}</button>
      {asking ? (
        <div className="confirm">
          <p>{T.ui.resignAsk}</p>
          <button type="button" data-testid="resign-yes" onClick={p.onResign}>{T.ui.resignYes}</button>
          <button type="button" data-testid="resign-no" onClick={() => setAsking(false)}>{T.ui.resignNo}</button>
        </div>
      ) : (
        <button type="button" data-testid="resign" onClick={() => setAsking(true)}>{T.ui.resign}</button>
      )}
      <button type="button" data-testid="go-home" onClick={p.onHome}>{T.ui.home}</button>
      <button type="button" data-testid="close-sheet" onClick={p.onClose}>{T.ui.close}</button>
    </section>
  );
}
