import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  growthNeeded, playerIncome, playerView, cityIncome, unitCapacity, unitsOf,
} from '../../engine';
import type { FactionId, HexKey, MatchState, PlayerId, PlayerView, TechId } from '../../engine';
import { roundOf } from '../../app/record';
import { useApp } from '../../app/useApp';
import { T } from '../text';
import { marksFor, offered, spentUnits } from '../interaction';
import type { ActionIndex, Selection } from '../interaction';
import { isMuted, play, setMuted, soundFor } from '../sound';
import { cityCommands, techRows, tileCommands, unitCommands } from '../panels/commands';
import type { Command } from '../panels/commands';
import { CityPanel } from '../panels/CityPanel';
import { DigestCard } from '../panels/DigestCard';
import { Hud } from '../panels/Hud';
import { Menu } from '../panels/Menu';
import { RewardSheet } from '../panels/RewardSheet';
import { TechSheet } from '../panels/TechSheet';
import { TilePanel } from '../panels/TilePanel';
import { UnitPanel } from '../panels/UnitPanel';
import { Board } from '../board/Board';
import { Effects } from '../board/Effects';
import { effectsFor, seenBy } from '../board/effects';
import { buildScene } from '../board/scene';
import { FACTION_COLOUR } from './colour';
import { NoticeLine } from './NoticeLine';

export const END_TURN_LOCK_MS = 600;

// Everything drawn for one viewer, worked out once. The board takes items (from view, marks and spent), radius,
// factions and focus; the panels take the rest. This is the only place the app calls playerView.
export interface MatchData {
  view: PlayerView; ix: ActionIndex; marks: ReturnType<typeof marksFor>; spent: Set<number>;
  focus: HexKey | null; radius: number; factions: [FactionId, FactionId];
}

export function matchData(state: MatchState, viewer: PlayerId, selection: Selection): MatchData {
  const view = playerView(state, viewer);
  const ix = offered(state, viewer);
  const capital = view.cities.find((c) => c.owner === viewer && c.capital);
  const first = view.units.find((u) => u.owner === viewer);
  return {
    // Off the viewer's turn (the AI is playing) nothing is offered, and no unit is drawn as spent.
    view, ix, marks: marksFor(selection, view, ix), spent: state.current === viewer ? spentUnits(view, ix) : new Set(),
    focus: capital?.pos ?? first?.pos ?? null, radius: state.radius,
    factions: [state.players[0]!.faction, state.players[1]!.faction],
  };
}

// The focus the camera aims at, held for the whole of a turn (`key` names the turn and the player). Without a
// capital the focus is a unit's tile, which moves with it; re-aiming on each move would throw away the player's
// pan and zoom.
export interface TurnFocus { key: string; focus: HexKey }
export function turnFocus(held: TurnFocus | null, key: string, focus: HexKey): TurnFocus {
  return held !== null && held.key === key ? held : { key, focus };
}

type Sheet = 'none' | 'tech' | 'menu';

// Next unit is greyed, like End turn, while the AI plays, during End turn's lock and while a sheet or overlay is
// up, and also when none of the viewer's units can still act.
export function nextUnitDisabled(p: { canAct: number; aiBusy: boolean; locked: boolean; covered: boolean }): boolean {
  return p.canAct === 0 || p.aiBusy || p.locked || p.covered;
}

