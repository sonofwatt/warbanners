// The AI turn driver: applies a plan's actions one by one, notices when the real view differs from what
// the plan expected, and replans. The app runs the same three step functions with the worker in between.
import { applyAction } from '../engine';
import type { Action, GameEvent, MatchState, PlayerId } from '../engine';
import { aiInputFor, viewKey } from './input';
import { planTurn } from './plan';
import type { Plan } from './plan';

export const MAX_REPLANS = 6;

export interface AiSeat { player: PlayerId; dial: number; salt: number }

// The planner's seed for one think: from the seat's salt, never from the match seed.
export function planSeed(salt: number, stamp: number, replans: number): number {
  return (salt ^ Math.imul(stamp + 1, 0x9E3779B1) ^ Math.imul(replans + 1, 0x85EBCA6B)) >>> 0;
}

export interface Cursor {
  plan: Plan | null;
  next: number;          // index in plan.actions of the next action to apply
  refused: Action[];     // actions the real match refused this turn
  replans: number;       // plans made after the first
}

export const START: Cursor = { plan: null, next: 0, refused: [], replans: 0 };

export type Step = { kind: 'think'; refused: Action[]; seed: number } | { kind: 'act'; action: Action };

const END_TURN: Action = { type: 'endTurn' };

// No plan and nothing refused yet: the coming think makes the turn's first plan.
const firstThink = (cur: Cursor): boolean => cur.plan === null && cur.refused.length === 0;

// Did the plan believe its last applied action won the match? Only a capture can end a match (the planner
// never resigns), and the believed state counts only seen cities, so it believes it has won exactly when
// the view it expected after the capture shows no rival city. The planner then pushes endTurn without
// applying it, and the real view after the capture differs from that belief whenever the win is not real.
function believedWin(plan: Plan, next: number, me: PlayerId): boolean {
  if (plan.actions[next - 1]?.type !== 'capture') return false;
  try {
    const view = JSON.parse(plan.expect[next - 1] ?? '') as { cities?: { owner: PlayerId }[] };
    return Array.isArray(view.cities) && view.cities.every((c) => c.owner === me);
  } catch {
    return false;
  }
}

export function aiStep(cur: Cursor, real: MatchState, seat: AiSeat): Step {
  const { plan, next } = cur;
  if (plan !== null) {
    const action = plan.actions[next] ?? END_TURN;   // a plan always ends with endTurn; this is a guard
    if (action.type === 'endTurn' && believedWin(plan, next, seat.player)) return { kind: 'act', action };
    if (next === 0 || viewKey(aiInputFor(real, seat.player)) === plan.expect[next - 1]) return { kind: 'act', action };
  }
  const index = firstThink(cur) ? 0 : cur.replans + 1;
  if (index > MAX_REPLANS) return { kind: 'act', action: END_TURN };
  return { kind: 'think', refused: cur.refused, seed: planSeed(seat.salt, real.stamp, index) };
}

export function afterThink(cur: Cursor, plan: Plan): Cursor {
  return { plan, next: 0, refused: cur.refused, replans: firstThink(cur) ? cur.replans : cur.replans + 1 };
}

export function afterAct(cur: Cursor, action: Action, accepted: boolean): Cursor {
  if (accepted) return { ...cur, next: cur.next + 1 };
  return { ...cur, plan: null, next: 0, refused: [...cur.refused, action] };
}

export interface AiTurnLog {
  state: MatchState;
  steps: { action: Action; events: GameEvent[]; before: MatchState }[];
  refused: Action[];
  replans: number;
  evals: number;
}

// One whole AI turn on the real match, planning in place. Stops once endTurn is applied or the match is over.
export function runAiTurn(
  state: MatchState, seat: AiSeat, opts?: { now?: () => number; firstMs?: number; replanMs?: number },
): AiTurnLog {
  let s = state;
  let cur = START;
  let evals = 0;
  const steps: AiTurnLog['steps'] = [];
  while (s.winner === null) {
    const step = aiStep(cur, s, seat);
    if (step.kind === 'think') {
      const deadlineMs = firstThink(cur) ? opts?.firstMs : opts?.replanMs;
      const plan = planTurn(aiInputFor(s, seat.player), {
        dial: seat.dial, seed: step.seed, refused: step.refused, now: opts?.now, deadlineMs,
      });
      evals += plan.evals;
      cur = afterThink(cur, plan);
      continue;
    }
    const r = applyAction(s, step.action);
    if (!r.ok && step.action.type === 'endTurn') throw new Error(`the match refused endTurn: ${r.reason}`);
    cur = afterAct(cur, step.action, r.ok);
    if (!r.ok) continue;
    steps.push({ action: step.action, events: r.events, before: s });
    s = r.state;
    if (step.action.type === 'endTurn') break;
  }
  return { state: s, steps, refused: cur.refused, replans: cur.replans, evals };
}
