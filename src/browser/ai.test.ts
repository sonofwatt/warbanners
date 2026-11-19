/// <reference types="node" />
import type { Page } from 'playwright';
import { beforeAll, describe, expect, test } from 'vitest';
import { LEVEL_DIAL } from '../ai/types';
import { newRecord } from '../app/record';
import type { MatchRecord } from '../app/record';
import { writeSave } from '../app/saves';
import { AI_STEP_MS } from '../app/store';
import { hashState } from '../engine';
import type { MatchState } from '../engine';
import { randomPlayout } from '../engine/testkit';
import { T } from '../ui/text';
import { frames, openApp } from './harness';

// Solo play in a real browser: with the network cut, and a hard AI turn on a crowded board with the CPU slowed.
// Seed 7 facts (see flow.test.ts): the person (Player 1) moves first with one Warrior (unit 0) on -2,5, which can
// move to -1,4.

const SEED = '?seed=7';

/** The id of the one saved match, from the saves list in storage. */
async function matchId(page: Page): Promise<string> {
  const id = await page.evaluate(() => (JSON.parse(localStorage.getItem('warbanners.saves.v1') ?? '[]') as { id: string }[])[0]?.id ?? '');
  expect(id, 'a save is listed').not.toBe('');
  return id;
}

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

interface Probe {
  tapAt: number | null; thinks: number[]; sent: number[]; sleeps: number[]; longTasks: { start: number; ms: number }[];
  shown: number | null; hidden: number | null;
}

/** What one measured AI turn left behind. Nothing here is asserted by the measuring itself. */
interface HardTurn {
  /** Facts about the position the save holds, from the engine. */
  setup: { winner: number | null; current: number; units: number };
  probe: Probe;
  /** The match record in storage after the turn. */
  saved: { actions: { type: string }[]; current: number | undefined };
}

/** The AI's own turn in the save the page wrote: its actions, and whose move the saved state says it is. */
function savedRecord(page: Page, id: string): Promise<HardTurn['saved']> {
  return page.evaluate((key) => {
    const body = JSON.parse(localStorage.getItem(key) ?? 'null') as { actions?: { type: string }[]; snapshot?: { state?: { current?: number } } } | null;
    return { actions: body?.actions ?? [], current: body?.snapshot?.state?.current };
  }, `warbanners.save.${id}`);
}

/**
 * One hard AI turn on a crowded board with the CPU slowed four times, as a mid-range phone. The position is 160
 * random turns of seed 7, so it is the person's move and tapping End turn hands the AI the board (with 159 the AI
 * would start on Continue, and the board-opening render would land inside its first think). Times are milliseconds
 * on the page's clock; `sleeps` are the store's waits between the AI's visible actions, as it asked for them.
 * It throws only when the page does not behave (no Continue, no turn finishing in time), never on a slow turn.
 */
