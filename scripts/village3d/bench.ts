// The 3D board's frame times with villages in view (scripts/village3d-bench.ts drives it in Chromium through Vite's
// dev server). Not part of the app: a phone-sized terrain and units canvas over a small map of fields and forest with
// four villages, close up, by day and at night. Two numbers each: a camera frame (the terrain and the figures' canvas
// drawn, as a pan draws them) and an ambient frame (the figures' canvas alone, as the ambient loop draws it), each
// waited for with a one pixel read so the GPU's work is counted too. It uses only the renderer's public calls, so the
// same page runs on a branch without the bonfires.
import type { TimeOfDay } from '../../src/app/advanced';
import type { GlMap, GlTile } from '../../src/ui/terrain3d/input';
import { createTerrain3d } from '../../src/ui/terrain3d/terrain3d';

const bare: GlTile = { terrain: 'field', resource: null, harvested: false, building: null, village: false, treasure: false, road: false, city: false, town: null };

function mapOf(): GlMap {
  const tiles: Record<string, GlTile> = {};
  const radius = 4;
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      const forest = (q * 7 + r * 3) % 4 === 0;
      tiles[`${q},${r}`] = { ...bare, terrain: forest ? 'forest' : 'field' };
    }
  }
  for (const k of ['0,0', '2,-1', '-2,1', '1,1']) tiles[k] = { ...bare, village: true };
  return { radius, tiles, fog: [] };
}

type Row = { avg: number; p50: number; p95: number; calls: number; triangles: number };
function stats(times: number[], calls: number, triangles: number): Row {
  times.sort((a, b) => a - b);
  return { avg: times.reduce((a, b) => a + b, 0) / times.length, p50: times[Math.floor(times.length / 2)]!, p95: times[Math.floor(times.length * 0.95)]!, calls, triangles };
}

function bench(time: TimeOfDay, frames: number, dpr: number): { camera: Row; ambient: Row } {
  const canvas = document.getElementById('terrain') as HTMLCanvasElement;
  const units = document.getElementById('units') as HTMLCanvasElement;
  const w = 412, h = 915;
  for (const c of [canvas, units]) { c.style.width = `${w}px`; c.style.height = `${h}px`; }
  Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true });
  const t = createTerrain3d(canvas, { units })!;
  t.setMap(mapOf());
  t.setLook({ weather: 'clear', time });
  const cam = { cx: 0, cy: 0, scale: 3 }; // close up, as a player looks at a village
  const vp = { w, h };
  const gl = canvas.getContext('webgl2')!, ugl = units.getContext('webgl2')!;
  const px = new Uint8Array(4);
  const cameraTimes: number[] = [], ambientTimes: number[] = [];
  let calls = 0, triangles = 0;
  for (let f = 0; f < frames + 10; f++) {
    const t0 = performance.now();
    t.tick(20_000 + f * 50, 1);
    t.draw({ ...cam, cx: cam.cx + (f % 2) * 0.5 }, vp);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    ugl.readPixels(0, 0, 1, 1, ugl.RGBA, ugl.UNSIGNED_BYTE, px);
    if (f >= 10) cameraTimes.push(performance.now() - t0);
    if (f === 10) { const s = t.stats(); calls = s.calls; triangles = s.triangles; }
  }
  for (let f = 0; f < frames + 10; f++) {
    const t0 = performance.now();
    t.tick(40_000 + f * 50, 1);
    t.drawUnits(cam, vp);
    ugl.readPixels(0, 0, 1, 1, ugl.RGBA, ugl.UNSIGNED_BYTE, px);
    if (f >= 10) ambientTimes.push(performance.now() - t0);
  }
  t.dispose();
  return { camera: stats(cameraTimes, calls, triangles), ambient: stats(ambientTimes, 0, 0) };
}

Object.assign(window, { villageBench: bench });
document.body.dataset.ready = '1';
