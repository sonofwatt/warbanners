import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  DEEDS, blockadeOf, growthNeeded, isBraced, isConnected, mythTouched, playerIncome, playerView, cityIncome, statsOf, thresholdOf, unitCapacity, unitsOf,
} from '../../engine';
import { aiInputFor, believedState } from '../../ai/input';
import type { DeedId, FactionId, HexKey, MatchState, PlayerId, PlayerView, TechId } from '../../engine';
import { roundOf } from '../../app/record';
import type { Notice } from '../../app/store';
import { useApp } from '../../app/useApp';
import { formatClock } from '../../online/clock';
import { T, digestText, fill } from '../text';
import { indexActions, marksFor, offered, readyTiles, spentUnits } from '../interaction';
import type { ActionIndex, Selection } from '../interaction';
import { hearingFor, isMuted, play, setMuted, soundFor, warmSound } from '../sound';
import { cityCommands, techRows, tileCommands, unitCommands } from '../panels/commands';
import type { Command } from '../panels/commands';
import { CityPanel } from '../panels/CityPanel';
import { DigestCard } from '../panels/DigestCard';
import { ActionBar, Hud } from '../panels/Hud';
import { Menu } from '../panels/Menu';
import { RewardSheet } from '../panels/RewardSheet';
import { TechSheet } from '../panels/TechSheet';
import { TilePanel } from '../panels/TilePanel';
import { UnitPanel } from '../panels/UnitPanel';
import { SelectionSheet } from '../panels/SelectionSheet';
import type { SheetApi } from '../panels/SelectionSheet';
import { Board } from '../board/Board';
import type { BoardAttacks } from '../board/Board';
import { NO_INSETS } from '../board/camera';
import type { Insets } from '../board/camera';
import { setTerrain3d, terrain3dOn } from '../terrain3d/option';
import { Effects } from '../board/Effects';
import { claimsOf, effectsFor, seenBy } from '../board/effects';
import { useTracks } from '../board/useTracks';
import { buildScene } from '../board/scene';
import { FACTION_COLOUR } from './colour';
import { failureText } from './Join';
import { NoticeLine } from './NoticeLine';

export const END_TURN_LOCK_MS = 600;
export const TIME_UP_MS = 4000;

// Everything drawn for one viewer, worked out once. The board takes items (from view, marks and spent), radius,
// factions and focus; the panels take the rest. This is the only place the app calls playerView.
export interface MatchData {
  view: PlayerView; ix: ActionIndex; marks: ReturnType<typeof marksFor>; ready: Set<HexKey>; spent: Set<number>;
  focus: HexKey | null; radius: number; factions: [FactionId, FactionId];
  // rules 8: the gold each of the viewer's blockaded cities would lose as its next turn starts, judged on what the
  // viewer sees (an unseen enemy is not counted here, so the forecast never gives one away)
  blockades: Map<number, number>;
}

// `acts` is false online while the session says it is not this phone's turn (the other phone's turn, a return
// still landing, an End turn on its way): nothing is offered then, even on the viewer's own turn.
export function matchData(state: MatchState, viewer: PlayerId, selection: Selection, acts = true): MatchData {
  const view = playerView(state, viewer);
  const ix = acts ? offered(state, viewer) : indexActions([]);
  const capital = view.cities.find((c) => c.owner === viewer && c.capital);
  const first = view.units.find((u) => u.owner === viewer);
  return {
    // Off the viewer's turn (the AI is playing) nothing is offered, and no unit is drawn as spent.
    view, ix, marks: marksFor(selection, view, ix), ready: new Set(readyTiles(view, ix)), spent: acts && state.current === viewer ? spentUnits(view, ix) : new Set(),
    focus: capital?.pos ?? first?.pos ?? null, radius: state.radius,
    factions: [state.players[0]!.faction, state.players[1]!.faction],
    blockades: blockadesSeen(state, viewer),
  };
}

function blockadesSeen(state: MatchState, viewer: PlayerId): Map<number, number> {
  const believed = believedState(aiInputFor(state, viewer));
  const out = new Map<number, number>();
  for (const c of believed.cities) {
    if (c.owner !== viewer) continue;
    const b = blockadeOf(believed, c);
    if (b.blockaded) out.set(c.id, b.cut);
  }
  return out;
}

