/// <reference types="node" />
import { describe, expect, test } from 'vitest';
import { newRecord } from '../app/record';
import type { MatchRecord } from '../app/record';
import { writeSave } from '../app/saves';
import { createMatch, hashState } from '../engine';
import type { HexKey } from '../engine';
import { T } from '../ui/text';
import { frames, openApp, tapTile } from './harness';

// Rules 7, Hunker, in a real browser: seed 7's first unit (not fresh, nothing done yet) is offered Hunker on its card;
// tapping it puts the Hunkered line on the card and the shield on the board. The save is built from the engine.

function startSave(): { entries: [string, string][]; at: HexKey } {
  const state = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
  const u = state.units.find((x) => x.owner === 0);
  if (u === undefined) throw new Error('player 0 has no unit');
  const settings = { seed: 7, factions: ['spartans', 'mongols'] as ['spartans', 'mongols'] };
  const base = newRecord('hunker', settings, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  const outcome = writeSave({
    getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); },
  }, record, state);
  expect(outcome.saved).toBe(true);
  return { entries: [...map.entries()], at: u.pos };
}

describe.runIf(process.env.BROWSER === '1')('hunker in the browser', () => {
  test('the unit card offers Hunker, and a hunkered unit shows the line and the shield', async () => {
    const { entries, at } = startSave();
    const { page, close } = await openApp('', {
      width: 360, height: 640,
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

      await tapTile(page, at);
      const button = page.getByTestId('cmd-hunker');
      await button.waitFor({ state: 'visible' });
      expect(await page.locator('[data-hunker-mark]').count()).toBe(0);
      if (process.env.SHOT_DIR) { await page.waitForTimeout(400); await page.screenshot({ path: `${process.env.SHOT_DIR}/hunker-button.png` }); }
      await button.tap();
      await page.locator('[data-hunker-mark]').first().waitFor({ state: 'attached' });
      await frames(page);
      await tapTile(page, at);
      const panel = page.locator('.unit-panel');
      await panel.waitFor();
      expect((await panel.textContent()) ?? '').toContain(T.ui.hunkered);
      expect(await page.getByTestId('cmd-hunker').count()).toBe(0);
      if (process.env.SHOT_DIR) { await page.waitForTimeout(400); await page.screenshot({ path: `${process.env.SHOT_DIR}/hunkered.png` }); }
    } finally {
      await close();
    }
  }, 60_000);
});
