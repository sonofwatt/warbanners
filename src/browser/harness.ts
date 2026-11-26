/// <reference types="node" />
import { createServer } from 'node:net';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { preview } from 'vite';
import type { PreviewServer } from 'vite';

// Browser tests drive the built app (run `vite build` first; `npm run test:browser` does).
// openApp serves dist with Vite's preview server on a free port, opens Chromium on a phone-sized
// touch screen, and returns the page. close() always stops both, so call it in a finally block.
// Service workers are blocked unless a test asks for them; `outDir` serves another built folder than dist,
// and `beforeOpen` sees the browser context before the first page load (to record requests, say).
// `storageState` starts the browser with storage saved from an earlier one, and `port` serves on that port rather
// than a free one: storage is kept per origin, so a browser that comes back with its saved storage must come back
// on the same port. `webgl` launches Chromium with software WebGL (SwiftShader), for the 3D terrain, and `scale` sets the device pixel ratio (2.6 by default). Each call launches its own Chromium, so two calls are two phones with separate storage.

const PHONE = { width: 412, height: 915 };
const SCALE = 2.6;
/** Software WebGL in headless Chromium, as a phone without a GPU driver would get it. */
export const WEBGL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      s.close(() => resolve(port));
    });
  });
}

export async function openApp(
  query = '',
  opts: {
    width?: number; height?: number;
    serviceWorkers?: 'allow' | 'block';
    outDir?: string;
    beforeOpen?: (context: BrowserContext) => void;
    storageState?: Awaited<ReturnType<BrowserContext['storageState']>>;
    port?: number;
    webgl?: boolean;
    scale?: number;
  } = {},
): Promise<{ page: Page; context: BrowserContext; origin: string; url: string; close(): Promise<void> }> {
  let server: PreviewServer | null = null;
  let browser: Browser | null = null;
  const close = async (): Promise<void> => {
    const b = browser;
    const s = server;
    browser = null;
    server = null;
    await b?.close().catch(() => {});
    await s?.close().catch(() => {});
  };
  try {
    const port = opts.port ?? await freePort();
    server = await preview({
      logLevel: 'silent',
      preview: { host: '127.0.0.1', port, strictPort: true, open: false },
      ...(opts.outDir !== undefined ? { build: { outDir: opts.outDir } } : {}),
    });
    browser = await chromium.launch(opts.webgl === true ? { args: WEBGL_ARGS } : {});
    const context = await browser.newContext({
      viewport: { width: opts.width ?? PHONE.width, height: opts.height ?? PHONE.height },
      deviceScaleFactor: opts.scale ?? SCALE,
      hasTouch: true,
      isMobile: true,
      serviceWorkers: opts.serviceWorkers ?? 'block',
      ...(opts.storageState !== undefined ? { storageState: opts.storageState } : {}),
    });
    opts.beforeOpen?.(context);
    const page = await context.newPage();
    const base = process.env.GITHUB_PAGES_BASE ?? '/';
    const origin = `http://127.0.0.1:${port}`;
    const url = `${origin}${base}${query}`;
    await page.goto(url);
    return { page, context, origin, url, close };
  } catch (e) {
    await close();
    throw e;
  }
}

/** Resolves after the page has painted twice, so writes queued for the next animation frame have landed. */
export async function frames(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
}

/**
 * Resolves once the board's camera has held still for a few frames: an automatic pan (a selection that opened the
 * unit card, Next unit, a followed action) eases over up to 400 ms, and a tile's place on screen is only known after.
 */
export async function cameraStill(page: Page): Promise<void> {
  await page.evaluate(`new Promise((done) => {
    let last = null, same = 0, n = 0;
    function look() {
      const t = document.querySelector('[data-camera="true"]')?.getAttribute('transform') ?? '';
      same = t === last ? same + 1 : 0;
      last = t;
      if (same >= 3 || ++n > 240) done(); else requestAnimationFrame(look);
    }
    requestAnimationFrame(look);
  })`);
}

/**
 * Taps a tile at the centre of its data-centre marker, as a finger would, once the view has stopped moving. When the
 * selection's card or the bar of turn buttons lies over that spot (both lie over the board), the board is first
 * dragged, as a player would, until the tile is clear of it.
 */
