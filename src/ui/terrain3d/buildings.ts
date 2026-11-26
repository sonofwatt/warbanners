// The 3D tile buildings and the treasure chest: low-poly, faceted, vertex coloured parts for the terrain's merged prop
// mesh, in the toon style of the cities and the mine (town.ts). Where things stand comes from buildingLayout.ts; this
// file only shapes them.
//
// - Farm: fenced ploughed rows with young shoots, a red barn, a hay bale. Its upgrade, the granary: ripe wheat, the
//   barn, and a tall round stone granary with sheaves.
// - Orchard: tidy rows of pruned fruit trees with whitewashed trunks, a ladder, baskets of fruit, a low fence. Its
//   upgrade, the plantation: seven heavier trees in straight rows on mown strips, crates of fruit.
// - Lumber camp: a log cabin at the forest's front edge, a stump with an axe, a pile of cut logs, a sawhorse. Its
//   upgrade, the lumber mill: a two storey timber mill on a stone footing beside a race, its water wheel turning
//   (wheels.ts), a bigger pile of logs and a stack of sawn planks.
// - Market: three stalls round an open square, their awnings striped in the owner's colour.
// - Treasure: a wooden chest with gold bands and a lock, a lid on a hinge (chests.ts swings it open), two coins at its
//   foot and the svg's two sparkles, standing in 3D facing the camera.
import {
  BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, DodecahedronGeometry, ExtrudeGeometry, IcosahedronGeometry,
  OctahedronGeometry, Path, Shape, ShapeGeometry,
} from 'three';
import type { FactionId } from '../../engine';
import { PLAYER_COLOURS } from '../art/palette';
import { coloured } from './geom';
import { SQUASH } from './layout';
import { Kit, gable } from './town';
import { MILL_CHIMNEY, PIECE_SIZE, WHEEL } from './buildingLayout';
import type { BuildingPiece, BuildingPlan, ChestSpot } from './buildingLayout';

const B = {
  soil: '#8A6440', ridge: '#74522F', shoot: '#7BBF4A', wheat: '#E9BE36', wheatDark: '#C99B2F', straw: '#E2C46A',
  barn: '#B5653A', barnRoof: '#6E4A33', trim: '#F1E3C2', barnDoor: '#5A3C29',
  fence: '#A87545', fenceDark: '#7A5230',
  stone: '#D9C49A', stoneDark: '#BFA87C', granaryRoof: '#B5653A',
  trunk: '#7A5230', whitewash: '#F1EDE2', leaf: '#5FAE55', leafDark: '#4E9A4A', fruit: '#E2402F', fruitDeep: '#C42E2A', pear: '#F2C230',
  basket: '#B58548', basketDark: '#8A6232', ladder: '#C9995A', crate: '#C8925A', crateDark: '#A8743F', mown: '#4F8A35',
  log: '#7A4E2C', logEnd: '#E9C98F', logRing: '#C9995A', cabin: '#A87545', cabinDark: '#8A5A33', roof: '#6E4A33', door: '#5A3C29',
  steel: '#C9D1D8', steelDark: '#9AA2AC', handle: '#6B4A2B',
  mill: '#B98B5C', millDark: '#94683F', footing: '#A39D93', footingDark: '#8E887F', window: '#4A3828',
  water: '#5FB3E0', waterLight: '#A6DDF5', plank: '#E2C08A', plankDark: '#C9A26A',
  counter: '#C8925A', counterTop: '#DDB07A', post: '#6B4A2B', cream: '#FFF6E0', market: '#F2B705',
  apple: '#E0563F', lemon: '#F2C230', greens: '#7BBF4A', cloth: '#9B6BE0', barrel: '#9C6B3E', hoop: '#55525E', sack: '#E2D3AE',
  chest: '#A0622D', chestDark: '#7E4A21', lid: '#B8743A', band: '#E7B53C', lock: '#F5D46A', gold: '#F2C230', glint: '#FFF4B8', inside: '#3B2414',
} as const;

