/// <reference types="node" />
import { createServer } from 'node:net';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { preview } from 'vite';
import type { PreviewServer } from 'vite';

// Browser tests drive the built app (run `vite build` first; `npm run test:browser` does).
// openApp serves dist with Vite's preview server on a free port, opens Chromium on a phone-sized
// touch screen, and returns the page. close() always stops both, so call it in a finally block.

const PHONE = { width: 412, height: 915 };
const SCALE = 2.6;

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
  opts: { width?: number; height?: number } = {},
): Promise<{ page: Page; close(): Promise<void> }> {
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
    const port = await freePort();
    server = await preview({ logLevel: 'silent', preview: { host: '127.0.0.1', port, strictPort: true, open: false } });
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: opts.width ?? PHONE.width, height: opts.height ?? PHONE.height },
      deviceScaleFactor: SCALE,
      hasTouch: true,
      isMobile: true,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const base = process.env.GITHUB_PAGES_BASE ?? '/';
    await page.goto(`http://127.0.0.1:${port}${base}${query}`);
    return { page, close };
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
