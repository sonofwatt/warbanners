// Clips of the 3D figures' motion (scripts/motion3d-shots.ts drives it in Chromium through Vite's dev server). Not
// part of the app: it draws the figures straight from units3d on a plain ground with hex outlines, posed frame by
// frame on its own clock with the game's own timings: the slide as the board plays it in the 3D look (motion.ts: the
// turn on the spot, then the eased travel), the svg lunge (450 ms, its furthest point at 0.3), and the strikes and
// blocks the board hands units3d.
import { Color, Vector3 } from 'three';
import type { FactionId, UnitTypeId } from '../../src/engine';
import { ACCENT, playerColour } from '../../src/ui/art/palette';
import { R, SQUASH } from '../../src/ui/board/layout';
import { slideMs3d, travelPhase, TURN_LEAD_MS } from '../../src/ui/board/motion';
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
let view: View = { w: 800, h: 600, scale: 2, cx: 0, cy: 0 };
let units: NonNullable<ReturnType<typeof createUnits3d>> | null = null;
function fresh(v: View): NonNullable<ReturnType<typeof createUnits3d>> {
  if (units !== null) {
    // A disposed renderer loses its context on purpose: each clip draws on a new canvas.
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

/** The 3D slide's travel ease, cubic-bezier(0.45, 0, 0.4, 1) as the board plays it (motion.ts TRAVEL_EASING). */
function travelEase(x: number): number {
  const bez = (t: number, a: number, b: number): number => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (bez(m, 0.45, 0.4) < x) lo = m; else hi = m; }
  return bez((lo + hi) / 2, 0, 1);
}

/** A move as the board's 3D slide draws it, at time t: held for the turn, then eased along. */
function slide(t: number, t0: number, type: UnitTypeId, hexes: number, a: [number, number], b: [number, number]): UnitPose | null {
  const total = slideMs3d(type, hexes);
  if (t < t0 || t > t0 + total) return null;
  const travel = travelPhase(t - t0, total);
  const s = travel === null ? 0 : travelEase(travel);
  return { x: a[0] + (b[0] - a[0]) * s, y: a[1] + (b[1] - a[1]) * s, ...(travel === null ? {} : { travel }) };
}
/** The svg lunge: 11 board units toward the target at 0.3 of 450 ms, ease-out. */
function lunge(t: number, t0: number, a: [number, number], b: [number, number]): UnitPose | null {
  if (t < t0 || t > t0 + 450) return null;
  const p = (t - t0) / 450;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const k = (p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7) * 11;
  return { x: a[0] + ((b[0] - a[0]) / len) * k, y: a[1] + ((b[1] - a[1]) / len) * k, lunge: p };
}

interface Clip { frame(t: number): void; length: number }
interface Mover { id: number; type: UnitTypeId; faction: FactionId; hero?: boolean; path: [number, number][]; start: number; hexes: number[] }

/** Units that move along paths (one slide per leg, each leg one action), the others standing by. */
function moves(movers: Mover[], v: View, qs: [number, number], rs: [number, number], length: number, title: string): Clip {
  const u = fresh(v);
  field(qs, rs);
  label(title, v.cx, v.cy - v.h / v.scale / 2 + 6);
  const legsAt = (m: Mover): number[] => {
    const out: number[] = [];
    let t = m.start;
    m.hexes.forEach((h) => { out.push(t); t += slideMs3d(m.type, h) + 250; });
    return out;
  };
  let shown = '';
  return {
    length,
    frame(t: number): void {
      const list: GlUnit[] = [];
      const poses = new Map<number, UnitPose>();
      let key = '';
      for (const m of movers) {
        const legs = legsAt(m);
        const leg = legs.filter((s) => t >= s).length;
        const p = m.path[leg]!;
        list.push({ id: m.id, type: m.type, look: look(m.faction), hero: m.hero === true, x: p[0], y: p[1], alpha: 1, hunkered: false });
        key += `${m.id}:${leg} `;
        if (leg > 0) {
          const s = slide(t, legs[leg - 1]!, m.type, m.hexes[leg - 1]!, m.path[leg - 1]!, p);
          if (s !== null) poses.set(m.id, s);
        }
      }
      if (key !== shown) { u.setUnits(list, t); shown = key; }
      u.pose(poses, []);
      u.tick(t, 1);
      u.draw({ cx: view.cx, cy: view.cy, scale: view.scale }, { w: view.w, h: view.h }, 1);
    },
  };
}

interface Duel {
  attacker: { type: UnitTypeId; faction: FactionId; at: [number, number] };
  defender: { type: UnitTypeId; faction: FactionId; at: [number, number] };
  survives: boolean; counter: boolean; title: string;
}
/** One attack, played twice (at 300 ms and 1500 ms), exactly as the board hands it to units3d. */
function duel(d: Duel, v: View, qs: [number, number], rs: [number, number]): Clip {
  const u = fresh(v);
  field(qs, rs);
  label(d.title, v.cx, v.cy - v.h / v.scale / 2 + 6);
  u.setUnits([
    { id: 1, type: d.attacker.type, look: look(d.attacker.faction), hero: false, x: d.attacker.at[0], y: d.attacker.at[1], alpha: 1, hunkered: false },
    { id: 2, type: d.defender.type, look: look(d.defender.faction), hero: false, x: d.defender.at[0], y: d.defender.at[1], alpha: 1, hunkered: false },
  ], 0);
  const STARTS = [300, 1500];
  const fired = new Set<number>();
  return {
    length: 2500,
    frame(t: number): void {
      for (const s of STARTS) {
        if (t < s - 130 || fired.has(s)) continue;
        fired.add(s);
        // As the board does: the aim (round by the lunge), then the strike, the block and any counter strike.
        u.aim(1, d.defender.at[0], d.defender.at[1], t, s);
        const from = { x: d.attacker.at[0], y: d.attacker.at[1] }, to = { x: d.defender.at[0], y: d.defender.at[1] };
        u.strikes([{ unit: 1, target: 2, from, to, delay: s - t, survives: d.survives, counter: d.counter }], t);
      }
      const poses = new Map<number, UnitPose>();
      for (const s of STARTS) { const p = lunge(t, s, d.attacker.at, d.defender.at); if (p !== null) poses.set(1, p); }
      u.pose(poses, []);
      u.tick(t, 1);
      u.draw({ cx: view.cx, cy: view.cy, scale: view.scale }, { w: view.w, h: view.h }, 1);
    },
  };
}

const CLIPS: Record<string, (scale: number) => Clip> = {
  walk: (s) => moves([
    { id: 1, type: 'hoplite', faction: 'spartans', path: [at(-2, 0), at(0, 0), at(0, 1), at(1, -1)], start: 300, hexes: [2, 1, 2] },
  ], { w: Math.round(300 * s), h: Math.round(170 * s), scale: s, cx: 0, cy: 4 }, [-3, 2], [-2, 2], 3200, 'hoplite walks'),
  gallop: (s) => moves([
    { id: 1, type: 'knight', faction: 'spartans', path: [at(-3, 0), at(0, 0), at(1, 1)], start: 300, hexes: [3, 1] },
  ], { w: Math.round(300 * s), h: Math.round(150 * s), scale: s, cx: -10, cy: 8 }, [-4, 2], [-1, 2], 2600, 'knight gallops'),
  trebuchet: (s) => moves([
    { id: 1, type: 'catapult', faction: 'spartans', path: [at(-2, 0), at(0, 0), at(0, 1)], start: 300, hexes: [2, 1] },
    { id: 2, type: 'camp', faction: 'mongols', path: [at(-1, -1), at(1, -1)], start: 600, hexes: [2] },
  ], { w: Math.round(300 * s), h: Math.round(170 * s), scale: s, cx: 0, cy: 0 }, [-3, 2], [-2, 2], 2800, 'trebuchet lurches, camp rolls'),
  sword: (s) => duel({
    attacker: { type: 'warrior', faction: 'mongols', at: at(-1, 0) }, defender: { type: 'hoplite', faction: 'spartans', at: at(0, 0) },
    survives: true, counter: false, title: 'sword swing, shield block',
  }, { w: Math.round(160 * s), h: Math.round(110 * s), scale: s, cx: -26, cy: -4 }, [-2, 1], [-1, 1]),
  counter: (s) => duel({
    attacker: { type: 'swordsman', faction: 'spartans', at: at(-1, 0) }, defender: { type: 'spearman', faction: 'mongols', at: at(0, 0) },
    survives: true, counter: true, title: 'two swords, block, spear strikes back',
  }, { w: Math.round(160 * s), h: Math.round(110 * s), scale: s, cx: -26, cy: -4 }, [-2, 1], [-1, 1]),
  spear: (s) => duel({
    attacker: { type: 'hoplite', faction: 'spartans', at: at(-1, 0) }, defender: { type: 'archer', faction: 'mongols', at: at(0, 0) },
    survives: true, counter: false, title: 'spear thrust, archer flinches',
  }, { w: Math.round(160 * s), h: Math.round(110 * s), scale: s, cx: -26, cy: -4 }, [-2, 1], [-1, 1]),
  archer: (s) => duel({
    attacker: { type: 'archer', faction: 'mongols', at: at(-2, 0) }, defender: { type: 'defender', faction: 'spartans', at: at(0, 0) },
    survives: true, counter: false, title: 'archer looses, shield takes the arrow',
  }, { w: Math.round(200 * s), h: Math.round(110 * s), scale: s, cx: -52, cy: -4 }, [-3, 1], [-1, 1]),
  lance: (s) => duel({
    attacker: { type: 'knight', faction: 'spartans', at: at(-1, 0) }, defender: { type: 'warrior', faction: 'mongols', at: at(0, 0) },
    survives: true, counter: false, title: 'lance thrust, shield block',
  }, { w: Math.round(160 * s), h: Math.round(110 * s), scale: s, cx: -26, cy: -4 }, [-2, 1], [-1, 1]),
  rear: (s) => duel({
    attacker: { type: 'khansGuard', faction: 'mongols', at: at(-1, 0) }, defender: { type: 'swordsman', faction: 'spartans', at: at(0, 0) },
    survives: true, counter: false, title: 'horse rears and charges, flinch',
  }, { w: Math.round(160 * s), h: Math.round(110 * s), scale: s, cx: -26, cy: -4 }, [-2, 1], [-1, 1]),
};

let current: Clip | null = null;
Object.assign(window, {
  motionClip: (name: string, scale = 3) => { current = CLIPS[name]!(scale); return current.length; },
  motionFrame: (t: number) => current?.frame(t),
  motionClips: () => Object.keys(CLIPS),
});
void TURN_LEAD_MS;
document.body.dataset.ready = '1';