const cyl = (rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number): CylinderGeometry => {
  const g = new CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y + h / 2, z);
  return g;
};
/** A log lying along x (or z when `alongZ`), its centre at (x, y, z). */
function log(k: Kit, len: number, r: number, x: number, y: number, z: number, alongZ: boolean, ends = true): void {
  const g = new CylinderGeometry(r, r, len, 7);
  g.rotateZ(Math.PI / 2);
  if (alongZ) g.rotateY(Math.PI / 2);
  g.translate(x, y, z);
  k.add(g, B.log, 0.3);
  if (!ends) return;
  // The cut end toward the viewer, pale with a darker ring.
  const e = new CylinderGeometry(r * 0.86, r * 0.86, 0.2, 7);
  e.rotateX(Math.PI / 2);
  if (alongZ) e.translate(x, y, z + len / 2 + 0.05);
  else { e.rotateY(Math.PI / 2); e.translate(x + len / 2 + 0.05, y, z); }
  k.add(e, B.logEnd, 0);
}

// ---------------------------------------------------------------------------------------------------------------
// Farm and granary

/** Ploughed rows inside a fence: w wide (x), d deep (z); `ripe` grows wheat on them instead of shoots. */
function plot(k: Kit, ripe: boolean, seed: number): void {
  const w = 18, d = 14;
  k.box(w, 0.45, d, 0, -0.2, 0, B.soil, 0.15);
  const rows = 5;
  for (let i = 0; i < rows; i++) {
    const z = -d / 2 + 1.6 + (i * (d - 3.2)) / (rows - 1);
    k.box(w - 1.4, 0.9, 1.3, 0, 0, z, B.ridge, 0.15);
    for (let j = 0; j < 5; j++) {
      const x = -w / 2 + 2.2 + j * ((w - 4.4) / 4) + (((i + j + Math.floor(seed * 7)) % 3) - 1) * 0.4;
      if (ripe) {
        const c = new ConeGeometry(0.85, 3.2, 4);
        c.translate(x, 0.9 + 1.6, z);
        k.add(c, (i + j) % 3 === 0 ? B.wheatDark : B.wheat, 0.15);
      } else {
        const o = new OctahedronGeometry(0.75, 0);
        o.scale(1, 1.3, 1);
        o.translate(x, 1.5, z);
        k.add(o, B.shoot, 0.12);
      }
    }
  }
  // A fence along the front and the left: posts and two rails.
  const fence = (x0: number, z0: number, x1: number, z1: number, n: number): void => {
    for (let i = 0; i <= n; i++) k.box(0.8, 3, 0.8, x0 + ((x1 - x0) * i) / n, -0.3, z0 + ((z1 - z0) * i) / n, B.fenceDark, 0.25);
    const len = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(-(z1 - z0), x1 - x0);
    for (const y of [1.0, 2.1]) k.box(len, 0.4, 0.4, (x0 + x1) / 2, y, (z0 + z1) / 2, B.fence, 0.15, rot);
  };
  fence(-w / 2 - 0.6, d / 2 + 0.6, w / 2 + 0.6, d / 2 + 0.6, 4);
  fence(-w / 2 - 0.6, -d / 2 - 0.6, -w / 2 - 0.6, d / 2 + 0.6, 3);
}

/** A red barn, its gable end and big doors to the viewer. */
function barn(k: Kit): void {
  const w = 10, h = 7.4, d = 9;
  k.box(w, h, d, 0, -0.4, 0, B.barn, 0.7);
  const roof = gable(w, d, 5.2, 0.7);
  roof.translate(0, h - 0.4, 0);
  k.add(roof, B.barnRoof, 0.7);
  k.box(4.6, 5, 0.3, 0, -0.4, d / 2 + 0.05, B.barnDoor, 0.2);
  for (const s of [-1, 1]) {
    const x = new BoxGeometry(0.45, 6.4, 0.2);
    x.rotateZ(s * 0.75);
    x.translate(0, 2.1, d / 2 + 0.25);
    k.add(x, B.trim, 0);
  }
  k.box(5.2, 0.45, 0.25, 0, 4.6, d / 2 + 0.2, B.trim, 0);
  k.box(1.8, 1.8, 0.25, 0, h + 0.6, d / 2 + 0.05, B.barnDoor, 0.12); // the hay door
}

function bale(k: Kit): void {
  const g = new CylinderGeometry(2, 2, 2.8, 9);
  g.rotateZ(Math.PI / 2);
  g.translate(0, 1.9, 0);
  k.add(g, B.straw, 0.35);
}

