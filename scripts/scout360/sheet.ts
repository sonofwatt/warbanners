// A turntable of one 3D figure, its strike at a few facings, its walk, and a stretch of board at game zoom
// (scripts/scout360-shots.ts drives it in Chromium through Vite's dev server). Not part of the app: like
// scripts/spearjab/sheet.ts it draws the figures straight from units3d on a plain ground with hex outlines, with the
// game's own camera. The turntable turns the figure through the game's own facing (an aim at a point round it), so
// every view is one the board can show.
import { Color, Vector3 } from 'three';
import type { FactionId, UnitTypeId } from '../../src/engine';
import { ACCENT, playerColour } from '../../src/ui/art/palette';
import { R, SQUASH } from '../../src/ui/board/layout';
import { slideMs3d, travelPhase } from '../../src/ui/board/motion';
import type { GlUnit } from '../../src/ui/terrain3d/unitsInput';
import { frontsOf } from '../../src/ui/terrain3d/units/facing';
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
function field(qs: [number, number], rs: [number, number]): void {
  const g = ground.getContext('2d')!;
  g.fillStyle = '#6f8f4e'; g.fillRect(0, 0, view.w, view.h);
  for (let r = rs[0]; r <= rs[1]; r++) for (let q = qs[0] - Math.ceil(r / 2); q <= qs[1] - Math.floor(r / 2); q++) {
    const [x, y] = at(q, r);
    hex(g, x, y, (q + r) % 2 === 0 ? '#8aa860' : '#83a15a', '#5d7a3e');
  }
}
const draw = (u: NonNullable<typeof units>, t: number): void => {
  u.tick(t, 1);
  u.draw({ cx: view.cx, cy: view.cy, scale: view.scale }, { w: view.w, h: view.h }, 1);
};
const unit = (id: number, type: UnitTypeId, f: FactionId, p: [number, number]): GlUnit =>
  ({ id, type, look: look(f), hero: false, x: p[0], y: p[1], spent: false, hunkered: false });

/** A board point `d` away from p along the ground heading h (0 toward the viewer, pi/2 to the right of the screen). */
const toward = (p: [number, number], h: number, d = 40): [number, number] => [p[0] + Math.sin(h) * d, p[1] + Math.cos(h) * d * SQUASH];

// ---- the turntable: one figure, turned through its own aim ----

let turnType: UnitTypeId = 'scout';
let clock = 0;
/** One figure alone on a tile, drawn at `scale`. Returns its screen point (the tile centre). */
function turntable(type: UnitTypeId, faction: FactionId, scale: number): [number, number] {
  turnType = type;
  const u = fresh({ w: Math.round(110 * scale), h: Math.round(90 * scale), scale, cx: 0, cy: -16 });
  field([-1, 1], [-1, 1]);
  u.setUnits([unit(1, type, faction, [0, 0])], 0);
  clock = 0;
  draw(u, clock);
  return toPx(0, 0);
}
/** Turn the figure `deg` degrees from its rest pose (seen from above, counterclockwise on screen), and draw it settled. */
function turnTo(deg: number): void {
  const u = units!;
  const h = frontsOf(turnType).aim + (deg * Math.PI) / 180;
  const [x, y] = toward([0, 0], h);
  // Step the clock well past the turn, so each view is the settled figure.
  clock += 600;
  u.aim(1, x, y, clock);
  clock += 600;
  u.pose(new Map(), []);
  draw(u, clock);
}

// ---- the strike, at four facings, and the walk ----

/** The svg lunge: 11 board units toward the target at 0.3 of 450 ms, ease-out. */
function lunge(t: number, t0: number, a: [number, number], b: [number, number]): UnitPose | null {
  if (t < t0 || t > t0 + 450) return null;
  const p = (t - t0) / 450;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const k = (p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7) * 11;
  return { x: a[0] + ((b[0] - a[0]) / len) * k, y: a[1] + ((b[1] - a[1]) / len) * k, lunge: p };
}
/** The four strikes of the strike clip: right, down-left, left and up-right (attacker, target). */
const STRIKES: { a: [number, number]; d: [number, number] }[] = [
  { a: at(-1, 0), d: at(0, 0) },
  { a: at(3, -1), d: at(2, 0) },
  { a: at(2, 2), d: at(1, 2) },
  { a: at(-2, 3), d: at(-1, 2) },
];
export const STRIKE_AT = 300;
let frame: (t: number) => void = () => {};
function strikeClip(type: UnitTypeId, faction: FactionId, scale: number): { length: number; pairs: [number, number][] } {
  const u = fresh({ w: Math.round(290 * scale), h: Math.round(180 * scale), scale, cx: 52, cy: 15 });
  field([-3, 4], [-2, 4]);
  const list: GlUnit[] = [];
  STRIKES.forEach((p, i) => {
    list.push(unit(10 + i, type, faction, p.a));
    list.push(unit(20 + i, 'warrior', faction === 'spartans' ? 'mongols' : 'spartans', p.d));
  });
  u.setUnits(list, 0);
  let fired = false;
  frame = (t: number): void => {
    if (!fired && t >= STRIKE_AT - 130) {
      fired = true;
      STRIKES.forEach((p, i) => {
        u.aim(10 + i, p.d[0], p.d[1], t, STRIKE_AT);
        u.strikes([{ unit: 10 + i, target: 20 + i, from: { x: p.a[0], y: p.a[1] }, to: { x: p.d[0], y: p.d[1] }, delay: STRIKE_AT - t, survives: true, counter: false }], t);
      });
    }
    const poses = new Map<number, UnitPose>();
    STRIKES.forEach((p, i) => { const l = lunge(t, STRIKE_AT, p.a, p.d); if (l !== null) poses.set(10 + i, l); });
    u.pose(poses, []);
    draw(u, t);
  };
  return { length: 1000, pairs: STRIKES.map((p) => toPx(...p.a)) };
}

