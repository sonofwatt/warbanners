// The 3D cities, villages and mines: low-poly, faceted, vertex coloured parts for the terrain's merged prop mesh, in
// the toon style of the peaks, trees and figures. Where things stand comes from townLayout.ts; this file only shapes
// them. Spartan cities are whitewashed houses with gabled roofs round a columned hall; Mongol cities are round felt
// tents round a great tent; both roof in the owner's colour. A village is two humble thatched huts.
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Float32BufferAttribute, ConeGeometry, CylinderGeometry, DodecahedronGeometry, ExtrudeGeometry, IcosahedronGeometry,
  OctahedronGeometry, Path, Shape,
} from 'three';
import type { FactionId } from '../../engine';
import { ACCENT, MIRROR_ACCENT, MIRROR_COLOUR, PLAYER_COLOURS } from '../art/palette';
import { coloured, repaint } from './geom';
import { hash2 } from './layout';
import { FIRE_RING, FURNACE, hallDoor, houseSize, hutSize, LANTERN, LANTERN_WALL, MINE, yurtGap, yurtRadius } from './townLayout';
import type { TownPiece, TownPlan, WallPlan } from './townLayout';

const TOWN = {
  plaster: '#F4EBD5', plasterShade: '#E6DAC0', stone: '#DCD1B8', stoneDark: '#C7BBA0', step: '#E4D9BF',
  column: '#FBF6E9', door: '#8A6A48', window: '#5A4632',
  felt: '#F1E7D3', feltDoor: '#8C5A33',
  wood: '#A87545', woodDark: '#6B4A2B', pole: '#6B4A2B',
  mud: '#D9C59C', ash: '#4E4741', thatch: '#B8975A', thatchDark: '#9C7C45', logEnd: '#E2C08A', log: '#A8743F',
  rock: '#7F786E', rockLight: '#958D80', rockDark: '#635D55', tunnel: '#3B2B20', tunnelDeep: '#1F1814', floor: '#3A2B20',
  timber: '#8C5D35', timberDark: '#6E4528', rail: '#7D7A80', sleeper: '#6B4A2B', iron: '#3A3532', glass: '#FFD98A',
  ore: '#4E4B58', crystal: '#BFE3FA', spoil: '#6E6A78', spoilDark: '#55525E',
  furnace: '#8F887C', furnaceDark: '#77716A', ember: '#F28C28', emberHot: '#FFD45E', smoke: '#D9D5CE',
} as const;

/** Parts shaped round a local origin, then turned and placed as one, and only then coloured (so outlines turn too). */
export class Kit {
  private readonly raw: { g: BufferGeometry; colour: string; gloss: number; out: number }[] = [];
  add(g: BufferGeometry, colour: string, out = 0.6, gloss = 0): this {
    this.raw.push({ g, colour, gloss, out });
    return this;
  }
  box(w: number, h: number, d: number, x: number, y: number, z: number, colour: string, out = 0.6, ry = 0): this {
    const g = new BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y + h / 2, z);
    return this.add(g, colour, out);
  }
  done(x: number, y: number, z: number, rot: number, scale = 1): BufferGeometry[] {
    return this.raw.map(({ g, colour, gloss, out }) => {
      if (scale !== 1) g.scale(scale, scale, scale);
      if (rot) g.rotateY(rot);
      g.translate(x, y, z);
      return coloured(g, colour, gloss, out);
    });
  }
}

/** A gable roof: ridge along z (the gable ends face the viewer, as in the svg), w wide, d deep, rh tall, with eaves. */
export function gable(w: number, d: number, rh: number, eave = 0.8): BufferGeometry {
  const hw = w / 2 + eave;
  const s = new Shape();
  s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(0, rh); s.closePath();
  const g = new ExtrudeGeometry(s, { depth: d + 2 * eave, bevelEnabled: false });
  g.translate(0, 0, -(d / 2 + eave));
  return g;
}

/** A thin flat shape in the x-y plane (a flag's cloth), facing the viewer, with a gentle wave along x. */
function cloth(points: readonly [number, number][], thick: number, wave: number): BufferGeometry {
  const s = new Shape();
  points.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, steps: 1 });
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + Math.sin(p.getX(i) * 0.42) * wave * Math.min(1, p.getX(i) / 4));
  return g;
}

type Colour = { main: string; dark: string };

// ---------------------------------------------------------------------------------------------------------------
// Spartans

function spartanHouse(k: Kit, colour: Colour, tall: boolean, seed: number): void {
  const { w, d } = houseSize(seed), h = tall ? 11 : 6.2;
  k.box(w, h, d, 0, -0.4, 0, TOWN.plaster, 0.7);
  if (tall) k.box(w + 0.5, 0.6, d + 0.5, 0, 5.4, 0, TOWN.plasterShade, 0.3);
  const roof = gable(w, d, 3.8);
  roof.translate(0, h - 0.4, 0);
  k.add(roof, colour.main, 0.7);
  k.box(1.7, 3.2, 0.3, -w * 0.18, -0.4, d / 2 + 0.05, TOWN.door, 0.2);
  k.box(1.3, 1.3, 0.25, w * 0.24, 2.2, d / 2 + 0.05, TOWN.window, 0.15);
  if (tall) {
    k.box(1.3, 1.5, 0.25, -w * 0.2, 7.4, d / 2 + 0.05, TOWN.window, 0.15);
    k.box(1.3, 1.5, 0.25, w * 0.22, 7.4, d / 2 + 0.05, TOWN.window, 0.15);
  }
  // A chimney on the back slope.
  k.box(1.1, 2.6, 1.1, w * 0.22, h + 0.6, -d * 0.2, TOWN.stoneDark, 0.3);
}

