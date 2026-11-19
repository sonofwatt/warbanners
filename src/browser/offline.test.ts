/// <reference types="node" />
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { build } from 'vite';
import { describe, expect, test } from 'vitest';
import { T } from '../ui/text';
import { frames, openApp } from './harness';

// The installed game with no connection, in a real browser with its service worker running.
// Seed 7 facts (see flow.test.ts): Player 1 moves first with one Warrior (unit 0) on -2,5, which can move to -1,4.

const SEED = '?seed=7';

async function tapTile(page: Page, hex: string): Promise<void> {
  const box = await page.locator(`[data-centre="${hex}"]`).boundingBox();
  if (box === null) throw new Error(`tile ${hex} has no box`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await frames(page);
}

const text = async (page: Page, id: string): Promise<string> => (await page.getByTestId(id).textContent()) ?? '';

async function throughCurtain(page: Page, name: string): Promise<void> {
  await page.getByTestId('pass').waitFor();
  expect(await page.locator('body').textContent()).toContain(name);
  await page.getByTestId('ready').tap();
  await page.getByTestId('match').waitFor();
  await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
  await frames(page);
}

async function endTurn(page: Page): Promise<void> {
  await expect.poll(() => page.getByTestId('end-turn').isEnabled()).toBe(true);
  await page.getByTestId('end-turn').tap();
}

/** Player 1 walks the Warrior from the capital to -1,4 and ends the turn. */
async function firstMove(page: Page): Promise<void> {
  await tapTile(page, '-2,5');
  await tapTile(page, '-1,4');
  await expect.poll(() => page.locator('[data-unit="0"]').getAttribute('data-at')).toBe('-1,4');
  await endTurn(page);
}

/** The service worker has installed every file and Home says so. */
async function installed(page: Page): Promise<void> {
  // `ready` never settles when no worker registers, so it gets a deadline of its own.
  await page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, no) => setTimeout(() => no(new Error('no service worker became ready')), 20_000)),
  ]));
  await page.getByTestId('offline-ready').waitFor();
  expect(await text(page, 'offline-ready')).toBe(T.ui.offlineReady);
}