// The focus the camera aims at, held for the whole of a turn (`key` names the turn and the player). Without a
// capital the focus is a unit's tile, which moves with it; re-aiming on each move would throw away the player's
// pan and zoom.
export interface TurnFocus { key: string; focus: HexKey }
export function turnFocus(held: TurnFocus | null, key: string, focus: HexKey): TurnFocus {
  return held !== null && held.key === key ? held : { key, focus };
}

export type Sheet = 'none' | 'tech' | 'menu';

// While a turn report line is shown on the board, the board pans and zooms but takes no taps.
const noTap = (): void => {};

// Next unit is greyed, like End turn, while the AI plays, during End turn's lock and while a sheet or overlay is
// up, and also when none of the viewer's units can still act.
export function nextUnitDisabled(p: { canAct: number; aiBusy: boolean; locked: boolean; covered: boolean }): boolean {
  return p.canAct === 0 || p.aiBusy || p.locked || p.covered;
}

// The one line over the board about the online match: the connection, the other player's, or the clock.
// The notices the match screen shows; the rest wait for Home.
/** The top bar's paper (--paper in theme.css), for the status bar above it. */
const MATCH_THEME_COLOUR = '#FFF8E8';
const MATCH_NOTICES: ReadonlySet<Notice> = new Set<Notice>(['saveFailed', 'blockedUnseen', 'aiPassed', 'resignLost', 'onlineListFailed', 'onlineListDropped']);

type OnlineLine = { text: string; testid: string } | null;

