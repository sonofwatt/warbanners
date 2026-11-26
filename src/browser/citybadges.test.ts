/// <reference types="node" />
import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { newRecord } from '../app/record';
import type { MatchRecord } from '../app/record';
import { writeSave } from '../app/saves';
import { FACTIONS, createMatch, hashState, isConnected } from '../engine';
import { addCity, setTile } from '../engine/testkit';
import { T } from '../ui/text';
import { cameraStill, deselect, frames, openApp, tapTile } from './harness';

// The city card's picture carries two badges on its bottom corners: a road when the city is joined to its owner's
// capital now (rules 7), and its level. The level is no longer in the numbers row. The save is built from the engine:
// seed 7 with two more Spartan cities, one at -1,3 joined to the capital at -2,5 by a road on -1,4, one at 1,2 with
// no road. Set SHOT_DIR to save the three cards.

function save(): [string, string][] {
  const state = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
  const linked = addCity(state, 0, -1, 3, { level: 2 });
  setTile(state, -1, 4, { road: true });
  const alone = addCity(state, 0, 1, 2);
  expect(isConnected(state, linked)).toBe(true);
  expect(isConnected(state, alone)).toBe(false);
  const p = state.players[0]!;
  p.explored = [...new Set([...p.explored, ...Object.keys(state.tiles).filter((k) => state.tiles[k]!.cityId !== null)])].sort();
  const settings = { seed: 7, factions: ['spartans', 'mongols'] as ['spartans', 'mongols'] };
  const base = newRecord('badges', settings, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  const outcome = writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state);
  expect(outcome.saved).toBe(true);
  return [...map.entries()];
}

/** The badge's box against the picture's: in its bottom corner, readable, off the middle. */
async function badge(page: Page, id: string) {
  return page.evaluate((tid) => {
    const b = document.querySelector(`[data-testid="${tid}"]`)?.getBoundingClientRect();
    const f = document.querySelector('.city-panel .picture-frame')!.getBoundingClientRect();
    if (b === undefined) return null;
    const cx = f.left + f.width / 2, cy = f.top + f.height / 2;
    return {
      h: b.height, inside: b.left >= f.left - 0.5 && b.right <= f.right + 0.5 && b.bottom <= f.bottom + 0.5,
      bottom: f.bottom - b.bottom, left: b.left - f.left, right: f.right - b.right,
      middleClear: !(cx > b.left && cx < b.right && cy > b.top && cy < b.bottom),
    };
  }, id);
}

async function selectCity(page: Page, at: string): Promise<void> {
  await deselect(page);
  for (let i = 0; i < 3 && (await page.locator('.selection .city-panel').count()) === 0; i += 1) {
    await tapTile(page, at);
    await page.waitForTimeout(200);
    await cameraStill(page);
  }
  await page.locator('.selection .city-panel').waitFor();
  await frames(page);
}

describe.runIf(process.env.BROWSER === '1')('the city card\'s corner badges', () => {
  test('412x915: road badge on a connected city only, never on the capital; the level on the corner, not in the row', async () => {
    const entries = save();
    const { page, close } = await openApp('', {
      width: 412, height: 915,
      beforeOpen: (c) => {
        void c.addInitScript((items: [string, string][]) => {
          try { for (const [k, v] of items) if (localStorage.getItem(k) === null) localStorage.setItem(k, v); } catch { /* Continue is missing then */ }
        }, entries);
      },
    });
    try {
      await page.getByTestId('continue').tap();
      await page.getByTestId('ready').tap();
      await page.getByTestId('match').waitFor();
      await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
      await frames(page);
      await cameraStill(page);

      for (const [at, name, connected, level] of [['-1,3', 'connected', true, 2], ['1,2', 'unconnected', false, 1], ['-2,5', 'capital', false, FACTIONS.spartans.capitalStartLevel]] as const) {
        await selectCity(page, at);
        const road = await badge(page, 'city-connected');
        if (connected) {
          expect(road, `${name}: the road badge`).not.toBeNull();
          expect(road!.inside && road!.middleClear).toBe(true);
          expect(road!.h).toBeGreaterThanOrEqual(22); expect(road!.h).toBeLessThanOrEqual(26);
          expect(road!.bottom).toBeLessThan(6); expect(road!.left).toBeLessThan(6);
          expect(await page.getByTestId('city-connected').getAttribute('aria-label')).toBe(T.ui.connectedToCapital);
        } else {
          expect(road, `${name}: no road badge`).toBeNull();
        }
        const lv = await badge(page, 'city-level');
        expect(lv).not.toBeNull();
        expect(lv!.inside && lv!.middleClear).toBe(true);
        expect(lv!.h).toBeGreaterThanOrEqual(22); expect(lv!.h).toBeLessThanOrEqual(26);
        expect(lv!.bottom).toBeLessThan(6); expect(lv!.right).toBeLessThan(6);
        expect(await page.getByTestId('city-level').textContent()).toBe(String(level));
        // Shown with the card collapsed, and the numbers row has no Level any more.
        expect(await page.getByTestId('selection').getAttribute('data-sheet')).toBe('collapsed');
        const labels = await page.locator('.city-panel .stat dt').allTextContents();
        expect(labels).not.toContain(T.ui.level);
        expect(labels).toContain(T.ui.growth);
        if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/city-card-${name}-412x915.png` });
      }
    } finally {
      await close();
    }
  }, 120_000);
});
