import { abilityHandler } from './abilities';
import { attackHandler } from './combat';
import { buildHandler, harvestHandler, rewardHandler, roadHandler, wallsHandler } from './economy';
import { captureHandler, resignHandler } from './capture';
import { researchHandler } from './tech';
import { trainHandler } from './training';
import { endTurnHandler } from './turn';
import { moveHandler } from './movement';
import { refreshExplored } from './vision';
import type { Action, GameEvent, Handler, MatchState, Result } from './types';

// Later tasks register their action handlers here.
export const HANDLERS: Partial<Record<Action['type'], Handler<any>>> = {
  move: moveHandler,
  attack: attackHandler,
  ability: abilityHandler,
  harvest: harvestHandler,
  build: buildHandler,
  road: roadHandler,
  buildWalls: wallsHandler,
  chooseReward: rewardHandler,
  research: researchHandler,
  train: trainHandler,
  capture: captureHandler,
  resign: resignHandler,
  endTurn: endTurnHandler,
};

export function applyAction(state: MatchState, action: Action): Result {
  if (state.winner !== null) return { ok: false, reason: 'match over' };
  const type = typeof action === 'object' && action !== null ? (action as { type?: unknown }).type : undefined;
  if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(HANDLERS, type)) {
    return { ok: false, reason: 'unknown action' };
  }
  const handler = HANDLERS[type as Action['type']]!;
  const draft = structuredClone(state);
  const events: GameEvent[] = [];
  try {
    const reason = handler(draft, action, events);
    if (reason !== null) return { ok: false, reason };
    for (const p of draft.players) if (p.alive) refreshExplored(draft, p.id);
  } catch {
    return { ok: false, reason: 'invalid action' };
  }
  return { ok: true, state: draft, events };
}
