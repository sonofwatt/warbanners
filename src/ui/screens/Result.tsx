import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import type { MatchState } from '../../engine';
import type { AppState } from '../../app/store';
import { roundOf } from '../../app/record';
import type { MatchRecord } from '../../app/record';
import { scoreSheets } from '../../app/score';
import type { ScoreLine, ScoreSheet } from '../../app/score';
import { cachedTallies } from '../../app/tally';
import type { Tally } from '../../app/tally';
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

const ROWS: readonly [keyof Tally, string][] = [
  ['dealt', T.stats.tallyDealt], ['kills', T.stats.tallyKills], ['deaths', T.stats.tallyDeaths],
  ['cities', T.stats.tallyCities], ['heroes', T.stats.tallyHeroes], ['treasures', T.stats.tallyTreasures],
];

// Both sides' numbers for this match, counted from its actions.
function TallyTable({ record }: { record: MatchRecord }): ReactElement {
  const t = cachedTallies(record);
  const [a, b] = [record.players[0]?.name ?? '', record.players[1]?.name ?? ''];
  return (
    <table className="result-tally" data-testid="result-tally">
      <caption>{T.stats.tallyTitle}</caption>
      <thead><tr><td /><th scope="col">{a}</th><th scope="col">{b}</th></tr></thead>
      <tbody>
        {ROWS.map(([k, label]) => (
          <tr key={k}><th scope="row">{label}</th><td>{t.tallies[0][k]}</td><td>{t.tallies[1][k]}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

// The small grey count beside a line's label.
function countOf(l: ScoreLine): string {
  const S = T.stats.score;
  switch (l.key) {
    case 'victory': return l.count > 0 ? fill(S.wonOn, { n: l.count }) : S.notWon;
    case 'explored': return fill(S.tiles, { n: l.count, of: l.of ?? 0 });
    case 'cities': return S.cities(l.count, l.best ?? 0);
    case 'roads': return l.of === 0 ? S.noOthers : fill(S.joined, { n: l.count, of: l.of ?? 0 });
    default: return String(l.count);
  }
}

// One person's match as points: a row per line, the subtotal, the AI's difficulty, and the total.
function ScoreTable({ sheet, name }: { sheet: ScoreSheet; name: string }): ReactElement {
  const S = T.stats.score;
  const d = sheet.difficulty;
  return (
    <table className="score-sheet" data-testid={`score-sheet-${sheet.seat}`}>
      <caption>{fill(S.title, { name })}</caption>
      <tbody>
        {sheet.lines.map((l) => (
          <tr key={l.key} data-testid={`score-line-${l.key}`}>
            <th scope="row">{S.label[l.key]}<small>{countOf(l)}</small></th>
            <td data-testid="score-points">{signed(l.points)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="subtotal" data-testid="score-subtotal"><th scope="row">{S.subtotal}</th><td>{sheet.subtotal}</td></tr>
        {d === null ? null : (
          <tr data-testid="score-difficulty">
            <th scope="row">{fill(S.factor, { ai: T.ai.name[d.level], factor: d.factor.toFixed(1) })}</th><td>{signed(d.points)}</td>
          </tr>
        )}
        <tr className="total"><th scope="row">{S.total}</th><td data-testid="score-total">{sheet.total}</td></tr>
      </tfoot>
    </table>
  );
}

function ScoreSheets({ record, state }: { record: MatchRecord; state: MatchState }): ReactElement {
  const sheets = scoreSheets(record, state, cachedTallies(record));
  return <>{sheets.map((x) => <ScoreTable key={x.seat} sheet={x} name={record.players[x.seat]?.name ?? ''} />)}</>;
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
      <ScoreSheets record={record} state={state} />
      <TallyTable record={record} />
      <button type="button" className="primary big" data-testid="result-home" onClick={goHome}><HomeIcon />{T.ui.homeButton}</button>
    </div>
  );
}
