// The online twin of the store's playAi: plays an AI seat's turn through plan 3's step driver and appends each action
// to the room. No screen pacing and no local save. It keeps nothing between calls but the seat's salt and adapt, both
// in the database, so a stand-in host carries on the same AI from the current state.
import { applyAction } from '../engine';
import type { Action, MatchState, PlayerId } from '../engine';
import { adaptStep, gapOf } from '../ai/adapt';
import type { AdaptState } from '../ai/adapt';
import { afterAct, afterThink, aiStep, FIRST_THINK_MS, REPLAN_MS, START } from '../ai/driver';
import type { Cursor } from '../ai/driver';
import { aiInputFor } from '../ai/input';
import { LEVEL_DIAL } from '../ai/types';
import { isSuperseded } from '../app/aiClient';
import type { AiClient } from '../app/aiClient';
import type { RoomSeat } from './wire';

export interface AiSeatDeps {
  ai: AiClient;                                                 // the session's shared client: never disposed here
  state(): MatchState | null;                                   // the session's current followed state
  live(): boolean;                                              // still host, still this seat's turn, session open
  append(action: Action, adapt: AdaptState | null): Promise<boolean>;   // true once the write landed and the state moved on
}
export type AiSeatEnd = 'ended' | 'stopped' | 'passed';

const END_TURN: Action = { type: 'endTurn' };

// `turnFresh`: no action yet in this AI turn. The client rarely throws (it falls back to the main thread at a capped
// dial), and a fallback plan breaks same-salt determinism between phones; the retry-then-pass path is for the rest.
export async function playAiSeat(
  seat: PlayerId, info: Extract<RoomSeat, { kind: 'ai' }>, turnFresh: boolean, deps: AiSeatDeps,
): Promise<AiSeatEnd> {
  const start = deps.state();
  if (start === null) return 'stopped';
  if (start.winner !== null) return 'ended';

  // The adaptive dial moves once, as the turn starts, and is sent with the turn's first action. A host that picks the
  // turn up midway uses the stored dial, which already moved.
  let adapt: AdaptState | null = info.level === 'adaptive' && turnFresh ? adaptStep(info.adapt, gapOf(start, seat)) : null;
  const dial = info.level === 'adaptive' ? (adapt ?? info.adapt).dial : LEVEL_DIAL[info.level];
  const aiSeat = { player: seat, dial, salt: info.salt };

  // Appends one action the engine accepted, with the dial if it has not gone yet. Once an ending action lands the
  // turn is no longer this seat's, so `live()` is checked by the caller only when the turn goes on.
  const send = async (action: Action): Promise<boolean> => {
    const ok = await deps.append(action, adapt);
    if (ok) adapt = null;
    return ok;
  };

  let cur: Cursor = START;
  let failed = false;      // the step being tried has failed once already
  for (;;) {
    try {
      const state = deps.state();
      if (state === null) return 'stopped';
      if (state.winner !== null) return 'ended';
      const step = aiStep(cur, state, aiSeat);
      if (step.kind === 'think') {
        const deadlineMs = cur.plan === null && cur.refused.length === 0 ? FIRST_THINK_MS : REPLAN_MS;
        const plan = await deps.ai.think(aiInputFor(state, seat), { dial, seed: step.seed, refused: step.refused, deadlineMs });
        if (!deps.live()) return 'stopped';
        cur = afterThink(cur, plan);
        failed = false;
        continue;
      }
      const res = applyAction(state, step.action);
      cur = afterAct(cur, step.action, res.ok);
      failed = false;
      if (!res.ok) {
        if (step.action.type === 'endTurn') return 'stopped';   // cannot happen; never loop on it
        continue;
      }
      if (!(await send(step.action))) return 'stopped';
      if (step.action.type === 'endTurn' || res.state.winner !== null) return 'ended';
      if (!deps.live()) return 'stopped';
    } catch (e) {
      // A newer think took over, or this phone no longer plays the seat: stop and let the session decide.
      if (isSuperseded(e) || !deps.live()) return 'stopped';
      // Anything else (a planner failure): try the same step once more, then pass the turn rather than freeze it.
      if (!failed) { failed = true; continue; }
      const state = deps.state();
      if (state === null || !applyAction(state, END_TURN).ok) return 'stopped';
      return (await send(END_TURN)) ? 'passed' : 'stopped';
    }
  }
}
