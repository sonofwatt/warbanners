import type { CSSProperties, ReactElement, Ref } from 'react';
import type { FactionId } from '../../engine';
import { ACCENT, playerColour } from '../art/palette';
import { BannerMark, ClockIcon, CoinIcon, FlaskIcon, HourglassIcon, MenuIcon, NextUnitIcon } from '../icons';
import { T, fill } from '../text';

export interface HudProps {
  name: string; colour: string; faction: FactionId; gold: number; income: number; round: number;
  /** The player's shade and accent when they are not the faction's own (the second seat of a mirror match). */
  dark?: string; accent?: string;
  /** rules 8: the gold blockades will cut from the next income (0 or absent: none). */
  blockade?: number;
  thinking?: boolean;
  // Online: whose turn it is, and the turn clock as m:ss (or Paused).
  // `statusName`, when the status names a player, is drawn on a line of its own and cut with an ellipsis if it is
  // long, so the rest of the sentence ("'s turn") is never cut.
  // `statusShort` stands in for the status where the Hud is short of room (the full words stay for screen readers).
  status?: string; statusName?: string; statusShort?: string; clock?: string; clockPaused?: boolean;
  onOpenMenu: () => void;
}

/** The player's colour and its shade, for the buttons drawn in it (End turn). */
function playerStyle(colour: string, faction: FactionId, dark?: string): CSSProperties {
  return { '--player': colour, '--player-dark': dark ?? playerColour(faction).dark } as CSSProperties;
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

// The top bar: the Menu button on the far left, then who is playing (their banner, name and people), their purse
// and the turn, and on the right the line about whose turn it is online or that the AI is thinking. The buttons
// for playing the turn (Tech, Next unit, End turn) sit at the bottom of the screen (ActionBar).
export function Hud(p: HudProps): ReactElement {
  const colour = { main: p.colour, dark: p.dark ?? playerColour(p.faction).dark };
  return (
    <header className={p.clock !== undefined ? 'hud has-clock' : 'hud'} style={playerStyle(p.colour, p.faction, p.dark)}>
      <div className="hud-status">
        <div className="hud-who">
          <button type="button" className="tool menu-button" data-testid="open-menu" aria-label={T.ui.menu} onClick={p.onOpenMenu}>
            <MenuIcon />
          </button>
          <BannerMark colour={colour} accent={p.accent ?? ACCENT[p.faction]} />
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
            {p.blockade !== undefined && p.blockade > 0
              ? <span className="blockade-cut" data-testid="blockade-cut" title={T.ui.blockadeHint(p.blockade)}>{`-${p.blockade}`}</span>
              : null}
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
      {p.status !== undefined || p.thinking === true ? (
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
            : <small data-testid="thinking" className="can-act some" role="status">{T.ai.thinking}</small>}
        </div>
      ) : null}
    </header>
  );
}

export interface ActionBarProps {
  barRef?: Ref<HTMLElement>;
  colour: string; faction: FactionId; dark?: string;
  unitsToAct: number; techReady: boolean; endDisabled?: boolean; nextDisabled?: boolean;
  onOpenTech: () => void; onEndTurn: () => void; onNextUnit: () => void;
}

// The buttons for playing the turn, in one row along the bottom of the screen, each the shape of End turn: Tech
// (with a dot when a tech can be researched), Next unit (with how many units can still act) and End turn, the
// boldest, on the right. A selection's card takes this place while something is selected.
export function ActionBar(p: ActionBarProps): ReactElement {
  const act = p.unitsToAct === 0 ? T.ui.noUnitsCanAct : p.unitsToAct === 1 ? T.ui.oneUnitCanAct : fill(T.ui.unitsCanAct, { n: p.unitsToAct });
  return (
    <nav ref={p.barRef} className="action-bar" data-testid="action-bar" aria-label={T.ui.turnActions} style={playerStyle(p.colour, p.faction, p.dark)}>
      <button type="button" className="bar-button paper" data-testid="open-tech" onClick={p.onOpenTech}>
        <FlaskIcon />
        <span className="bar-label">{T.ui.techs}</span>
        {p.techReady ? <span className="dot" data-testid="tech-dot" aria-hidden="true" /> : null}
      </button>
      <button type="button" className="bar-button paper next-unit" data-testid="next-unit" disabled={p.nextDisabled === true} onClick={p.onNextUnit}>
        <NextUnitIcon />
        <span className="bar-label">{T.ui.nextUnit}</span>
        <span className="vh">{`, ${act}`}</span>
        {p.unitsToAct > 0 ? <span className="unit-count" data-testid="units-to-act" aria-hidden="true">{p.unitsToAct}</span> : null}
      </button>
      {/* End turn stays neutral while a unit can still act, and lights up in the player's colour once none can. */}
      <button
        type="button" className={`bar-button end-turn ${p.unitsToAct > 0 ? 'paper' : 'player'}`} data-testid="end-turn" data-ready={p.unitsToAct > 0 ? undefined : 'true'}
        disabled={p.endDisabled === true} onClick={p.onEndTurn}
      >
        {T.ui.endTurn}
      </button>
    </nav>
  );
}
