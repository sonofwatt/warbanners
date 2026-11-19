import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  growthNeeded, playerIncome, playerView, cityIncome, legalActions, unitCapacity, unitsOf,
} from '../../engine';
import type { FactionId, HexKey, MatchState, PlayerId, PlayerView, TechId } from '../../engine';
import { roundOf } from '../../app/record';
import { useApp } from '../../app/useApp';
import { T } from '../text';
import { indexActions, marksFor, spentUnits } from '../interaction';
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
import { FACTION_COLOUR } from './colour';

export const END_TURN_LOCK_MS = 600;

// Everything drawn for one viewer, worked out once. The board takes items (from view, marks and spent), radius,
// factions and focus; the panels take the rest. This is the only place the app calls playerView.
export interface MatchData {
  view: PlayerView; ix: ActionIndex; marks: ReturnType<typeof marksFor>; spent: Set<number>;
  focus: HexKey | null; radius: number; factions: [FactionId, FactionId];
}

export function matchData(state: MatchState, viewer: PlayerId, selection: Selection): MatchData {
  const view = playerView(state, viewer);
  const ix = indexActions(legalActions(state));
  const capital = view.cities.find((c) => c.owner === viewer && c.capital);
  const first = view.units.find((u) => u.owner === viewer);
  return {
    view, ix, marks: marksFor(selection, view, ix), spent: spentUnits(view, ix),
    focus: capital?.pos ?? first?.pos ?? null, radius: state.radius,
    factions: [state.players[0]!.faction, state.players[1]!.faction],
  };
}

type Sheet = 'none' | 'tech' | 'menu';

export function Match(): ReactElement | null {
  const state = useApp((s) => s.state);
  const record = useApp((s) => s.record);
  const viewer = useApp((s) => s.viewer);
  const selection = useApp((s) => s.selection);
  const digest = useApp((s) => s.digest);
  const last = useApp((s) => s.last);
  const run = useApp((s) => s.run);
  const arm = useApp((s) => s.arm);
  const goHome = useApp((s) => s.goHome);
  const dismissDigest = useApp((s) => s.dismissDigest);

  const [sheet, setSheet] = useState<Sheet>('none');
  const [locked, setLocked] = useState(true);
  const [soundOn, setSoundOn] = useState(() => !isMuted());
  const [later, setLater] = useState<number[]>([]);

  // End turn waits a moment after the screen appears, so the tap that ended the curtain cannot end the turn too.
  useEffect(() => {
    const t = setTimeout(() => setLocked(false), END_TURN_LOCK_MS);
    return () => clearTimeout(t);
  }, []);

  // One sound per accepted action; what was accepted before this screen appeared is not replayed.
  const heard = useRef(last?.seq ?? 0);
  useEffect(() => {
    if (last === null || last.seq === heard.current) return;
    heard.current = last.seq;
    const name = soundFor(last.events);
    if (name !== null) play(name);
  }, [last]);

  const data = useMemo(
    () => (state === null || viewer === null ? null : matchData(state, viewer, selection)),
    [state, viewer, selection],
  );
  if (state === null || record === null || viewer === null || data === null) return null;

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
      panel = (
        <CityPanel
          level={city.level} growth={city.growth} growthNeeded={growthNeeded(state, city)}
          units={unitsOf(state, city.id)} capacity={unitCapacity(city)} income={cityIncome(state, city)}
          walls={city.walls} commands={mine ? cityCommands(city.id, state, ix) : []} onCommand={onCommand}
        />
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
  const toggleSound = (): void => { setMuted(soundOn); setSoundOn(!soundOn); };

  return (
    <div className="screen match" data-testid="match">
      <Hud
        name={record.players[viewer]?.name ?? ''} colour={FACTION_COLOUR[player.faction].main} faction={player.faction}
        gold={player.gold} income={playerIncome(state, viewer)} round={roundOf(state)}
        unitsToAct={ix.activeUnits.length} techReady={ix.research.length > 0} endDisabled={locked}
        onOpenTech={() => setSheet('tech')} onOpenMenu={() => setSheet('menu')} onEndTurn={() => run({ type: 'endTurn' })}
      />
      <div className="board-slot" data-testid="board-slot" />
      {panel !== null ? <aside className="selection">{panel}</aside> : null}
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
          <button type="button" data-testid="digest-ok" onClick={dismissDigest}>{T.ui.gotIt}</button>
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