/** A round stone granary: a drum with darker courses, a conical red roof with a finial, a door and a small window. */
function granaryTower(k: Kit): void {
  k.add(cyl(5, 5.4, 13, 12, 0, -0.5, 0), B.stone, 0.7);
  for (const y of [3.4, 7.6]) k.add(cyl(5.15, 5.15, 0.7, 12, 0, y, 0), B.stoneDark, 0.1);
  k.add(cyl(5.8, 5.8, 0.9, 12, 0, 12.3, 0), B.stoneDark, 0.3);
  const roof = new ConeGeometry(6.8, 7.4, 12);
  roof.translate(0, 13.2 + 3.7, 0);
  k.add(roof, B.granaryRoof, 0.7);
  const fin = new OctahedronGeometry(0.8, 0);
  fin.scale(1, 1.8, 1);
  fin.translate(0, 21.2, 0);
  k.add(fin, B.wheat, 0.2, 0.6);
  k.box(2.6, 4.4, 0.4, 0, -0.5, 5.15, B.door, 0.15);
  k.box(1.3, 1.6, 0.3, 1.4, 8.4, 5.0, B.window, 0.1);
}

function sheaf(k: Kit): void {
  const g = new ConeGeometry(1.6, 4.4, 6);
  g.translate(0, 2.2, 0);
  k.add(g, B.wheat, 0.3);
  k.add(cyl(1.0, 1.0, 0.5, 6, 0, 1.6, 0), B.wheatDark, 0.1);
}

// ---------------------------------------------------------------------------------------------------------------
// Orchard and plantation

/** A pruned fruit tree: a whitewashed trunk and a round crown hung with fruit; `full` for the plantation's heavier ones. */
function fruitTree(k: Kit, s: number, seed: number, full: boolean): void {
  k.add(cyl(0.8 * s, 1.0 * s, 4.6 * s, 5, 0, -0.3, 0), B.trunk, 0.35);
  k.add(cyl(1.05 * s, 1.1 * s, 1.6 * s, 5, 0, -0.3, 0), B.whitewash, 0.1);
  const cr = (full ? 5 : 4.5) * s, cy = (full ? 8.6 : 8) * s;
  const crown = new IcosahedronGeometry(cr, 0);
  crown.rotateY(seed * 3);
  crown.scale(1, 0.9, 1);
  crown.translate(0, cy, 0);
  k.add(crown, B.leaf, 0.6);
  const n = full ? 7 : 4;
  for (let i = 0; i < n; i++) {
    // On the half of the crown facing the viewer, so they all read.
    const a = Math.PI / 2 + (i / (n - 1) - 0.5) * 2.4;
    const e = ((i * 37) % 5) / 5 - 0.35;
    const f = new OctahedronGeometry(0.95 * s, 0);
    f.translate(Math.cos(a) * Math.cos(e) * cr * 0.95, cy + Math.sin(e) * cr * 0.8, Math.sin(a) * Math.cos(e) * cr * 0.95);
    k.add(f, full && i % 3 === 1 ? B.pear : i % 2 ? B.fruitDeep : B.fruit, 0.2, 0.6);
  }
}

function ladder(k: Kit): void {
  // Leaning back against the tree behind it.
  const part = (w: number, h: number, x: number, y: number): void => {
    const g = new BoxGeometry(w, h, 0.35);
    g.translate(x, y + h / 2, 0);
    g.rotateX(-0.28);
    k.add(g, B.ladder, 0.12);
  };
  for (const x of [-0.9, 0.9]) part(0.35, 8.4, x, 0);
  for (let i = 0; i < 4; i++) part(2.1, 0.3, 0, 1.4 + i * 1.9);
}

function basket(k: Kit, colour: string): void {
  k.add(cyl(1.7, 1.3, 1.8, 8, 0, 0, 0), B.basket, 0.3);
  k.add(cyl(1.8, 1.8, 0.35, 8, 0, 1.7, 0), B.basketDark, 0.1);
  for (const [x, z] of [[-0.6, -0.3], [0.6, 0.1], [0, 0.6]] as const) {
    const f = new OctahedronGeometry(0.75, 0);
    f.translate(x, 2.2, z);
    k.add(f, colour, 0.15, 0.5);
  }
}

function crates(k: Kit): void {
  for (const [x, y, z, c] of [[-2.4, 0, 0, B.apple], [2.4, 0, 0.3, B.lemon], [0, 2.8, 0, B.apple]] as const) {
    k.box(4.2, 2.6, 3.4, x, y - 0.2, z, B.crate, 0.35);
    k.box(4.4, 0.35, 3.6, x, y + 1.0, z, B.crateDark, 0.05);
    for (const fx of [-1.2, 0, 1.2]) {
      const f = new OctahedronGeometry(0.7, 0);
      f.translate(x + fx, y + 2.6, z + 0.3);
      k.add(f, c, 0.12, 0.5);
    }
  }
}

