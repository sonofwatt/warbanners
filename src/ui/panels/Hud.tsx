import type { CSSProperties, ReactElement } from 'react';
import type { FactionId } from '../../engine';
import { ACCENT, playerColour } from '../art/palette';
import { BannerMark, CoinIcon, FlaskIcon, HourglassIcon, MenuIcon, NextUnitIcon } from '../icons';
import { T, fill } from '../text';

export interface HudProps {
  name: string; colour: string; faction: FactionId; gold: number; income: number; round: number;
  unitsToAct: number; techReady: boolean; endDisabled?: boolean; nextDisabled?: boolean; thinking?: boolean;
  onOpenTech: () => void; onOpenMenu: () => void; onEndTurn: () => void; onNextUnit: () => void;
}

// One strip: who is playing (their banner, name and people), their purse and the turn, then the buttons, with
// Next unit beside End turn and End turn the boldest thing on it. Wraps to two rows at most on a narrow phone.
export function Hud(p: HudProps): ReactElement {
  const act = p.unitsToAct === 0 ? T.ui.noUnitsCanAct : p.unitsToAct === 1 ? T.ui.oneUnitCanAct : fill(T.ui.unitsCanAct, { n: p.unitsToAct });
  // The player's colour comes from the caller; its shade for the button's edge, from the palette.
  const colour = { main: p.colour, dark: playerColour(p.faction).dark };
  const style = { '--player': colour.main, '--player-dark': colour.dark } as CSSProperties;
  return (
    <header className="hud" style={style}>
      <div className="hud-status">
        <div className="hud-who">
          <BannerMark colour={colour} accent={ACCENT[p.faction]} />
          <span className="hud-name">
            <strong data-testid="who">{p.name}</strong>
            <small>{T.faction[p.faction]}</small>
          </span>
        </div>
        <div className="hud-numbers">
          <span className="pill">
            <CoinIcon />
            <span data-testid="gold">{p.gold}</span>
            <span className="vh">{` ${T.ui.gold.toLowerCase()}, `}</span>
            <span className="income">{`+${p.income}`}</span>
          </span>
          <span className="pill turn">
            <HourglassIcon />
            <span data-testid="turn">{`${T.ui.turn} ${p.round}`}</span>
          </span>
        </div>
      </div>
      <div className="hud-actions">
        <div className="hud-buttons">
          <button type="button" className="tool" data-testid="open-tech" aria-label={T.ui.techs} onClick={p.onOpenTech}>
            <FlaskIcon />
            <span className="tool-label" aria-hidden="true">{T.ui.techs}</span>
            {p.techReady ? <span className="dot" data-testid="tech-dot" aria-hidden="true" /> : null}
          </button>
          <button type="button" className="tool" data-testid="open-menu" aria-label={T.ui.menu} onClick={p.onOpenMenu}>
            <MenuIcon />
            <span className="tool-label" aria-hidden="true">{T.ui.menu}</span>
          </button>
        </div>
        <div className="hud-end">
          {p.thinking === true
            ? <small data-testid="thinking" className="can-act some" role="status">{T.ai.thinking}</small>
            : <small data-testid="can-act" className={p.unitsToAct > 0 ? 'can-act some' : 'can-act'}>{act}</small>}
          <button
            type="button" className="tool next-unit" disabled={p.nextDisabled === true} data-testid="next-unit"
            aria-label={T.ui.nextUnit} onClick={p.onNextUnit}
          >
            <NextUnitIcon />
            <span className="tool-label" aria-hidden="true">{T.ui.nextUnit}</span>
          </button>
          <button type="button" className="player end-turn" data-testid="end-turn" disabled={p.endDisabled === true} onClick={p.onEndTurn}>
            {T.ui.endTurn}
          </button>
        </div>
      </div>
    </header>
  );
}