/** The columned hall; the capital's is wider, with six columns and three steps. */
function spartanHall(k: Kit, colour: Colour, accent: string, grand: boolean): void {
  const cols = grand ? 6 : 4;
  const w = grand ? 19 : 14, d = grand ? 13 : 10;
  const steps = grand ? 3 : 2;
  for (let i = 0; i < steps; i++) k.box(w + 2 * (steps - i), 1.1, d + 2 * (steps - i), 0, -0.6 + i * 1.1, 0, i % 2 ? TOWN.stone : TOWN.step, 0.5);
  const top = -0.6 + steps * 1.1;
  const colH = grand ? 9 : 7.2;
  k.box(w - 4, colH, d - 4.5, 0, top, -1.4, TOWN.plasterShade, 0.5); // the hall behind the columns
  // Its doorway, between the middle columns: lit warm after dark, as the houses' windows are.
  k.box(hallDoor(grand).w, colH * 0.62, 0.25, 0, top, -1.4 + (d - 4.5) / 2 + 0.08, TOWN.window, 0.1);
  const span = w - 2.2;
  for (let i = 0; i < cols; i++) {
    const x = -span / 2 + (span * i) / (cols - 1);
    for (const z of grand ? [d / 2 - 1.1, -d / 2 + 1.1] : [d / 2 - 1.1]) {
      const c = new CylinderGeometry(0.72, 0.86, colH, 8);
      c.translate(x, top + colH / 2, z);
      k.add(c, TOWN.column, 0.35);
    }
  }
  k.box(w, 1.4, d, 0, top + colH, 0, TOWN.plaster, 0.6); // the beam
  const roof = gable(w - 0.6, d - 0.6, grand ? 5 : 4, 0.6);
  roof.translate(0, top + colH + 1.4, 0);
  k.add(roof, colour.main, 0.7);
  // A gold disc in the pediment, as the svg hall has.
  const disc = new CylinderGeometry(grand ? 1.4 : 1.1, grand ? 1.4 : 1.1, 0.35, 12);
  disc.rotateX(Math.PI / 2);
  disc.translate(0, top + colH + 1.4 + (grand ? 1.9 : 1.5), d / 2 + 0.35);
  k.add(disc, accent, 0.25, 0.6);
  if (grand) {
    // Gilded ornaments on the roof's corners and ridge.
    for (const [x, y] of [[-(w / 2), 0], [w / 2, 0], [0, 5]] as const) {
      const o = new OctahedronGeometry(0.9, 0);
      o.scale(1, 1.6, 1);
      o.translate(x * 0.97, top + colH + 1.4 + y + 1, d / 2);
      k.add(o, accent, 0.25, 0.6);
    }
  }
}

function spartanTower(k: Kit, colour: Colour): void {
  const t = new CylinderGeometry(2.9, 3.2, 18, 9);
  t.translate(0, 9 - 0.5, 0);
  k.add(t, TOWN.stone, 0.7);
  const ring = new CylinderGeometry(3.5, 3.5, 0.9, 9);
  ring.translate(0, 17.9, 0);
  k.add(ring, TOWN.stoneDark, 0.4);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    k.box(1.0, 1.3, 1.0, Math.cos(a) * 3.1, 18.3, Math.sin(a) * 3.1, TOWN.stone, 0.25, -a);
  }
  const roof = new ConeGeometry(3.7, 6.2, 9);
  roof.translate(0, 19.6 + 3.1, 0);
  k.add(roof, colour.main, 0.6);
  k.box(0.8, 2.4, 0.3, 0, 9, 3.05, TOWN.window, 0.15);
  k.box(0.8, 2.4, 0.3, 0, 13.5, 3.0, TOWN.window, 0.15);
}

// ---------------------------------------------------------------------------------------------------------------
// Mongols

function yurt(k: Kit, colour: Colour, accent: string, r: number, wallH: number, roofH: number, band: boolean): number {
  const wall = new CylinderGeometry(r, r * 1.02, wallH, 12);
  wall.translate(0, wallH / 2 - 0.4, 0);
  k.add(wall, TOWN.felt, 0.7);
  if (band) {
    const b = new CylinderGeometry(r + 0.12, r + 0.12, 0.9, 12);
    b.translate(0, wallH - 1.6, 0);
    k.add(b, accent, 0.2, 0.4);
  }
  // Rope bands round the felt, a little darker.
  const rope = new CylinderGeometry(r + 0.06, r + 0.06, 0.35, 12);
  rope.translate(0, wallH * 0.35, 0);
  k.add(rope, TOWN.plasterShade, 0.1);
  const roof = new ConeGeometry(r + 0.8, roofH, 12);
  roof.translate(0, wallH - 0.4 + roofH / 2, 0);
  k.add(roof, colour.main, 0.7);
  const crown = new CylinderGeometry(r * 0.2, r * 0.24, 0.7, 8);
  crown.translate(0, wallH - 0.4 + roofH - 0.6, 0);
  k.add(crown, accent, 0.25, 0.5);
  k.box(2.0, Math.min(3.6, wallH * 0.72), 0.5, 0, -0.4, r - 0.05, TOWN.feltDoor, 0.2);
  // The door stands a hand ajar: a thin gap beside it in the windows' colour, lit warm after dark (shaders.ts).
  k.box(0.55, Math.min(3.2, wallH * 0.64), 0.3, yurtGap(r), -0.4, Math.sqrt(r * r - yurtGap(r) ** 2) + 0.1, TOWN.window, 0.1);
  return wallH - 0.4 + roofH;
}

