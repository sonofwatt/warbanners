import { expect, test, vi } from 'vitest';
import { applyAction, createMatch } from '../engine';
import type { Action, MatchState } from '../engine';
import { must } from '../engine/testkit';
import type { AdaptState } from '../ai/adapt';
import { planTurn } from '../ai/plan';
import { SupersededError } from '../app/aiClient';
import type { AiClient } from '../app/aiClient';
import { encodeAction } from './wire';
import type { RoomSeat } from './wire';
import { playAiSeat } from './aiSeat';
import type { AiSeatDeps } from './aiSeat';

vi.setConfig({ testTimeout: 30_000 });   // these run the real planner on a shared machine

const BOT: RoomSeat = { uid: 'ai_1', name: 'Bot', kind: 'ai', level: 'normal', salt: 7, adapt: { dial: 0.5, trend: 0 } };
// A planner on the main thread stands in for the worker, as store.test.ts's `thinker` does.
const thinker = (): AiClient => ({ think: async (input, opts) => planTurn(input, opts), dispose: () => {} });
function harness(start: MatchState) {
  let state = start; const sent: { action: Action; adapt: AdaptState | null }[] = [];
  const deps: AiSeatDeps = {
    ai: thinker(), state: () => state, live: () => true,
    append: async (action, adapt) => { const r = applyAction(state, action); if (!r.ok) return false; state = r.state; sent.push({ action, adapt }); return true; },
  };
  return { deps, sent, now: () => state };
}
const AFTER_ONE = () => must(applyAction(createMatch({ seed: 42, factions: ['spartans', 'mongols'] }), { type: 'endTurn' }));

test('an AI seat plays a whole turn and ends it', async () => {
  const h = harness(AFTER_ONE());
  h.deps.live = () => h.now().current === 1;                               // as the session's: still this seat's turn
  expect(await playAiSeat(1, BOT as never, true, h.deps)).toBe('ended');
  expect(h.sent.length).toBeGreaterThan(1);
  expect(h.sent.at(-1)!.action).toEqual({ type: 'endTurn' }); expect(h.now().current).toBe(0);
  expect(h.sent.every(x => x.adapt === null)).toBe(true);                  // a fixed level has no dial to send
});
test('the same salt plays the same turn on any phone', async () => {
  const a = harness(AFTER_ONE()); const b = harness(AFTER_ONE());
  await playAiSeat(1, BOT as never, true, a.deps); await playAiSeat(1, BOT as never, true, b.deps);
  expect(a.sent.map(x => encodeAction(x.action))).toEqual(b.sent.map(x => encodeAction(x.action)));
});
test('adaptive: the dial moves once, with the first action, and not again after a handover', async () => {
  const seat = { ...BOT, level: 'adaptive' } as Extract<RoomSeat, { kind: 'ai' }>;
  const h = harness(AFTER_ONE());
  await playAiSeat(1, seat, true, h.deps);
  expect(h.sent[0]!.adapt).not.toBeNull(); expect(h.sent.slice(1).every(x => x.adapt === null)).toBe(true);
  const mid = harness(AFTER_ONE());
  mid.deps.live = () => mid.sent.length < 1;                                // the host leaves after its first action
  expect(await playAiSeat(1, seat, true, mid.deps)).toBe('stopped');
  const standIn = harness(mid.now());
  await playAiSeat(1, { ...seat, adapt: mid.sent[0]!.adapt! }, false, standIn.deps);
  expect(standIn.sent.every(x => x.adapt === null)).toBe(true);
  expect(standIn.now().current).toBe(0);
});
test('a lost write stops the AI; the session decides who plays on', async () => {
  const h = harness(AFTER_ONE()); h.deps.append = async () => false;
  expect(await playAiSeat(1, BOT as never, true, h.deps)).toBe('stopped');
});
test('a planner that keeps failing passes the turn', async () => {
  const h = harness(AFTER_ONE()); h.deps.ai = { think: async () => { throw new Error('boom'); }, dispose: () => {} };
  expect(await playAiSeat(1, BOT as never, true, h.deps)).toBe('passed');
  expect(h.sent.map(x => x.action)).toEqual([{ type: 'endTurn' }]);
});
test('a superseded think stops quietly', async () => {
  const h = harness(AFTER_ONE()); h.deps.ai = { think: async () => { throw new SupersededError(); }, dispose: () => {} };
  expect(await playAiSeat(1, BOT as never, true, h.deps)).toBe('stopped'); expect(h.sent).toEqual([]);
});
