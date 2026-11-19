import { useState } from 'react';
import type { ReactElement } from 'react';
import { CONFIG } from '../../engine';
import type { FactionId } from '../../engine';
import { useApp } from '../../app/useApp';
import { T, fill } from '../text';

export const MAX_NAME = 16;

export function Setup(): ReactElement {
  const startMatch = useApp((s) => s.startMatch);
  const goHome = useApp((s) => s.goHome);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [swapped, setSwapped] = useState(false);

  const a = first.trim() === '' ? T.ui.playerOne : first.trim();
  const b = second.trim() === '' ? T.ui.playerTwo : second.trim();
  const factions: [FactionId, FactionId] = swapped ? ['mongols', 'spartans'] : ['spartans', 'mongols'];
  const spartanName = swapped ? b : a;
  const extra = CONFIG.startGold[1] - CONFIG.startGold[0];
  return (
    <div className="screen setup">
      <h1>{T.ui.setupTitle}</h1>
      <label>
        <span>{fill(T.ui.nameLabel, { n: 1 })}</span>
        <input data-testid="name-0" type="text" maxLength={MAX_NAME} placeholder={T.ui.playerOne} value={first} onChange={(e) => setFirst(e.target.value)} />
      </label>
      <label>
        <span>{fill(T.ui.nameLabel, { n: 2 })}</span>
        <input data-testid="name-1" type="text" maxLength={MAX_NAME} placeholder={T.ui.playerTwo} value={second} onChange={(e) => setSecond(e.target.value)} />
      </label>
      <p data-testid="spartans-line">{fill(T.ui.spartansPlay, { name: spartanName })}</p>
      <button type="button" data-testid="swap" onClick={() => setSwapped(!swapped)}>{T.ui.swapFactions}</button>
      <p className="muted">{fill(T.ui.setupLine, { first: a, second: b, n: extra })}</p>
      <button type="button" className="primary" data-testid="start" onClick={() => startMatch({ names: [a, b], factions })}>{T.ui.start}</button>
      <button type="button" data-testid="setup-back" onClick={goHome}>{T.ui.home}</button>
    </div>
  );
}
