// Runs the AI planner in a Web Worker; on any trouble, plans on the main thread at easy instead.
import { planTurn } from '../ai/plan';
import type { Plan, PlanOpts } from '../ai/plan';
import type { AiInput } from '../ai/types';

export const THINK_TIMEOUT_MS = 8000;
export const FALLBACK_DIAL_CAP = 0.2;   // the main-thread fallback plans at easy at most

export interface WorkerLike {
  postMessage(m: unknown): void; terminate(): void;
  onmessage: ((e: { data: unknown }) => void) | null; onerror: ((e: unknown) => void) | null;
}
export interface AiClient { think(input: AiInput, opts: Omit<PlanOpts, 'now'>): Promise<Plan>; dispose(): void }

type Opts = Omit<PlanOpts, 'now'>;

function makeWorker(): WorkerLike | null {
  try {
    if (typeof Worker === 'undefined') return null;
    return new Worker(new URL('../ai/worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
  } catch { return null; }
}

function onMainThread(input: AiInput, opts: Opts): Promise<Plan> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try { resolve(planTurn(input, { ...opts, dial: Math.min(opts.dial, FALLBACK_DIAL_CAP) })); } catch (e) { reject(e); }
    }, 0);
  });
}

export function createAiClient(make: () => WorkerLike | null = makeWorker): AiClient {
  let worker: WorkerLike | null = null;
  let started = false;
  let broken = false;
  let nextId = 0;
  let current: { id: number; input: AiInput; opts: Opts; resolve: (p: Plan) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> } | null = null;

  const giveUp = () => {
    broken = true;
    const w = worker; worker = null;
    if (w) { w.onmessage = null; w.onerror = null; try { w.terminate(); } catch { /* already gone */ } }
    const c = current; current = null;
    if (c) { clearTimeout(c.timer); onMainThread(c.input, c.opts).then(c.resolve, c.reject); }
  };

  const start = (): WorkerLike | null => {
    if (broken) return null;
    if (started) return worker;
    started = true;
    try { worker = make(); } catch { worker = null; }
    if (!worker) { broken = true; return null; }
    worker.onmessage = (e) => {
      const m = e.data as { id?: number; plan?: Plan; error?: string } | null;
      if (!m || !current || m.id !== current.id) return;   // an old answer
      if (m.plan) { const c = current; current = null; clearTimeout(c.timer); c.resolve(m.plan); } else giveUp();
    };
    worker.onerror = () => giveUp();
    return worker;
  };

  return {
    think(input, opts) {
      const w = start();
      if (!w) return onMainThread(input, opts);
      if (current) clearTimeout(current.timer);   // a newer question supersedes the old one, which is never answered
      const id = ++nextId;
      return new Promise<Plan>((resolve, reject) => {
        current = { id, input, opts, resolve, reject, timer: setTimeout(giveUp, THINK_TIMEOUT_MS) };
        try { w.postMessage({ id, input, opts }); } catch { giveUp(); }
      });
    },
    dispose() {
      if (current) clearTimeout(current.timer);
      current = null; broken = true;
      const w = worker; worker = null;
      if (w) { w.onmessage = null; w.onerror = null; w.terminate(); }
    },
  };
}
