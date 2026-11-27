// The lantern's light split, measured on a render (scripts/nightlights3d/bench.ts nightProbe, in Chromium with
// software WebGL through Vite's dev server): one warrior at the board's middle at night, turned along a board vector,
// drawn with its lantern and again without, and the difference in the figures' canvas's opacity summed by the quarter
// of the ground round its feet it falls in (ahead, left, right, behind). Pixels the figure covers in both frames, and
// a disc round the lantern itself (its halo), are left out.
// Run: npx tsx scripts/nightlights3d-split.ts [dx dy]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { WEBGL_ARGS } from '../src/browser/harness';
import { headingOf } from '../src/ui/terrain3d/units/facing';
import { SQUASH } from '../src/ui/terrain3d/layout';

const dx = Number(process.argv[2] ?? 0), dy = Number(process.argv[3] ?? 30);
type Probe = { lit: number[]; dark: number[]; w: number; h: number; scale: number; lamp: { x: number; y: number } | null };
type W = Window & { nightProbe(dx: number, dy: number): Probe };
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const addr = server.httpServer?.address();
const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
const browser = await chromium.launch({ args: WEBGL_ARGS });
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  await page.goto(`http://127.0.0.1:${port}/scripts/nightlights3d/bench.html`);
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 60_000 });
  const r = await page.evaluate(([x, y]) => (window as unknown as W).nightProbe(x!, y!), [dx, dy]);
  const h = headingOf(dx, dy)!;
  const hx = Math.sin(h), hz = Math.cos(h);
  // The feet stand 4 board units below the tile centre (units3d.ts FEET_Z), at the canvas's middle.
  const fx = r.w / 2, fy = r.h / 2 + 4 * r.scale;
  const sum = { ahead: 0, left: 0, right: 0, behind: 0 };
  for (let i = 0; i < r.w * r.h; i++) {
    const la = r.lit[4 * i + 3]!, da = r.dark[4 * i + 3]!;
    if (la >= 250 && da >= 250) continue;
    const x = i % r.w, y = Math.floor(i / r.w);
    if (r.lamp !== null && Math.hypot(x - r.lamp.x, y - r.lamp.y) < 6 * r.scale) continue;
    const d = (la - da) / 255;
    if (d <= 0) continue;
    const wx = (x - fx) / r.scale, wz = (y - fy) / r.scale / SQUASH;
    const a = Math.atan2(wx * hz - wz * hx, wx * hx + wz * hz);
    if (Math.abs(a) <= Math.PI / 4) sum.ahead += d;
    else if (Math.abs(a) >= (3 * Math.PI) / 4) sum.behind += d;
    else if (a > 0) sum.left += d;
    else sum.right += d;
  }
  const all = sum.ahead + sum.left + sum.right + sum.behind;
  console.log(`facing (${dx}, ${dy}): ahead ${(100 * sum.ahead / all).toFixed(1)}%, left ${(100 * sum.left / all).toFixed(1)}%, right ${(100 * sum.right / all).toFixed(1)}%, behind ${(100 * sum.behind / all).toFixed(1)}%`);
} finally {
  await browser.close();
  await server.close();
}