export function Match(): ReactElement | null {
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
  const myTurn = useApp((s) => s.state !== null && s.viewer !== null && s.state.current === s.viewer);

  const [sheet, setSheet] = useState<Sheet>('none');
  const [locked, setLocked] = useState(true);
  const [soundOn, setSoundOn] = useState(() => !isMuted());
  const [later, setLater] = useState<number[]>([]);
  // Each tap on Next unit asks the board, once, to bring the unit it selected into view.
  const [revealed, setRevealed] = useState(0);

  // End turn waits a moment after the screen appears, so the tap that ended the curtain cannot end the turn too.
  // Against the AI the screen stays up, so it waits again each time the person's turn comes back.
  useEffect(() => {
    if (!myTurn) { setLocked(true); return undefined; }
    const t = setTimeout(() => setLocked(false), END_TURN_LOCK_MS);
    return () => clearTimeout(t);
  }, [myTurn]);

  const heard = useRef(last?.seq ?? 0);
  const shownBefore = useRef(last?.seq ?? 0);

  const data = useMemo(
    () => (state === null || viewer === null ? null : matchData(state, viewer, selection)),
    [state, viewer, selection],
  );
  // The effects of each action accepted while this screen is up, for this viewer's eyes only: effectsFor drops
  // every tile the viewer cannot see and every unit the viewer could not see before the action and cannot see
  // after it (a hidden unit can stand unseen on a visible tile). Worked out once per action, not per selection.
  // The curtain unmounts this screen, so nothing of `last` shows behind it, and what was accepted before the
  // screen appeared is not replayed.
  // The sound is chosen by the same rule, from the same units.
  const fx = useMemo(() => {
    if (last === null || state === null || viewer === null || last.seq === shownBefore.current) return null;
    const { visible, seenUnits } = seenBy(last.before, state, viewer);
    return {
      seq: last.seq, sound: soundFor(last.events, seenUnits),
      list: effectsFor(last.events, last.before, state, visible, seenUnits),
    };
  }, [last, state, viewer]);
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
  const items = useMemo(
    () => (data === null ? null : buildScene({ view: data.view, radius: data.radius, marks: data.marks, selectedUnit, spentUnits: data.spent })),
    [data, selectedUnit],
  );
  if (state === null || record === null || viewer === null || data === null || items === null) return null;

  const { view, ix } = data;
  const player = state.players[viewer]!;
  const onCommand = (c: Command): void => {
    if (c.action !== null) run(c.action);
    else arm(c.arm);
  };

  let panel: ReactElement | null = null;
  if (selection.kind === 'unit') {
    const u = view.units.find((x) => x.id === selection.id);
    if (u !== undefined) {
      const owner = state.players[u.owner]!.faction;
      const commands = u.owner === viewer ? unitCommands(selection, state, ix) : [];
      panel = <UnitPanel type={u.type} hp={u.hp} faction={owner} commands={commands} onCommand={onCommand} />;
    }
  } else if (selection.kind === 'city') {
    const city = view.cities.find((c) => c.id === selection.id);
    if (city !== undefined) {
      const mine = city.owner === viewer;
      const owner = state.players[city.owner]!.faction;
      panel = mine ? (
        <CityPanel
          faction={owner} level={city.level} capital={city.capital} growth={city.growth} growthNeeded={growthNeeded(state, city)}
          units={unitsOf(state, city.id)} capacity={unitCapacity(city)} income={cityIncome(state, city)}
          walls={city.walls} commands={cityCommands(city.id, state, ix)} onCommand={onCommand}
        />
      ) : (
        <CityPanel faction={owner} level={city.level} capital={city.capital} walls={city.walls} commands={[]} onCommand={onCommand} />
      );
    }
  } else if (selection.kind === 'tile') {
    const tile = view.tiles[selection.at];
    if (tile !== undefined) {
      panel = (
        <TilePanel
          terrain={tile.terrain} resource={tile.resource} building={tile.building} road={tile.road}
          commands={tileCommands(selection.at, state, ix)} onCommand={onCommand}
        />
      );
    }
  }

  const rewardCity = digest.length > 0 || sheet !== 'none' ? undefined
    : view.cities.find((c) => c.owner === viewer && ix.rewards.includes(c.id) && c.pendingRewards[0] !== undefined && !later.includes(c.id));
  // In landscape the board takes the side column too while nothing is shown there.
  const side = sheet !== 'none' || panel !== null;
  const toggleSound = (): void => { setMuted(soundOn); setSoundOn(!soundOn); };
  const nextDisabled = nextUnitDisabled({
    canAct: ix.activeUnits.length, aiBusy, locked, covered: sheet !== 'none' || digest.length > 0 || rewardCity !== undefined,
  });
  const onNextUnit = (): void => { nextUnit(); setRevealed((n) => n + 1); };
  const shownUnit = selection.kind === 'unit' ? view.units.find((u) => u.id === selection.id) : undefined;

  return (
    <div className={side ? 'screen match has-side' : 'screen match'} data-testid="match">
      <Hud
        name={record.players[viewer]?.name ?? ''} colour={FACTION_COLOUR[player.faction].main} faction={player.faction}
        gold={player.gold} income={playerIncome(state, viewer)} round={roundOf(state)}
        unitsToAct={ix.activeUnits.length} techReady={ix.research.length > 0} endDisabled={locked || aiBusy} thinking={aiBusy}
        nextDisabled={nextDisabled} onNextUnit={onNextUnit}
        onOpenTech={() => setSheet('tech')} onOpenMenu={() => setSheet('menu')} onEndTurn={() => run({ type: 'endTurn' })}
      />
      <div className="board-slot" data-testid="board-slot">
        <Board items={items} radius={data.radius} factions={data.factions} focus={focusHeld.current?.focus ?? '0,0'} viewer={viewer} onTap={tap}
          reveal={revealed > 0 && shownUnit !== undefined ? { n: revealed, at: shownUnit.pos } : null}
        >
          {fx !== null ? <Effects key={fx.seq} effects={fx.list} factions={data.factions} /> : null}
        </Board>
      </div>
      {notice === 'saveFailed' || notice === 'blockedUnseen' || notice === 'aiPassed' ? (
        <div className="match-notice" data-testid="match-notice"><NoticeLine notice={notice} onDismiss={dismissNotice} /></div>
      ) : null}
      {panel !== null && sheet === 'none' ? <aside className="selection">{panel}</aside> : null}
      {sheet === 'tech' ? (
        <TechSheet rows={techRows(state, ix)} onResearch={(t: TechId) => run({ type: 'research', tech: t })} onClose={() => setSheet('none')} />
      ) : null}
      {sheet === 'menu' ? (
        <Menu
          soundOn={soundOn} onToggleSound={toggleSound} onResign={() => run({ type: 'resign' })}
          onHome={goHome} onClose={() => setSheet('none')}
        />
      ) : null}
      {digest.length > 0 ? (
        <div className="overlay" data-testid="digest">
          <DigestCard lines={digest} />
          <button type="button" className="primary" data-testid="digest-ok" onClick={dismissDigest}>{T.ui.gotIt}</button>
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
