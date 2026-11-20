import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import type { AppState } from '../../app/store';
import { roundOf } from '../../app/record';
import { useApp } from '../../app/useApp';
import { ACCENT, playerColour } from '../art/palette';
import { BannerTile, HomeIcon } from '../icons';
import { play } from '../sound';
import type { SoundName } from '../sound';
import { T, fill } from '../text';

// Flat confetti around the winner's banner: [x %, y %, turn in degrees, which colour]. Fixed, so every win looks the same.
const CONFETTI: readonly [number, number, number, 'main' | 'gold' | 'grass' | 'sky'][] = [
  [8, 10, 20, 'gold'], [22, 4, -30, 'main'], [38, 14, 50, 'sky'], [62, 6, -15, 'gold'], [78, 12, 35, 'main'], [92, 4, -45, 'grass'],
  [4, 40, -20, 'main'], [14, 62, 40, 'grass'], [88, 36, 25, 'gold'], [96, 58, -35, 'sky'], [30, 30, 70, 'grass'], [72, 32, -60, 'sky'],
];

// The winning action switches straight to this screen, so the match screen never plays its sound: it is played
// here. A finished match opened from Home has no last action and stays quiet.
export function resultSound(last: AppState['last']): SoundName | null {
  return last !== null && last.events.some((e) => e.type === 'matchOver') ? 'win' : null;
}

export function Result(): ReactElement | null {
  const record = useApp((s) => s.record);
  const state = useApp((s) => s.state);
  const last = useApp((s) => s.last);
  const goHome = useApp((s) => s.goHome);
  const sending = useApp((s) => s.mode === 'online' && s.online?.sending === true);
  const played = useRef<number | null>(null);
  useEffect(() => {
    const name = resultSound(last);
    if (last === null || name === null || played.current === last.seq) return;
    played.current = last.seq;
    play(name);
  }, [last]);
  if (record === null || state === null || state.winner === null) return null;
  const resigned = record.actions[record.actions.length - 1]?.type === 'resign';
  const winner = record.players[state.winner]?.name ?? '';
  const faction = state.players[state.winner]!.faction;
  const adaptive = record.players.find((p) => p.kind === 'ai' && p.level === 'adaptive');
  const colour = playerColour(faction);
  const style = { '--player': colour.main, '--player-dark': colour.dark } as CSSProperties;
  return (
    <div className="screen result" style={style} data-testid="result">
      <div className="trophy">
        <div className="confetti" aria-hidden="true">
          {CONFETTI.map(([x, y, turn, c], i) => (
            <i key={i} className={`bit ${c}`} style={{ left: `${x}%`, top: `${y}%`, '--turn': `${turn}deg`, '--delay': `${i * 30}ms` } as CSSProperties} />
          ))}
        </div>
        <BannerTile className="result-banner" colour={colour} accent={ACCENT[faction]} />
        <h1 data-testid="winner">{fill(T.ui.wins, { name: winner })}</h1>
        <p className="result-faction">{T.faction[faction]}</p>
      </div>
      <div className="result-card">
        <p>{fill(T.ui.endedOn, { n: roundOf(state) })}</p>
        <p>{resigned ? T.ui.byResignation : T.ui.byLastCity}</p>
        {adaptive?.kind === 'ai' ? <p data-testid="ai-settled">{T.ai.settled(Math.round(adaptive.adapt.dial * 10))}</p> : null}
        {sending ? <p className="online-line" data-testid="result-sending" role="status">{T.ui.sending}</p> : null}
      </div>
      <button type="button" className="primary big" data-testid="result-home" onClick={goHome}><HomeIcon />{T.ui.homeButton}</button>
    </div>
  );
}
