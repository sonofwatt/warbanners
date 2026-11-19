import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { applyAction, createMatch, legalActions, playerView } from '../../engine';
import type { HexKey, MatchState } from '../../engine';
import { indexActions, spentUnits } from '../interaction';
import { Board } from './Board';
import { buildScene } from './scene';

// A developer page: player 0's view of a seeded match, every tap written to an <output>.
// Open it with ?board=<seed>, and add &turns=<n> to play n turns of fixed but arbitrary
// legal moves first, so the board shows more than the opening.

const MAX_ACTIONS_PER_TURN = 60;

/** Plays `turns` turns, picking legal actions by a fixed rule (never resign). */
export function advance(start: MatchState, turns: number): MatchState {
  let s = start;
  let ended = 0;
  for (let i = 0; ended < turns && i < turns * MAX_ACTIONS_PER_TURN; i++) {
    const actions = legalActions(s).filter((a) => a.type !== 'resign');
    if (actions.length === 0) break;
    const action = actions[(i * 7) % actions.length]!;
    const r = applyAction(s, action);
    if (!r.ok) break;
    s = r.state;
    if (action.type === 'endTurn') ended++;
  }
  return s;
}

export function BoardDemo(p: { seed: number; turns: number }): ReactElement {
  const [last, setLast] = useState('');
  const { items, radius, factions, focus } = useMemo(() => {
    const s = advance(createMatch({ seed: p.seed, factions: ['spartans', 'mongols'] }), p.turns);
    const view = playerView(s, 0);
    const spent = s.current === 0 ? spentUnits(view, indexActions(legalActions(s))) : new Set<number>();
    const capital = view.cities.find((c) => c.owner === 0 && c.capital);
    const focus: HexKey = capital?.pos ?? view.units.find((u) => u.owner === 0)?.pos ?? '0,0';
    return {
      items: buildScene({ view, radius: s.radius, marks: {}, selectedUnit: null, spentUnits: spent }),
      radius: s.radius,
      factions: [s.players[0]!.faction, s.players[1]!.faction],
      focus,
    };
  }, [p.seed, p.turns]);
  return (
    <main className="board-demo">
      <Board
        items={items}
        radius={radius}
        factions={factions}
        focus={focus}
        viewer={0}
        onTap={(hit) => setLast(hit.unit === null ? `hex ${hit.hex ?? 'none'}` : `unit ${hit.unit}, hex ${hit.hex ?? 'none'}`)}
      />
      <output data-testid="last-tap">{last}</output>
    </main>
  );
}
