import type { ReactElement } from 'react';
import type { FactionId } from '../../engine';
import { T, fill } from '../text';

export interface HudProps {
  name: string; colour: string; faction: FactionId; gold: number; income: number; round: number;
  unitsToAct: number; techReady: boolean; endDisabled?: boolean;
  onOpenTech: () => void; onOpenMenu: () => void; onEndTurn: () => void;
}

export function Hud(p: HudProps): ReactElement {
  const act = p.unitsToAct === 0 ? T.ui.noUnitsCanAct : p.unitsToAct === 1 ? T.ui.oneUnitCanAct : fill(T.ui.unitsCanAct, { n: p.unitsToAct });
  return (
    <header className="hud">
      <div className="hud-who">
        <span className="chip" style={{ background: p.colour }} aria-hidden="true" />
        <strong data-testid="who">{p.name}</strong>
        <span>{T.faction[p.faction]}</span>
      </div>
      <div className="hud-numbers">
        <span><span data-testid="gold">{p.gold}</span> {T.ui.gold.toLowerCase()}</span>
        <span>{`+${p.income}`}</span>
        <span data-testid="turn">{`${T.ui.turn} ${p.round}`}</span>
      </div>
      <div className="hud-buttons">
        <button type="button" data-testid="open-tech" onClick={p.onOpenTech}>
          {T.ui.techs}{p.techReady ? <span className="dot" data-testid="tech-dot" aria-hidden="true" /> : null}
        </button>
        <button type="button" data-testid="open-menu" onClick={p.onOpenMenu}>{T.ui.menu}</button>
      </div>
      <div className="hud-end">
        <small data-testid="can-act">{act}</small>
        <button type="button" data-testid="end-turn" disabled={p.endDisabled === true} onClick={p.onEndTurn}>{T.ui.endTurn}</button>
      </div>
    </header>
  );
}
