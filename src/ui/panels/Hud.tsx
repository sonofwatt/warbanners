import type { CSSProperties, ReactElement } from 'react';
import type { FactionId } from '../../engine';
import { ACCENT, playerColour } from '../art/palette';
import { BannerMark, ClockIcon, CoinIcon, FlaskIcon, HourglassIcon, MenuIcon, NextUnitIcon } from '../icons';
import { T, fill } from '../text';

export interface HudProps {
  name: string; colour: string; faction: FactionId; gold: number; income: number; round: number;
  unitsToAct: number; techReady: boolean; endDisabled?: boolean; nextDisabled?: boolean; thinking?: boolean;
  // Online: whose turn it is, in place of the units-to-act line, and the turn clock as m:ss (or Paused).
  // `statusName`, when the status names a player, is drawn on a line of its own and cut with an ellipsis if it is
  // long, so the rest of the sentence ("'s turn") is never cut.
  // `statusShort` stands in for the status where the Hud is short of room (the full words stay for screen readers).
  status?: string; statusName?: string; statusShort?: string; clock?: string; clockPaused?: boolean;
  onOpenTech: () => void; onOpenMenu: () => void; onEndTurn: () => void; onNextUnit: () => void;
}

// The status with the player's name in a span of its own: one line, cut at its end when there is no room.
function statusParts(status: string, name: string | undefined): ReactElement | string {
  const at = name === undefined || name === '' ? -1 : status.indexOf(name);
  if (at < 0 || name === undefined) return status;
  return (
    <>
      {status.slice(0, at)}<span className="status-name">{name}</span><span className="status-rest">{status.slice(at + name.length)}</span>
    </>
  );
}

// One strip: who is playing (their banner, name and people), their purse and the turn, then the buttons, with
// Next unit beside End turn and End turn the boldest thing on it. Wraps to two rows at most on a narrow phone.
export function Hud(p: HudProps): ReactElement {
  const act = p.unitsToAct === 0 ? T.ui.noUnitsCanAct : p.unitsToAct === 1 ? T.ui.oneUnitCanAct : fill(T.ui.unitsCanAct, { n: p.unitsToAct });
  // The player's colour comes from the caller; its shade for the button's edge, from the palette.
  const colour = { main: p.colour, dark: playerColour(p.faction).dark };
  const style = { '--player': colour.main, '--player-dark': colour.dark } as CSSProperties;
  return (
    <header className={p.clock !== undefined ? 'hud has-clock' : 'hud'} style={style}>
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
            <span data-testid="turn" className="turn-full">{`${T.ui.turn} ${p.round}`}</span>
            <span className="turn-short" aria-hidden="true">{p.round}</span>
          </span>
          {p.clock !== undefined ? (
            <span className={p.clockPaused === true ? 'pill clock paused' : 'pill clock'}>
              <ClockIcon />
              <span className="vh">{`${T.ui.clockLabel}: `}</span>
              <span data-testid="clock">{p.clock}</span>
            </span>
          ) : null}
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
          {p.status !== undefined
            ? (
              // The sentence is drawn in two parts; the reader hears it whole.
              p.statusShort !== undefined
                ? (
                  <small data-testid="hud-status" className="can-act some hud-turn has-short" role="status" aria-label={p.status} data-short={p.statusShort}>
                    <span className="status-long">{p.status}</span>
                  </small>
                )
                : (
                  <small data-testid="hud-status" className="can-act some hud-turn" role="status" aria-label={p.status}>
                    {statusParts(p.status, p.statusName)}
                  </small>
                )
            )
            : p.thinking === true
            ? <small data-testid="thinking" className="can-act some" role="status">{T.ai.thinking}</small>
            : <small data-testid="can-act" className={p.unitsToAct > 0 ? 'can-act some' : 'can-act'}>{act}</small>}
          <button
            type="button" className="tool next-unit" data-testid="next-unit" disabled={p.nextDisabled === true}
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
