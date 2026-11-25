// Shots of the 3D figures' hunker crouch (scripts/hunker3d-shots.ts drives it in Chromium through Vite's dev server).
// Not part of the app: it draws the figures straight from units3d on a plain ground with hex outlines. A sheet shows
// each unit type standing and hunkered side by side; the clips play a hunker, a block while hunkered and standing up
// again, on their own clock at real pace, exactly as the board hands them to units3d (setUnits with `hunkered`,
// then strikes).
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
const STEP = R * Math.sqrt(3);

const ground = document.getElementById('ground') as HTMLCanvasElement;
let unitsCanvas = document.getElementById('units') as HTMLCanvasElement;
const wrap = document.getElementById('wrap') as HTMLDivElement;

interface View { w: number; h: number; scale: number; cx: number; cy: number }
let view: View = { w: 800, h: 600, scale: 2, cx: 0, cy: 0 };
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
  const g = ground.getContext('2d')!;
  g.fillStyle = '#6f8f4e'; g.fillRect(0, 0, v.w, v.h);
  return u;
}
const toPx = (x: number, y: number): [number, number] => [(x - view.cx) * view.scale + view.w / 2, (y - view.cy) * view.scale + view.h / 2];
function hex(x: number, y: number, fill = '#8aa860'): void {
  const g = ground.getContext('2d')!;
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = ((30 + 60 * i) * Math.PI) / 180;
    const [px, py] = toPx(x + R * Math.cos(a), y + R * Math.sin(a) * SQUASH);
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
  g.fillStyle = fill; g.fill();
  g.strokeStyle = '#5d7a3e'; g.lineWidth = 1.5; g.stroke();
}
function label(text: string, x: number, y: number): void {
  const el = document.createElement('div');
  el.className = 'label';
  el.textContent = text;
  const [px, py] = toPx(x, y);
  el.style.left = `${px}px`; el.style.top = `${py}px`;
  wrap.appendChild(el);
}
const draw = (u: NonNullable<typeof units>): void => u.draw({ cx: view.cx, cy: view.cy, scale: view.scale }, { w: view.w, h: view.h }, 1);

interface Cell { type: UnitTypeId; faction: FactionId; hero?: boolean; name: string }

/** Each unit standing (left) and hunkered (right), `perRow` units to a row, at `scale` pixels per board unit. */
function sheet(cells: readonly Cell[], scale: number, perRow: number): void {
  const CW = STEP * 2 + 14, RH = 92;
  const rows = Math.ceil(cells.length / perRow);
  const cols = Math.min(perRow, cells.length);
  const u = fresh({ w: Math.round((cols * CW + 10) * scale), h: Math.round((rows * RH + 24) * scale), scale, cx: (cols * CW) / 2 - CW / 2 + STEP / 2, cy: (rows * RH) / 2 - RH / 2 + 2 });
  const list: GlUnit[] = [];
  let id = 1;
  cells.forEach((c, i) => {
    const x = (i % perRow) * CW, y = Math.floor(i / perRow) * RH;
    hex(x, y); hex(x + STEP, y, '#93b168');
    label(c.name, x + STEP / 2, y - RH * 0.56);
    for (const hunkered of [false, true]) {
      list.push({ id: id++, type: c.type, look: look(c.faction), hero: c.hero === true, x: hunkered ? x + STEP : x, y, alpha: 1, hunkered });
    }
  });
  u.setUnits(list, 0);
  u.pose(new Map(), []);
  u.tick(10_000, 0);
  draw(u);
}

interface Clip { frame(t: number): void; length: number }

/**
 * A hoplite hunkers (at 400 ms), holds the crouch with its idle life, and stands up again (at 1600 ms), with an
 * archer, a knight and a swordsman doing the same beside it; at full pace.
 */
function hunkerClip(scale: number, types: readonly UnitTypeId[]): Clip {
  const span = types.length;
  const u = fresh({ w: Math.round((span * STEP + 20) * scale), h: Math.round(84 * scale), scale, cx: ((span - 1) * STEP) / 2, cy: -12 });
  types.forEach((_, i) => hex(i * STEP, 0));
  const at = (hunkered: boolean): GlUnit[] => types.map((type, i) => ({
    id: i + 1, type, look: look(i % 2 === 0 ? 'spartans' : 'mongols'), hero: false, x: i * STEP, y: 0, alpha: 1, hunkered,
  }));
  let shown: boolean | null = null;
  return {
    length: 2400,
    frame(t: number): void {
      const h = t >= 400 && t < 1600;
      if (h !== shown) { u.setUnits(at(h), t); shown = h; }
      u.pose(new Map(), []);
      u.tick(t, 1);
      draw(u);
    },
  };
}

/** The svg lunge: 11 board units toward the target at 0.3 of 450 ms. */
function lunge(t: number, t0: number, a: [number, number], b: [number, number]): UnitPose | null {
  if (t < t0 || t > t0 + 450) return null;
  const p = (t - t0) / 450;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const k = (p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7) * 11;
  return { x: a[0] + ((b[0] - a[0]) / len) * k, y: a[1] + ((b[1] - a[1]) / len) * k, lunge: p };
}

/** A hunkered hoplite takes a sword blow: the block plays from its crouch and it settles back into it, then stands. */
function blockClip(scale: number): Clip {
  const u = fresh({ w: Math.round(150 * scale), h: Math.round(84 * scale), scale, cx: -STEP / 2, cy: -12 });
  hex(-STEP, 0); hex(0, 0);
  const a: [number, number] = [-STEP, 0], d: [number, number] = [0, 0];
  const list = (hunkered: boolean): GlUnit[] => [
    { id: 1, type: 'warrior', look: look('mongols'), hero: false, x: a[0], y: a[1], alpha: 1, hunkered: false },
    { id: 2, type: 'hoplite', look: look('spartans'), hero: false, x: d[0], y: d[1], alpha: 1, hunkered },
  ];
  u.setUnits(list(true), 0);
  const BLOW = 500;
  let fired = false, up = false;
  return {
    length: 2200,
    frame(t: number): void {
      if (!fired && t >= BLOW - 130) {
        fired = true;
        u.aim(1, d[0], d[1], t, BLOW);
        u.strikes([{ unit: 1, target: 2, from: { x: a[0], y: a[1] }, to: { x: d[0], y: d[1] }, delay: BLOW - t, survives: true, counter: false }], t);
      }
      if (!up && t >= 1600) { up = true; u.setUnits(list(false), t); }
      const poses = new Map<number, UnitPose>();
      const p = lunge(t, BLOW, a, d);
      if (p !== null) poses.set(1, p);
      u.pose(poses, []);
      u.tick(t, 1);
      draw(u);
    },
  };
}

let current: Clip | null = null;
Object.assign(window, {
  hunkerSheet: (cells: Cell[], scale: number, perRow: number) => sheet(cells, scale, perRow),
  hunkerClip: (scale: number, types: UnitTypeId[]) => { current = hunkerClip(scale, types); return current.length; },
  blockClip: (scale: number) => { current = blockClip(scale); return current.length; },
  hunkerFrame: (t: number) => current?.frame(t),
});
document.body.dataset.ready = '1';
