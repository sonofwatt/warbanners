// Clips of the spear jab and the couched lance in the 3D look, with a sword swing beside them for comparison
// (scripts/spearjab-shots.ts drives it in Chromium through Vite's dev server). Not part of the app: like
// scripts/motion3d/sheet.ts it draws the figures straight from units3d on a plain ground with hex outlines, with the
// game's camera and its own timings (the svg lunge, the strikes and blocks the board hands units3d). Each clip has
// two attacks side by side, at two facings: to the right, and down the screen to the left (toward the viewer).
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
const at = (q: number, r: number): [number, number] => [R * SQRT3 * (q + r / 2), R * 1.5 * SQUASH * r];

const ground = document.getElementById('ground') as HTMLCanvasElement;
let unitsCanvas = document.getElementById('units') as HTMLCanvasElement;
const wrap = document.getElementById('wrap') as HTMLDivElement;

interface View { w: number; h: number; scale: number; cx: number; cy: number }
let view: View = { w: 800, h: 600, scale: 3, cx: 0, cy: 0 };
let units: NonNullable<ReturnType<typeof createUnits3d>> | null = null;
function fresh(v: View): NonNullable<ReturnType<typeof createUnits3d>> {
  if (units !== null) {
    units.dispose();
    const next = document.createElement('canvas');
    next.id = 'units';
    unitsCanvas.replaceWith(next);
    unitsCanvas = next;
  }
  view = v;
  for (const c of [ground, unitsCanvas]) { c.width = v.w; c.height = v.h; c.style.width = `${v.w}px`; c.style.height = `${v.h}px`; }
  wrap.style.width = `${v.w}px`; wrap.style.height = `${v.h}px`;
  for (const el of wrap.querySelectorAll('.label')) el.remove();
  const u = createUnits3d(unitsCanvas, shared);
  if (u === null) throw new Error('no WebGL');
  units = u;
  return u;
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
function label(text: string, x: number, y: number): void {
  const el = document.createElement('div');
  el.className = 'label';
  el.textContent = text;
  const [px, py] = toPx(x, y);
  el.style.left = `${px}px`; el.style.top = `${py}px`;
  wrap.appendChild(el);
}
function field(qs: [number, number], rs: [number, number]): void {
  const g = ground.getContext('2d')!;
  g.fillStyle = '#6f8f4e'; g.fillRect(0, 0, view.w, view.h);
  for (let r = rs[0]; r <= rs[1]; r++) for (let q = qs[0] - Math.ceil(r / 2); q <= qs[1] - Math.floor(r / 2); q++) {
    const [x, y] = at(q, r);
    hex(g, x, y, (q + r) % 2 === 0 ? '#8aa860' : '#83a15a', '#5d7a3e');
  }
}

/** The svg lunge: 11 board units toward the target at 0.3 of 450 ms, ease-out. */
function lunge(t: number, t0: number, a: [number, number], b: [number, number]): UnitPose | null {
  if (t < t0 || t > t0 + 450) return null;
  const p = (t - t0) / 450;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const k = (p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7) * 11;
  return { x: a[0] + ((b[0] - a[0]) / len) * k, y: a[1] + ((b[1] - a[1]) / len) * k, lunge: p };
}

/** The two attacks of a clip: to the right, and down the screen to the left. */
const PAIRS: { a: [number, number]; d: [number, number] }[] = [
  { a: at(-1, 0), d: at(0, 0) },
  { a: at(3, -1), d: at(2, 0) },
];
/** When each attack starts (ms): played twice. */
export const STARTS = [300, 1300];
export const LENGTH = 2100;

let frame: (t: number) => void = () => {};

/** A clip of `type` attacking a shielded warrior at both facings. */
function clip(type: UnitTypeId, faction: FactionId, title: string, scale: number): { length: number; pairs: { a: [number, number]; d: [number, number] }[] } {
  const v: View = { w: Math.round(340 * scale), h: Math.round(150 * scale), scale, cx: 78, cy: -26 };
  const u = fresh(v);
  field([-3, 5], [-2, 1]);
  label(title, v.cx, v.cy - v.h / v.scale / 2 + 4);
  const list: GlUnit[] = [];
  PAIRS.forEach((p, i) => {
    list.push({ id: 10 + i, type, look: look(faction), hero: false, x: p.a[0], y: p.a[1], spent: false, hunkered: false });
    list.push({ id: 20 + i, type: 'warrior', look: look(faction === 'spartans' ? 'mongols' : 'spartans'), hero: false, x: p.d[0], y: p.d[1], spent: false, hunkered: false });
  });
  u.setUnits(list, 0);
  const fired = new Set<string>();
  frame = (t: number): void => {
    for (const s of STARTS) PAIRS.forEach((p, i) => {
      const key = `${s}:${i}`;
      if (t < s - 130 || fired.has(key)) return;
      fired.add(key);
      u.aim(10 + i, p.d[0], p.d[1], t, s);
      u.strikes([{ unit: 10 + i, target: 20 + i, from: { x: p.a[0], y: p.a[1] }, to: { x: p.d[0], y: p.d[1] }, delay: s - t, survives: true, counter: false }], t);
    });
    const poses = new Map<number, UnitPose>();
    for (const s of STARTS) PAIRS.forEach((p, i) => { const l = lunge(t, s, p.a, p.d); if (l !== null) poses.set(10 + i, l); });
    u.pose(poses, []);
    u.tick(t, 1);
    u.draw({ cx: view.cx, cy: view.cy, scale: view.scale }, { w: view.w, h: view.h }, 1);
  };
  return { length: LENGTH, pairs: PAIRS.map((p) => ({ a: toPx(...p.a), d: toPx(...p.d) })) };
}

const CLIPS: Record<string, [UnitTypeId, FactionId, string]> = {
  spearman: ['spearman', 'spartans', 'spearman: jab'],
  hoplite: ['hoplite', 'spartans', 'hoplite: jab'],
  kingsGuard: ['kingsGuard', 'spartans', "king's guard: jab"],
  horseman: ['horseman', 'mongols', 'horseman: couched spear'],
  knight: ['knight', 'spartans', 'knight: couched lance'],
  warrior: ['warrior', 'mongols', 'warrior: sword swing (for comparison)'],
};

Object.assign(window, {
  jabClip: (name: string, scale = 3) => { const [t, f, title] = CLIPS[name]!; return clip(t, f, title, scale); },
  jabFrame: (t: number) => frame(t),
  jabClips: () => Object.keys(CLIPS),
});
document.body.dataset.ready = '1';
