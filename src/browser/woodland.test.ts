/// <reference types="node" />
import { describe, expect, test } from 'vitest';
import { newRecord } from '../app/record';
import type { MatchRecord } from '../app/record';
import { writeSave } from '../app/saves';
import { createMatch, hashState } from '../engine';
import { frames, openApp, tapTile } from './harness';

// Rules 11 in a real browser. Seed 7 with the Woodland Nations (Ann) against the Mongols (Ben), saved on Ben's first
// turn: his Horseman (unit 2) stands on his capital at 2,-5 and its way to 0,-3 runs through 1,-4, where a Woodland
// snare lies. Ben cannot see it; the engine stops the Horseman on it.
const SNARE = '1,-4';

function snareSave(): [string, string][] {
  const settings = { seed: 7, factions: ['woodland', 'mongols'] as ['woodland', 'mongols'] };
  const state = createMatch(settings);
  state.current = 1;
  state.snares = [{ owner: 0, at: SNARE }];
  const base = newRecord('snare', settings, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  const outcome = writeSave({
    getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); },
  }, record, state);
  expect(outcome.saved).toBe(true);
  return [...map.entries()];
}

describe.runIf(process.env.BROWSER === '1')('the Woodland Nations in the browser', () => {
  test('a move through an unseen snare stops on it, and the board shows the unit there and no snare mark to Ben', async () => {
    const entries = snareSave();
    const { page, close } = await openApp('', {
      width: 412, height: 780,
      beforeOpen: (c) => {
        void c.addInitScript((items: [string, string][]) => {
          try {
            for (const [k, v] of items) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
          } catch { /* the test fails below when Continue is not there */ }
        }, entries);
      },
    });
    try {
      await page.getByTestId('continue').tap();
      await page.getByTestId('ready').tap();
      await page.getByTestId('match').waitFor();
      await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
      await frames(page);
      await page.keyboard.press('Escape');
      await frames(page);
      expect(await page.locator('[data-snare]').count(), 'Ben never sees the Woodland snare').toBe(0);
      await tapTile(page, '2,-5');
      await page.locator('[data-mark="move"]').first().waitFor({ state: 'attached' });
      await tapTile(page, '0,-3');
      // The Horseman ends on the snare tile, not the tile Ben picked, and the board settles there.
      await expect.poll(() => page.locator('[data-unit="2"]').getAttribute('data-at'), { timeout: 5_000 }).toBe(SNARE);
      await frames(page);
      expect(await page.locator('[data-unit="2"]').getAttribute('data-at')).toBe(SNARE);
      expect(await page.getByTestId('match').isVisible()).toBe(true);
    } finally {
      await close();
    }
  });
}, 120_000);
