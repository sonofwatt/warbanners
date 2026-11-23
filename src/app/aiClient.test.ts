import { afterEach, expect, test, vi } from 'vitest';
import { randomPlayout } from '../engine/testkit';
import { aiInputFor } from '../ai/input';
import { planTurn } from '../ai/plan';
import type { Plan } from '../ai/plan';
import { FALLBACK_DIAL_CAP, MAX_WORKER_FAILURES, SupersededError, THINK_TIMEOUT_MS, createAiClient, isSuperseded } from './aiClient';
import type { WorkerLike } from './aiClient';

vi.setConfig({ testTimeout: 30_000 });
afterEach(() => { vi.useRealTimers(); });

interface Fake extends WorkerLike { sent: { id: number }[]; terminated: number }
function fake(): Fake {
  const w: Fake = {
    sent: [], terminated: 0, onmessage: null, onerror: null,
    postMessage(m) { w.sent.push(m as { id: number }); },
    terminate() { w.terminated += 1; },
  };
  return w;
}
let cached: ReturnType<typeof aiInputFor> | undefined;
const input = () => (cached ??= aiInputFor(randomPlayout(7, 60), 0));   // any mid-game input will do: the worker is faked, and (7, 160) takes over 20 s to build since rules 7
const stub = (n: number): Plan => ({ actions: [{ type: 'endTurn' }], expect: [`k${n}`], evals: n, cutShort: false });

test('answers come back by id and stale ones are ignored', async () => {
  const w = fake();
  const client = createAiClient(() => w);
  const opts = { dial: 0.5, seed: 1, refused: [] };
  const first = client.think(input(), opts);
  const firstOutcome = first.then(() => 'resolved', (e: unknown) => (isSuperseded(e) ? 'superseded' : 'other'));
  const second = client.think(input(), opts);
  expect(w.sent.map((m) => m.id)).toEqual([1, 2]);
  w.onmessage?.({ data: { id: 2, plan: stub(2) } });
  w.onmessage?.({ data: { id: 1, plan: stub(1) } });
  await expect(second).resolves.toEqual(stub(2));
  await expect(firstOutcome).resolves.toBe('superseded');
  expect(w.terminated).toBe(0);
  client.dispose();
  expect(w.terminated).toBe(1);
});

// A factory that hands out a new fake worker each time it is called.
function factory() {
  const made: Fake[] = [];
  return { made, make: () => { const w = fake(); made.push(w); return w; } };
}

test('a worker that errors falls back to the main thread at easy, and the next think gets a new worker', async () => {
  const f = factory();
  const client = createAiClient(f.make);
  const inp = input();
  const opts = { dial: 0.9, seed: 3, refused: [] };
  const p = client.think(inp, opts);
  f.made[0]!.onerror?.(new Error('boom'));
  await expect(p).resolves.toEqual(planTurn(inp, { ...opts, dial: Math.min(opts.dial, FALLBACK_DIAL_CAP) }));
  expect(f.made[0]!.terminated).toBe(1);
  const next = client.think(inp, opts);
  expect(f.made).toHaveLength(2);
  expect(f.made[1]!.sent).toHaveLength(1);
  f.made[1]!.onmessage?.({ data: { id: 2, plan: stub(2) } });
  await expect(next).resolves.toEqual(stub(2));
});

test('a planner error reply is answered on the main thread and the same worker plans the next think', async () => {
  const f = factory();
  const client = createAiClient(f.make);
  const inp = input();
  const opts = { dial: 0.1, seed: 4, refused: [] };
  const p = client.think(inp, opts);
  f.made[0]!.onmessage?.({ data: { id: 1, error: 'bad' } });
  await expect(p).resolves.toEqual(planTurn(inp, opts));
  expect(f.made[0]!.terminated).toBe(0);
  const next = client.think(inp, { ...opts, dial: 0.9 });
  expect(f.made).toHaveLength(1);
  expect(f.made[0]!.sent.map((m) => m.id)).toEqual([1, 2]);
  f.made[0]!.onmessage?.({ data: { id: 2, plan: stub(2) } });
  await expect(next).resolves.toEqual(stub(2));
});