function lowFence(k: Kit, len: number): void {
  const n = Math.max(2, Math.round(len / 5.5));
  for (let i = 0; i <= n; i++) k.box(0.7, 2.6, 0.7, -len / 2 + (len * i) / n, -0.3, 0, B.fenceDark, 0.2);
  k.box(len, 0.4, 0.4, 0, 1.6, 0, B.fence, 0.12);
}

/** The plantation's mown strips under its three rows. */
function mownRows(k: Kit): void {
  for (const [z, w] of [[-14, 36], [0, 42], [13, 28]] as const) k.box(w, 0.12, 6, 0, -0.02, z, B.mown, 0);
}

// ---------------------------------------------------------------------------------------------------------------
// Lumber camp and mill

function cabin(k: Kit): void {
  const w = 8.4, h = 5.2, d = 7;
  // Walls of stacked logs: a box, and log courses along its front.
  k.box(w, h, d, 0, -0.4, 0, B.cabin, 0.65);
  for (let i = 0; i < 3; i++) log(k, w + 0.8, 0.5, 0, 0.6 + i * 1.6, d / 2, false, false);
  const roof = gable(w, d, 4.6, 1.1);
  roof.translate(0, h - 0.4, 0);
  k.add(roof, B.roof, 0.65);
  k.box(2, 3.6, 0.3, -w * 0.2, -0.4, d / 2 + 0.55, B.door, 0.15);
  k.box(1.1, 4.6, 1.1, w * 0.28, h + 0.6, -d * 0.15, B.cabinDark, 0.25); // a stovepipe, standing clear of the ridge (CABIN_PIPE)
}

function stump(k: Kit): void {
  k.add(cyl(2.1, 2.5, 2.6, 8, 0, -0.3, 0), B.log, 0.45);
  k.add(cyl(1.85, 1.85, 0.2, 8, 0, 2.3, 0), B.logEnd, 0);
  // The axe bitten into its top: a handle leaning right, a steel head.
  const h = new BoxGeometry(0.45, 5.6, 0.45);
  h.translate(0, 2.8, 0);
  h.rotateZ(-0.5);
  h.translate(-0.2, 2.2, 0.2);
  k.add(h, B.handle, 0.15);
  const head = new BoxGeometry(2.4, 1.6, 0.35);
  head.translate(0.9, 0, 0);
  head.rotateZ(-0.5);
  head.translate(-0.2 + Math.sin(0.5) * 5.4, 2.2 + Math.cos(0.5) * 5.4, 0.2);
  k.add(head, B.steel, 0.2, 0.7);
}

/** Cut logs stacked three, two and one, their ends toward the viewer; `big` adds a fourth course and longer logs. */
function logPile(k: Kit, big: boolean): void {
  const r = 1.45, len = big ? 9 : 7.5;
  const courses = big ? [4, 3, 2, 1] : [3, 2, 1];
  courses.forEach((n, row) => {
    for (let i = 0; i < n; i++) log(k, len, r, (i - (n - 1) / 2) * r * 2.05, r + row * r * 1.75, 0, true);
  });
  for (const x of [-(courses[0]! * r + 0.4), courses[0]! * r + 0.4]) k.box(0.6, 3.6 + (big ? 1.5 : 0), 0.6, x, -0.3, len * 0.3, B.handle, 0.15);
}

function sawhorse(k: Kit): void {
  for (const x of [-2.6, 2.6]) {
    for (const s of [-1, 1]) {
      const g = new BoxGeometry(0.45, 4.2, 0.45);
      g.rotateX(s * 0.38);
      g.translate(x, 1.8, 0);
      k.add(g, B.fenceDark, 0.15);
    }
  }
  k.box(6.6, 0.5, 0.6, 0, 3.4, 0, B.fence, 0.15);
  log(k, 7.6, 1.05, 0.4, 4.9, 0, false);
}

