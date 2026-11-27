// The 3D board's frame times with lit windows and lanterns in view (scripts/nightlights3d-bench.ts drives it in Chromium
// through Vite's dev server). Not part of the app: a phone-sized terrain and units canvas over a small map with a
// level 6 Spartan capital, a Mongol city and a village, and 24 units round them, close up, by day and at night. Two
// numbers each: a camera frame (the terrain and the figures' canvas drawn, as a pan draws them) and an ambient frame
// (the figures' canvas alone, as the ambient loop draws it, the units turning a little each frame so the lanterns'
// light moves), each waited for with a one pixel read so the GPU's work is counted too. It uses only the renderer's
// public calls, so the same page runs on a branch without the night lights (the units' lantern flag is then ignored).
import type { TimeOfDay } from '../../src/app/advanced';
import type { GlMap, GlTile } from '../../src/ui/terrain3d/input';
import type { GlUnit } from '../../src/ui/terrain3d/unitsInput';
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
  tiles['0,0'] = { ...bare, city: true, town: { faction: 'spartans', level: 6, capital: true, walls: true } } as GlTile;
  tiles['2,-1'] = { ...bare, city: true, town: { faction: 'mongols', level: 4, capital: false, walls: false } } as GlTile;
  tiles['-2,1'] = { ...bare, village: true };
  return { radius, tiles, fog: [] };
}

const SQ3 = Math.sqrt(3), R = 30;
const boardOf = (q: number, r: number): { x: number; y: number } => ({ x: R * SQ3 * (q + r / 2), y: R * 1.5 * r * 0.62 });
const TYPES: GlUnit['type'][] = ['warrior', 'archer', 'horseman', 'catapult', 'spearman', 'knight', 'hoplite', 'scout'];
function unitsOf(turn: number): GlUnit[] {
  const out: GlUnit[] = [];
  let id = 1;
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
    if (Math.abs(q + r) > 3 || out.length >= 24) continue;
    if ((q === 0 && r === 0) || (q === 2 && r === -1)) continue;
    const at = boardOf(q, r);
    const type = TYPES[id % TYPES.length]!;
    // Each frame a unit steps a hair along a turning heading, so its facing and its lantern's light change.
    const a = turn * 0.7 + id;
    out.push({
      id, type, look: { main: '#B3261E', dark: '#8E1D17', accent: '#C8963E' }, hero: false, x: at.x + Math.cos(a) * 0.5 * (turn % 2), y: at.y + Math.sin(a) * 0.5 * (turn % 2),
      spent: false, hunkered: false, lantern: type !== 'scout',
    } as GlUnit);
    id++;
  }
  return out;
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
  t.units!.setUnits(unitsOf(0), 0);
  const cam = { cx: 0, cy: 0, scale: 2 };
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
    t.units!.setUnits(unitsOf(f + 1), 40_000 + f * 50);
    t.tick(40_000 + f * 50, 1);
    t.drawUnits(cam, vp);
    ugl.readPixels(0, 0, 1, 1, ugl.RGBA, ugl.UNSIGNED_BYTE, px);
    if (f >= 10) ambientTimes.push(performance.now() - t0);
  }
  t.dispose();
  return { camera: stats(cameraTimes, calls, triangles), ambient: stats(ambientTimes, 0, 0) };
}

Object.assign(window, { nightBench: bench });
document.body.dataset.ready = '1';

/**
 * The figures' canvas for one unit at the board's middle, facing along the board vector (dx, dy), at night with
 * and without its lantern: both frames' pixels (RGBA, device pixels, unpremultiplied), so the lantern's own light
 * (its pool, its halo and its glass) is their difference.
 */
function probe(dx: number, dy: number, w = 400, h = 400): { lit: number[]; dark: number[]; w: number; h: number; scale: number; lamp: { x: number; y: number } | null } {
  const canvas = document.getElementById('terrain') as HTMLCanvasElement;
  const units = document.getElementById('units') as HTMLCanvasElement;
  for (const c of [canvas, units]) { c.style.width = `${w}px`; c.style.height = `${h}px`; }
  Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
  const t = createTerrain3d(canvas, { units })!;
  t.setMap(mapOf());
  const one = (x: number, y: number, lantern = true): GlUnit => ({ id: 1, type: 'warrior', look: { main: '#B3261E', dark: '#8E1D17', accent: '#C8963E' }, hero: false, x, y, spent: false, hunkered: false, lantern } as GlUnit);
  // It steps onto the middle from (-dx, -dy), so it faces along (dx, dy).
  t.units!.setUnits([one(-dx, -dy)], 0);
  t.units!.setUnits([one(0, 0)], 1);
  const cam = { cx: 0, cy: 0, scale: 6 };
  const grab = (time: TimeOfDay): number[] => {
    t.setLook({ weather: 'clear', time });
    t.tick(5000, 0);
    t.drawUnits(cam, { w, h });
    const c2 = document.createElement('canvas');
    c2.width = w; c2.height = h;
    const g = c2.getContext('2d')!;
    g.drawImage(units, 0, 0);
    return Array.from(g.getImageData(0, 0, w, h).data);
  };
  const lit = grab('night');
  // The lantern's glass is the brightest opaque pixel: its halo is centred there.
  let lamp: { x: number; y: number } | null = null, best = 0;
  for (let i = 0; i < w * h; i++) {
    if (lit[4 * i + 3]! < 250) continue;
    const v = lit[4 * i]! + lit[4 * i + 1]! + lit[4 * i + 2]!;
    if (v > best) { best = v; lamp = { x: i % w, y: Math.floor(i / w) }; }
  }
  // The same frame with no lantern on the unit (it keeps its facing).
  t.units!.setUnits([one(0, 0, false)], 2);
  const dark = grab('night');
  t.dispose();
  return { lit, dark, w, h, scale: cam.scale, lamp };
}
Object.assign(window, { nightProbe: probe });