function greatYurt(k: Kit, colour: Colour, accent: string): void {
  const r = 8.6, wallH = 7, roofH = 6;
  const wall = new CylinderGeometry(r, r * 1.02, wallH, 14);
  wall.translate(0, wallH / 2 - 0.4, 0);
  k.add(wall, TOWN.felt, 0.8);
  const band = new CylinderGeometry(r + 0.14, r + 0.14, 1.1, 14);
  band.translate(0, wallH - 1.8, 0);
  k.add(band, accent, 0.2, 0.4);
  const roof = new ConeGeometry(r + 0.9, roofH, 14);
  roof.translate(0, wallH - 0.4 + roofH / 2, 0);
  k.add(roof, colour.main, 0.8);
  // A second tier: a smaller drum and dome on top.
  const y2 = wallH - 0.4 + roofH * 0.5;
  const drum = new CylinderGeometry(4.3, 4.4, 4, 12);
  drum.translate(0, y2 + 2, 0);
  k.add(drum, TOWN.felt, 0.6);
  const band2 = new CylinderGeometry(4.45, 4.45, 0.7, 12);
  band2.translate(0, y2 + 3.2, 0);
  k.add(band2, accent, 0.15, 0.4);
  const dome = new ConeGeometry(5, 4.4, 12);
  dome.translate(0, y2 + 4 + 2.2, 0);
  k.add(dome, colour.main, 0.6);
  const fin = new OctahedronGeometry(1.1, 0);
  fin.scale(1, 2, 1);
  fin.translate(0, y2 + 4 + 4.4 + 1.2, 0);
  k.add(fin, accent, 0.25, 0.7);
  k.box(3.0, 4.6, 0.6, 0, -0.4, r - 0.05, TOWN.feltDoor, 0.25);
  k.box(0.7, 4.0, 0.3, yurtGap(r), -0.4, Math.sqrt(r * r - yurtGap(r) ** 2) + 0.1, TOWN.window, 0.1);
  k.box(4.2, 0.8, 0.8, 0, 4.2, r + 0.1, accent, 0.2);
}

function watchtower(k: Kit, colour: Colour): void {
  for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]] as const) k.box(0.8, 16, 0.8, x, -0.4, z, TOWN.wood, 0.35);
  for (const y of [5, 10.5]) {
    k.box(5.2, 0.5, 0.5, 0, y, 2.2, TOWN.woodDark, 0.2);
    k.box(0.5, 0.5, 5.2, 2.2, y, 0, TOWN.woodDark, 0.2);
    k.box(0.5, 0.5, 5.2, -2.2, y, 0, TOWN.woodDark, 0.2);
  }
  k.box(6.4, 1, 6.4, 0, 15.6, 0, TOWN.wood, 0.5);
  k.box(4.6, 3.2, 4.6, 0, 16.6, 0, TOWN.felt, 0.5);
  const roof = new ConeGeometry(4.4, 4, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 19.8 + 2, 0);
  k.add(roof, colour.main, 0.6);
}

// ---------------------------------------------------------------------------------------------------------------
// Banners and walls

function banner(colour: Colour, accent: string, h: number): Kit {
  const k = new Kit();
  const pole = new CylinderGeometry(0.42, 0.5, h, 6);
  pole.translate(0, h / 2 - 0.5, 0);
  k.add(pole, TOWN.pole, 0.3);
  const ball = new IcosahedronGeometry(1.15, 0);
  ball.translate(0, h + 0.4, 0);
  k.add(ball, accent, 0.3, 0.6);
  // A swallowtailed flag, as the svg banner, in the owner's colour with the accent disc.
  const f = cloth([[0, 0], [13, -1], [10, -4.5], [13, -8], [0, -7]], 0.4, 0.7);
  f.translate(0.3, h - 1, 0);
  k.add(f, colour.main, 0.35);
  const disc = new CylinderGeometry(1.6, 1.6, 0.3, 12);
  disc.rotateX(Math.PI / 2);
  disc.translate(5.6, h - 1 - 3.6, 0.2 + Math.sin(5.6 * 0.42) * 0.7);
  k.add(disc, accent, 0.15, 0.4);
  return k;
}

function pennant(colour: Colour): Kit {
  const k = new Kit();
  const pole = new CylinderGeometry(0.22, 0.26, 5, 5);
  pole.translate(0, 2.5, 0);
  k.add(pole, TOWN.pole, 0.2);
  const f = cloth([[0, 0], [5, -1.2], [0, -2.4]], 0.3, 0.35);
  f.translate(0.2, 4.9, 0);
  k.add(f, colour.main, 0.25);
  return k;
}

