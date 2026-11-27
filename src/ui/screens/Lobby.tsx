import { useEffect, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import type { PlayerId } from '../../engine';
import { useApp } from '../../app/useApp';
import { factionsFor } from '../../online/wire';
import type { Room } from '../../online/wire';
import { seatAccent, seatColour } from '../art/palette';
import { BannerMark, HomeIcon, InfoIcon } from '../icons';
import { T, fill } from '../text';
import { failureText } from './Join';
import { NoticeLine } from './NoticeLine';
import { clockName, ClockChips, SideChips, guestAfterHostPick } from './OnlineSetup';
import { AdvancedSection } from './Advanced';
import { DEFAULT_ADVANCED } from '../../app/advanced';
import type { Advanced } from '../../app/advanced';

const COPIED_MS = 2500;

function Seat({ room, seat, mine }: { room: Room; seat: PlayerId; mine: boolean }): ReactElement {
  const factions = factionsFor(room.meta.hostFaction, room.meta.guestFaction);
  const faction = factions[seat] ?? room.meta.hostFaction;
  // Seat colours, so a mirror room shows two (rules 11)
  const colour = seatColour(factions, seat);
  const who = room.seats[seat] ?? null;
  const style = { '--player': colour.main, '--player-dark': colour.dark } as CSSProperties;
  return (
    <li className={who === null ? 'lobby-seat open' : 'lobby-seat'} style={style} data-testid={`lobby-seat-${seat}`}>
      <BannerMark colour={colour} accent={seatAccent(factions, seat)} />
      <span className="lobby-seat-text">
        <strong>{who === null ? T.ui.seatOpen : who.name}</strong>
        <small>{T.faction[faction]}</small>
      </span>
      {mine ? <span className="lobby-you">{T.ui.youTag}</span> : null}
    </li>
  );
}

// Sends the invite: the share sheet where the phone has one (closing it is the player's choice, not a failure),
// otherwise the link goes on the clipboard.
async function share(link: string): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: T.ui.appName, text: T.ui.inviteText, url: link });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    return 'copied';
  } catch {
    return 'failed';
  }
}

// The room before the match: its code in big letters, the invite, both seats and the clock. The host can still
// change their side and the clock, and starts the match once both seats are taken; the guest waits.
export function Lobby(): ReactElement | null {
  const online = useApp((s) => s.online);
  const link = useApp((s) => s.inviteLink);
  const setLobby = useApp((s) => s.setLobby);
  const startOnline = useApp((s) => s.startOnline);
  const goHome = useApp((s) => s.goHome);
  const notice = useApp((s) => s.notice);
  const dismissNotice = useApp((s) => s.dismissNotice);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [advanced, setAdvanced] = useState<Advanced>(DEFAULT_ADVANCED);
  const [guestTouched, setGuestTouched] = useState(false);   // the host has picked the guest's side in this lobby
  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);
  if (online === null || online.room === null) return null;
  const room = online.room;
  const host = online.hostIsMe;
  const full = room.seats[0] !== null && room.seats[1] !== null;
  const shareLink = link ?? `${typeof location === 'undefined' ? '' : location.origin + location.pathname}?room=${room.code}`;
  const onShare = (): void => { void share(shareLink).then((r) => { setCopied(r === 'copied'); setCopyFailed(r === 'failed'); }); };
  return (
    <div className="screen setup lobby">
      <h1>{T.ui.onlineTitle}</h1>
      {notice !== null ? <NoticeLine notice={notice} onDismiss={dismissNotice} /> : null}
      {!online.connected ? <p className="notice" role="status"><InfoIcon /><span>{T.ui.reconnecting}</span></p> : null}
      <div className="lobby-code">
        <span>{T.ui.roomCode}</span>
        <strong className="room-code" data-testid="room-code">{room.code}</strong>
        <button type="button" className="primary" data-testid="share-invite" onClick={onShare}>{T.ui.shareInvite}</button>
        {copied ? <small className="copied" role="status" data-testid="copied">{T.ui.copied}</small> : null}
        {copyFailed ? <small className="copy-failed" role="status" data-testid="copy-failed">{T.ui.copyFailed}</small> : null}
      </div>
      <ul className="lobby-seats">
        <Seat room={room} seat={0} mine={online.mySeat === 0} />
        <Seat room={room} seat={1} mine={online.mySeat === 1} />
      </ul>
      {host ? (
        <>
          <div className="setup-seat">
            <span>{T.ui.yourFaction}</span>
            <SideChips chosen={room.meta.hostFaction} onPick={(f) => setLobby({ hostFaction: f, guestFaction: guestAfterHostPick(f, factionsFor(room.meta.hostFaction, room.meta.guestFaction)[1], guestTouched) })} label={T.ui.yourFaction} />
          </div>
          <div className="setup-seat">
            <span>{T.ui.guestFaction}</span>
            <SideChips chosen={factionsFor(room.meta.hostFaction, room.meta.guestFaction)[1]} onPick={(f) => { setGuestTouched(true); setLobby({ hostFaction: room.meta.hostFaction, guestFaction: f }); }} label={T.ui.guestFaction} seat={1} />
          </div>
          <div className="setup-seat">
            <span>{T.ui.clockLabel}</span>
            <ClockChips chosen={room.meta.clock} onPick={(c) => setLobby({ clock: c })} />
          </div>
          <AdvancedSection value={advanced} onChange={setAdvanced} />
        </>
      ) : <p className="setup-line" data-testid="lobby-clock">{fill(T.ui.clockShort, { clock: clockName(room.meta.clock) })}</p>}
      {online.failure !== null ? <p className="notice" role="status"><InfoIcon /><span>{failureText(online.failure, online)}</span></p> : null}
      <p className="setup-line lobby-wait" role="status">
        {!full ? T.ui.waitingForGuest : host ? null : fill(T.ui.waitingForHost, { name: room.seats[0]?.name ?? '' })}
      </p>
      <div className="setup-row">
        {host && full ? <button type="button" className="primary big" data-testid="start-online" onClick={() => startOnline(advanced)}>{T.ui.startOnline}</button> : null}
        <button type="button" data-testid="lobby-home" onClick={goHome}><HomeIcon />{T.ui.home}</button>
      </div>
    </div>
  );
}
