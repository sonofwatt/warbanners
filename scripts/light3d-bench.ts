// The units canvas's frame time on this machine, in Chromium with software WebGL (SwiftShader): a phone-sized canvas
// (412x915 css at DPR 2) with 12 and 24 figures in view, posed and drawn each frame and waited for (scripts/light3d).
// Run: npx tsx scripts/light3d-bench.ts [runs]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { WEBGL_ARGS } from '../src/browser/harness';

const runs = Number(process.argv[2] ?? 3);
type W = Window & { unitsBench(units: number, frames: number, dpr: number): { avg: number; p50: number; p95: number; units: number; calls: number; triangles: number } };
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const addr = server.httpServer?.address();
const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
const browser = await chromium.launch({ args: WEBGL_ARGS });
try {
  for (const n of [12, 24]) {
    const rows: string[] = [];
    for (let i = 0; i < runs; i++) {
      const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
      await page.goto(`http://127.0.0.1:${port}/scripts/light3d/bench.html`);
      await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 60_000 });
      const r = await page.evaluate((k) => (window as unknown as W).unitsBench(k, 120, 2), n);
      rows.push(`avg ${r.avg.toFixed(2)} p50 ${r.p50.toFixed(2)} p95 ${r.p95.toFixed(2)} ms (calls ${r.calls}, triangles ${r.triangles})`);
      await page.close();
    }
    console.log(`${n} units:\n  ${rows.join('\n  ')}`);
  }
} finally {
  await browser.close();
  await server.close();
}
