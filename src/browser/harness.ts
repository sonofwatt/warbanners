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
// on the same port. `webgl` launches Chromium with software WebGL (SwiftShader), for the 3D terrain. Each call launches its own Chromium, so two calls are two phones with separate storage.

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
      deviceScaleFactor: SCALE,
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

/** Taps a tile at the centre of its data-centre marker, as a finger would, once the view has stopped moving. */
export async function tapTile(page: Page, hex: string): Promise<void> {
  await cameraStill(page);
  const box = await page.locator(`[data-centre="${hex}"]`).boundingBox();
  if (box === null) throw new Error(`tile ${hex} has no box`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await frames(page);
}
