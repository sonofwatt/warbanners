// The AI's Web Worker: plans a turn off the main thread. The only file in src/ai that may read the clock.
import { planTurn } from './plan';
import type { Plan, PlanOpts } from './plan';
import type { AiInput } from './types';

export interface WorkerRequest { id: number; input: AiInput; opts: Omit<PlanOpts, 'now'> }
export type WorkerReply = { id: number; plan: Plan } | { id: number; error: string };

const scope = self as unknown as {
  onmessage: ((e: { data: WorkerRequest }) => void) | null;
  postMessage(m: WorkerReply): void;
};

scope.onmessage = (e) => {
  const { id, input, opts } = e.data;
  try {
    scope.postMessage({ id, plan: planTurn(input, { ...opts, now: () => performance.now() }) });
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