function walls(w: WallPlan, spartan: boolean): Kit {
  const k = new Kit();
  const H = spartan ? 4.6 : 5.2;
  for (const [x0, z0, x1, z1] of w.runs) {
    const dx = x1 - x0, dz = z1 - z0;
    const L = Math.hypot(dx, dz);
    const rot = Math.atan2(-dz, dx);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    if (spartan) {
      const g = new BoxGeometry(L, H, 2.2);
      g.rotateY(rot);
      g.translate(mx, H / 2 - 0.6, mz);
      k.add(g, TOWN.stone, 0.45);
      const n = Math.max(2, Math.floor(L / 2.6));
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n - 0.5;
        k.box(1.3, 1.2, 2.2, mx + (dx * u), H - 0.6, mz + (dz * u), TOWN.stoneDark, 0.2, rot);
      }
    } else {
      // A palisade: one run of pointed stakes, cut from a single sawtooth outline.
      const s = new Shape();
      const n = Math.max(3, Math.round(L / 1.6));
      s.moveTo(-L / 2, -0.6);
      s.lineTo(L / 2, -0.6);
      for (let i = n; i >= 0; i--) {
        const x = -L / 2 + (L * i) / n;
        s.lineTo(x, H - 1.4);
        if (i > 0) s.lineTo(x - L / n / 2, H);
      }
      s.closePath();
      const g = new ExtrudeGeometry(s, { depth: 1.3, bevelEnabled: false });
      g.translate(0, 0, -0.65);
      g.rotateY(rot);
      g.translate(mx, 0, mz);
      k.add(g, TOWN.wood, 0.3);
      const rail = new BoxGeometry(L, 0.5, 1.6);
      rail.rotateY(rot);
      rail.translate(mx, H * 0.45, mz);
      k.add(rail, TOWN.woodDark, 0.15);
    }
  }
  for (const [x, z] of w.towers) {
    if (spartan) {
      const t = new CylinderGeometry(2.4, 2.7, 7, 8);
      t.translate(x, 3.5 - 0.6, z);
      k.add(t, TOWN.stone, 0.5);
      const cap = new CylinderGeometry(2.9, 2.9, 1.1, 8);
      cap.translate(x, 6.9, z);
      k.add(cap, TOWN.stoneDark, 0.3);
    } else {
      const t = new CylinderGeometry(1.2, 1.3, 7, 6);
      t.translate(x, 3.5 - 0.6, z);
      k.add(t, TOWN.wood, 0.3);
      const tip = new ConeGeometry(1.2, 1.8, 6);
      tip.translate(x, 7.8, z);
      k.add(tip, TOWN.wood, 0.25);
    }
  }
  // The gate: two posts and a beam over the opening.
  const { x, z, rot } = w.gate;
  const ux = Math.cos(rot), uz = Math.sin(rot);
  for (const s of [-1, 1]) {
    const px = x + ux * 4.4 * s, pz = z + uz * 4.4 * s;
    if (spartan) k.box(2.4, H + 2, 2.8, px, -0.6, pz, TOWN.stone, 0.45, -rot);
    else k.box(1.6, H + 1.6, 1.6, px, -0.6, pz, TOWN.woodDark, 0.3, -rot);
  }
  k.box(10.4, 1.4, spartan ? 2.8 : 1.6, x, H + (spartan ? 1.4 : 1.0), z, spartan ? TOWN.stoneDark : TOWN.woodDark, 0.35, -rot);
  return k;
}

// ---------------------------------------------------------------------------------------------------------------
// Villages

function hut(k: Kit, seed: number): void {
  const { w, d } = hutSize(seed);
  k.box(w, 5.6, d, 0, -0.4, 0, TOWN.mud, 0.6);
  const roof = gable(w, d, 6, 1.5);
  roof.translate(0, 5.0, 0);
  k.add(roof, seed > 0.5 ? TOWN.thatch : TOWN.thatchDark, 0.6);
  k.box(2, 3.4, 0.3, -w * 0.15, -0.4, d / 2 + 0.05, TOWN.door, 0.2);
  k.box(1.2, 1.2, 0.25, w * 0.25, 2.2, d / 2 + 0.05, TOWN.window, 0.12);
}

function woodpile(k: Kit): void {
  for (const [x, y] of [[-1, 0.5], [1, 0.5], [0, 2.1]] as const) {
    const g = new CylinderGeometry(0.9, 0.9, 4.2, 7);
    g.rotateZ(Math.PI / 2);
    g.rotateY(Math.PI / 2);
    g.translate(x * 1.8, y, 0);
    k.add(g, TOWN.log, 0.25);
  }
}

/**
 * A village's bonfire, still parts only (its flames, glow and smoke move, on the figures' canvas: bonfires.ts): a
 * bed of dark ash, a ring of rough stones, four logs crossed over the middle, and the embers glowing between them.
 */
