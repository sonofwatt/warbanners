// The 3D board's frame time with lit windows and lanterns in view, on this machine, in Chromium with software WebGL
// (SwiftShader): a phone-sized canvas (412x915 css at DPR 2), close up on two cities, a village and 24 units, by day
// and at night (scripts/nightlights3d).
// Run: npx tsx scripts/nightlights3d-bench.ts [runs] [frames]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { WEBGL_ARGS } from '../src/browser/harness';

const runs = Number(process.argv[2] ?? 3);
const frames = Number(process.argv[3] ?? 20);
type Row = { avg: number; p50: number; p95: number; calls: number; triangles: number };
type W = Window & { nightBench(time: string, frames: number, dpr: number): { camera: Row; ambient: Row } };
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const addr = server.httpServer?.address();
const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
const browser = await chromium.launch({ args: WEBGL_ARGS });
const fmt = (r: Row): string => `avg ${r.avg.toFixed(2)} p50 ${r.p50.toFixed(2)} p95 ${r.p95.toFixed(2)} ms`;
try {
  for (const time of ['day', 'night']) {
    const rows: string[] = [];
    for (let i = 0; i < runs; i++) {
      const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
      await page.goto(`http://127.0.0.1:${port}/scripts/nightlights3d/bench.html`);
      await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 60_000 });
      page.on('pageerror', (e) => console.log('page error:', e.message));
      const r = await page.evaluate((t) => (window as unknown as W).nightBench(t.time, t.frames, 2), { time, frames });
      rows.push(`camera ${fmt(r.camera)} (calls ${r.camera.calls}, triangles ${r.camera.triangles}); ambient ${fmt(r.ambient)}`);
      await page.close();
    }
    console.log(`${time}:\n  ${rows.join('\n  ')}`);
  }
} finally {
  await browser.close();
  await server.close();
}
