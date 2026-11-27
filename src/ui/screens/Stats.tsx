import { useState } from 'react';
import type { ReactElement } from 'react';
import type { FactionId } from '../../engine';
import type { AiLevel } from '../../ai/types';
import { filtered, playerNames, summarize } from '../../app/stats';
import type { Filter, MatchKind, StatLine, Summary } from '../../app/stats';
import { useApp } from '../../app/useApp';
import { HomeIcon } from '../icons';
import { T, fill } from '../text';

const KINDS: readonly (MatchKind | 'all')[] = ['all', 'computer', 'pass', 'online'];
const FACTIONS: readonly (FactionId | 'all')[] = ['all', 'spartans', 'mongols', 'woodland'];
const LEVELS: readonly (AiLevel | 'any')[] = ['any', 'easy', 'normal', 'hard', 'adaptive'];
const RECENT = 10;

function Chips<V extends string>({ label, id, values, chosen, text, onPick }: {
  label: string; id: string; values: readonly V[]; chosen: V; text: (v: V) => string; onPick: (v: V) => void;
}): ReactElement {
  return (
    <div className="stats-filter">
      <span id={`${id}-label`}>{label}</span>
      <div className="chips" role="radiogroup" aria-labelledby={`${id}-label`}>
        {values.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={v === chosen} className={v === chosen ? 'chip on' : 'chip'}
            data-testid={`${id}-${v}`} onClick={() => onPick(v)}>{text(v)}</button>
        ))}
      </div>
    </div>
  );
}

const whole = (x: number | null): string => (x === null ? T.stats.none : String(Math.round(x)));
const percent = (x: number | null): string => (x === null ? T.stats.none : `${Math.round(x * 100)}%`);

function Tiles({ s }: { s: Summary }): ReactElement {
  const tiles: [string, string, string][] = [
    ['played', T.stats.played, String(s.played)],
    ['wins', T.stats.wins, String(s.wins)],
    ['winRate', T.stats.winRate, percent(s.winRate)],
    ['streak', T.stats.streak, String(s.streak)],
    ['bestStreak', T.stats.bestStreak, String(s.bestStreak)],
    ['avgRounds', T.stats.avgRounds, whole(s.avgRounds)],
    ['avgDealt', T.stats.avgDealt, whole(s.avgDealt)],
    ['avgTaken', T.stats.avgTaken, whole(s.avgTaken)],
    ['favourite', T.stats.favourite, s.favourite === null ? T.stats.none : T.faction[s.favourite]],
    ['kills', T.stats.kills, String(s.kills)],
    ['deaths', T.stats.deaths, String(s.deaths)],
    ['cities', T.stats.cities, String(s.cities)],
    ['heroes', T.stats.heroes, String(s.heroes)],
    ['treasures', T.stats.treasures, String(s.treasures)],
  ];
  return (
    <dl className="stat-tiles">
      {tiles.map(([key, label, value]) => (
        <div key={key} className="stat-tile" data-testid={`stat-${key}`}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}

function RecentRow({ l }: { l: StatLine }): ReactElement {
  const them = l.opponent;
  const against = them?.name ?? (l.ai !== null ? T.ai.name[l.ai] : T.stats.kinds.online);
  const date = new Date(l.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const side = (name: string, t: StatLine['tally']): string => fill(T.stats.sideLine, { name, dealt: t.dealt, kills: t.kills, deaths: t.deaths });
  return (
    <li className={l.won ? 'stats-match won' : 'stats-match'} data-testid="stats-recent-row">
      <strong>{fill(l.won ? T.stats.won : T.stats.lost, { name: against })}</strong>
      <span className="stats-match-line">{fill(T.stats.recentLine, { faction: T.faction[l.faction], kind: T.stats.kinds[l.kind], turns: T.stats.turns(l.rounds), date })}</span>
      <span className="stats-match-side">{side(l.name, l.tally)}</span>
      {them !== null ? <span className="stats-match-side">{side(them.name, them.tally)}</span> : null}
    </li>
  );
}

export function Stats(): ReactElement {
  const lines = useApp((s) => s.statLines);
  const goHome = useApp((s) => s.goHome);
  const forgetPlayer = useApp((s) => s.forgetPlayer);
  const players = playerNames(lines);
  const [picked, setPicked] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>({ kind: 'all', faction: 'all', ai: 'any' });
  const [asking, setAsking] = useState(false);
  const name = picked !== null && players.includes(picked) ? picked : players[0] ?? null;

  const home = <button type="button" data-testid="stats-home" onClick={goHome}><HomeIcon />{T.ui.home}</button>;
  if (name === null) {
    return (
      <div className="screen stats" data-testid="stats">
        <h1>{T.stats.title}</h1>
        <p className="empty" data-testid="stats-empty">{T.stats.empty}</p>
        {home}
      </div>
    );
  }
  const summary = summarize(lines, name, filter);
  const recent = filtered(lines, name, filter).slice(0, RECENT);
  return (
    <div className="screen stats" data-testid="stats">
      <h1>{T.stats.title}</h1>
      <Chips label={T.stats.player} id="stats-player" values={players} chosen={name} text={(v) => v} onPick={(v) => { setPicked(v); setAsking(false); }} />
      <Chips label={T.stats.kind} id="stats-kind" values={KINDS} chosen={filter.kind} text={(v) => T.stats.kinds[v]} onPick={(kind) => setFilter({ ...filter, kind, ai: kind === 'pass' ? 'any' : filter.ai })} />
      <Chips label={T.stats.faction} id="stats-faction" values={FACTIONS} chosen={filter.faction}
        text={(v) => (v === 'all' ? T.stats.allFactions : T.faction[v])} onPick={(faction) => setFilter({ ...filter, faction })} />
      {filter.kind === 'pass' ? null : <Chips label={T.stats.ai} id="stats-ai" values={LEVELS} chosen={filter.ai}
        text={(v) => (v === 'any' ? T.stats.anyAi : T.ai.name[v])} onPick={(ai) => setFilter({ ...filter, ai })} />}
      {summary.played === 0 ? <p className="empty" data-testid="stats-none">{T.stats.noMatches}</p> : <Tiles s={summary} />}
      {recent.length > 0 ? (
        <>
          <h2>{T.stats.recent}</h2>
          <ul className="stats-recent" data-testid="stats-recent">{recent.map((l, i) => <RecentRow key={`${l.match}:${i}`} l={l} />)}</ul>
        </>
      ) : null}
      <div className="setup-row">
        {asking ? (
          <div className="confirm">
            <span>{fill(T.stats.forgetAsk, { name })}</span>
            <button type="button" className="danger" data-testid="stats-forget-yes" onClick={() => { forgetPlayer(name); setAsking(false); setPicked(null); }}>{T.stats.forgetYes}</button>
            <button type="button" data-testid="stats-forget-no" onClick={() => setAsking(false)}>{T.stats.forgetNo}</button>
          </div>
        ) : (
          <button type="button" className="quiet danger-text" data-testid="stats-forget" onClick={() => setAsking(true)}>{fill(T.stats.forget, { name })}</button>
        )}
        {home}
      </div>
    </div>
  );
}
