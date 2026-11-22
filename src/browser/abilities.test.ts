/// <reference types="node" />
import { describe, expect, test } from 'vitest';
import { newRecord } from '../app/record';
import type { MatchRecord } from '../app/record';
import { writeSave } from '../app/saves';
import { createMatch, hashState } from '../engine';
import { addUnit } from '../engine/testkit';
import { frames, openApp, tapTile } from './harness';

// A Piper beside a wounded Hoplite that has already moved and attacked, saved as a pass-the-phone match on seed 7
// and resumed with Continue. Heal is armed, cancelled, armed again and spent on the Hoplite.

function pipeSave(): { entries: [string, string][]; piper: number; hoplite: number } {
  const state = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
  for (const u of state.units) if (u.owner === 0) u.pos = '0,3';   // the Scout off the capital
  const piper = addUnit(state, 'piper', 0, -2, 5);
  piper.fresh = false;
  const hoplite = addUnit(state, 'hoplite', 0, -1, 4, { hp: 5 });
  Object.assign(hoplite, { fresh: false, mp: 0, attacks: 0, acted: true });
  const base = newRecord('abilities', { seed: 7, factions: ['spartans', 'mongols'] }, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  const outcome = writeSave({
    getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); },
  }, record, state);
  expect(outcome.saved).toBe(true);
  return { entries: [...map.entries()], piper: piper.id, hoplite: hoplite.id };
}

describe.runIf(process.env.BROWSER === '1')('abilities in the browser', () => {
  test('Heal can be cancelled, and heals a unit that has already moved and attacked', async () => {
    const { entries } = pipeSave();
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

      await tapTile(page, '-2,5');
      const heal = page.getByTestId('cmd-ability-heal');
      await heal.tap();
      await frames(page);
      expect(await heal.textContent()).toContain('Cancel');
      expect(await page.locator('[data-mark="ability"]').count()).toBe(1);
      await heal.tap();
      await frames(page);
      expect(await heal.textContent(), 'Cancel puts the button back').toContain('Heal');
      expect(await page.locator('[data-mark="ability"]').count(), 'and clears the target rings').toBe(0);

      await heal.tap();
      await frames(page);
      await tapTile(page, '-1,4');
      await page.waitForTimeout(300);
      await tapTile(page, '-1,4');
      await page.locator('.unit-panel').waitFor();
      expect(await page.locator('.unit-panel').textContent()).toContain('9/15');
    } finally {
      await close();
    }
  }, 60_000);
});
