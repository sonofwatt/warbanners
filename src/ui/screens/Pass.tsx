import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { useApp } from '../../app/useApp';
import { T, fill } from '../text';
import { FACTION_COLOUR } from './colour';

// The curtain. It draws a name and a colour and nothing from the match: no board, no digest, no numbers.
export function Pass(): ReactElement | null {
  const name = useApp((s) => (s.state === null || s.record === null ? null : s.record.players[s.state.current]?.name ?? null));
  const faction = useApp((s) => (s.state === null ? null : s.state.players[s.state.current]?.faction ?? null));
  const ready = useApp((s) => s.ready);
  const colour = faction === null ? null : FACTION_COLOUR[faction].main;
  // The safe-area strips belong to the body, so the curtain colours the body while it is up.
  useEffect(() => {
    if (colour === null) return undefined;
    const before = document.body.style.background;
    document.body.style.background = colour;
    return () => { document.body.style.background = before; };
  }, [colour]);
  if (name === null || faction === null) return null;
  return (
    <div className="screen pass" data-testid="pass" style={{ background: colour ?? undefined }}>
      <h1>{fill(T.ui.turnOf, { name })}</h1>
      <p>{T.faction[faction]}</p>
      <p>{fill(T.ui.passTo, { name })}</p>
      <button type="button" className="primary" data-testid="ready" onClick={ready}>{fill(T.ui.imName, { name })}</button>
    </div>
  );
}