export async function tapTile(page: Page, hex: string): Promise<void> {
  await cameraStill(page);
  const at = async (): Promise<{ x: number; y: number }> => {
    const box = await page.locator(`[data-centre="${hex}"]`).boundingBox();
    if (box === null) throw new Error(`tile ${hex} has no box`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  let p = await at();
  const blocker = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const over = el?.closest('[data-testid="selection"], [data-testid="action-bar"]');
    if (over === null || over === undefined) return null;
    const r = over.getBoundingClientRect(), s = document.querySelector('[data-testid="board-slot"]')!.getBoundingClientRect();
    const side = r.top <= s.top + 1 && r.left > s.left + 40;
    return { side, top: r.top, left: r.left, slot: { x: s.left, y: s.top, w: s.width, h: s.height } };
  }, p);
  if (blocker !== null) {
    const from = blocker.side
      ? { x: blocker.slot.x + 40, y: blocker.slot.y + blocker.slot.h / 2 }
      : { x: blocker.slot.x + blocker.slot.w / 2, y: Math.min(p.y, blocker.top) - 30 };
    const dx = blocker.side ? blocker.left - 50 - p.x : 0;
    const dy = blocker.side ? 0 : blocker.top - 50 - p.y;
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
    await page.mouse.up();
    await frames(page);
    p = await at();
  }
  await page.touchscreen.tap(p.x, p.y);
  await frames(page);
}

/**
 * The part of the board's slot the selection card (or, with nothing selected, the bar of turn buttons) leaves
 * uncovered: both lie over the slot (the slot keeps its size), the card at the bottom in portrait (only its collapsed
 * top counts) and in the side column in landscape, the bar at the bottom.
 */
export async function uncoveredBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  return page.evaluate(() => {
    const s = document.querySelector('[data-testid="board-slot"]')!.getBoundingClientRect();
    const card = document.querySelector<HTMLElement>('[data-testid="selection"]');
    if (card === null) {
      // Nothing selected: the bar of turn buttons lies over the bottom.
      const bar = document.querySelector('[data-testid="action-bar"]')?.getBoundingClientRect();
      return { x: s.x, y: s.y, width: s.width, height: (bar === undefined ? s.bottom : Math.min(s.bottom, bar.top)) - s.y };
    }
    const c = card.getBoundingClientRect();
    if (card.dataset.sheet === 'side') return { x: s.x, y: s.y, width: c.left - s.x, height: s.height };
    // Measure with the card collapsed: what the camera counts is the collapsed card.
    if (card.dataset.sheet !== 'collapsed') throw new Error('uncoveredBox needs the card collapsed');
    return { x: s.x, y: s.y, width: s.width, height: c.top - s.y };
  });
}

/**
 * Clears the selection, as a player would to reach the turn buttons (the selection's card takes their place): a tap
 * on the sea past the map's edge, or failing that, taps on the selected tile until it cycles to nothing.
 */
export async function deselect(page: Page): Promise<void> {
  for (let i = 0; i < 4 && (await page.locator('[data-testid="selection"]').count()) > 0; i += 1) {
    await cameraStill(page);
    const sea = await page.evaluate(() => {
      const s = document.querySelector('[data-testid="board-slot"]')!.getBoundingClientRect();
      const card = document.querySelector('[data-testid="selection"]')?.getBoundingClientRect();
      const bottom = card !== undefined && card.top > s.top + 40 ? card.top : s.bottom;
      const right = card !== undefined && card.left > s.left + 40 && card.top <= s.top + 1 ? card.left : s.right;
      for (let y = s.top + 12; y < bottom - 12; y += 16) {
        for (let x = s.left + 12; x < right - 12; x += 16) {
          const el = document.elementFromPoint(x, y);
          if (el !== null && el.matches('svg.board')) return { x, y };
        }
      }
      return null;
    });
    if (sea !== null) await page.touchscreen.tap(sea.x, sea.y);
    else {
      const sel = await page.locator('[data-mark="selected"]').first().evaluate((el) => el.closest('[data-hex]')?.getAttribute('data-hex') ?? null).catch(() => null);
      if (sel === null) break;
      await tapTile(page, sel);
    }
    await frames(page);
  }
}
