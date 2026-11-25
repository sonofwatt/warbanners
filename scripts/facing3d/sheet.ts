// A test sheet for the 3D unit figures' facing (scripts/facing3d-shots.ts drives it in Chromium through Vite's dev
// server). Not part of the app: it draws the figures straight from units3d, on a plain ground with hex outlines.
import { Color, Vector3 } from 'three';
import type { FactionId, UnitTypeId } from '../../src/engine';
import { ACCENT, playerColour } from '../../src/ui/art/palette';
import { R, SQUASH } from '../../src/ui/board/layout';
import type { GlUnit } from '../../src/ui/terrain3d/unitsInput';
import { createUnits3d } from '../../src/ui/terrain3d/units/units3d';
import type { UnitPose } from '../../src/ui/terrain3d/units/units3d';

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
/** The six hex steps as board vectors, clockwise from the right: E, SE, SW, W, NW, NE. */
const STEPS: { name: string; d: [number, number] }[] = [
  { name: 'E', d: [R * SQRT3, 0] },
  { name: 'SE', d: [R * SQRT3 / 2, R * 1.5 * SQUASH] },
  { name: 'SW', d: [-R * SQRT3 / 2, R * 1.5 * SQUASH] },
  { name: 'W', d: [-R * SQRT3, 0] },
  { name: 'NW', d: [-R * SQRT3 / 2, -R * 1.5 * SQUASH] },
  { name: 'NE', d: [R * SQRT3 / 2, -R * 1.5 * SQUASH] },
];

const ground = document.getElementById('ground') as HTMLCanvasElement;
const unitsCanvas = document.getElementById('units') as HTMLCanvasElement;
const wrap = document.getElementById('wrap') as HTMLDivElement;
function make(): NonNullable<ReturnType<typeof createUnits3d>> {
  const u = createUnits3d(unitsCanvas, shared);
  if (u === null) throw new Error('no WebGL');
  return u;
}
const units = make();

interface View { w: number; h: number; scale: number; cx: number; cy: number }
let view: View = { w: 800, h: 600, scale: 2, cx: 0, cy: 0 };
function size(v: View): void {
  view = v;
  for (const c of [ground, unitsCanvas]) { c.width = v.w; c.height = v.h; c.style.width = `${v.w}px`; c.style.height = `${v.h}px`; }
  wrap.style.width = `${v.w}px`; wrap.style.height = `${v.h}px`;
  for (const el of wrap.querySelectorAll('.label')) el.remove();
}
const toPx = (x: number, y: number): [number, number] => [(x - view.cx) * view.scale + view.w / 2, (y - view.cy) * view.scale + view.h / 2];
function hex(g: CanvasRenderingContext2D, x: number, y: number, fill: string, stroke: string): void {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = ((30 + 60 * i) * Math.PI) / 180;
    const [px, py] = toPx(x + R * Math.cos(a), y + R * Math.sin(a) * SQUASH);
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
  g.fillStyle = fill; g.fill();
  g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke();
}
function arrow(g: CanvasRenderingContext2D, x: number, y: number, d: [number, number]): void {
  const [ax, ay] = toPx(x + d[0] * 0.55, y + d[1] * 0.55), [bx, by] = toPx(x + d[0] * 0.95, y + d[1] * 0.95);
  g.strokeStyle = '#f4e9c8'; g.fillStyle = '#f4e9c8'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
  const a = Math.atan2(by - ay, bx - ax);
  g.beginPath(); g.moveTo(bx, by);
  g.lineTo(bx - 10 * Math.cos(a - 0.5), by - 10 * Math.sin(a - 0.5));
  g.lineTo(bx - 10 * Math.cos(a + 0.5), by - 10 * Math.sin(a + 0.5));
  g.closePath(); g.fill();
}
function label(text: string, x: number, y: number): void {
  const el = document.createElement('div');
  el.className = 'label';
  el.textContent = text;
  const [px, py] = toPx(x, y);
  el.style.left = `${px}px`; el.style.top = `${py}px`;
  wrap.appendChild(el);
}
const draw = (): void => units.draw({ cx: view.cx, cy: view.cy, scale: view.scale }, { w: view.w, h: view.h }, 1);

interface Row { type: UnitTypeId; faction: FactionId; hero?: boolean; name: string }

/**
 * The facing sheet: one row per unit, its rest pose then the six hex directions of a move. Each figure is first set
 * one step behind its cell and then on it, exactly as a move reaches units3d.
 */
