import { afterEach, expect, test, vi } from 'vitest';
import { randomPlayout } from '../engine/testkit';
import { aiInputFor } from '../ai/input';
import { planTurn } from '../ai/plan';
import type { Plan } from '../ai/plan';
import { FALLBACK_DIAL_CAP, THINK_TIMEOUT_MS, createAiClient } from './aiClient';
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
const input = () => (cached ??= aiInputFor(randomPlayout(7, 160), 0));
const stub = (n: number): Plan => ({ actions: [{ type: 'endTurn' }], expect: [`k${n}`], evals: n, cutShort: false });

test('answers come back by id and stale ones are ignored', async () => {
  const w = fake();
  const client = createAiClient(() => w);
  const opts = { dial: 0.5, seed: 1, refused: [] };
  const first = vi.fn();
  void client.think(input(), opts).then(first);
  const second = client.think(input(), opts);
  expect(w.sent.map((m) => m.id)).toEqual([1, 2]);
  w.onmessage?.({ data: { id: 2, plan: stub(2) } });
  w.onmessage?.({ data: { id: 1, plan: stub(1) } });
  await expect(second).resolves.toEqual(stub(2));
  await Promise.resolve();
  expect(first).not.toHaveBeenCalled();
  expect(w.terminated).toBe(0);
  client.dispose();
  expect(w.terminated).toBe(1);
});

test('a worker that errors falls back to the main thread at easy', async () => {
  const w = fake();
  const client = createAiClient(() => w);
  const inp = input();
  const opts = { dial: 0.9, seed: 3, refused: [] };
  const p = client.think(inp, opts);
  w.onerror?.(new Error('boom'));
  await expect(p).resolves.toEqual(planTurn(inp, { ...opts, dial: Math.min(opts.dial, FALLBACK_DIAL_CAP) }));
  expect(w.terminated).toBe(1);
  // the worker is not used again this session
  await client.think(inp, opts);
  expect(w.sent).toHaveLength(1);
});

test('a worker that posts an error falls back too', async () => {
  const w = fake();
  const client = createAiClient(() => w);
  const inp = input();
  const opts = { dial: 0.1, seed: 4, refused: [] };
  const p = client.think(inp, opts);
  w.onmessage?.({ data: { id: 1, error: 'bad' } });
  await expect(p).resolves.toEqual(planTurn(inp, opts));
  expect(w.terminated).toBe(1);
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