// `openSheet` opens the match with a sheet already up (the screen tests use it; the app never passes it).
export function Match({ openSheet = 'none' }: { openSheet?: Sheet } = {}): ReactElement | null {
  const state = useApp((s) => s.state);
  const record = useApp((s) => s.record);
  const viewer = useApp((s) => s.viewer);
  const selection = useApp((s) => s.selection);
  const digest = useApp((s) => s.digest);
  const last = useApp((s) => s.last);
  const run = useApp((s) => s.run);
  const tap = useApp((s) => s.tap);
  const nextUnit = useApp((s) => s.nextUnit);
  const arm = useApp((s) => s.arm);
  const goHome = useApp((s) => s.goHome);
  const dismissDigest = useApp((s) => s.dismissDigest);
  const notice = useApp((s) => s.notice);
  const dismissNotice = useApp((s) => s.dismissNotice);
  const aiBusy = useApp((s) => s.aiBusy);
  const mode = useApp((s) => s.mode);
  const online = useApp((s) => s.online);
  const resignOnline = useApp((s) => s.resignOnline);
  const isOnline = mode === 'online';
  // Online the session has the last word on whose turn it is; locally the state does.
  const myTurn = useApp((s) => (s.mode === 'online'
    ? s.online?.myTurn === true
    : s.state !== null && s.viewer !== null && s.state.current === s.viewer));

  const [sheet, setSheet] = useState<Sheet>(openSheet);
  // The tech a locked command asked for, ringed on the tech sheet; null when the sheet was opened from the bar.
  const [techFocus, setTechFocus] = useState<TechId | null>(null);
  const [locked, setLocked] = useState(true);
  const [soundOn, setSoundOn] = useState(() => !isMuted());
  const [terrain3d, setTerrain3dState] = useState(terrain3dOn);
  const [later, setLater] = useState<number[]>([]);
  // Each tap on Next unit asks the board, once, to bring the unit it selected into view.
  const [revealed, setRevealed] = useState(0);
  // The turn report line being looked at on the board (its card is put away meanwhile), and a count that asks the
  // board, once per tap, to centre on that line's tile.
  const [peek, setPeek] = useState<number | null>(null);
  const [centred, setCentred] = useState(0);
  useEffect(() => { setPeek(null); }, [digest]);
  // The selection card lies over the board; the board asks it what it covers when deciding where to look, and
  // `coverN` tells the board each time that may have changed (the card's top grew or shrank, a rotation).
  // With nothing selected the bar of turn buttons lies over the bottom of the board instead, and covers its height.
  const slotRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const sheetApi = useRef<SheetApi | null>(null);
  const [coverN, setCoverN] = useState(0);
  const cover = useCallback((): Insets => {
    const api = sheetApi.current, slot = slotRef.current, bar = barRef.current;
    if (slot === null) return NO_INSETS;
    const s = slot.getBoundingClientRect();
    if (api !== null) return api.cover(s);
    if (bar !== null) return { ...NO_INSETS, bottom: Math.max(0, Math.min(s.height, s.bottom - bar.getBoundingClientRect().top)) };
    return NO_INSETS;
  }, []);
  const onCover = useCallback((): void => setCoverN((n) => n + 1), []);

  // The phone's status bar takes the top bar's paper while a match is open (the sky colour comes back on leaving).
  // The audio context and the samples are made ready once the match is up, not by the first sound of a move.
  useEffect(() => (soundOn ? warmSound() : undefined), [soundOn]);

  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta === null) return undefined;
    const before = meta.content;
    meta.content = MATCH_THEME_COLOUR;
    return () => { meta.content = before; };
  }, []);

  // End turn waits a moment after the screen appears, so the tap that ended the curtain cannot end the turn too.
  // Against the AI the screen stays up, so it waits again each time the person's turn comes back.
  useEffect(() => {
    if (!myTurn) { setLocked(true); return undefined; }
    const t = setTimeout(() => setLocked(false), END_TURN_LOCK_MS);
    return () => clearTimeout(t);
  }, [myTurn]);

  // Time up: shown for a few seconds after the clock ended this phone's own turn, never for an old one.
  const timedOut = online?.timedOut ?? null;
  const timeSeen = useRef(timedOut);
  const [timeUp, setTimeUp] = useState(false);
  useEffect(() => {
    if (timedOut === null || timedOut === timeSeen.current) return undefined;
    timeSeen.current = timedOut;
    setTimeUp(true);
    const t = setTimeout(() => setTimeUp(false), TIME_UP_MS);
    return () => clearTimeout(t);
  }, [timedOut]);

  const heard = useRef(last?.seq ?? 0);
  const shownBefore = useRef(last?.seq ?? 0);

  const data = useMemo(
    () => (state === null || viewer === null ? null : matchData(state, viewer, selection, !isOnline || myTurn)),
    [state, viewer, selection, isOnline, myTurn],
  );
  // The effects of each action accepted while this screen is up, for this viewer's eyes only: effectsFor drops
  // every tile the viewer cannot see and every unit the viewer could not see before the action and cannot see
  // after it (a hidden unit can stand unseen on a visible tile). Worked out once per action, not per selection.
  // The curtain unmounts this screen, so nothing of `last` shows behind it, and what was accepted before the
  // screen appeared is not replayed.
  // The sound is chosen by the same rule, from the same units.
  const fx = useMemo(() => {
    if (last === null || state === null || viewer === null || last.seq === shownBefore.current) return null;
    const { visible, seenUnits, visibleBefore } = seenBy(last.before, state, viewer);
    return {
      seq: last.seq, sound: soundFor(last.events, hearingFor(last.before, state, viewer)),
      list: effectsFor(last.events, last.before, state, visible, seenUnits, viewer, visibleBefore),
    };
  }, [last, state, viewer]);
  // The same action as the board plays it: its attacks and deaths (the 3D figures face, strike and block), when its
  // moves start, and the tiles where it happened (the view follows them when they leave the middle of the screen).
  const attacks = useMemo((): BoardAttacks | null => {
    if (fx === null) return null;
    const list = fx.list.flatMap((f) => (f.kind === 'lunge'
      ? [{ unit: f.unit, from: f.from, toward: f.toward, delay: f.delay, target: f.target, counter: f.counter }] : []));
    const fallen = fx.list.flatMap((f) => (f.kind === 'fall' ? [f.unit] : []));
    const moves = fx.list.flatMap((f) => (f.kind === 'move' ? [{ unit: f.unit, delay: f.delay }] : []));
    const tiles = fx.list.flatMap((f) => (f.kind === 'lunge' ? [f.from, f.toward] : f.kind === 'move' ? [f.to] : [f.at]));
    const chests = claimsOf(fx.list);
    return list.length === 0 && fallen.length === 0 && moves.length === 0 && tiles.length === 0 ? null : { seq: fx.seq, list, fallen, moves, tiles, chests };
  }, [fx]);
  // One sound per accepted action; what was accepted before this screen appeared is not replayed.
  useEffect(() => {
    if (fx === null || fx.seq === heard.current) return;
    heard.current = fx.seq;
    if (fx.sound !== null) play(fx.sound);
  }, [fx]);
  const focusHeld = useRef<TurnFocus | null>(null);
  if (data !== null && state !== null && viewer !== null) {
    focusHeld.current = turnFocus(focusHeld.current, `${roundOf(state)}:${viewer}`, data.focus ?? '0,0');
  }
  const selectedUnit = selection.kind === 'unit' ? selection.id : null;
  // While a city is selected (either player's), its land is outlined on the board.
  const cityLand = selection.kind === 'city' ? selection.id : null;
  // The tile of the turn report line being looked at is ringed, so it can be found when the board's edge stops the
  // view short of centring it.
  const peekAt = peek !== null ? digest[peek]?.at : undefined;
  // tracks3d: the marks traffic left on the ground, replayed from the record for this viewer's eyes (board/tracks.ts).
  const tracks = useTracks(record?.settings ?? null, record?.actions ?? null, viewer);
  const items = useMemo(() => {
    if (data === null) return null;
    const marks = peekAt === undefined ? data.marks : { ...data.marks, [peekAt]: 'selected' as const };
    return buildScene({ view: data.view, radius: data.radius, marks, ready: data.ready, selectedUnit, spentUnits: data.spent, cityLand, tracks });
  }, [data, selectedUnit, peekAt, cityLand, tracks]);
  if (state === null || record === null || viewer === null || data === null || items === null) return null;

  const { view, ix } = data;
  const player = state.players[viewer]!;
  const onCommand = (c: Command): void => {
    if (!c.enabled) {
      if (c.tech !== undefined) { setTechFocus(c.tech); setSheet('tech'); }
      return;
    }
    if (c.action !== null) run(c.action);
    else arm(c.arm);
  };

  let panel: ReactElement | null = null;
  if (selection.kind === 'unit') {
    const u = view.units.find((x) => x.id === selection.id);
    if (u !== undefined) {
      const owner = state.players[u.owner]!.faction;
      const commands = u.owner === viewer ? unitCommands(selection, state, ix) : [];
      // The myth touch, the brace and the movement are judged on what the viewer believes, never on the whole match, so an
      // enemy's card cannot tell of a hero or a helper beside it that the viewer has not seen.
      const believed = believedState(aiInputFor(state, viewer));
      const myth = mythTouched(believed, u);
      const thresholds = u.owner === viewer
        ? Object.fromEntries(DEEDS.map((d) => [d, thresholdOf(state, u, d)])) as Record<DeedId, number> : null;
      panel = (
        <UnitPanel unit={u} faction={owner} stats={statsOf(believed, u)} myth={myth} braced={isBraced(believed, u)} thresholds={thresholds}
          commands={commands} onCommand={onCommand} />
      );
    }
  } else if (selection.kind === 'city') {
    const city = view.cities.find((c) => c.id === selection.id);
    if (city !== undefined) {
      const mine = city.owner === viewer;
      const owner = state.players[city.owner]!.faction;
      // Joined to its owner's capital now, judged on what the viewer believes (roads seen, never ones in the fog).
      const believed = believedState(aiInputFor(state, viewer));
      const seen = believed.cities.find((c) => c.id === city.id);
      const connected = seen !== undefined && isConnected(believed, seen);
      panel = mine ? (
        <CityPanel
          key={city.id} faction={owner} level={city.level} capital={city.capital} growth={city.growth} growthNeeded={growthNeeded(state, city)}
          units={unitsOf(state, city.id)} capacity={unitCapacity(city)} income={cityIncome(state, city)} blockade={data.blockades.get(city.id)}
          walls={city.walls} connected={connected} commands={cityCommands(city.id, state, ix)} onCommand={onCommand}
        />
      ) : (
        <CityPanel faction={owner} level={city.level} capital={city.capital} walls={city.walls} connected={connected} commands={[]} onCommand={onCommand} />
      );
    }
  } else if (selection.kind === 'tile') {
    const tile = view.tiles[selection.at];
    if (tile !== undefined) {
      panel = (
        <TilePanel
          terrain={tile.terrain} resource={tile.resource} building={tile.building} road={tile.road} harvested={tile.harvested}
          commands={tileCommands(selection.at, state, ix)} onCommand={onCommand}
        />
      );
    }
  }

  const rewardCity = digest.length > 0 || sheet !== 'none' ? undefined
    : view.cities.find((c) => c.owner === viewer && ix.rewards.includes(c.id) && c.pendingRewards[0] !== undefined && !later.includes(c.id));
  // Something is shown in the side column (landscape) or over the bottom of the board (portrait). The board's slot
  // keeps its size either way: the panel lies over it.
  const side = sheet !== 'none' || panel !== null;
  const selectionKey = selection.kind === 'unit' ? `unit:${selection.id}` : selection.kind === 'city' ? `city:${selection.id}`
    : selection.kind === 'tile' ? `tile:${selection.at}` : 'none';
  const toggleSound = (): void => { setMuted(soundOn); setSoundOn(!soundOn); };
  const toggleTerrain3d = (): void => { setTerrain3d(!terrain3d); setTerrain3dState(!terrain3d); };
  const waiting = isOnline && !myTurn;
  const nextDisabled = waiting || nextUnitDisabled({
    canAct: ix.activeUnits.length, aiBusy, locked, covered: sheet !== 'none' || digest.length > 0 || rewardCity !== undefined,
  });
  const nameOf = (p: PlayerId): string => record.players[p]?.name ?? '';

  // Online: whose turn, the clock, the line over the board, and the sheet a desync puts over it all.
  let status: string | undefined;
  let statusName: string | undefined;
  let statusShort: string | undefined;
  let clock: string | undefined;
  let line: OnlineLine = null;
  if (isOnline) {
    const linked = online !== null && online.connected && !online.returning;
    // Whose turn, always. On the player's own turn while the connection is down (or the return has not landed), End
    // turn is greyed, so the status says the turn waits for the connection; the line over the board says why.
    status = state.current !== viewer ? fill(T.ui.theirTurn, { name: nameOf(state.current) })
      : linked ? T.ui.yourTurn : T.ui.yourTurnWaits;
    if (state.current !== viewer) statusName = nameOf(state.current);
    else if (!linked) statusShort = T.ui.yourTurnWaitsShort;
    if (online !== null && online.clock.kind !== 'off' && online.secondsLeft !== null && state.winner === null) {
      clock = online.clock.kind === 'paused' ? T.ui.clockPaused : formatClock(online.secondsLeft);
    }
    const away = online?.absent.find((p) => p !== viewer);
    if (online === null) line = { text: T.ui.connecting, testid: 'online-connecting' };
    else if (!linked) line = { text: T.ui.reconnecting, testid: 'online-reconnecting' };
    else if (online.verifying) line = { text: T.ui.checking, testid: 'online-checking' };
    else if (online.phase === 'failed') line = { text: online.failure !== null ? failureText(online.failure, online) : T.ui.openFailed, testid: 'online-failed' };
    else if (away !== undefined && state.winner === null) {
      const clockOff = (online.room?.meta.clock ?? 0) === 0;
      const words = clockOff ? T.ui.droppedNoClock : away === state.current ? T.ui.dropped : T.ui.droppedWaiting;
      line = { text: fill(words, { name: nameOf(away) }), testid: 'online-dropped' };
    } else if (timeUp) line = { text: T.ui.timeUp, testid: 'online-time-up' };
  }
  // Either phone: the one that found the disagreement, and the one whose match it froze.
  const desync = isOnline && (online?.phase === 'desync' || online?.blocked === true);
  const resignDisabled = aiBusy || (online === null && !myTurn)
    || (online !== null && (!online.connected || online.returning || online.verifying || online.blocked || online.phase !== 'playing'));
  const onNextUnit = (): void => { nextUnit(); setRevealed((n) => n + 1); };
  const shownUnit = selection.kind === 'unit' ? view.units.find((u) => u.id === selection.id) : undefined;
  const peeked = peek !== null ? digest[peek] : undefined;
  const showLine = (i: number): void => { setPeek(i); setCentred((n) => n + 1); };

  return (
    <div className={`screen match${side ? ' has-side' : ''}${peeked !== undefined ? ' peeking' : ''}`} data-testid="match">
      <Hud
        name={record.players[viewer]?.name ?? ''} colour={FACTION_COLOUR[player.faction].main} faction={player.faction}
        gold={player.gold} income={playerIncome(state, viewer)} blockade={[...data.blockades.values()].reduce((a, n) => a + n, 0)} round={roundOf(state)}
        thinking={aiBusy && !isOnline}
        status={status} statusName={statusName} statusShort={statusShort} clock={clock} clockPaused={online?.clock.kind === 'paused'}
        onOpenMenu={() => setSheet('menu')}
      />
      <div className="board-slot" data-testid="board-slot" ref={slotRef}>
        <Board items={items} radius={data.radius} factions={data.factions} seed={state?.seed ?? 0} focus={focusHeld.current?.focus ?? '0,0'} viewer={viewer}
          terrain3d={terrain3d} attacks={attacks}
          covered={sheet !== 'none' || (digest.length > 0 && peeked === undefined) || rewardCity !== undefined || desync}
          onTap={peeked !== undefined ? noTap : tap}
          reveal={revealed > 0 && shownUnit !== undefined ? { n: revealed, at: shownUnit.pos } : null}
          centre={centred > 0 && peeked !== undefined ? { n: centred, at: peeked.at } : null}
          cover={cover} coverN={coverN}
        >
          {fx !== null ? <Effects key={fx.seq} effects={fx.list} factions={data.factions} /> : null}
        </Board>
      </div>
      {line !== null || (notice !== null && MATCH_NOTICES.has(notice)) ? (
        <div className="match-notice" data-testid="match-notice">
          {line !== null ? <p className="online-line" data-testid={line.testid} role="status">{line.text}</p> : null}
          {notice !== null && MATCH_NOTICES.has(notice) ? <NoticeLine notice={notice} onDismiss={dismissNotice} /> : null}
        </div>
      ) : null}
      {/* The bottom of the screen: the selection's card while something is selected, else the turn buttons. */}
      {panel !== null && sheet === 'none' ? (
        <SelectionSheet resetKey={selectionKey} apiRef={sheetApi} onCover={onCover}>{panel}</SelectionSheet>
      ) : (
          <ActionBar
            barRef={barRef} colour={FACTION_COLOUR[player.faction].main} faction={player.faction}
            unitsToAct={ix.activeUnits.length} techReady={ix.research.length > 0} endDisabled={locked || aiBusy || waiting}
            nextDisabled={nextDisabled} onNextUnit={onNextUnit}
            onOpenTech={() => { setTechFocus(null); setSheet('tech'); }} onEndTurn={() => run({ type: 'endTurn' })}
          />
      )}
      {sheet === 'tech' ? (
        <TechSheet rows={techRows(state, ix)} focus={techFocus} onResearch={(t: TechId) => run({ type: 'research', tech: t })} onClose={() => setSheet('none')} />
      ) : null}
      {sheet === 'menu' ? (
        <Menu
          soundOn={soundOn} onToggleSound={toggleSound} terrain3d={terrain3d} onToggleTerrain3d={toggleTerrain3d} onResign={isOnline ? resignOnline : () => run({ type: 'resign' })}
          resignDisabled={isOnline ? resignDisabled : aiBusy || !myTurn}
          onHome={goHome} onClose={() => setSheet('none')} onlineNote={isOnline ? T.ui.homeWaits : undefined}
        />
      ) : null}
      {digest.length > 0 && peeked === undefined ? (
        <div className="overlay" data-testid="digest">
          <DigestCard lines={digest} onShow={showLine} />
          <button type="button" className="primary" data-testid="digest-ok" onClick={dismissDigest}>{T.ui.gotIt}</button>
        </div>
      ) : null}
      {peeked !== undefined ? (
        <div className="digest-peek" data-testid="digest-peek">
          <p>{digestText(peeked)}</p>
          <button type="button" className="primary" data-testid="digest-back" onClick={() => setPeek(null)}>{T.ui.backToReport}</button>
        </div>
      ) : null}
      {desync ? (
        <div className="overlay desync" data-testid="desync">
          <div className="digest desync-card"><p>{T.ui.desync}</p><p>{T.ui.desyncWaits}</p></div>
          <button type="button" className="primary" data-testid="desync-home" onClick={goHome}>{T.ui.home}</button>
        </div>
      ) : null}
      {rewardCity !== undefined ? (
        <div className="overlay">
          <RewardSheet
            level={rewardCity.pendingRewards[0]!}
            onPick={(choice) => run({ type: 'chooseReward', city: rewardCity.id, choice })}
            onLater={() => setLater([...later, rewardCity.id])}
          />
        </div>
      ) : null}
    </div>
  );
}
