// The units canvas's frame time (scripts/light3d-bench.ts drives it in Chromium through Vite's dev server). Not part
// of the app: a phone-sized units canvas with a crowd of figures (standing, hunkered, mounted), each frame posed
// (tick, idle life on) and drawn, then waited for with a one pixel read so the GPU's work is counted too.
import { Color, Vector3 } from 'three';
import type { FactionId, UnitTypeId } from '../../src/engine';
import { ACCENT, playerColour } from '../../src/ui/art/palette';
import { R, SQUASH } from '../../src/ui/board/layout';
import type { GlUnit } from '../../src/ui/terrain3d/unitsInput';
import { createUnits3d } from '../../src/ui/terrain3d/units/units3d';

const shared = {
  uLightDir: { value: new Vector3(-0.55, 0.8, 0.28).normalize() },
  uLightColor: { value: new Color(1.05, 1.02, 0.96) },
  uShadowColor: { value: new Color(0.68, 0.70, 0.80) },
  uTint: { value: new Color(1, 1, 1) },
  uVeilColor: { value: new Color('#1E2833') },
  uTime: { value: 0 },
};
const look = (f: FactionId): GlUnit['look'] => ({ ...playerColour(f), accent: ACCENT[f] });
const SQRT3 = Math.sqrt(3);
const at = (q: number, r: number): [number, number] => [R * SQRT3 * (q + r / 2), R * 1.5 * SQUASH * r];
const TYPES: UnitTypeId[] = ['warrior', 'knight', 'hoplite', 'archer', 'horseman', 'catapult', 'horseArcher', 'swordsman', 'defender', 'spearman', 'khansGuard', 'scout'];

function bench(units: number, frames: number, dpr: number, keep = false): { avg: number; p50: number; p95: number; units: number; calls: number; triangles: number } {
  const canvas = document.getElementById('units') as HTMLCanvasElement;
  const w = 412, h = 915;
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  const u = createUnits3d(canvas, shared);
  if (u === null) throw new Error('no WebGL');
  const gl = canvas.getContext('webgl2')!;
  const list: GlUnit[] = [];
  for (let i = 0; i < units; i++) {
    const q = (i % 4) - 2, r = Math.floor(i / 4) - Math.floor(units / 8);
    const [x, y] = at(q, r);
    list.push({ id: i + 1, type: TYPES[i % TYPES.length]!, look: look(i % 2 === 0 ? 'spartans' : 'mongols'), hero: false, x, y, spent: false, hunkered: i % 5 === 2 });
  }
  u.setUnits(list, 0);
  u.pose(new Map(), []);
  const cam = { cx: 0, cy: 0, scale: 64 / 52 };
  const px = new Uint8Array(4);
  const times: number[] = [];
  for (let f = 0; f < frames + 10; f++) {
    const t0 = performance.now();
    u.tick(20_000 + f * 50, 1);
    u.draw(cam, { w, h }, dpr);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (f >= 10) times.push(performance.now() - t0);
  }
  const s = u.stats();
  if (!keep) u.dispose();
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return { avg, p50: times[Math.floor(times.length / 2)]!, p95: times[Math.floor(times.length * 0.95)]!, units: s.units, calls: s.calls, triangles: s.triangles };
}

Object.assign(window, { unitsBench: bench });
document.body.dataset.ready = '1';