/** The 3D slide's travel ease, cubic-bezier(0.45, 0, 0.4, 1) as the board plays it (motion.ts TRAVEL_EASING). */
function travelEase(x: number): number {
  const bez = (t: number, a: number, b: number): number => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (bez(m, 0.45, 0.4) < x) lo = m; else hi = m; }
  return bez((lo + hi) / 2, 0, 1);
}
/** A walk along a loop of legs (each one hex or more), so the figure is seen going every way. */
function walkClip(type: UnitTypeId, faction: FactionId, scale: number): { length: number } {
  const u = fresh({ w: Math.round(170 * scale), h: Math.round(130 * scale), scale, cx: 0, cy: 22 });
  field([-3, 3], [-2, 3]);
  const path: [number, number][] = [at(-1, 0), at(1, 0), at(1, 1), at(-1, 2), at(-1, 0)];
  const hexes = [2, 1, 2, 2];
  const starts: number[] = [];
  let s = 200;
  for (const h of hexes) { starts.push(s); s += slideMs3d(type, h) + 200; }
  let shown = -1;
  frame = (t: number): void => {
    const leg = starts.filter((x) => t >= x).length;
    if (leg !== shown) { u.setUnits([unit(1, type, faction, path[leg]!)], t); shown = leg; }
    const poses = new Map<number, UnitPose>();
    if (leg > 0) {
      const total = slideMs3d(type, hexes[leg - 1]!);
      const dt = t - starts[leg - 1]!;
      if (dt <= total) {
        const travel = travelPhase(dt, total);
        const k = travel === null ? 0 : travelEase(travel);
        const a = path[leg - 1]!, b = path[leg]!;
        poses.set(1, { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, ...(travel === null ? {} : { travel }) });
      }
    }
    u.pose(poses, []);
    draw(u, t);
  };
  return { length: s };
}

// ---- a stretch of board at game zoom ----

/** Scouts of both sides on a few tiles, facing different ways, beside other foot units, at the board's own zoom. */
function board(scale: number): void {
  const u = fresh({ w: Math.round(200 * scale), h: Math.round(130 * scale), scale, cx: 26, cy: 16 });
  field([-3, 4], [-2, 3]);
  const list: GlUnit[] = [
    unit(1, 'scout', 'spartans', at(0, 0)), unit(2, 'scout', 'mongols', at(1, 0)), unit(3, 'warrior', 'mongols', at(2, 0)),
    unit(4, 'scout', 'mongols', at(-1, 1)), unit(5, 'spearman', 'spartans', at(0, 1)), unit(6, 'scout', 'spartans', at(1, 1)),
  ];
  u.setUnits(list, 0);
  // Two face the way they came from, one walks up the screen and one stays at rest.
  u.aim(2, ...toward(at(1, 0), -Math.PI / 2), 0);
  u.aim(4, ...toward(at(-1, 1), Math.PI), 0);
  u.aim(6, ...toward(at(1, 1), Math.PI * 0.75), 0);
  u.pose(new Map(), []);
  draw(u, 2000);
}

Object.assign(window, {
  turntable: (type: UnitTypeId, faction: FactionId, scale = 4) => turntable(type, faction, scale),
  turnTo: (deg: number) => turnTo(deg),
  strikeClip: (type: UnitTypeId, faction: FactionId, scale = 3) => strikeClip(type, faction, scale),
  walkClip: (type: UnitTypeId, faction: FactionId, scale = 3) => walkClip(type, faction, scale),
  clipFrame: (t: number) => frame(t),
  board: (scale = 3) => board(scale),
});
document.body.dataset.ready = '1';