function sheet(rows: readonly Row[], scale = 2): void {
  const CW = 125, RH = 105;
  const cols = 1 + STEPS.length;
  size({ w: Math.round(cols * CW * scale), h: Math.round((rows.length * RH + 30) * scale), scale, cx: (cols * CW) / 2 - CW / 2, cy: (rows.length * RH) / 2 - RH / 2 + 4 });
  const g = ground.getContext('2d')!;
  g.fillStyle = '#6f8f4e'; g.fillRect(0, 0, view.w, view.h);
  const from: GlUnit[] = [], to: GlUnit[] = [];
  let id = 1;
  rows.forEach((row, ri) => {
    for (let c = 0; c < cols; c++) {
      const x = c * CW, y = ri * RH;
      const step = c === 0 ? null : STEPS[c - 1]!;
      hex(g, x, y, '#8aa860', '#5d7a3e');
      if (step !== null) { hex(g, x + step.d[0], y + step.d[1], '#7e9c56', '#5d7a3e'); arrow(g, x, y, step.d); }
      const u: GlUnit = { id, type: row.type, look: look(row.faction), hero: row.hero === true, x, y, spent: false, hunkered: false };
      to.push(u);
      from.push(step === null ? u : { ...u, x: x - step.d[0], y: y - step.d[1] });
      if (ri === 0) label(step === null ? 'rest' : `move ${step.name}`, x, -RH / 2 - 8);
      if (c === 0) label(row.name, x - CW * 0.2, y - RH * 0.42);
      id++;
    }
  });
  units.setUnits(from, 0);
  units.setUnits(to, 0);
  units.pose(new Map(), []);
  units.tick(10_000, 0);
  draw();
}

/** A short clip: moves, an attack, a trebuchet's throw and a hunker, posed for time `t` (ms). */
interface Clip { frame(t: number): void; length: number }
function clip(scale = 2.4): Clip {
  size({ w: Math.round(330 * scale), h: Math.round(190 * scale), scale, cx: 40, cy: 12 });
  const at = (q: number, r: number): [number, number] => [R * SQRT3 * (q + r / 2), R * 1.5 * SQUASH * r];
  const g = ground.getContext('2d')!;
  g.fillStyle = '#6f8f4e'; g.fillRect(0, 0, view.w, view.h);
  for (let r = -2; r <= 2; r++) for (let q = -4; q <= 5; q++) { const [x, y] = at(q, r); hex(g, x, y, (q + r) % 2 === 0 ? '#8aa860' : '#83a15a', '#5d7a3e'); }
  // The hoplite walks E, SE, NE and NW (away), attacks the archer to its W (a profile), then hunkers (back to rest).
  // The trebuchet throws up the screen (its back to the viewer), and the knight rides down toward the viewer.
  const path: [number, number][] = [at(-2, 0), at(-1, 0), at(-1, 1), at(0, 0), at(0, -1)];
  const archer = at(-1, -1);
  const treb = at(3, 1), trebTarget = at(3, -1);
  const knight = at(1, -2), knightTo = at(1, -1);
  const base = (hx: [number, number], hk = false): Omit<GlUnit, 'id' | 'type' | 'look' | 'hero'> => ({ x: hx[0], y: hx[1], spent: false, hunkered: hk });
  // The timeline (ms): each move at 500 ms steps (180 ms slides), then an attack, then the hunker.
  const MOVE_AT = [400, 900, 1400, 1900];
  const ATTACK_AT = 2500, THROW_AT = 2700, HUNKER_AT = 3700, KNIGHT_AT = 3200;
  let shownKey = '';
  const state = (t: number): { list: GlUnit[]; key: string } => {
    const step = MOVE_AT.filter((m) => t >= m).length;
    const hk = t >= HUNKER_AT;
    const kn = t >= KNIGHT_AT ? knightTo : knight;
    const list: GlUnit[] = [
      { id: 1, type: 'hoplite', look: look('spartans'), hero: false, ...base(path[step]!, hk) },
      { id: 2, type: 'archer', look: look('mongols'), hero: false, ...base(archer) },
      { id: 3, type: 'catapult', look: look('spartans'), hero: false, ...base(treb) },
      { id: 4, type: 'horseArcher', look: look('mongols'), hero: false, ...base(trebTarget) },
      { id: 5, type: 'knight', look: look('spartans'), hero: true, ...base(kn) },
    ];
    return { list, key: `${step}|${hk}|${kn.join()}` };
  };
  const slide = (t: number, t0: number, a: [number, number], b: [number, number]): UnitPose | null => {
    if (t < t0 || t > t0 + 180) return null;
    const s = 1 - (1 - (t - t0) / 180) ** 2;
    return { x: a[0] + (b[0] - a[0]) * s, y: a[1] + (b[1] - a[1]) * s };
  };
  const lunge = (t: number, t0: number, a: [number, number], b: [number, number]): UnitPose | null => {
    if (t < t0 || t > t0 + 450) return null;
    const p = (t - t0) / 450;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = (p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7) * 11;
    return { x: a[0] + ((b[0] - a[0]) / len) * k, y: a[1] + ((b[1] - a[1]) / len) * k, lunge: p };
  };
  let aimed = false, thrown = false;
  return {
    length: 4400,
    frame(t: number): void {
      const s = state(t);
      if (s.key !== shownKey) { units.setUnits(s.list, t); shownKey = s.key; }
      if (!aimed && t >= ATTACK_AT) { units.aim(1, archer[0], archer[1], t, t); aimed = true; }
      if (!thrown && t >= THROW_AT - 200) { units.aim(3, trebTarget[0], trebTarget[1], t, THROW_AT); thrown = true; }
      const poses = new Map<number, UnitPose>();
      MOVE_AT.forEach((m, i) => { const p = slide(t, m, path[i]!, path[i + 1]!); if (p) poses.set(1, p); });
      const kp = slide(t, KNIGHT_AT, knight, knightTo); if (kp) poses.set(5, kp);
      const lp = lunge(t, ATTACK_AT, path[4]!, archer); if (lp) poses.set(1, lp);
      const tp = lunge(t, THROW_AT, treb, trebTarget); if (tp) poses.set(3, tp);
      units.pose(poses, []);
      units.tick(t, 1);
      draw();
    },
  };
}

