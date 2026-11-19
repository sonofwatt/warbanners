/// <reference types="node" />
import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { LEVEL_DIAL } from '../ai/types';
import { newRecord } from '../app/record';
import type { MatchRecord } from '../app/record';
import { writeSave } from '../app/saves';
import { hashState } from '../engine';
import type { MatchState } from '../engine';
import { randomPlayout } from '../engine/testkit';
import { T } from '../ui/text';
import { frames, openApp } from './harness';

// Solo play in a real browser: with the network cut, and a hard AI turn on a crowded board with the CPU slowed.
// Seed 7 facts (see flow.test.ts): the person (Player 1) moves first with one Warrior (unit 0) on -2,5, which can
// move to -1,4.

const SEED = '?seed=7';

async function tapTile(page: Page, hex: string): Promise<void> {
  const box = await page.locator(`[data-centre="${hex}"]`).boundingBox();
  if (box === null) throw new Error(`tile ${hex} has no box`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await frames(page);
}

/** The service worker has installed every file and Home says so. */
async function installed(page: Page): Promise<void> {
  await page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, no) => setTimeout(() => no(new Error('no service worker became ready')), 20_000)),
  ]));
  await page.getByTestId('offline-ready').waitFor();
  expect(await page.getByTestId('offline-ready').textContent()).toBe(T.ui.offlineReady);
}

/**
 * A saved match written the way the app writes one (real record helpers and save writer, into a map standing in
 * for localStorage): the position after `playerTurns` random turns of seed 7 (the person's move when it is even, so
 * ending the turn hands the AI the board), with the second seat a hard AI.
 */
function savedHardMatch(playerTurns: number): { entries: [string, string][]; state: MatchState } {
  const state = randomPlayout(7, playerTurns);
  const settings = { seed: 7, factions: ['spartans', 'mongols'] as ['spartans', 'mongols'] };
  const base = newRecord('crowded', settings, ['Person', {
    name: T.ai.name.hard, kind: 'ai', level: 'hard', salt: 12345, adapt: { dial: LEVEL_DIAL.hard, trend: 0 },
  }], 1_000_000);
  // The same record shape the store writes for a new match: the snapshot at action count 0 holds the state.
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  const outcome = writeSave({
    getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); },
  }, record, state);
  expect(outcome.saved).toBe(true);
  return { entries: [...map.entries()], state };
}

interface HardTurn { wall: number; paused: number; thinks: number[]; worstWhileThinking: number; worstAnyTime: number }

/**
 * One hard AI turn on a crowded board (24 or more units) with the CPU slowed four times, as a mid-range phone.
 * The position is 160 random turns of seed 7, so it is the person's move and tapping End turn hands the AI the
 * board (with 159 the AI would start on Continue, and the board-opening render would land inside its first think).
 * Times are milliseconds in the page; `paused` is the store's 450 ms waits between the AI's visible actions.
 */
async function hardTurn(): Promise<HardTurn> {
  const { entries, state } = savedHardMatch(160);
  expect(state.winner).toBeNull();
  expect(state.current).toBe(0);
  expect(state.units.length).toBeGreaterThanOrEqual(24);

  const { page, context, close } = await openApp('', {
    beforeOpen: (c) => {
      void c.addInitScript((items: [string, string][]) => {
        try {
          for (const [k, v] of items) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
        } catch { /* the test fails below when Continue is not there */ }
        type Probe = {
          thinks: number[]; sent: number[]; sleeps: number[]; longTasks: { start: number; ms: number }[];
          shown: number | null; hidden: number | null;
        };
        const probe: Probe = { thinks: [], sent: [], sleeps: [], longTasks: [], shown: null, hidden: null };
        (window as unknown as { probe: Probe }).probe = probe;
        // Long tasks on the main thread (the browser reports those over 50 ms).
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) probe.longTasks.push({ start: e.startTime, ms: e.duration });
        }).observe({ type: 'longtask', buffered: true });
        // How long the planner worker took to answer each question it was asked.
        const Real = window.Worker;
        window.Worker = class extends Real {
          private sentAt = 0;
          constructor(url: string | URL, opts?: WorkerOptions) {
            super(url, opts);
            this.addEventListener('message', () => { probe.thinks.push(performance.now() - this.sentAt); });
          }
          override postMessage(m: unknown, ...rest: unknown[]): void {
            this.sentAt = performance.now();
            probe.sent.push(this.sentAt);
            (super.postMessage as (m: unknown, ...r: unknown[]) => void)(m, ...rest);
          }
        } as typeof Worker;
        // The store's pauses between the AI's visible actions: setTimeout(resolve, ms), whose callback is a Promise
        // resolver (no name, one parameter). Asked for while the AI is playing, they are added up and taken off.
        const realTimeout = window.setTimeout.bind(window);
        window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
          if (typeof fn === 'function' && fn.name === '' && fn.length === 1 && typeof ms === 'number' && ms > 0 && probe.sent.length > 0 && probe.hidden === null) probe.sleeps.push(ms);
          return realTimeout(fn, ms, ...args);
        }) as typeof window.setTimeout;
        // When the Thinking line appeared and when it went.
        const watch = (): void => {
          const on = document.querySelector('[data-testid="thinking"]') !== null;
          if (on && probe.shown === null) probe.shown = performance.now();
          if (!on && probe.shown !== null && probe.hidden === null) probe.hidden = performance.now();
        };
        new MutationObserver(watch).observe(document, { childList: true, subtree: true });
      }, entries);
    },
  });
  try {
    await page.getByTestId('continue').waitFor();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    await page.getByTestId('continue').tap();
    await page.getByTestId('match').waitFor();
    await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
    await frames(page);
    await expect.poll(() => page.getByTestId('end-turn').isEnabled()).toBe(true);
    await page.getByTestId('end-turn').tap();
    await page.getByTestId('thinking').waitFor({ timeout: 5000 });
    await page.getByTestId('thinking').waitFor({ state: 'detached', timeout: 30_000 });
    await frames(page);

    const probe = await page.evaluate(() => (window as unknown as { probe: {
      thinks: number[]; sent: number[]; sleeps: number[]; longTasks: { start: number; ms: number }[]; shown: number | null; hidden: number | null;
    } }).probe);
    expect(probe.sent.length).toBeGreaterThan(0);
    expect(probe.hidden).not.toBeNull();
    // The AI's turn runs from its first question to the planner (sent as End turn is tapped) until Thinking goes.
    const begin = probe.sent[0] ?? 0;
    const end = probe.hidden ?? 0;
    const wall = end - begin;
    const paused = probe.sleeps.reduce((a, b) => a + b, 0);
    // Main-thread tasks of 50 ms or more that began while the planner was working on a question: after the
    // question was sent and before its answer came back.
    const during = probe.longTasks.filter((t) => probe.sent.some((at, i) => t.start >= at && t.start <= at + (probe.thinks[i] ?? 0)));
    const worstWhileThinking = Math.max(0, ...during.map((t) => t.ms));
    const worstAnyTime = Math.max(0, ...probe.longTasks.filter((t) => t.start + t.ms >= begin && t.start <= end).map((t) => t.ms));
    process.stderr.write(`AI turn at 4x CPU: wall ${Math.round(wall)} ms, pauses ${paused} ms (${probe.sleeps.length}), wall minus pauses ${Math.round(wall - paused)} ms, planner answers ${JSON.stringify(probe.thinks.map(Math.round))} ms, longest task starting while thinking ${Math.round(worstWhileThinking)} ms, longest task in the whole turn ${Math.round(worstAnyTime)} ms\n`);

    return { wall, paused, thinks: probe.thinks, worstWhileThinking, worstAnyTime };
  } finally {
    await close();
  }
}

