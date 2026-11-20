import { useState } from 'react';
import type { ReactElement } from 'react';
import { RULES_VERSION } from '../../engine';
import { useApp } from '../../app/useApp';
import type { Refusal } from '../../net/net';
import type { SessionView } from '../../online/session';
import { CODE_LENGTH, isRoomCode, MAX_NAME } from '../../online/wire';
import { HomeIcon, InfoIcon } from '../icons';
import { T, fill } from '../text';
import { NoticeLine } from './NoticeLine';

/** A sentence for every refusal the session can report, naming both rules numbers where it knows them. */
export function failureText(f: Refusal, v: SessionView | null): string {
  if (f === 'notFound') return T.ui.noSuchRoom;
  if (f === 'full') return T.ui.roomFull;
  if (f === 'started') return T.ui.roomStarted;
  if (f === 'offline') return T.ui.needsConnection;
  if (f === 'notSetUp') return T.ui.notSetUp;
  if (f === 'schema') return T.ui.newerBuild;
  if (f === 'version') {
    const theirs = v?.remoteVersion ?? v?.room?.meta.rulesVersion ?? null;
    if (theirs !== null && theirs !== RULES_VERSION) return fill(theirs > RULES_VERSION ? T.ui.newerVersion : T.ui.olderVersion, { theirs, mine: RULES_VERSION });
    return T.ui.rulesDiffer;
  }
  return T.ui.joinRefused;
}

function Problem({ text }: { text: string }): ReactElement {
  return <p className="notice join-problem" data-testid="join-problem" role="status"><InfoIcon /><span>{text}</span></p>;
}

// The room code typed by hand, from Home's "Join with a code". Letters only from the code's own alphabet.
function CodeEntry(): ReactElement {
  const openRoom = useApp((s) => s.openRoom);
  const [code, setCode] = useState('');
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const ok = isRoomCode(clean);
  return (
    <form className="join-form" onSubmit={(e) => { e.preventDefault(); if (ok) openRoom(clean); }}>
      <label>
        <span>{T.ui.codeLabel}</span>
        <input
          data-testid="join-code" className="code-input" type="text" inputMode="text" autoCapitalize="characters" autoComplete="off"
          spellCheck={false} maxLength={CODE_LENGTH + 2} value={clean} onChange={(e) => setCode(e.target.value)}
        />
      </label>
      <button type="submit" className="primary big" data-testid="join-code-go" disabled={!ok}>{T.ui.joinButton}</button>
    </form>
  );
}

// The room's word on whether this phone may join, and the way in: a name for a lobby, a seat for a match under way.
function RoomEntry({ v }: { v: SessionView }): ReactElement {
  const joinAs = useApp((s) => s.joinAs);
  const takeSeat = useApp((s) => s.takeSeat);
  const updateForRoom = useApp((s) => s.updateForRoom);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const busyWhile = (p: Promise<void>): void => { setBusy(true); void p.finally(() => setBusy(false)); };
  const room = v.room;

  if (v.phase === 'version') {
    // Without either number (never expected) the words name no rules, and the update is still offered.
    const known = v.remoteSchema !== null || v.remoteVersion !== null;
    const newer = !known || v.remoteSchema !== null || (v.remoteVersion ?? 0) > RULES_VERSION;
    const text = v.remoteSchema !== null ? T.ui.newerBuild
      : v.remoteVersion === null ? T.ui.rulesDiffer
      : fill(newer ? T.ui.newerVersion : T.ui.olderVersion, { theirs: v.remoteVersion, mine: RULES_VERSION });
    return (
      <>
        <Problem text={text} />
        {newer ? <button type="button" className="primary big" data-testid="go-update" onClick={updateForRoom}>{T.ui.goUpdate}</button> : null}
      </>
    );
  }
  if (v.phase === 'failed') return <Problem text={v.failure !== null ? failureText(v.failure, v) : T.ui.openFailed} />;
  if (v.phase !== 'join' || room === null) return <p className="join-wait" data-testid="connecting">{v.connected ? T.ui.connecting : T.ui.reconnecting}</p>;

  const problem = v.failure !== null ? <Problem text={failureText(v.failure, v)} /> : null;
  if (room.meta.phase === 'lobby') {
    const host = room.seats[0]?.name ?? '';
    return (
      <>
        {problem}
        <p className="setup-line">{fill(T.ui.waitingForHost, { name: host })}</p>
        <form className="join-form" onSubmit={(e) => { e.preventDefault(); busyWhile(joinAs(name.trim() === '' ? T.ui.playerTwo : name.trim())); }}>
          <label>
            <span>{T.ui.yourName}</span>
            <input data-testid="join-name" type="text" maxLength={MAX_NAME} placeholder={T.ui.playerTwo} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="primary big" data-testid="join" disabled={busy}>{T.ui.joinButton}</button>
        </form>
      </>
    );
  }
  // A match under way: the seats whose player is away may be taken back by that player on a new phone.
  const [a, b] = [room.seats[0]?.name ?? '', room.seats[1]?.name ?? ''];
  return (
    <>
      {problem}
      {v.absent.length > 0 ? (
        <>
          <p className="setup-line">{fill(T.ui.areYou, { a, b })}</p>
          <div className="setup-row">
            {v.absent.map((seat) => (
              <button key={seat} type="button" className="primary big" data-testid={`take-seat-${seat}`} disabled={busy} onClick={() => busyWhile(takeSeat(seat))}>
                {fill(T.ui.imName, { name: room.seats[seat]?.name ?? '' })}
              </button>
            ))}
          </div>
        </>
      ) : v.failure === null ? <Problem text={T.ui.roomFull} /> : null}
    </>
  );
}

// Joining a match: by typed code, from a link, or after a reload on a phone that is not (yet) in the room.
export function Join(): ReactElement {
  const online = useApp((s) => s.online);
  const mode = useApp((s) => s.mode);
  const notice = useApp((s) => s.notice);
  const dismissNotice = useApp((s) => s.dismissNotice);
  const goHome = useApp((s) => s.goHome);
  const typing = mode === 'local' && online === null;
  return (
    <div className="screen setup join">
      <h1>{typing ? T.ui.joinWithCode : T.ui.playOnline}</h1>
      {notice !== null ? <NoticeLine notice={notice} onDismiss={dismissNotice} /> : null}
      {online !== null ? <p className="room-code small" aria-label={T.ui.roomCode}>{online.code}</p> : null}
      {typing ? <CodeEntry /> : online === null ? <p className="join-wait" data-testid="connecting">{T.ui.connecting}</p> : <RoomEntry v={online} />}
      <div className="setup-row">
        <button type="button" data-testid="join-back" onClick={goHome}><HomeIcon />{T.ui.home}</button>
      </div>
    </div>
  );
}