function bonfire(k: Kit): void {
  const ash = new CylinderGeometry(FIRE_RING - 0.5, FIRE_RING - 0.3, 0.3, 10);
  ash.translate(0, 0.05, 0);
  k.add(ash, TOWN.ash, 0.15);
  const stones = 9;
  for (let i = 0; i < stones; i++) {
    const a = (i / stones) * Math.PI * 2 + 0.3;
    const r = FIRE_RING - 0.7;
    const g = new DodecahedronGeometry(0.75 + 0.15 * ((i * 7) % 3), 0);
    g.scale(1, 0.75, 1);
    g.rotateY(i * 1.3);
    g.translate(r * Math.cos(a), 0.45, r * Math.sin(a));
    k.add(g, i % 2 === 0 ? TOWN.rockLight : TOWN.rock, 0.2);
  }
  // Four logs, each leaning in from the ring so they cross just over the ashes.
  for (let i = 0; i < 4; i++) {
    const g = new CylinderGeometry(0.32, 0.36, 3.6, 6);
    g.rotateZ(Math.PI / 2 - 0.32);
    g.rotateY((i * Math.PI) / 4 + 0.4);
    g.translate(0, 0.75, 0);
    k.add(g, i % 2 === 0 ? TOWN.log : TOWN.timberDark, 0.2);
  }
  const embers = new CylinderGeometry(0.9, 1.1, 0.35, 8);
  embers.translate(0, 0.3, 0);
  k.add(embers, TOWN.ember, 0);
}

// ---------------------------------------------------------------------------------------------------------------

