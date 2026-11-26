import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { T, fill } from '../ui/text';
import { deselect, openApp, tapTile } from './harness';

// One online match in two browser phones against the Firebase emulator (`npm run test:online` builds dist-emu and
// starts the emulator). Each openApp is its own Chromium, so each phone has its own storage and anonymous identity.
// The host opens ?seed=7, so the room's seed is 7. Seed 7 facts (see flow.test.ts): Player 1 (Spartans) moves first
// with one Scout (unit 0) on the capital at -2,5, which can move to -1,4.

type Phone = Awaited<ReturnType<typeof openApp>>;

async function hostLobby(page: Page, name: string): Promise<string> {
  await page.getByTestId('play-online').tap();
  await page.getByTestId('online-name').fill(name);
  await page.getByTestId('create-room').tap();
  const code = (await page.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  return code;
}

async function joinAs(page: Page, name: string): Promise<void> {
  await page.getByTestId('join-name').fill(name);
  await page.getByTestId('join').tap();
}

async function startedMatch(): Promise<{ A: Phone; B: Phone; code: string }> {
  const A = await openApp('?seed=7', { outDir: 'dist-emu' });
  try {
    const code = await hostLobby(A.page, 'Ann');
    const B = await openApp(`?room=${code}`, { outDir: 'dist-emu' });
    try {
      await joinAs(B.page, 'Ben');
      for (const p of [A.page, B.page]) await expect.poll(() => p.locator('body').textContent()).toContain('Ben');
      await A.page.getByTestId('start-online').tap();
      await A.page.getByTestId('match').waitFor();
      await B.page.getByTestId('match').waitFor();
      return { A, B, code };
    } catch (e) {
      await B.close();
      throw e;
    }
  } catch (e) {
    await A.close();
    throw e;
  }
}

/** The seed 7 first move (from flow.test.ts), then End turn; Ben's phone then says it is his turn. */
async function annPlaysFirstTurn(A: Phone, B: Phone): Promise<void> {
  await tapTile(A.page, '-2,5');
  await tapTile(A.page, '-1,4');
  await deselect(A.page); // 0.7.0: a selection's card takes the turn buttons' place
  await A.page.getByTestId('end-turn').tap();
  await expect.poll(() => B.page.getByTestId('hud-status').textContent(), { timeout: 5_000 }).toContain(T.ui.yourTurn);
}

const outer = describe.runIf(process.env.BROWSER === '1');
outer('online play in two browsers', () => {
  const emu = describe.runIf(process.env.EMULATOR === '1');
  emu('against the emulator', () => {
    test('two phones: lobby, invite, join, play, reload, a new browser takes the seat back, resign', async () => {
      const { A, B, code } = await startedMatch();
      let A2: Phone | null = null;
      try {
        expect(await A.page.getByTestId('hud-status').textContent()).toContain(T.ui.yourTurn);
        expect(await B.page.getByTestId('hud-status').textContent()).toContain(fill(T.ui.theirTurn, { name: 'Ann' }));
        expect(await B.page.getByTestId('end-turn').isDisabled()).toBe(true);
        expect(await A.page.getByTestId('pass').count()).toBe(0);
        await annPlaysFirstTurn(A, B);
        const gold = await B.page.getByTestId('gold').textContent();
        await B.page.reload();
        await B.page.getByTestId('match').waitFor();
        expect(await B.page.getByTestId('gold').textContent()).toBe(gold);
        await A.close(); // A's browser is gone: onDisconnect fires
        await expect.poll(() => B.page.locator('body').textContent(), { timeout: 90_000 })
          .toContain(fill(T.ui.droppedWaiting, { name: 'Ann' }));
        // A fresh browser with no storage is a new identity (the iPhone home-screen case): it takes Ann's seat back.
        A2 = await openApp(`?room=${code}`, { outDir: 'dist-emu' });
        await A2.page.getByTestId('take-seat-0').tap();
        await A2.page.getByTestId('match').waitFor();
        await expect.poll(() => B.page.locator('body').textContent(), { timeout: 10_000 }).not.toContain('lost their connection');
        await B.page.getByTestId('open-menu').tap();
        await B.page.getByTestId('resign').tap();
        await B.page.getByTestId('resign-yes').tap();
        for (const p of [A2.page, B.page]) await p.getByTestId('result').waitFor();
      } finally {
        await A2?.close();
        await A.close();
        await B.close();
      }
    }, 180_000);

    test('the same browser, closed and opened again from the link, comes straight back to the match', async () => {
      const { A, B, code } = await startedMatch();
      let A2: Phone | null = null;
      try {
        await annPlaysFirstTurn(A, B);
        const port = Number(new URL(A.origin).port);
        const saved = await A.context.storageState({ indexedDB: true }); // the Firebase identity lives in IndexedDB
        await A.close();
        await expect.poll(() => B.page.locator('body').textContent(), { timeout: 90_000 })
          .toContain(fill(T.ui.droppedWaiting, { name: 'Ann' }));
        A2 = await openApp(`?room=${code}`, { outDir: 'dist-emu', storageState: saved, port });
        await A2.page.getByTestId('match').waitFor();
        expect(await A2.page.getByTestId('take-seat-0').count()).toBe(0);
        expect(await A2.page.getByTestId('join-name').count()).toBe(0);
        expect(await A2.page.getByTestId('hud-status').textContent()).toContain(fill(T.ui.theirTurn, { name: 'Ben' }));
        await expect.poll(() => B.page.locator('body').textContent(), { timeout: 10_000 }).not.toContain('lost their connection');
        await B.page.getByTestId('end-turn').tap();
        await expect.poll(() => A2!.page.getByTestId('hud-status').textContent(), { timeout: 5_000 }).toContain(T.ui.yourTurn);
      } finally {
        await A2?.close();
        await A.close();
        await B.close();
      }
    }, 180_000);
  });
});