describe.runIf(process.env.BROWSER === '1')('offline and installed', () => {
  test('installed files, then no network: open, play, reload, resume', async () => {
    const requests: string[] = [];
    const { page, context, origin, close } = await openApp(SEED, {
      serviceWorkers: 'allow',
      beforeOpen: (c) => c.on('request', (r) => { requests.push(r.url()); }),
    });
    try {
      await installed(page);
      // The worker covers the folder the game is served from (/warbanners/ on the live site), not more or less.
      expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)).toBe(new URL('./', page.url()).href);

      await context.setOffline(true);
      await page.reload();
      await page.getByTestId('new-match').waitFor();
      expect(await page.evaluate(() => navigator.onLine)).toBe(false);

      await page.getByTestId('new-match').tap();
      await page.getByTestId('start').tap();
      await throughCurtain(page, 'Player 1');
      await firstMove(page);
      await page.getByTestId('pass').waitFor();

      await page.reload();
      await page.getByTestId('new-match').waitFor();
      expect(await page.locator('[data-testid="save"]').count()).toBe(1);
      await page.getByTestId('continue').tap();
      await throughCurtain(page, 'Player 2');
      expect(await text(page, 'who')).toBe('Player 2');
      // Player 1's Warrior is out of Player 2's sight, so it is checked when the phone goes back to Player 1.
      expect(await page.locator('[data-unit="0"]').count()).toBe(0);
      await endTurn(page);
      await throughCurtain(page, 'Player 1');
      expect(await page.locator('[data-unit="0"]').getAttribute('data-at')).toBe('-1,4');

      expect(requests.length).toBeGreaterThan(0);
      expect(requests.filter((u) => new URL(u).origin !== origin)).toEqual([]);
    } finally {
      await close();
    }
  });

  test('the manifest lets a phone install it', async () => {
    const { page, close } = await openApp();
    try {
      const href = await page.locator('link[rel="manifest"]').getAttribute('href');
      expect(href).not.toBeNull();
      const manifestUrl = new URL(href ?? '', page.url()).href;
      const res = await page.request.get(manifestUrl);
      expect(res.status()).toBe(200);
      const m = await res.json() as {
        name: string; display: string; start_url: string; scope: string;
        icons: { src: string; sizes: string; type: string; purpose?: string }[];
      };
      expect(m.name).toBe('Warbanners');
      expect(m.display).toBe('standalone');
      const relative = (u: string): boolean => !/^([a-z]+:|\/)/i.test(u);
      expect(relative(m.start_url), m.start_url).toBe(true);
      expect(relative(m.scope), m.scope).toBe(true);
      // Resolved against the manifest, start_url and scope are the folder the game is served from.
      const appFolder = new URL('./', page.url()).href;
      expect(new URL(m.start_url, manifestUrl).href).toBe(appFolder);
      expect(new URL(m.scope, manifestUrl).href).toBe(appFolder);

      const plain = (s: string) => m.icons.some((i) => i.sizes === s && (i.purpose ?? 'any') === 'any');
      expect(plain('192x192')).toBe(true);
      expect(plain('512x512')).toBe(true);
      expect(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
      for (const icon of m.icons) {
        const r = await page.request.get(new URL(icon.src, manifestUrl).href);
        expect(r.status(), icon.src).toBe(200);
        expect(r.headers()['content-type'], icon.src).toBe('image/png');
      }
    } finally {
      await close();
    }
  });

  test('a new build waits until Update is tapped on Home, and never swaps in under a match', async () => {
    // The first build is a copy of dist; the second is the same game with another build label, so every
    // chunk hash and the service worker's file list change, as they do when a new version is deployed.
    const work = await mkdtemp(join(tmpdir(), 'warbanners-update-'));
    const served = join(work, 'served');
    const next = join(work, 'next');
    await cp('dist', served, { recursive: true });
    await build({
      logLevel: 'silent',
      define: { __BUILD__: JSON.stringify('nextbld') },
      build: { outDir: next, emptyOutDir: true },
    });
    const { page, close } = await openApp(SEED, { serviceWorkers: 'allow', outDir: served });
    try {
      await installed(page);
      // The first visit is not controlled by the worker yet; from the next load on it is.
      await page.reload();
      await page.getByTestId('new-match').waitFor();
      expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
      const firstLabel = await page.locator('footer.version').textContent();
      expect(firstLabel).not.toContain('nextbld');
      await page.evaluate(() => {
        const w = window as Window & { loadMarker?: string; firstWorker?: ServiceWorker | null };
        w.loadMarker = 'still the same page';
        w.firstWorker = navigator.serviceWorker.controller;
      });
      const samePage = (): Promise<boolean> => page.evaluate(() => {
        const w = window as Window & { loadMarker?: string; firstWorker?: ServiceWorker | null };
        return w.loadMarker === 'still the same page' && navigator.serviceWorker.controller === w.firstWorker;
      });

      await page.getByTestId('new-match').tap();
      await page.getByTestId('start').tap();
      await throughCurtain(page, 'Player 1');

      // Deploy the new build while the match is on and let the browser find it.
      await cp(next, served, { recursive: true, force: true });
      await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
      await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting != null)).toBe(true);

      // Play on: the page is never reloaded or taken over, and the Update button is not on the match screen.
      await firstMove(page);
      await throughCurtain(page, 'Player 2');
      expect(await samePage()).toBe(true);
      expect(await page.getByTestId('update').count()).toBe(0);

      await page.getByTestId('open-menu').tap();
      await page.getByTestId('resign').tap();
      await page.getByTestId('resign-yes').tap();
      await page.getByTestId('winner').waitFor();
      expect(await page.getByTestId('update').count()).toBe(0);
      await page.getByTestId('result-home').tap();

      // On Home the new version is offered, and still not applied until Update is tapped.
      await page.getByTestId('update').waitFor();
      expect(await text(page, 'update-ready')).toContain(T.ui.updateReady);
      expect(await samePage()).toBe(true);
      expect(await page.locator('footer.version').textContent()).toBe(firstLabel);

      await page.getByTestId('update').tap();
      await expect.poll(() => page.locator('footer.version').textContent().catch(() => '')).toContain('nextbld');
      await page.getByTestId('new-match').waitFor();
      expect(await samePage()).toBe(false);
      expect(await page.getByTestId('update').count()).toBe(0);
    } finally {
      await close();
      await rm(work, { recursive: true, force: true });
    }
  });

  test('Update tapped in one window never reloads another that is in a match; that one waits for Home', async () => {
    const work = await mkdtemp(join(tmpdir(), 'warbanners-update2-'));
    const served = join(work, 'served');
    const next = join(work, 'next');
    await cp('dist', served, { recursive: true });
    await build({
      logLevel: 'silent',
      define: { __BUILD__: JSON.stringify('nextbld') },
      build: { outDir: next, emptyOutDir: true },
    });
    const { page, context, url, close } = await openApp(SEED, { serviceWorkers: 'allow', outDir: served });
    try {
      await installed(page);
      await page.reload();
      await page.getByTestId('new-match').waitFor();

      // A second window of the same game, in a match.
      const other = await context.newPage();
      await other.goto(url);
      await other.getByTestId('new-match').tap();
      await other.getByTestId('start').tap();
      await throughCurtain(other, 'Player 1');
      await other.evaluate(() => { (window as Window & { loadMarker?: string }).loadMarker = 'still the same page'; });
      const otherSame = (): Promise<boolean> => other.evaluate(() => (window as Window & { loadMarker?: string }).loadMarker === 'still the same page');

      await cp(next, served, { recursive: true, force: true });
      await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
      await page.getByTestId('update').waitFor();

      // The first window, on Home, takes the new version.
      await page.getByTestId('update').tap();
      await expect.poll(() => page.locator('footer.version').textContent().catch(() => '')).toContain('nextbld');

      // The other window plays on, untouched, for as long as its match is open.
      await other.waitForTimeout(1500);
      expect(await otherSame()).toBe(true);
      await firstMove(other);
      await throughCurtain(other, 'Player 2');
      expect(await otherSame()).toBe(true);

      // Leaving the match for Home lets it take the new version.
      await other.getByTestId('open-menu').tap();
      await other.getByTestId('resign').tap();
      await other.getByTestId('resign-yes').tap();
      await other.getByTestId('winner').waitFor();
      expect(await otherSame()).toBe(true);
      await other.getByTestId('result-home').tap();
      await expect.poll(() => other.locator('footer.version').textContent().catch(() => '')).toContain('nextbld');
      expect(await otherSame().catch(() => false)).toBe(false);
    } finally {
      await close();
      await rm(work, { recursive: true, force: true });
    }
  });
}, 180_000);