/** Every part of a city or village, standing on the ground. */
export function townParts(plan: TownPlan, cx: number, cz: number, height: (lx: number, lz: number) => number): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const faction: FactionId | null = plan.faction;
  const colour = faction === null ? { main: TOWN.thatch, dark: TOWN.thatchDark } : plan.mirror ? MIRROR_COLOUR : PLAYER_COLOURS[faction];
  const accent = faction === null ? TOWN.logEnd : plan.mirror ? MIRROR_ACCENT : ACCENT[faction];
  const spartan = faction === 'spartans';
  for (const p of plan.pieces) out.push(...piece(p, colour, accent, spartan).done(cx + p.x, height(p.x, p.z), cz + p.z, p.rot));
  if (plan.banner !== null) out.push(...banner(colour, accent, plan.banner.h).done(cx + plan.banner.x, height(plan.banner.x, plan.banner.z), cz + plan.banner.z, 0));
  if (plan.pennant !== null) out.push(...pennant(colour).done(cx + plan.pennant.x, plan.pennant.y, cz + plan.pennant.z, 0));
  if (plan.walls !== null) out.push(...walls(plan.walls, spartan).done(cx, 0, cz, 0));
  if (plan.fire !== null) {
    const k = new Kit();
    bonfire(k);
    out.push(...k.done(cx + plan.fire.x, height(plan.fire.x, plan.fire.z), cz + plan.fire.z, 0));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// rules 11, the Woodland Nations: hide tipis, bark longhouses and wigwams, and a council lodge of timber and bark.

const WOOD_TOWN = { hide: '#E6D6B4', hideShade: '#CDB98F', bark: '#8A6A4A', barkDark: '#6E5238', barkLight: '#A98A62', mat: '#C2A36F', ochre: '#A4452C' } as const;

function tipi(k: Kit, colour: Colour, seed: number): number {
  const h = 17 + seed * 2.5, r = 6 + seed * 0.5;
  const cover = new ConeGeometry(r, h, 9);
  cover.translate(0, h / 2 - 0.4, 0);
  k.add(cover, seed > 0.5 ? WOOD_TOWN.hide : WOOD_TOWN.hideShade, 0.7);
  // A painted band in the owner's colour and an ochre one above it.
  const band = new CylinderGeometry(r * 0.62, r * 0.7, 1.2, 9);
  band.translate(0, h * 0.32, 0);
  k.add(band, colour.main, 0.15);
  const band2 = new CylinderGeometry(r * 0.42, r * 0.46, 0.7, 9);
  band2.translate(0, h * 0.55, 0);
  k.add(band2, WOOD_TOWN.ochre, 0.12);
  // The poles crossing above the smoke hole.
  for (const a of [0.4, 2.2, 4.1]) {
    const pole = new CylinderGeometry(0.22, 0.22, 4.4, 4);
    pole.translate(0, 2.2, 0);
    pole.rotateZ(0.22);
    pole.rotateY(a);
    pole.translate(0, h - 1.6, 0);
    k.add(pole, WOOD_TOWN.barkDark, 0.2);
  }
  k.box(1.8, 3.4, 0.4, 0, -0.4, r * 0.78, WOOD_TOWN.barkDark, 0.2);
  return h + 2;
}

function longhouse(k: Kit, colour: Colour, len: number): void {
  // A barrel-roofed hall of bark over bent poles, sunk to its middle so the roof rises from the ground.
  const body = new CylinderGeometry(4.8, 4.8, len, 12);
  body.rotateZ(Math.PI / 2);
  body.scale(1, 1.25, 1);
  body.translate(0, 0, 0);
  k.add(body, WOOD_TOWN.bark, 0.7);
  for (const x of [-len * 0.3, 0, len * 0.3]) {
    const rib = new CylinderGeometry(4.95, 4.95, 0.6, 12);
    rib.rotateZ(Math.PI / 2);
    rib.scale(1, 1.25, 1);
    rib.translate(x, 0, 0);
    k.add(rib, WOOD_TOWN.barkDark, 0.15);
  }
  // A door at the front end in the owner's colour, framed in ochre.
  k.box(2.4, 4.0, 0.5, len / 2 - 3, -0.4, 4.6, WOOD_TOWN.ochre, 0.2);
  k.box(1.6, 3.4, 0.6, len / 2 - 3, -0.4, 4.65, colour.main, 0.2);
}

function wigwam(k: Kit, seed: number): void {
  const dome = new DodecahedronGeometry(4.8 + seed * 0.5, 1);
  dome.scale(1, 1.2, 1);
  dome.translate(0, 1.6, 0);
  k.add(dome, seed > 0.5 ? WOOD_TOWN.bark : WOOD_TOWN.barkLight, 0.6);
  const mat = new CylinderGeometry(4.7, 5.0, 0.8, 10);
  mat.translate(0, 3.2, 0);
  k.add(mat, WOOD_TOWN.mat, 0.12);
  k.box(2, 3.4, 0.4, 0, -0.4, 4.6, WOOD_TOWN.barkDark, 0.2);
}

function lodge(k: Kit, colour: Colour, accent: string): void {
  // The council lodge: a long timber hall with bark walls, a gabled bark roof, a smoke hole and a painted lintel.
  const w = 15, d = 9.6;
  k.box(w, 7, d, 0, -0.4, 0, WOOD_TOWN.barkLight, 0.7);
  for (const x of [-w / 2 + 0.4, -w / 6, w / 6, w / 2 - 0.4]) k.box(0.9, 7.4, 0.9, x, -0.4, d / 2, WOOD_TOWN.barkDark, 0.2);
  const roof = gable(w + 1.2, d + 1.2, 7.4, 1.2);
  roof.translate(0, 6.6, 0);
  k.add(roof, WOOD_TOWN.bark, 0.7);
  k.box(3.2, 0.9, 2.2, 0, 13.4, 0, WOOD_TOWN.barkDark, 0.2);
  k.box(w, 1.0, 0.5, 0, 5.4, d / 2 + 0.1, colour.main, 0.15);
  k.box(3.2, 4.8, 0.5, 0, -0.4, d / 2 + 0.1, WOOD_TOWN.ochre, 0.2);
  k.box(2.2, 4.2, 0.6, 0, -0.4, d / 2 + 0.15, accent, 0.2);
}

function piece(p: TownPiece, colour: Colour, accent: string, spartan: boolean): Kit {
  const k = new Kit();
  switch (p.kind) {
    case 'tipi': tipi(k, colour, p.seed); break;
    case 'longhouse': longhouse(k, colour, p.foot > 7.8 ? 15 : 13); break;
    case 'wigwam': wigwam(k, p.seed); break;
    case 'lodge': lodge(k, colour, accent); break;
    case 'house': spartanHouse(k, colour, false, p.seed); break;
    case 'tall': spartanHouse(k, colour, true, p.seed); break;
    case 'hall': spartanHall(k, colour, accent, false); break;
    case 'grandHall': spartanHall(k, colour, accent, true); break;
    case 'yurt': yurt(k, colour, accent, yurtRadius(p.kind, p.seed), 4.6, 4.2, false); break;
    case 'tallYurt': yurt(k, colour, accent, yurtRadius(p.kind, p.seed), 6.6, 4.6, true); break;
    case 'yurtHall': yurt(k, colour, accent, yurtRadius(p.kind, p.seed), 6, 5.8, true); break;
    case 'greatYurt': greatYurt(k, colour, accent); break;
    case 'tower': if (spartan) spartanTower(k, colour); else watchtower(k, colour); break;
    case 'hut': hut(k, p.seed); break;
    case 'woodpile': woodpile(k); break;
  }
  return k;
}

// ---------------------------------------------------------------------------------------------------------------
// The mine and the foundry

/**
 * A mine built into the mountain: a rock face with a timber-framed tunnel going in, rails running out of it to an
 * ore cart, a lantern hanging deep inside (its light is drawn and flickers on the units canvas: lanterns.ts) and a
 * spoil heap. The foundry adds a stone furnace with a chimney (its drifting smoke is smoke.ts).
 */
export function worksParts(kind: 'mine' | 'foundry', cx: number, cz: number, seed: number): BufferGeometry[] {
  const w = worksPieces(kind, cx, cz, seed);
  return [...w.outside, ...w.occluder, ...w.interior];
}

/**
 * The mine in three sets: what stands outside (the cart, the spoil heap, the furnace), the front that hides the
 * tunnel's inside from view (the rock face and its rim, the rocks above it, the mouth's frame), and the tunnel's
 * inside (its lining, floor, back wall, the inner frames, the lantern, the rails and sleepers). The prop mesh draws
 * all three; the lantern's light redraws the inside, lit by its flicker, behind a depth-only copy of the front.
 */
export function worksPieces(kind: 'mine' | 'foundry', cx: number, cz: number, seed: number): { outside: BufferGeometry[]; occluder: BufferGeometry[]; interior: BufferGeometry[] } {
  const k = new Kit(), front = new Kit(), inside = new Kit();
  const { x: fx, z: fz, halfW, h, depth, openW, openH } = MINE;
  // The rock face, its front a cliff with the tunnel's mouth cut in it; extruded back, so the mouth's sides line the
  // tunnel. Its foot sinks a little into the ground.
  const s = new Shape();
  const kx = halfW / 12.5, ky = h / 15;
  const rim: [number, number][] = ([[-12.5, -0.8], [-11.1, 6], [-8.5, 11], [-3.5, 14], [1.5, 15], [6.5, 12.2], [10.5, 7], [12.5, -0.8]] as const)
    .map(([x, y]) => [x * kx, y < 0 ? y : y * ky]);
  rim.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  const hole = new Path();
  hole.moveTo(-openW, 0.05); hole.lineTo(openW, 0.05); hole.lineTo(openW, openH - 1); hole.lineTo(0, openH); hole.lineTo(-openW, openH - 1); hole.closePath();
  s.holes.push(hole);
  const face = new ExtrudeGeometry(s, { depth, bevelEnabled: false });
  face.translate(fx, 0, fz - depth);
  const faceGeo = coloured(face, TOWN.rock, 0, 0);
  // The tunnel's lining is dark earth, warmer near the mouth; the face's front is two rock tones in facets.
  const lining = (x: number, y: number, z: number): boolean => Math.abs(x - fx) < openW + 0.01 && y > -0.5 && y < openH + 0.01 && z < fz - 0.05 && z > fz - depth + 0.05;
  repaint(faceGeo, (x, y, z, nx, _ny, nz) => {
    if (lining(x, y, z)) return z > fz - 3.5 ? TOWN.tunnel : TOWN.tunnelDeep;
    if (nz > 0.9) return hash2(Math.floor(x / 3.2) + seed, Math.floor(y / 3.2)) > 0.5 ? TOWN.rockLight : TOWN.rock;
    return nx < 0 ? TOWN.rockLight : TOWN.rockDark;
  });
  const [faceIn, faceOut] = splitTriangles(faceGeo, lining);
  faceGeo.dispose();
  // A dark rim round the face's outline, a little behind it, so its silhouette reads against the scree as the toon
  // outlines of the other props do (the face itself has none: its hull would show inside the tunnel).
  const ring = new Shape();
  const grow = (x: number, y: number): [number, number] => [x * 1.06 + Math.sign(x) * 0.2, y < 0 ? y : y + 0.55];
  rim.map(([x, y]) => grow(x, y)).forEach(([x, y], i) => (i === 0 ? ring.moveTo(x, y) : ring.lineTo(x, y)));
  ring.closePath();
  const inner = new Path();
  [...rim].reverse().forEach(([x, y], i) => (i === 0 ? inner.moveTo(x, y) : inner.lineTo(x, y)));
  inner.closePath();
  ring.holes.push(inner);
  const rimGeo = new ExtrudeGeometry(ring, { depth: depth - 0.6, bevelEnabled: false });
  rimGeo.translate(fx + cx, 0, fz - depth + cz);
  // The far end of the tunnel, and its floor in packed earth.
  inside.box(openW * 2 + 0.2, openH, 0.4, fx, 0, fz - depth + 0.3, TOWN.tunnelDeep, 0);
  inside.box(openW * 2, 0.12, depth, fx, 0.02, fz - depth / 2, TOWN.floor, 0);
  // Rock above and beside the face, so it reads as part of the mountain (kept clear of the tunnel).
  const rocks: [number, number, number, number, string][] = [
    [-9.5, 9.5, -2.5, 4.6, TOWN.rockLight], [-1, 15, -3, 4.2, TOWN.rock], [6.5, 11.5, -2.8, 4.4, TOWN.rockDark], [-12, 3, 1, 3.4, TOWN.rockLight],
  ];
  for (const [x, y, z, r, c] of rocks) {
    const g = new DodecahedronGeometry(r * kx, 0);
    g.rotateY(seed + x);
    g.scale(1.15, 0.8, 1);
    g.translate(fx + x * kx, y * ky, fz + z);
    front.add(g, c, 0.6);
  }
  // The timber frame at the mouth, and two more sets inside, smaller toward the dark.
  const frame = (kit: Kit, z: number, inset: number, out: number): void => {
    const w = openW - inset;
    kit.box(1.2, openH - 1.2 - inset, 1.2, fx - w - 0.5, 0, z, TOWN.timber, out);
    kit.box(1.2, openH - 1.2 - inset, 1.2, fx + w + 0.5, 0, z, TOWN.timberDark, out);
    kit.box(2 * w + 3, 1.3, 1.4, fx, openH - 1.4 - inset, z, TOWN.timber, out);
  };
  frame(front, fz + 0.4, 0, 0.45);
  front.box(1.0, 2.4, 1.0, fx - openW - 0.5, openH - 2.6, fz + 0.4, TOWN.timberDark, 0.2, 0.8); // a brace
  frame(inside, fz - 3, 0.6, 0);
  frame(inside, fz - 6, 0.6, 0);
  // The lantern, deep in the tunnel, fixed to its left wall: an iron plate on the rock, an arm out from it with a
  // scroll under it, and the lantern hanging from the arm's end: an iron frame round warm glass.
  const L = LANTERN;
  const wall = LANTERN_WALL;
  inside.box(0.3, 1.8, 1.0, wall + 0.15, L.y + 0.6, L.z, TOWN.iron, 0);
  inside.box(L.x - wall, 0.28, 0.28, (wall + L.x) / 2, L.y + 1.75, L.z, TOWN.iron, 0);
  const scroll = new BoxGeometry(0.22, 1.4, 0.22);
  scroll.rotateZ(-0.75);
  scroll.translate(wall + 0.55, L.y + 1.3, L.z);
  inside.add(scroll, TOWN.iron, 0);
  inside.box(0.16, 0.45, 0.16, L.x, L.y + 1.3, L.z, TOWN.iron, 0);
  inside.box(1.25, 1.6, 1.25, L.x, L.y - 0.8, L.z, TOWN.iron, 0);
  inside.box(0.95, 1.25, 1.5, L.x, L.y - 0.62, L.z, TOWN.glass, 0);
  inside.box(1.5, 1.25, 0.95, L.x, L.y - 0.62, L.z, TOWN.glass, 0);
  const cap = new ConeGeometry(0.95, 0.9, 4);
  cap.rotateY(Math.PI / 4);
  cap.translate(L.x, L.y + 0.8, L.z);
  inside.add(cap, TOWN.iron, 0);
  // Rails out of the tunnel, on sleepers, to an ore cart in the yard.
  const r0 = fz - depth + 0.6, r1 = fz + 9;
  for (const sx of [-1.35, 1.35]) inside.box(0.4, 0.4, r1 - r0, fx + sx, 0.1, (r0 + r1) / 2, TOWN.rail, 0);
  for (let z = r0 + 0.8; z < r1; z += 2.1) (z < fz ? inside : k).box(4.2, 0.28, 0.8, fx, 0, z, z < fz ? TOWN.tunnelDeep : TOWN.sleeper, 0);
  const cartZ = fz + 5.8;
  k.box(4.2, 2.4, 4.8, fx, 1.1, cartZ, TOWN.timberDark, 0.4);
  k.box(4.5, 0.4, 5.1, fx, 3.4, cartZ, TOWN.iron, 0.2);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const w = new CylinderGeometry(0.8, 0.8, 0.5, 8);
    w.rotateZ(Math.PI / 2);
    w.translate(fx + sx * 2.25, 0.9, cartZ + sz * 1.6);
    k.add(w, TOWN.iron, 0.15);
  }
  for (const [ox, oz, r] of [[-0.9, -0.8, 1.4], [1.0, 0.2, 1.3], [-0.2, 1.3, 1.1]] as const) {
    const g = new DodecahedronGeometry(r, 0);
    g.rotateX(ox + seed);
    g.translate(fx + ox, 3.9, cartZ + oz);
    k.add(g, TOWN.ore, 0.25);
  }
  const cr = new OctahedronGeometry(1, 0);
  cr.scale(0.7, 1.6, 0.7);
  cr.translate(fx + 0.4, 5.2, cartZ - 0.3);
  k.add(cr, TOWN.crystal, 0.2, 1);
  if (kind === 'mine') {
    // A spoil heap by the door.
    for (const [x, z, r, c] of [[12, 11, 2.6, TOWN.spoil], [14.6, 9.5, 2.0, TOWN.spoilDark], [10.2, 13.5, 1.6, TOWN.spoilDark], [15, 12.6, 1.5, TOWN.spoil]] as const) {
      const g = new DodecahedronGeometry(r, 0);
      g.rotateY(seed * 3 + x);
      g.scale(1.2, 0.65, 1);
      g.translate(x, r * 0.35, z);
      k.add(g, c, 0.35);
    }
  } else {
    // The foundry's furnace: a stone block against the rock, its mouth glowing, with a chimney (its smoke drifts:
    // smoke.ts).
    const { x, z } = FURNACE;
    k.box(8.4, 7.4, 7, x, -0.4, z, TOWN.furnace, 0.6);
    k.box(9, 1.0, 7.6, x, 6.6, z, TOWN.furnaceDark, 0.35);
    k.box(4.2, 3.8, 0.5, x, 0.6, z + 3.4, TOWN.tunnelDeep, 0);
    k.box(3.2, 1.6, 0.4, x, 0.8, z + 3.65, TOWN.ember, 0);
    k.box(1.8, 0.8, 0.3, x, 1.1, z + 3.9, TOWN.emberHot, 0);
    k.box(3, 13, 3, x + 2.2, 6, z - 1.6, TOWN.furnaceDark, 0.5);
    k.box(3.6, 0.9, 3.6, x + 2.2, 18.6, z - 1.6, TOWN.furnace, 0.3);
  }
  for (const g of [faceIn, faceOut]) g.translate(cx, 0, cz);
  return {
    outside: k.done(cx, 0, cz, 0),
    occluder: [faceOut, coloured(rimGeo, '#3F3B37', 0, 0), ...front.done(cx, 0, cz, 0)],
    interior: [faceIn, ...inside.done(cx, 0, cz, 0)],
  };
}

/** Split a non-indexed geometry's triangles in two by their centre: those `pick` takes, and the rest. */
function splitTriangles(g: BufferGeometry, pick: (x: number, y: number, z: number) => boolean): [BufferGeometry, BufferGeometry] {
  const p = g.attributes.position!;
  const yes: number[] = [], no: number[] = [];
  for (let i = 0; i + 2 < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    (pick(x, y, z) ? yes : no).push(i, i + 1, i + 2);
  }
  const take = (idx: number[]): BufferGeometry => {
    const out = new BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) {
      const a = attr as BufferAttribute;
      const arr = new Float32Array(idx.length * a.itemSize);
      idx.forEach((v, j) => { for (let c = 0; c < a.itemSize; c++) arr[j * a.itemSize + c] = a.array[v * a.itemSize + c]!; });
      out.setAttribute(name, new Float32BufferAttribute(arr, a.itemSize));
    }
    return out;
  };
  return [take(yes), take(no)];
}