async function measureHardTurn(): Promise<HardTurn> {
  const { entries, state } = savedHardMatch(160);
  const { page, context, close } = await openApp('', {
    beforeOpen: (c) => {
      void c.addInitScript((items: [string, string][]) => {
        try {
          for (const [k, v] of items) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
        } catch { /* the test fails below when Continue is not there */ }
        const probe: Probe = { tapAt: null, thinks: [], sent: [], sleeps: [], longTasks: [], shown: null, hidden: null };
        (window as unknown as { probe: Probe }).probe = probe;
        // The person's End turn tap: the clock starts here, before the app has done anything about it.
        document.addEventListener('click', (e) => {
          if (probe.tapAt === null && e.target instanceof Element && e.target.closest('[data-testid="end-turn"]') !== null) probe.tapAt = performance.now();
        }, true);
        // Long tasks on the main thread (the browser reports those of 50 ms or more).
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
        // resolver (no name, one parameter), asked for after the tap and before Thinking went. Added up and taken off.
        const realTimeout = window.setTimeout.bind(window);
        window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
          if (typeof fn === 'function' && fn.name === '' && fn.length === 1 && typeof ms === 'number' && ms > 0 && probe.tapAt !== null && probe.hidden === null) probe.sleeps.push(ms);
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
    await page.getByTestId('end-turn').and(page.locator(':enabled')).waitFor();
    await page.getByTestId('end-turn').tap();
    const read = (): Promise<Probe> => page.evaluate(() => (window as unknown as { probe: Probe }).probe);
    await page.waitForFunction(() => (window as unknown as { probe: Probe }).probe.hidden !== null, null, { timeout: 30_000 });
    await frames(page);

    const probe = await read();
    process.stderr.write(`AI turn at 4x CPU: wall ${Math.round((probe.hidden ?? 0) - (probe.tapAt ?? 0))} ms, pauses ${JSON.stringify(probe.sleeps)}, planner answers ${JSON.stringify(probe.thinks.map(Math.round))} ms, long tasks (start after tap, ms) ${JSON.stringify(probe.longTasks.filter((t) => t.start >= (probe.tapAt ?? 0)).map((t) => [Math.round(t.start - (probe.tapAt ?? 0)), Math.round(t.ms)]))}\n`);
    return {
      setup: { winner: state.winner, current: state.current, units: state.units.length },
      probe,
      saved: await savedRecord(page, 'crowded'),
    };
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

      // The AI plays and the person is on Turn 2 inside 10 s, with Thinking gone. (A turn short enough to be over
      // before Thinking could be seen is fine, so the wait is on the turn number, not on Thinking appearing.)
      await expect.poll(() => page.getByTestId('turn').textContent(), { timeout: 10_000 }).toBe(`${T.ui.turn} 2`);
      await expect.poll(() => page.getByTestId('thinking').count(), { timeout: 10_000 }).toBe(0);
      // The AI really acted: the saved match holds the person's two actions (the move and End turn) and then the AI's,
      // ending with its End turn, and it is the person's move again.
      const afterAi = await savedRecord(page, await matchId(page));
      expect(afterAi.actions.length, JSON.stringify(afterAi.actions)).toBeGreaterThan(2);
      expect(afterAi.actions.slice(2).some((a) => a.type === 'endTurn'), 'the AI ended its turn').toBe(true);
      expect(afterAi.current).toBe(0);
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

  // One measured turn feeds every check below, so a page that misbehaves fails them all as a broken run, and each
  // bound is its own assertion.
  describe('a hard AI turn on a crowded position, CPU slowed four times', () => {
    let turn: HardTurn;
    beforeAll(async () => { turn = await measureHardTurn(); }, 90_000);

    test('the position is a crowded board with the person to move', () => {
      expect(turn.setup.winner, 'the match is not over').toBeNull();
      expect(turn.setup.current, 'the person is to move').toBe(0);
      expect(turn.setup.units, 'units on the board').toBeGreaterThanOrEqual(24);
    });

    test('the measurement saw the turn: End turn tapped, Thinking shown and gone, the AI acted', () => {
      const p = turn.probe;
      expect(p.tapAt, 'the End turn tap was stamped').not.toBeNull();
      expect(p.shown, 'Thinking appeared').not.toBeNull();
      expect(p.hidden, 'Thinking went').not.toBeNull();
      expect(p.sent.length, 'questions put to the planner').toBeGreaterThan(0);
      expect(p.thinks.length, 'answers from the planner').toBe(p.sent.length);
      expect(turn.saved.actions.length, 'actions saved: the end of the person\'s turn, then the AI\'s').toBeGreaterThan(1);
      expect(turn.saved.actions[0]?.type).toBe('endTurn');
      expect(turn.saved.actions.at(-1)?.type, 'the AI ended its turn').toBe('endTurn');
      expect(turn.saved.current, 'it is the person\'s move again').toBe(0);
    });

    test('the store\'s pauses were seen, each at least its 450 ms step', () => {
      expect(turn.probe.sleeps.length, 'pauses recorded').toBeGreaterThan(0);
      for (const ms of turn.probe.sleeps) expect(ms).toBeGreaterThanOrEqual(AI_STEP_MS);
    });

    test('from the End turn tap until Thinking goes, less its pauses, takes under 3 s', () => {
      const { tapAt, hidden, sleeps } = turn.probe;
      const wall = (hidden ?? Infinity) - (tapAt ?? 0);
      const paused = sleeps.reduce((a, b) => a + b, 0);
      expect(wall - paused, `wall ${Math.round(wall)} ms less pauses ${paused} ms`).toBeLessThan(3000);
    });

    // Every main-thread task from the End turn tap until Thinking goes, the board's draw after each AI action included.
    // Task 11b made the board redraw only the tiles and units that changed: the longest task went from 116 to 154 ms to
    // 54 to 56 ms. This file runs alone (see test:browser), so another suite does not add load to the page.
    test('the page never stands still for 100 ms during the turn', () => {
      const { tapAt, hidden, longTasks } = turn.probe;
      const inTurn = longTasks.filter((t) => t.start + t.ms >= (tapAt ?? 0) && t.start <= (hidden ?? 0));
      const worst = Math.max(0, ...inTurn.map((t) => t.ms));
      expect(worst, `longest task ${Math.round(worst)} ms of ${inTurn.length} long tasks`).toBeLessThan(100);
    });
  });
}, 120_000);
