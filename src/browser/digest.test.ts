/// <reference types="node" />
import { describe, expect, test } from 'vitest';
import { newRecord } from '../app/record';
import type { MatchRecord } from '../app/record';
import { writeSave } from '../app/saves';
import { hashState } from '../engine';
import { addCity, addUnit, blankMatch } from '../engine/testkit';
import { deselect, frames, openApp, tapTile, uncoveredBox } from './harness';

// The turn report: each line is a button that puts the board's view on the tile where it happened.
// A hotseat match, saved with Player 1's Horseman next to a wounded Mongol Warrior in the middle of a wide board,
// out of sight of both capitals. Player 1 kills it and ends the turn; Player 2's report then has one line, "Your
// Warrior was lost to a Horseman.", and tapping it centres the board on 1,-1 and rings that tile.

const LOST = '1,-1';

function savedMatch(): [string, string][] {
  const state = blankMatch({ radius: 8 });
  addCity(state, 0, -7, 7); addCity(state, 1, -7, 0);
  addUnit(state, 'horseman', 0, 0, -1); addUnit(state, 'warrior', 1, 1, -1, { hp: 1 });
  const settings = { seed: 0, factions: ['spartans', 'mongols'] as ['spartans', 'mongols'] };
  const record: MatchRecord = { ...newRecord('digest', settings, ['Ann', 'Ben'], 1_000_000), snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  const outcome = writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state);
  expect(outcome.saved).toBe(true);
  return [...map.entries()];
}

describe.runIf(process.env.BROWSER === '1')('the turn report', () => {
  test('tapping a line centres the board on where it happened, and Back to report brings the card back', async () => {
    const entries = savedMatch();
    const { page, close } = await openApp('', {
      beforeOpen: (c) => {
        void c.addInitScript((items: [string, string][]) => {
          for (const [k, v] of items) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
        }, entries);
      },
    });
    try {
      await page.getByTestId('continue').tap();
      const ready = page.getByTestId('ready');
      if (await ready.isVisible().catch(() => false)) await ready.tap();
      await page.locator(`[data-centre="${LOST}"]`).waitFor({ state: 'attached' });
      await expect.poll(() => page.getByTestId('end-turn').isEnabled()).toBe(true);
      await tapTile(page, '0,-1');
      await tapTile(page, LOST);
      await page.waitForTimeout(400);
      await deselect(page); // a selection's card holds the bar's place
      await page.getByTestId('end-turn').tap();
      await page.getByTestId('ready').tap();
      await page.getByTestId('digest').waitFor();
      await page.waitForTimeout(250);
      await page.screenshot({ path: process.env.DIGEST_SHOTS ? `${process.env.DIGEST_SHOTS}/1-report.png` : undefined });

      const lines = page.getByTestId('digest-line');
      expect(await lines.count()).toBe(1);
      await lines.first().tap();
      await page.getByTestId('digest-peek').waitFor();
      expect(await page.getByTestId('digest').count()).toBe(0);
      await frames(page);
      await page.screenshot({ path: process.env.DIGEST_SHOTS ? `${process.env.DIGEST_SHOTS}/2-peek.png` : undefined });
      // The middle of the part of the board the bar of turn buttons leaves uncovered.
      const slot = await uncoveredBox(page);
      const tile = await page.locator(`[data-centre="${LOST}"]`).boundingBox();
      expect(slot).not.toBeNull(); expect(tile).not.toBeNull();
      const dx = Math.abs(tile!.x + tile!.width / 2 - (slot!.x + slot!.width / 2));
      const dy = Math.abs(tile!.y + tile!.height / 2 - (slot!.y + slot!.height / 2));
      expect(dx + dy, 'the lost unit\'s tile is in the middle of the board').toBeLessThan(40);
      expect(await page.locator(`[data-hex="${LOST}"][data-mark="selected"], [data-hex="${LOST}"] [data-mark="selected"]`).count(), 'the tile is ringed').toBeGreaterThan(0);

      // The Hud takes no taps while a line is shown; Back to report brings the card back, and Got it closes it.
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('.hud')!).pointerEvents)).toBe('none');
      await page.getByTestId('digest-back').tap();
      await page.getByTestId('digest').waitFor();
      await page.getByTestId('digest-ok').tap();
      await page.getByTestId('digest').waitFor({ state: 'detached' });
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('.hud')!).pointerEvents)).not.toBe('none');
    } finally {
      await close();
    }
  }, 60000);
});
