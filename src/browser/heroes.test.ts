/// <reference types="node" />
import { describe, expect, test } from 'vitest';
import { newRecord } from '../app/record';
import type { MatchRecord } from '../app/record';
import { writeSave } from '../app/saves';
import { createMatch, hashState, maxHpOf } from '../engine';
import type { HexKey } from '../engine';
import { addUnit } from '../engine/testkit';
import { APP_VERSION } from '../version';
import { T } from '../ui/text';
import { frames, openApp, tapTile } from './harness';

// A hero in a real browser. The save is built from the engine, not played to: seed 7's first unit is made a hero
// (Fierce, Hardy) and a second unit beside it carries a draught, then the position is written as a saved
// pass-the-phone match and resumed with Continue.

/** A saved two-person match whose first unit is a hero and whose neighbour carries a draught. */
function heroSave(): { entries: [string, string][]; heroAt: HexKey } {
  const state = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
  const hero = state.units.find((u) => u.owner === 0);
  if (hero === undefined) throw new Error('player 0 has no unit');
  hero.heroTraits = ['fierce', 'hardy'];
  hero.hp = maxHpOf(hero);
  // Beside the hero, on the tile it can walk to in seed 7 (see flow.test.ts).
  addUnit(state, 'warrior', 0, -1, 4, { item: 'draught' });
  const settings = { seed: 7, factions: ['spartans', 'mongols'] as ['spartans', 'mongols'] };
  const base = newRecord('heroes', settings, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  const outcome = writeSave({
    getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); },
  }, record, state);
  expect(outcome.saved).toBe(true);
  return { entries: [...map.entries()], heroAt: hero.pos };
}

async function resume(width: number, height: number): Promise<Awaited<ReturnType<typeof openApp>> & { heroAt: HexKey }> {
  const { entries, heroAt } = heroSave();
  const app = await openApp('', {
    width, height,
    beforeOpen: (c) => {
      void c.addInitScript((items: [string, string][]) => {
        try {
          for (const [k, v] of items) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
        } catch { /* the test fails below when Continue is not there */ }
      }, entries);
    },
  });
  return { ...app, heroAt };
}

describe.runIf(process.env.BROWSER === '1')('heroes in the browser', () => {
  test.each([[360, 640], [568, 320]])('a resumed match shows the hero mark and the hero panel at %i x %i', async (width, height) => {
    const { page, close, heroAt } = await resume(width, height);
    try {
      await page.getByTestId('continue').tap();
      await page.getByTestId('ready').tap();
      await page.getByTestId('match').waitFor();
      await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
      await frames(page);

      await tapTile(page, heroAt);
      await page.locator('[data-hero-mark]').first().waitFor({ state: 'visible' });
      await page.locator('[data-item="draught"]').first().waitFor({ state: 'visible' });
      const panel = page.locator('.unit-panel');
      await panel.waitFor();
      const text = (await panel.textContent()) ?? '';
      expect(text).toContain(T.ui.hero);
      expect(text).toContain('Earned');

      const fit = await page.evaluate(() => {
        const p = document.querySelector('.unit-panel');
        return {
          page: document.documentElement.scrollWidth <= window.innerWidth,
          panel: p !== null && p.scrollWidth <= p.clientWidth,
        };
      });
      expect(fit.page, 'the page does not scroll sideways').toBe(true);
      expect(fit.panel, 'the panel does not overflow its box').toBe(true);
    } finally {
      await close();
    }
  }, 60_000);

  test('Home shows what is new and the version 0.4.9', async () => {
    const { page, close } = await openApp();
    try {
      await page.getByTestId('new-match').waitFor();
      expect(APP_VERSION).toBe('0.4.9');
      expect(await page.locator('.whats-new p').textContent()).toBe(T.ui.whatsNew);
      expect(await page.locator('.version').textContent()).toContain('0.4.9');
    } finally {
      await close();
    }
  }, 60_000);
});
