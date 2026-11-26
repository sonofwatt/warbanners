// Shots of Gritty's realistic 3D Hoplite (scripts/hoplite3d-shots.ts drives it in Chromium through Vite's dev server).
// Not part of the app: it draws the figures straight from units3d on a plain overcast ground with hex outlines,
// exactly as the board hands them over (GlUnit with `gritty` and `wear`).
import { Color, ColorManagement, Vector3 } from 'three';
import type { FactionId, UnitTypeId } from '../../src/engine';
import { ACCENT, playerColour } from '../../src/ui/art/palette';
import { R, SQUASH } from '../../src/ui/board/layout';
import type { GlUnit } from '../../src/ui/terrain3d/unitsInput';
import { createUnits3d } from '../../src/ui/terrain3d/units/units3d';

// As the game's terrain does (terrain3d.ts): every colour is a display value, used as written.
ColorManagement.enabled = false;

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
let bg = '#4f5a47', tile = '#6a7558', edge = '#3c4535';
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
  g.fillStyle = bg; g.fillRect(0, 0, v.w, v.h);
  return u;
}
const toPx = (x: number, y: number): [number, number] => [(x - view.cx) * view.scale + view.w / 2, (y - view.cy) * view.scale + view.h / 2];
function hex(x: number, y: number): void {
  const g = ground.getContext('2d')!;
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = ((30 + 60 * i) * Math.PI) / 180;
    const [px, py] = toPx(x + R * Math.cos(a), y + R * Math.sin(a) * SQUASH);
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
  g.fillStyle = tile; g.fill();
  g.strokeStyle = edge; g.lineWidth = 1.5; g.stroke();
}
function label(text: string, x: number, y: number): void {
  const el = document.createElement('div');
  el.className = 'label';
  el.textContent = text;
  const [px, py] = toPx(x, y);
  el.style.left = `${px}px`; el.style.top = `${py}px`;
  wrap.appendChild(el);
}

interface Cell { type: UnitTypeId; faction: FactionId; gritty: boolean; wear?: GlUnit['wear']; name: string; hunkered?: boolean; yaw?: number }

/** A row (or rows) of figures, `perRow` to a row, at `scale` pixels per board unit; `bright` draws a Bright ground. */
function sheet(cells: readonly Cell[], scale: number, perRow: number, o: { bright?: boolean; rowH?: number; cellW?: number } = {}): void {
  if (o.bright === true) { bg = '#6f8f4e'; tile = '#8aa860'; edge = '#5d7a3e'; } else { bg = '#4f5a47'; tile = '#6a7558'; edge = '#3c4535'; }
  const CW = o.cellW ?? STEP + 6, RH = o.rowH ?? 92;
  const rows = Math.ceil(cells.length / perRow);
  const cols = Math.min(perRow, cells.length);
  const u = fresh({ w: Math.round((cols * CW + 10) * scale), h: Math.round((rows * RH + 24) * scale), scale, cx: (cols * CW) / 2 - CW / 2, cy: (rows * RH) / 2 - RH / 2 - 14 });
  const list: GlUnit[] = [];
  cells.forEach((c, i) => {
    const x = (i % perRow) * CW, y = Math.floor(i / perRow) * RH;
    hex(x, y);
    label(c.name, x, y + 12);
    list.push({ id: i + 1, type: c.type, look: look(c.faction), hero: false, x, y, spent: false, hunkered: c.hunkered === true, gritty: c.gritty, wear: c.wear });
  });
  u.setUnits(list, 0);
  u.pose(new Map(), []);
  u.tick(10_000, 0);
  u.draw({ cx: view.cx, cy: view.cy, scale: view.scale }, { w: view.w, h: view.h }, 1);
}

Object.assign(window, { hopliteSheet: sheet });
document.body.dataset.ready = '1';