/** The mill: a stone footing, two storeys of timber with darker posts, a roof along its long side, door and windows. */
function mill(k: Kit): void {
  const w = 15, d = 8.4, h = 11.5;
  k.box(w + 0.6, 2.6, d + 0.6, 0, -0.5, 0, B.footing, 0.55);
  k.box(w, h - 2.6, d, 0, 2.1, 0, B.mill, 0.65);
  k.box(w + 0.5, 0.6, d + 0.5, 0, 6.4, 0, B.millDark, 0.2);
  for (const x of [-w / 2 + 0.4, -w / 6, w / 6, w / 2 - 0.4]) k.box(0.7, h - 2.6, 0.3, x, 2.1, d / 2 + 0.05, B.millDark, 0);
  const roof = gable(d, w, 5.6, 1);
  roof.rotateY(Math.PI / 2);
  roof.translate(0, h - 0.5, 0);
  k.add(roof, B.roof, 0.7);
  k.box(2.4, 4.2, 0.3, -3.3, -0.3, d / 2 + 0.35, B.door, 0.15);
  for (const [x, y] of [[2.4, 3.2], [-w / 3 - 0.5, 7.6], [w / 4, 7.6]] as const) k.box(1.6, 1.7, 0.3, x, y, d / 2 + 0.1, B.window, 0.1);
  // A stone chimney through the roof's back slope (its smoke drifts: smoke.ts).
  const c = MILL_CHIMNEY;
  k.box(1.9, c.y - 0.6 - 9.5, 1.9, c.x, 9.5, c.z, B.footing, 0.4);
  k.box(2.4, 0.6, 2.4, c.x, c.y - 0.6, c.z, B.footingDark, 0.2);
  // A gable window and a hoist beam under the eaves at the right end.
  k.box(1.6, 0.6, 3.2, w / 2 + 0.9, h - 1.2, 0, B.millDark, 0.15);
}

/** The race under the wheel: a channel of water between timber sides, running out to the right of the tile. */
function race(k: Kit, len: number, wx: number): void {
  k.box(len, 0.5, 4.2, 0, -0.3, 0, B.water, 0, 0);
  k.box(len, 0.08, 1.2, 0.5, 0.2, -0.6, B.waterLight, 0);
  for (const z of [-2.4, 2.4]) k.box(len, 1.1, 0.6, 0, -0.4, z, B.fence, 0.2);
  // Posts carrying the wheel's axle, in front and behind it.
  for (const z of [-3.2, 3.2]) k.box(1, WHEEL.y + 0.6, 1, wx, -0.3, z, B.millDark, 0.25);
  k.box(0.8, 0.8, 7.2, wx, WHEEL.y - 0.4, 0, B.handle, 0.1);
}

function planks(k: Kit): void {
  for (let i = 0; i < 5; i++) k.box(8.6, 0.55, 2.4 - (i % 2) * 0.2, (i % 2) * 0.4, i * 0.55, 0, i % 2 ? B.plankDark : B.plank, 0.12, (i % 3 - 1) * 0.06);
  for (const x of [-3.2, 3.2]) k.box(0.7, 0.6, 2.8, x, -0.4, 0, B.handle, 0.05);
}

/** The water wheel, at the local origin, axle along z: two rims, spokes, a hub and paddles. Built once per mill. */
export function wheelParts(): BufferGeometry[] {
  const k = new Kit();
  const R = WHEEL.r;
  const ring = new Shape();
  ring.absarc(0, 0, R, 0, Math.PI * 2, false);
  const hole = new Path();
  hole.absarc(0, 0, R - 0.9, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  for (const z of [-1.3, 0.9]) {
    const g = new ExtrudeGeometry(ring, { depth: 0.4, bevelEnabled: false, curveSegments: 7 });
    g.translate(0, 0, z);
    k.add(g, B.millDark, 0.25);
  }
  for (let i = 0; i < 4; i++) {
    const g = new BoxGeometry(2 * R - 1, 0.55, 0.5);
    g.rotateZ((i * Math.PI) / 4);
    g.translate(0, 0, 0.9);
    k.add(g, B.trunk, 0);
  }
  const hub = new CylinderGeometry(1.1, 1.1, 3, 8);
  hub.rotateX(Math.PI / 2);
  k.add(hub, B.handle, 0.15);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const g = new BoxGeometry(2.1, 0.45, 2.6);
    g.rotateZ(a);
    g.translate(Math.cos(a) * (R - 0.4), Math.sin(a) * (R - 0.4), -0.2);
    k.add(g, B.mill, 0.15);
  }
  return k.done(0, 0, 0, 0);
}

// ---------------------------------------------------------------------------------------------------------------
// Market