test('a timeout ends that worker and the next think gets a fresh one', async () => {
  const inp = input();
  vi.useFakeTimers();
  const f = factory();
  const client = createAiClient(f.make);
  const opts = { dial: 1, seed: 5, refused: [] };
  const p = client.think(inp, opts);
  await vi.advanceTimersByTimeAsync(THINK_TIMEOUT_MS);
  await vi.runAllTimersAsync();
  await expect(p).resolves.toEqual(planTurn(inp, { ...opts, dial: FALLBACK_DIAL_CAP }));
  expect(f.made[0]!.terminated).toBe(1);
  const next = client.think(inp, opts);
  expect(f.made).toHaveLength(2);
  expect(f.made[1]!.sent.map((m) => m.id)).toEqual([2]);
  f.made[1]!.onmessage?.({ data: { id: 2, plan: stub(2) } });
  await expect(next).resolves.toEqual(stub(2));
});

test(`after ${MAX_WORKER_FAILURES} failures in a row the session plans on the main thread`, async () => {
  const f = factory();
  const client = createAiClient(f.make);
  const inp = input();
  const opts = { dial: 0.1, seed: 4, refused: [] };
  for (let i = 1; i <= MAX_WORKER_FAILURES; i += 1) {
    const p = client.think(inp, opts);
    f.made.at(-1)!.onmessage?.({ data: { id: i, error: 'bad' } });
    await expect(p).resolves.toEqual(planTurn(inp, opts));
  }
  expect(f.made).toHaveLength(1);
  expect(f.made[0]!.terminated).toBe(1);
  await expect(client.think(inp, opts)).resolves.toEqual(planTurn(inp, opts));
  expect(f.made).toHaveLength(1);
  expect(f.made[0]!.sent).toHaveLength(MAX_WORKER_FAILURES);
});

test('a good answer resets the count of failures in a row', async () => {
  const f = factory();
  const client = createAiClient(f.make);
  const inp = input();
  const opts = { dial: 0.1, seed: 4, refused: [] };
  let id = 0;
  const fail = async () => { const p = client.think(inp, opts); f.made[0]!.onmessage?.({ data: { id: ++id, error: 'bad' } }); await p; };
  for (let i = 1; i < MAX_WORKER_FAILURES; i += 1) await fail();
  const ok = client.think(inp, opts);
  f.made[0]!.onmessage?.({ data: { id: ++id, plan: stub(id) } });
  await expect(ok).resolves.toEqual(stub(id));
  for (let i = 1; i < MAX_WORKER_FAILURES; i += 1) await fail();
  expect(f.made[0]!.terminated).toBe(0);
  client.think(inp, opts).catch(() => {});
  expect(f.made[0]!.sent).toHaveLength(2 * MAX_WORKER_FAILURES);
  client.dispose();
});

test('a worker that cannot be built after a timeout stops the workers for the session', async () => {
  const inp = input();
  vi.useFakeTimers();
  let calls = 0;
  const w = fake();
  const client = createAiClient(() => { calls += 1; return calls === 1 ? w : null; });
  const opts = { dial: 0.6, seed: 5, refused: [] };
  const p = client.think(inp, opts);
  await vi.advanceTimersByTimeAsync(THINK_TIMEOUT_MS);
  await vi.runAllTimersAsync();
  await p;
  const second = client.think(inp, opts);
  await vi.runAllTimersAsync();
  await expect(second).resolves.toEqual(planTurn(inp, { ...opts, dial: FALLBACK_DIAL_CAP }));
  const third = client.think(inp, opts);
  await vi.runAllTimersAsync();
  await third;
  expect(calls).toBe(2);
});