describe.runIf(process.env.BROWSER === '1')('solo play in the browser', () => {
  test('solo against the AI with the network cut', async () => {
    const { page, context, close } = await openApp(SEED, { serviceWorkers: 'allow' });
    try {
      await installed(page);
      await context.setOffline(true);
      await page.reload();
      await page.getByTestId('new-match').waitFor();
      expect(await page.evaluate(() => navigator.onLine)).toBe(false);

      await page.getByTestId('new-match').tap();
      await page.getByTestId('second-easy').tap();
      await page.getByTestId('start').tap();
      // No curtain against the AI: the board is there at once.
      await page.getByTestId('match').waitFor();
      expect(await page.getByTestId('pass').count()).toBe(0);
      await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
      await frames(page);
      expect(await page.getByTestId('turn').textContent()).toBe(`${T.ui.turn} 1`);

      await tapTile(page, '-2,5');
      await tapTile(page, '-1,4');
      await expect.poll(() => page.locator('[data-unit="0"]').getAttribute('data-at')).toBe('-1,4');
      await expect.poll(() => page.getByTestId('end-turn').isEnabled()).toBe(true);
      await page.getByTestId('end-turn').tap();

      // The AI plays: Thinking shows, then goes, inside 10 s, and the person is on Turn 2.
      await page.getByTestId('thinking').waitFor({ timeout: 2000 });
      await page.getByTestId('thinking').waitFor({ state: 'detached', timeout: 10_000 });
      await expect.poll(() => page.getByTestId('turn').textContent()).toBe(`${T.ui.turn} 2`);
      // The person's own Warrior stayed where it was left, and the person can act again.
      expect(await page.locator('[data-unit="0"]').getAttribute('data-at')).toBe('-1,4');
      await expect.poll(() => page.getByTestId('end-turn').isEnabled()).toBe(true);

      await page.reload();
      await page.getByTestId('new-match').waitFor();
      expect(await page.locator('[data-testid="save"]').count()).toBe(1);
      await page.getByTestId('continue').tap();
      await page.getByTestId('match').waitFor();
      expect(await page.getByTestId('pass').count()).toBe(0);
      await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
      expect(await page.getByTestId('turn').textContent()).toBe(`${T.ui.turn} 2`);
    } finally {
      await close();
    }
  });

  test('a hard AI turn on a crowded position, CPU slowed four times, takes under 3 s apart from its pauses', async () => {
    const t = await hardTurn();
    expect(t.wall - t.paused).toBeLessThan(3000);
  });

  // Every main-thread task from the End turn tap until Thinking goes, the board's draw after each AI action included
  // (those land in the pauses between actions, not while the planner thinks). Task 11b made the board redraw only
  // the tiles and units that changed and the views cheaper to make: the longest task went from 116 to 154 ms to 54 to 56 ms.
  test('the page never stands still for 100 ms during an AI turn, CPU slowed four times', async () => {
    const t = await hardTurn();
    expect(t.worstAnyTime).toBeLessThan(100);
  });
}, 120_000);