/** A stall: a counter with goods, four posts, an awning striped in the owner's colour and cream, sloping to the front. */
function stall(k: Kit, colour: string, seed: number): void {
  const w = 9, d = 4.2;
  k.box(w, 3.2, d, 0, -0.3, 0.6, B.counter, 0.45);
  k.box(w + 0.4, 0.4, d + 0.4, 0, 2.9, 0.6, B.counterTop, 0.1);
  const goods = [B.apple, B.lemon, B.greens, seed > 0.5 ? B.cloth : B.apple];
  goods.forEach((c, i) => {
    const g = i === 3 ? new BoxGeometry(1.6, 1, 1.4) : new IcosahedronGeometry(0.9, 0);
    g.translate(-w / 2 + 1.5 + i * 2, 3.3 + 0.55, 0.9);
    k.add(g, c, 0.12, 0.4);
  });
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2 + 1.2], [w / 2, d / 2 + 1.2]] as const) {
    k.box(0.5, z < 0 ? 9.2 : 7.4, 0.5, x, -0.3, z + 0.6, B.post, 0.15);
  }
  // The awning: four stripes, each a slab tilted down to the front, and a valance of the same stripes.
  const n = 4;
  for (let i = 0; i < n; i++) {
    const sw = (w + 1.6) / n;
    const x = -(w + 1.6) / 2 + sw * (i + 0.5);
    const c = i % 2 === 0 ? colour : B.cream;
    const g = new BoxGeometry(sw, 0.35, d + 3.4);
    g.rotateX(0.32);
    g.translate(x, 8.2, 0.9);
    k.add(g, c, 0.25);
    const v = new BoxGeometry(sw, 1.1, 0.25);
    v.translate(x, 6.9, 0.9 + (d + 3.4) / 2 * Math.cos(0.32) + 0.05);
    k.add(v, c, 0.1);
  }
}

function barrel(k: Kit): void {
  k.add(cyl(1.4, 1.5, 3.2, 9, 0, -0.2, 0), B.barrel, 0.35);
  for (const y of [0.5, 2.3]) k.add(cyl(1.55, 1.55, 0.3, 9, 0, y, 0), B.hoop, 0.05);
}

function sack(k: Kit): void {
  const g = new DodecahedronGeometry(1.4, 0);
  g.scale(1, 1.15, 0.9);
  g.translate(0, 1.4, 0);
  k.add(g, B.sack, 0.3);
}

// ---------------------------------------------------------------------------------------------------------------

/** Every part of a tile building, standing on the ground. `owner`: the faction whose market it is, for its awnings. */
export function buildingParts(plan: BuildingPlan, cx: number, cz: number, height: (lx: number, lz: number) => number, owner: FactionId | null): BufferGeometry[] {
  const awning = owner === null ? B.market : PLAYER_COLOURS[owner].main;
  const out: BufferGeometry[] = [];
  for (const p of plan.pieces) out.push(...pieceOf(p, awning).done(cx + p.x, height(p.x, p.z), cz + p.z, p.rot, PIECE_SIZE[p.kind] ?? 1));
  return out;
}

function pieceOf(p: BuildingPiece, awning: string): Kit {
  const k = new Kit();
  switch (p.kind) {
    case 'plot': plot(k, false, p.seed); break;
    case 'wheatPlot': plot(k, true, p.seed); break;
    case 'barn': barn(k); break;
    case 'bale': bale(k); break;
    case 'granary': granaryTower(k); break;
    case 'sheaf': sheaf(k); break;
    case 'tree': fruitTree(k, p.s, p.seed, false); break;
    case 'fullTree': fruitTree(k, p.s, p.seed, true); break;
    case 'ladder': ladder(k); break;
    case 'basket': basket(k, p.seed > 0.5 ? B.fruit : B.pear); break;
    case 'crates': crates(k); break;
    case 'fence': lowFence(k, p.s); break;
    case 'rows': mownRows(k); break;
    case 'cabin': cabin(k); break;
    case 'stump': stump(k); break;
    case 'logPile': logPile(k, false); break;
    case 'bigLogPile': logPile(k, true); break;
    case 'sawhorse': sawhorse(k); break;
    case 'mill': mill(k); break;
    case 'race': race(k, p.s, WHEEL.x - p.x); break; // the wheel's hub, relative to the race's middle
    case 'planks': planks(k); break;
    case 'stall': stall(k, awning, p.seed); break;
    case 'barrel': barrel(k); break;
    case 'sack': sack(k); break;
  }
  return k;
}