test('the main-thread fallback reads the clock, so its deadline holds', async () => {
  const inp = input();
  const opts = { dial: 0.2, seed: 9, refused: [], deadlineMs: 100 };
  let t = 0;
  const client = createAiClient(() => null, () => (t += 50));
  const plan = await client.think(inp, opts);
  expect(t).toBeGreaterThan(0);
  expect(plan.cutShort).toBe(true);
  const unhurried = planTurn(inp, opts);
  expect(plan.evals).toBeLessThan(unhurried.evals);
});

test('a worker that never answers falls back after the timeout', async () => {
  const inp = input();
  vi.useFakeTimers();
  const w = fake();
  const client = createAiClient(() => w);
  const opts = { dial: 1, seed: 5, refused: [] };
  const p = client.think(inp, opts);
  await vi.advanceTimersByTimeAsync(THINK_TIMEOUT_MS - 1);
  expect(w.terminated).toBe(0);
  await vi.advanceTimersByTimeAsync(1);
  await vi.runAllTimersAsync();
  await expect(p).resolves.toEqual(planTurn(inp, { ...opts, dial: FALLBACK_DIAL_CAP }));
  expect(w.terminated).toBe(1);
});

test('no Worker at all', async () => {
  const client = createAiClient(() => null);
  const inp = input();
  const opts = { dial: 0.6, seed: 6, refused: [] };
  await expect(client.think(inp, opts)).resolves.toEqual(planTurn(inp, { ...opts, dial: FALLBACK_DIAL_CAP }));
});

test('a factory that throws also falls back', async () => {
  const client = createAiClient(() => { throw new Error('no worker'); });
  const inp = input();
  const opts = { dial: 0.1, seed: 7, refused: [] };
  await expect(client.think(inp, opts)).resolves.toEqual(planTurn(inp, opts));
});

test('a superseded think rejects at once; the old timeout does not touch the new one', async () => {
  vi.useFakeTimers();
  const w = fake();
  const client = createAiClient(() => w);
  const opts = { dial: 0.5, seed: 1, refused: [] };
  const old = client.think(input(), opts);
  const oldSettled = expect(old).rejects.toBeInstanceOf(SupersededError);
  await vi.advanceTimersByTimeAsync(THINK_TIMEOUT_MS - 1000);
  const fresh = client.think(input(), opts);
  await oldSettled;
  await vi.advanceTimersByTimeAsync(1000);   // the old think's deadline passes
  expect(w.terminated).toBe(0);
  w.onmessage?.({ data: { id: 2, plan: stub(2) } });
  await expect(fresh).resolves.toEqual(stub(2));
});

test('a superseded think followed by a timeout answers only the newest question', async () => {
  vi.useFakeTimers();
  const w = fake();
  const client = createAiClient(() => w);
  const inp = input();
  const opts = { dial: 0.7, seed: 2, refused: [] };
  const old = client.think(inp, opts);
  const oldSettled = expect(old).rejects.toBeInstanceOf(SupersededError);
  const fresh = client.think(inp, opts);
  await oldSettled;
  await vi.advanceTimersByTimeAsync(THINK_TIMEOUT_MS);
  await vi.runAllTimersAsync();
  await expect(fresh).resolves.toEqual(planTurn(inp, { ...opts, dial: FALLBACK_DIAL_CAP }));
  expect(w.terminated).toBe(1);
});

test('dispose rejects a pending think, guards terminate, and later thinks use the main thread', async () => {
  const w = fake();
  w.terminate = () => { w.terminated += 1; throw new Error('gone'); };
  const client = createAiClient(() => w);
  const inp = input();
  const opts = { dial: 0.9, seed: 8, refused: [] };
  const pending = client.think(inp, opts);
  const settled = expect(pending).rejects.toMatchObject({ name: 'SupersededError', message: 'disposed' });
  expect(() => client.dispose()).not.toThrow();
  await settled;
  expect(w.terminated).toBe(1);
  await expect(client.think(inp, opts)).resolves.toEqual(planTurn(inp, { ...opts, dial: FALLBACK_DIAL_CAP }));
  expect(w.sent).toHaveLength(1);
});
