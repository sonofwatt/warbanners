import { useEffect, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { useApp } from '../../app/useApp';
import { seatAccent, seatColour } from '../art/palette';
import { BannerTile } from '../icons';
import { play } from '../sound';
import { T, fill } from '../text';
import { END_TURN_LOCK_MS } from './Match';
import { NoticeLine } from './NoticeLine';

// The curtain. It draws a name, a colour and the player's banner, and nothing from the match: no board, no
// digest, no numbers. A notice about saving may show: it tells nothing about the match.
export function Pass(): ReactElement | null {
  const name = useApp((s) => (s.state === null || s.record === null ? null : s.record.players[s.state.current]?.name ?? null));
  const faction = useApp((s) => (s.state === null ? null : s.state.players[s.state.current]?.faction ?? null));
  // The player's own colours: the second seat of a mirror match has its own (seatColour).
  const current = useApp((s) => (s.state === null ? null : s.state.current));
  const f0 = useApp((s) => s.state?.players[0]?.faction ?? null);
  const f1 = useApp((s) => s.state?.players[1]?.faction ?? null);
  const seats = f0 === null || f1 === null ? null : [f0, f1];
  const seat = seats === null || current === null ? null : seatColour(seats, current);
  const accent = seats === null || current === null ? '' : seatAccent(seats, current);
  const ready = useApp((s) => s.ready);
  const notice = useApp((s) => s.notice);
  const dismissNotice = useApp((s) => s.dismissNotice);
  // The button waits a moment after the curtain appears, so a stray tap from the player who just ended the
  // turn cannot lift it on the next player's view.
  const [locked, setLocked] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLocked(false), END_TURN_LOCK_MS);
    return () => clearTimeout(t);
  }, []);
  const colour = seat === null ? null : seat.main;
  // The safe-area strips belong to the body, so the curtain colours the body while it is up.
  useEffect(() => {
    if (colour === null) return undefined;
    const before = document.body.style.background;
    document.body.style.background = colour;
    return () => { document.body.style.background = before; };
  }, [colour]);
  if (name === null || faction === null || seat === null) return null;
  const style = { background: seat.main, '--player': seat.main, '--player-dark': seat.dark } as CSSProperties;
  return (
    <div className="screen pass" data-testid="pass" style={style}>
      <div className="medallion" aria-hidden="true">
        <BannerTile className="pass-banner" colour={seat} accent={accent} />
      </div>
      <p className="pass-faction">{T.faction[faction]}</p>
      <h1>{fill(T.ui.turnOf, { name })}</h1>
      <p className="pass-line">{fill(T.ui.passTo, { name })}</p>
      {notice !== null ? <NoticeLine notice={notice} onDismiss={dismissNotice} /> : null}
      <button type="button" className="paper big" data-testid="ready" disabled={locked} onClick={() => { play('turn'); ready(); }}>{fill(T.ui.imName, { name })}</button>
    </div>
  );
}