// ---------------------------------------------------------------------------------------------------------------
// The treasure chest

/** The chest's size: its body w wide, d deep, h tall; the lid's hinge runs along its top back edge. */
export const CHEST = { w: 8, d: 5.2, h: 4.4 } as const;

/** A flat four-point sparkle facing the camera, as the svg's glint. */
function glint(x: number, y: number, z: number, s: number): BufferGeometry {
  const t = s * 0.3;
  const sh = new Shape();
  const pts: [number, number][] = [[0, s], [t, t], [s, 0], [t, -t], [0, -s], [-t, -t], [-s, 0], [-t, t]];
  pts.forEach(([px, py], i) => (i === 0 ? sh.moveTo(px, py) : sh.lineTo(px, py)));
  sh.closePath();
  const g = new ShapeGeometry(sh);
  g.rotateX(-Math.asin(SQUASH)); // its face toward the camera, which looks down at the elevation whose sine is SQUASH
  g.translate(x, y, z);
  return coloured(g, B.glint, 1, 0);
}

/**
 * The chest's parts at its own origin (its foot's centre), split so the lid can turn: `body` (with the coins at its
 * foot), `lid` shaped about its hinge (so a turn about x opens it), `hinge` where the hinge stands, and `glints`.
 */
export function chestParts(): { body: BufferGeometry[]; lid: BufferGeometry[]; hinge: [number, number, number]; glints: BufferGeometry[] } {
  const { w, d, h } = CHEST;
  const body = new Kit();
  body.box(w, h, d, 0, 0, 0, B.chest, 0.55);
  body.box(w - 0.8, 0.3, d - 0.8, 0, h - 0.25, 0, B.inside, 0); // the dark inside, seen when the lid is up
  for (const x of [-w * 0.3, w * 0.3]) body.box(0.95, h + 0.05, d + 0.25, x, -0.02, 0, B.band, 0.1);
  body.box(w + 0.2, 0.55, d + 0.2, 0, 0, 0, B.chestDark, 0.1);
  body.box(1.5, 1.9, 0.3, 0, h - 2.3, d / 2 + 0.1, B.lock, 0.05);
  for (const [x, z, r] of [[-w / 2 - 1.8, 2.6, 1.1], [w / 2 + 1.4, 3.4, 0.95]] as const) {
    const c = new CylinderGeometry(r, r, 0.35, 8);
    c.translate(x, 0.18, z);
    body.add(c, B.gold, 0.1, 0.7);
  }
  // The lid: a half barrel over the body, its hinge along the top back edge; gold bands to match the body's.
  const r = d / 2;
  const lid = new Kit();
  const half = (rr: number, len: number, x: number, colour: string, out: number): void => {
    const g = new CylinderGeometry(rr, rr, len, 8, 1, false, 0, Math.PI);
    g.rotateZ(Math.PI / 2); // axis along x, the curve on top
    g.translate(x, 0, r);
    lid.add(g, colour, out);
  };
  half(r, w, 0, B.lid, 0.5);
  for (const x of [-w * 0.3, w * 0.3]) half(r + 0.12, 0.95, x, B.band, 0.08);
  lid.box(w - 0.3, 0.3, d - 0.3, 0, 0.02, r, B.basket, 0); // the lid's underside, pale wood, seen as it opens
  lid.box(w - 0.3, 0.32, 0.5, 0, 0.03, 2 * r - 0.25, B.band, 0); // a gold rim along its front edge
  const glints = [glint(4.2, h + r + 4.8, 1, 2.4), glint(-3.6, h + r + 2.6, 1, 1.5)];
  return { body: body.done(0, 0, 0, 0), lid: lid.done(0, 0, 0, 0), hinge: [0, h, -r], glints };
}

/** The chest standing shut on a tile, for the prop mesh: placed and scaled at its spot. */
export function chestPropParts(spot: ChestSpot, cx: number, cz: number, y: number): BufferGeometry[] {
  const { body, lid, hinge, glints } = chestParts();
  for (const g of lid) g.translate(...hinge);
  const all = [...body, ...lid, ...glints];
  for (const g of all) {
    g.scale(spot.s, spot.s, spot.s);
    g.translate(cx + spot.x, y, cz + spot.z);
  }
  return all;
}
