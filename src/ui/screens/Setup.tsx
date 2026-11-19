import { useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { CONFIG } from '../../engine';
import type { FactionId, UnitTypeId } from '../../engine';
import { useApp } from '../../app/useApp';
import { FIGURES } from '../art/factionUnits';
import { ACCENT, playerColour } from '../art/palette';
import { TileBase } from '../art/tiles';
import { HomeIcon, SwapIcon } from '../icons';
import { T, fill } from '../text';

export const MAX_NAME = 16;

// Each people shown by one of its own soldiers, in its colours.
const FACE: Record<FactionId, UnitTypeId> = { spartans: 'hoplite', mongols: 'horseArcher' };

function FactionCard({ faction, name, first }: { faction: FactionId; name: string; first: boolean }): ReactElement {
  const colour = playerColour(faction);
  return (
    <div className="faction-card" style={{ '--player': colour.main, '--player-dark': colour.dark } as CSSProperties}>
      <svg className="picture" viewBox="-31 -40 62 66" aria-hidden="true" focusable="false">
        <TileBase ground="grass" />
        {FIGURES[FACE[faction]]({ colour, accent: ACCENT[faction] })}
      </svg>
      <span className="faction-name">{T.faction[faction]}</span>
      <strong className="faction-player">{name}</strong>
      {first ? <small className="faction-first">{T.ui.movesFirst}</small> : null}
    </div>
  );
}

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
      <div className="setup-names">
        <label>
          <span>{fill(T.ui.nameLabel, { n: 1 })}</span>
          <input data-testid="name-0" type="text" maxLength={MAX_NAME} placeholder={T.ui.playerOne} value={first} onChange={(e) => setFirst(e.target.value)} />
        </label>
        <label>
          <span>{fill(T.ui.nameLabel, { n: 2 })}</span>
          <input data-testid="name-1" type="text" maxLength={MAX_NAME} placeholder={T.ui.playerTwo} value={second} onChange={(e) => setSecond(e.target.value)} />
        </label>
      </div>
      <div className="setup-factions">
        <FactionCard faction="spartans" name={spartanName} first={!swapped} />
        <button type="button" className="swap" data-testid="swap" aria-label={T.ui.swapFactions} onClick={() => setSwapped(!swapped)}>
          <SwapIcon />
        </button>
        <FactionCard faction="mongols" name={swapped ? a : b} first={swapped} />
      </div>
      <p className="vh" data-testid="spartans-line" aria-live="polite">{fill(T.ui.spartansPlay, { name: spartanName })}</p>
      <p className="setup-line">{fill(T.ui.setupLine, { first: a, second: b, n: extra })}</p>
      <div className="setup-row">
        <button type="button" className="primary big" data-testid="start" onClick={() => startMatch({ names: [a, b], factions })}>{T.ui.start}</button>
        <button type="button" data-testid="setup-back" onClick={goHome}><HomeIcon />{T.ui.home}</button>
      </div>
    </div>
  );
}
