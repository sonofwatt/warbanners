import { useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { CONFIG, FACTIONS } from '../../engine';
import type { FactionId, UnitTypeId } from '../../engine';
import type { SecondSeat } from '../../app/store';
import { useApp } from '../../app/useApp';
import { FIGURES } from '../art/factionUnits';
import { seatAccent, seatColour } from '../art/palette';
import { TileBase } from '../art/tiles';
import { HomeIcon, SwapIcon } from '../icons';
import { MAX_NAME } from '../../online/wire';
import { NameChips } from './NameChips';
import { AdvancedSection } from './Advanced';
import { DEFAULT_ADVANCED } from '../../app/advanced';
import type { Advanced } from '../../app/advanced';
import { T, fill } from '../text';

// Each people shown by one of its own soldiers, in its colours.
const FACE: Record<FactionId, UnitTypeId> = { spartans: 'hoplite', mongols: 'horseArcher', woodland: 'skirmisher' };

// A seat's card: the people it leads in the colours it will play in (the second seat of a mirror match has its own).
function FactionCard({ picks, seat, name }: { picks: readonly [FactionId, FactionId]; seat: 0 | 1; name: string }): ReactElement {
  const faction = picks[seat];
  const colour = seatColour(picks, seat);
  return (
    <div className="faction-card" style={{ '--player': colour.main, '--player-dark': colour.dark } as CSSProperties}>
      <svg className="picture" viewBox="-31 -40 62 66" aria-hidden="true" focusable="false">
        <TileBase ground="grass" />
        {FIGURES[FACE[faction]]({ colour, accent: seatAccent(picks, seat) })}
      </svg>
      <span className="faction-name">{T.faction[faction]}</span>
      <strong className="faction-player">{name}</strong>
      {seat === 0 ? <small className="faction-first">{T.ui.movesFirst}</small> : null}
    </div>
  );
}

// Who moves first, and the second player's extra start gold when there is any.
export const setupLine = (first: string, second: string, extra: number): string =>
  extra === 0 ? fill(T.ui.firstMoves, { first }) : fill(T.ui.setupLine, { first, second, n: extra });

const PEOPLES = Object.keys(FACTIONS) as FactionId[];

// The people a seat leads: one chip each. Both seats may pick the same one (a mirror match).
function FactionChips({ seat, chosen, onPick }: { seat: 0 | 1; chosen: FactionId; onPick: (f: FactionId) => void }): ReactElement {
  const label = `faction-label-${seat}`;
  return (
    <div className="chips seat-factions" role="radiogroup" aria-labelledby={label}>
      <span id={label} className="vh">{fill(T.ui.factionOf, { n: seat + 1 })}</span>
      {PEOPLES.map((f) => (
        <button
          key={f} type="button" role="radio" aria-checked={f === chosen} className={f === chosen ? 'chip on' : 'chip'}
          data-testid={`faction-${seat}-${f}`} onClick={() => onPick(f)}
        >{T.faction[f]}</button>
      ))}
    </div>
  );
}

const SEATS: readonly SecondSeat[] = ['human', 'easy', 'normal', 'hard', 'adaptive'];
const seatLabel = (s: SecondSeat): string => (s === 'human' ? T.ui.person : T.ai.name[s]);

export function Setup(): ReactElement {
  const startMatch = useApp((s) => s.startMatch);
  const goHome = useApp((s) => s.goHome);
  const names = useApp((s) => s.names);
  const [first, setFirst] = useState(() => names[0] ?? '');
  const [second, setSecond] = useState('');
  const [seat, setSeat] = useState<SecondSeat>('human');
  const [picks, setPicks] = useState<readonly [FactionId, FactionId]>(['spartans', 'mongols']);
  const [advanced, setAdvanced] = useState<Advanced>(DEFAULT_ADVANCED);

  const a = first.trim() === '' ? T.ui.playerOne : first.trim();
  const b = seat !== 'human' ? T.ai.name[seat] : second.trim() === '' ? T.ui.playerTwo : second.trim();
  const pick = (seat: 0 | 1, f: FactionId): void => setPicks(seat === 0 ? [f, picks[1]] : [picks[0], f]);
  const extra = CONFIG.startGold[1] - CONFIG.startGold[0];
  return (
    <div className="screen setup">
      <h1>{T.ui.setupTitle}</h1>
      <div className="setup-names">
        <label>
          <span>{fill(T.ui.nameLabel, { n: 1 })}</span>
          <input data-testid="name-0" type="text" maxLength={MAX_NAME} placeholder={T.ui.playerOne} value={first} onChange={(e) => setFirst(e.target.value)} />
          <NameChips names={names} taken={[first.trim(), second.trim()]} onPick={setFirst} testid="name-chip-0" />
        </label>
        {seat === 'human' ? (
          <label>
            <span>{fill(T.ui.nameLabel, { n: 2 })}</span>
            <input data-testid="name-1" type="text" maxLength={MAX_NAME} placeholder={T.ui.playerTwo} value={second} onChange={(e) => setSecond(e.target.value)} />
            <NameChips names={names} taken={[first.trim(), second.trim()]} onPick={setSecond} testid="name-chip-1" />
          </label>
        ) : null}
      </div>
      <div className="setup-seat">
        <span id="second-label">{T.ui.secondPlayer}</span>
        <div className="chips" role="radiogroup" aria-labelledby="second-label">
          {SEATS.map((s) => (
            <button
              key={s} type="button" role="radio" aria-checked={s === seat} className={s === seat ? 'chip on' : 'chip'}
              data-testid={`second-${s}`} onClick={() => setSeat(s)}
            >{seatLabel(s)}</button>
          ))}
        </div>
      </div>
      <div className="setup-factions">
        <div className="seat">
          <FactionCard picks={picks} seat={0} name={a} />
          <FactionChips seat={0} chosen={picks[0]} onPick={(f) => pick(0, f)} />
        </div>
        <button type="button" className="swap" data-testid="swap" aria-label={T.ui.swapFactions} onClick={() => setPicks([picks[1], picks[0]])}>
          <SwapIcon />
        </button>
        <div className="seat">
          <FactionCard picks={picks} seat={1} name={b} />
          <FactionChips seat={1} chosen={picks[1]} onPick={(f) => pick(1, f)} />
        </div>
      </div>
      <p className="vh" data-testid="factions-line" aria-live="polite">{fill(T.ui.factionsLine, { a, fa: T.faction[picks[0]], b, fb: T.faction[picks[1]] })}</p>
      <p className="setup-line">{setupLine(a, b, extra)}</p>
      <AdvancedSection value={advanced} onChange={setAdvanced} />
      <div className="setup-row">
        <button type="button" className="primary big" data-testid="start" onClick={() => startMatch({ names: [a, b], factions: [picks[0], picks[1]], second: seat, advanced })}>{T.ui.start}</button>
        <button type="button" data-testid="setup-back" onClick={goHome}><HomeIcon />{T.ui.home}</button>
      </div>
    </div>
  );
}
