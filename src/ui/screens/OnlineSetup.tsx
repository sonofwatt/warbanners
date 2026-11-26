import { useState } from 'react';
import type { ReactElement } from 'react';
import type { FactionId } from '../../engine';
import { useApp } from '../../app/useApp';
import { CLOCK_CHOICES, DEFAULT_CLOCK, MAX_NAME } from '../../online/wire';
import type { ClockSec } from '../../online/wire';
import { ACCENT, playerColour } from '../art/palette';
import { BannerMark, HomeIcon } from '../icons';
import { NameChips } from './NameChips';
import { T, fill } from '../text';
import { NoticeLine } from './NoticeLine';

const FACTIONS: readonly FactionId[] = ['spartans', 'mongols'];

/** A clock choice in words: Off, or "2 min". */
export const clockName = (c: ClockSec): string => (c === 0 ? T.ui.clockOff : fill(T.ui.clockMinutes, { n: c / 60 }));

/** The two sides as a row of chips. */
export function SideChips({ chosen, onPick, label }: { chosen: FactionId; onPick: (f: FactionId) => void; label: string }): ReactElement {
  return (
    <div className="chips" role="group" aria-label={label}>
      {FACTIONS.map((f) => {
        const colour = playerColour(f);
        return (
          <button
            key={f} type="button" className={f === chosen ? 'chip side on' : 'chip side'} aria-pressed={f === chosen}
            data-testid={`side-${f}`} onClick={() => onPick(f)}
          >
            <BannerMark colour={colour} accent={ACCENT[f]} />{T.faction[f]}
          </button>
        );
      })}
    </div>
  );
}

/** The five turn clocks as a row of chips. */
export function ClockChips({ chosen, onPick }: { chosen: ClockSec; onPick: (c: ClockSec) => void }): ReactElement {
  return (
    <div className="chips clock-chips" role="group" aria-label={T.ui.clockLabel}>
      {CLOCK_CHOICES.map((c) => (
        <button
          key={c} type="button" className={c === chosen ? 'chip on' : 'chip'} aria-pressed={c === chosen}
          data-testid="clock-choice" onClick={() => onPick(c)}
        >{clockName(c)}</button>
      ))}
    </div>
  );
}

// Online play, first step: who you are, your side and the turn clock. Then the lobby.
export function OnlineSetup(): ReactElement {
  const createRoom = useApp((s) => s.createRoom);
  const goHome = useApp((s) => s.goHome);
  const notice = useApp((s) => s.notice);
  const dismissNotice = useApp((s) => s.dismissNotice);
  const names = useApp((s) => s.names);
  const [name, setName] = useState(() => names[0] ?? '');
  const [faction, setFaction] = useState<FactionId>('spartans');
  const [clock, setClock] = useState<ClockSec>(DEFAULT_CLOCK);
  const [busy, setBusy] = useState(false);
  const open = (): void => {
    setBusy(true);
    void createRoom({ name: name.trim() === '' ? T.ui.playerOne : name.trim(), faction, clock }).finally(() => setBusy(false));
  };
  return (
    <div className="screen setup online-setup">
      <h1>{T.ui.onlineTitle}</h1>
      <p className="setup-line">{T.ui.needsConnection}</p>
      {notice !== null ? <NoticeLine notice={notice} onDismiss={dismissNotice} /> : null}
      <label>
        <span>{T.ui.yourName}</span>
        <input data-testid="online-name" type="text" maxLength={MAX_NAME} placeholder={T.ui.playerOne} value={name} onChange={(e) => setName(e.target.value)} />
        <NameChips names={names} taken={[name.trim()]} onPick={setName} />
      </label>
      <div className="setup-seat">
        <span>{T.ui.yourFaction}</span>
        <SideChips chosen={faction} onPick={setFaction} label={T.ui.yourFaction} />
      </div>
      <div className="setup-seat">
        <span>{T.ui.clockLabel}</span>
        <ClockChips chosen={clock} onPick={setClock} />
      </div>
      <div className="setup-row">
        <button type="button" className="primary big" data-testid="create-room" disabled={busy} onClick={open}>{T.ui.createRoom}</button>
        <button type="button" data-testid="online-back" onClick={goHome}><HomeIcon />{T.ui.home}</button>
      </div>
    </div>
  );
}
