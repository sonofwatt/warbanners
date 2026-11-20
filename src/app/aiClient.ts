// Runs the AI planner in a Web Worker; when a think fails, plans that one on the main thread at easy instead.
import { planTurn } from '../ai/plan';
import type { Plan, PlanOpts } from '../ai/plan';
import type { AiInput } from '../ai/types';

export const THINK_TIMEOUT_MS = 8000;
export const FALLBACK_DIAL_CAP = 0.2;   // the main-thread fallback plans at easy at most
export const MAX_WORKER_FAILURES = 3;   // failures in a row before the session stops using workers

export interface WorkerLike {
  postMessage(m: unknown): void; terminate(): void;
  onmessage: ((e: { data: unknown }) => void) | null; onerror: ((e: unknown) => void) | null;
}
// A think that was replaced by a newer one, or cut off by dispose(), rejects with this. Callers catch it and stop.
export class SupersededError extends Error {
  constructor(message = 'superseded') { super(message); this.name = 'SupersededError'; }
}
export const isSuperseded = (e: unknown): e is SupersededError => e instanceof SupersededError;

export interface AiClient { think(input: AiInput, opts: Omit<PlanOpts, 'now'>): Promise<Plan>; dispose(): void }

type Opts = Omit<PlanOpts, 'now'>;

function makeWorker(): WorkerLike | null {
  try {
    if (typeof Worker === 'undefined') return null;
    return new Worker(new URL('../ai/worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
  } catch { return null; }
}

// Reads the clock only when called, so importing this module touches nothing.
const wallClock = (): number => performance.now();

function onMainThread(input: AiInput, opts: Opts, now: () => number): Promise<Plan> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try { resolve(planTurn(input, { ...opts, dial: Math.min(opts.dial, FALLBACK_DIAL_CAP), now })); } catch (e) { reject(e); }
    }, 0);
  });
}

// One failed think falls back for that think only. A worker that times out or breaks is replaced for the next think;
// a planner error reply keeps the worker. After MAX_WORKER_FAILURES failures in a row, or when no worker can be
// built, the rest of the session plans on the main thread.
export function createAiClient(make: () => WorkerLike | null = makeWorker, now: () => number = wallClock): AiClient {
  let worker: WorkerLike | null = null;
  let broken = false;
  let failures = 0;
  let nextId = 0;
  let current: { id: number; input: AiInput; opts: Opts; resolve: (p: Plan) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> } | null = null;

  const drop = () => {
    const w = worker; worker = null;
    if (w) { w.onmessage = null; w.onerror = null; try { w.terminate(); } catch { /* already gone */ } }
  };

  // 'reply': the worker answered with an error, so it is still sound. 'worker': it broke or went quiet.
  const fail = (kind: 'reply' | 'worker') => {
    failures += 1;
    if (failures >= MAX_WORKER_FAILURES) broken = true;
    if (kind === 'worker' || broken) drop();
    const c = current; current = null;
    if (c) { clearTimeout(c.timer); onMainThread(c.input, c.opts, now).then(c.resolve, c.reject); }
  };

  const start = (): WorkerLike | null => {
    if (broken) return null;
    if (worker) return worker;
    let w: WorkerLike | null;
    try { w = make(); } catch { w = null; }
    if (!w) { broken = true; return null; }
    worker = w;
    w.onmessage = (e) => {
      const m = e.data as { id?: number; plan?: Plan; error?: string } | null;
      if (!m || !current || m.id !== current.id) return;   // an old answer
      if (m.plan) { const c = current; current = null; clearTimeout(c.timer); failures = 0; c.resolve(m.plan); } else fail('reply');
    };
    w.onerror = () => fail('worker');
    return w;
  };

  return {
    think(input, opts) {
      const w = start();
      if (!w) return onMainThread(input, opts, now);
      if (current) { clearTimeout(current.timer); current.reject(new SupersededError()); }   // a newer question supersedes the old one
      const id = ++nextId;
      return new Promise<Plan>((resolve, reject) => {
        current = { id, input, opts, resolve, reject, timer: setTimeout(() => fail('worker'), THINK_TIMEOUT_MS) };
        try { w.postMessage({ id, input, opts }); } catch { fail('worker'); }
      });
    },
    dispose() {
      const c = current; current = null;
      if (c) { clearTimeout(c.timer); c.reject(new SupersededError('disposed')); }
      broken = true;
      drop();
    },
  };
}