/**
 * The light on turned pieces, with the figures' normals in world space (as shipped) or in object space (as before
 * facing): falls mid-tip, a trebuchet mid-swing, and the same trebuchet turned away mid-swing.
 */
function normals(world: boolean, scale = 3): void {
  size({ w: Math.round(330 * scale), h: Math.round(110 * scale), scale, cx: 120, cy: -10 });
  const g = ground.getContext('2d')!;
  g.fillStyle = '#6f8f4e'; g.fillRect(0, 0, view.w, view.h);
  for (const x of [0, 80, 160, 240]) hex(g, x, 0, '#8aa860', '#5d7a3e');
  units.setUnits([
    { id: 1, type: 'catapult', look: look('spartans'), hero: false, x: 160, y: 0, spent: false, hunkered: false },
    { id: 2, type: 'catapult', look: look('spartans'), hero: false, x: 240, y: 0, spent: false, hunkered: false },
  ], 0);
  units.aim(2, 240, -60, 0);
  units.tick(1000, 0);
  units.pose(new Map([[1, { x: 160, y: 0, lunge: 0.2 }], [2, { x: 240, y: 0, lunge: 0.2 }]]), [
    { key: 'a', type: 'hoplite', look: look('spartans'), x: 0, y: 0, angle: 0.9, alpha: 1 },
    { key: 'b', type: 'knight', look: look('mongols'), x: 80, y: 0, angle: 0.6, alpha: 1 },
  ]);
  units.tick(1100, 0);
  let changed = 0;
  units.extras.parent?.traverse((o) => {
    const m = (o as { material?: { defines?: Record<string, string>; needsUpdate: boolean } }).material;
    if (m?.defines === undefined) return;
    const has = 'WORLD_NORMAL' in m.defines;
    if (has === world) return;
    if (world) m.defines.WORLD_NORMAL = ''; else delete m.defines.WORLD_NORMAL;
    m.needsUpdate = true;
    changed++;
  });
  document.body.dataset.changed = String(changed);
  label(world ? 'world normals (now)' : 'object normals (before)', 120, -50);
  draw();
}

let current: Clip | null = null;
Object.assign(window, {
  facingSheet: (rows: Row[], scale?: number) => sheet(rows, scale),
  facingClip: (scale?: number) => { current = clip(scale); return current.length; },
  facingFrame: (t: number) => current?.frame(t),
  facingNormals: (world: boolean) => normals(world),
});
document.body.dataset.ready = '1';
