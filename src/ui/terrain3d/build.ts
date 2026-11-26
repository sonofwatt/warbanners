// Geometry for the 3D terrain: one ground mesh (each tile's subdivided top face plus its six walls) and one prop
// mesh (trees, peaks, deer, ore, tufts and the small details), both merged from per-tile pieces that are cached,
// so a change on one tile rebuilds only that tile.
import {
  BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Euler, Float32BufferAttribute,
  IcosahedronGeometry, OctahedronGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HexKey } from '../../engine';
import type { GlMap } from './input';
import {
  bedFn, centre, distToEdges, EDGE_NB, edgeDist, hash2, heightFn, INR, parse, R, RES_HARVESTED, RES_ID, TERRAIN_ID, tileSetup, WALL, WATER_Y,
} from './layout';
import type { BedBit } from './waterLayout';
import type { RidgeHalf } from './ridges';
import type { Bit, Peak, Prop, Setup } from './layout';
import { at, coloured } from './geom';
import { townParts, worksParts } from './town';
import { buildingParts, chestPropParts } from './buildings';

const N = 10; // top-face subdivisions per side

function groundOf(map: GlMap, k: HexKey): number | null {
  const t = map.tiles[k];
  if (!t) return null;
  if (t.city) return TERRAIN_ID.sand;
  return TERRAIN_ID[t.terrain];
}

// ---------------------------------------------------------------------------------------------------------------
// Ground

function hexAttr(geo: BufferGeometry, q: number, r: number): void {
  const n = geo.attributes.position!.count;
  const a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { a[i * 2] = q; a[i * 2 + 1] = r; }
  geo.setAttribute('aHex', new Float32BufferAttribute(a, 2));
}

function walls(cx: number, cz: number, g: number, top: number, v: number, skip: readonly number[] = []): BufferGeometry {
  const wp: number[] = [], wi: number[] = [], wt: number[] = [], wa: number[] = [], wl: number[] = [], wn: number[] = [];
  const corner = (i: number): [number, number] => { const a = ((30 + 60 * i) * Math.PI) / 180; return [R * Math.cos(a), R * Math.sin(a)]; };
  const sides = [0, 1, 2, 3, 4, 5].filter((e) => !skip.includes(e));
  for (const e of sides) {
    // Edge e (normal at 60e degrees) runs from corner e-1 to corner e (corners at 30 + 60i).
    const [ax, az] = corner((e + 5) % 6), [bx, bz] = corner(e);
    const nx = Math.cos((e * Math.PI) / 3), nz = Math.sin((e * Math.PI) / 3);
    for (const [x, z, y, wv] of [[ax, az, top, 0], [bx, bz, top, 0], [ax, az, -WALL, 1], [bx, bz, -WALL, 1]] as const) {
      wp.push(cx + x, y, cz + z);
      wn.push(nx, 0, nz);
      wi.push(g, 1, wv, 60);
      wt.push(cx, cz, 0, v);
      wa.push(1);
      wl.push(x, z);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(wp, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(wn, 3));
  geo.setAttribute('aInfo', new Float32BufferAttribute(wi, 4));
  geo.setAttribute('aTile', new Float32BufferAttribute(wt, 4));
  geo.setAttribute('aAO', new Float32BufferAttribute(wa, 1));
  geo.setAttribute('aLocal', new Float32BufferAttribute(wl, 2));
  geo.setAttribute('aRoad', new Float32BufferAttribute(new Float32Array(sides.length * 4), 1));
  const wIndex: number[] = [];
  for (let i = 0; i < sides.length; i++) { const o = i * 4; wIndex.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  geo.setIndex(wIndex);
  return geo;
}

/** A fogged tile: flat, painted in today's fog colours by the shader, nothing about what lies beneath. */
export function fogGeometry(k: HexKey): BufferGeometry {
  const { q, r } = parse(k);
  const c = centre(q, r);
  // The edge distance runs from the inradius at the centre to 0 at the rim, exactly linear across each fan triangle.
  const pos: number[] = [c.x, 0, c.z], info: number[] = [TERRAIN_ID.fog, 0, INR, 60], local: number[] = [0, 0];
  for (let i = 0; i < 6; i++) {
    const a = ((30 + 60 * i) * Math.PI) / 180;
    pos.push(c.x + R * Math.cos(a), 0, c.z + R * Math.sin(a));
    info.push(TERRAIN_ID.fog, 0, 0, 60);
    local.push(R * Math.cos(a), R * Math.sin(a));
  }
  const top = new BufferGeometry();
  top.setAttribute('position', new Float32BufferAttribute(pos, 3));
  top.setAttribute('normal', new Float32BufferAttribute(Array.from({ length: 7 }, () => [0, 1, 0]).flat(), 3));
  top.setAttribute('aInfo', new Float32BufferAttribute(info, 4));
  top.setAttribute('aTile', new Float32BufferAttribute(Array.from({ length: 7 }, () => [c.x, c.z, 0, 0]).flat(), 4));
  top.setAttribute('aAO', new Float32BufferAttribute(new Float32Array(7).fill(1), 1));
  top.setAttribute('aLocal', new Float32BufferAttribute(local, 2));
  top.setAttribute('aRoad', new Float32BufferAttribute(new Float32Array(7), 1));
  const index: number[] = [];
  for (let i = 0; i < 6; i++) index.push(0, 1 + ((i + 1) % 6), 1 + i);
  top.setIndex(index);
  const geo = mergeGeometries([top, walls(c.x, c.z, TERRAIN_ID.fog, 0, 0)])!;
  hexAttr(geo, q, r);
  return geo;
}

export interface TilePieces { ground: BufferGeometry; props: BufferGeometry | null }

export function tilePieces(map: GlMap, k: HexKey): TilePieces {
  const { q, r } = parse(k);
  const c = centre(q, r);
  const g = groundOf(map, k)!;
  const setup = tileSetup(map, k);
  const isWater = g === TERRAIN_ID.water;
  const base = isWater ? WATER_Y : 0;
  // Edges on the water (for land) or on land (for water): wet bank and foam.
  const shoreEdges: number[] = [];
  EDGE_NB.forEach(([dq, dr], e) => {
    const ng = groundOf(map, `${q + dq},${r + dr}`);
    if (ng === null) return;
    if (isWater !== (ng === TERRAIN_ID.water)) shoreEdges.push(e);
  });
  const resId = RES_ID[setup.res ?? 'none'] + (setup.faded ? RES_HARVESTED : 0);

  const pos: number[] = [], info: number[] = [], tile: number[] = [], ao: number[] = [], local: number[] = [], road: number[] = [];
  const idx = new Map<string, number>();
  const ux = (R / N) * Math.cos(Math.PI / 6), uz = (R / N) * Math.sin(Math.PI / 6);
  const vz = R / N;
  let n = 0;
  const height = heightFn(setup);
  // water3d: a water tile's top is its bed, under the clear surface (water.ts), deepest away from the shore.
  const bed = bedFn(setup);
  const roadMask = setup.links ? (setup.links.length ? setup.links.reduce((m, e) => m + (1 << e), 0) : 64) : 0;
  for (let i = -N; i <= N; i++) {
    for (let j = -N; j <= N; j++) {
      if (Math.abs(i + j) > N) continue;
      const lx = i * ux, lz = i * uz + j * vz;
      const h = base + height(lx, lz) - bed(lx, lz);
      pos.push(c.x + lx, h, c.z + lz);
      info.push(g, 0, Math.max(0, edgeDist(lx, lz)), Math.min(60, distToEdges(lx, lz, shoreEdges)));
      tile.push(c.x, c.z, resId, setup.v);
      local.push(lx, lz);
      road.push(roadMask);
      let shade = 1;
      for (const [bx, bz, br, bs] of setup.blobs) {
        // Light from the upper left: shadows fall to the right and a little back.
        const d = Math.hypot(lx - (bx + 3.2), lz - (bz - 1.2)) / br;
        shade -= bs * Math.exp(-d * d * 1.6);
      }
      ao.push(Math.max(0.45, shade));
      idx.set(`${i},${j}`, n++);
    }
  }
  const index: number[] = [];
  for (let i = -N; i < N; i++) {
    for (let j = -N; j < N; j++) {
      const a = idx.get(`${i},${j}`), b = idx.get(`${i + 1},${j}`), cc = idx.get(`${i},${j + 1}`), d = idx.get(`${i + 1},${j + 1}`);
      if (a !== undefined && b !== undefined && cc !== undefined) index.push(a, cc, b);
      if (b !== undefined && d !== undefined && cc !== undefined) index.push(b, cc, d);
    }
  }
  const top = new BufferGeometry();
  top.setAttribute('position', new Float32BufferAttribute(pos, 3));
  top.setAttribute('aInfo', new Float32BufferAttribute(info, 4));
  top.setAttribute('aTile', new Float32BufferAttribute(tile, 4));
  top.setAttribute('aAO', new Float32BufferAttribute(ao, 1));
  top.setAttribute('aLocal', new Float32BufferAttribute(local, 2));
  top.setAttribute('aRoad', new Float32BufferAttribute(road, 1));
  top.setIndex(index);
  top.computeVertexNormals();
  // Between two water tiles there is no wall: the bed runs on under the one surface.
  const ground = mergeGeometries([top, walls(c.x, c.z, g, base, setup.v, isWater ? setup.open : [])])!;
  top.dispose();
  hexAttr(ground, q, r);
  const parts = propsFor(setup, c, height, bed);
  let props: BufferGeometry | null = null;
  if (parts.length) {
    props = mergeGeometries(parts)!;
    for (const p of parts) p.dispose();
    hexAttr(props, q, r);
  }
  return { ground, props };
}

// ---------------------------------------------------------------------------------------------------------------
// Props: low-poly, faceted, vertex-coloured; one merged mesh drawn twice (toon fill, then a back-face outline).

const PAL = {
  trunk: '#7A5230', leafLow: '#3F8F4A', leaf: '#57AE5E', leafTip: '#6CC46E',
  orchardLeaf: '#5FAE55', fruit: '#E2402F', fruitDeep: '#C42E2A',
  rockLight: '#9C958C', rockDark: '#857F78', oreRockLight: '#8E7A6C', oreRockDark: '#6F5F55', scree: '#AEA597', snow: '#F6F8FB', snowShade: '#E4EBF3',
  grass: ['#5E9A3C', '#73AD45', '#4F8A35'], straw: ['#DDB552', '#E9C764', '#C99B3F'], ear: '#F2CF62',
  deer: '#A8693A', deerBelly: '#E1BC8A', deerLeg: '#6E4222', antler: '#EFE3CC', nose: '#3A2516',
  oreDark: '#4E4B58', oreMid: '#6B6778', crystal: '#BFE3FA', crystalDeep: '#7FB8E6',
  gems: ['#E0405A', '#9B6BE0', '#36C08C', '#F2B233'],
  bush: '#4E9A4A', bushLight: '#62AE55', stone: '#A39D93', stoneDark: '#8E887F',
  bedStone: '#B8AE98', bedStoneDark: '#8F8878', bedPebble: '#CFC3A6', weed: '#4E8F4C', weedLight: '#6BA65A',
  flowers: ['#F7F3E8', '#F4CF4A', '#E98BB0', '#B9A2E8'], lily: '#5FA85A', lilyFlower: '#F2B6CF', reed: '#7D9B4A', reedTop: '#8A6A3E',
} as const;

function pine(x: number, z: number, s: number, seed: number): BufferGeometry[] {
  const ry = seed * 2.4;
  return [
    coloured(at(new CylinderGeometry(1.0 * s, 1.3 * s, 4 * s, 5), x, 2 * s, z, ry), PAL.trunk, 0, 0.4),
    coloured(at(new ConeGeometry(6.2 * s, 8.5 * s, 7), x, 3.2 * s + 4.25 * s, z, ry), PAL.leafLow),
    coloured(at(new ConeGeometry(4.6 * s, 7.5 * s, 7), x, 8.2 * s + 3.75 * s, z, ry + 0.4), PAL.leaf),
  ];
}

function fruitTree(x: number, z: number, s: number, seed: number): BufferGeometry[] {
  const cy = 8.6 * s, cr = 5.2 * s;
  const parts = [
    coloured(at(new CylinderGeometry(0.9 * s, 1.2 * s, 5 * s, 5), x, 2.5 * s, z), PAL.trunk, 0, 0.4),
    coloured(at(new IcosahedronGeometry(cr, 1), x, cy, z, seed, 1, 0.86, 1), PAL.orchardLeaf),
  ];
  // Seven apples sitting on the canopy's skin, spread over the half that faces the viewer (the camera looks
  // from +z and above), so all of them read.
  const APPLES = [[-0.75, 0.25], [-0.3, 0.55], [0.2, 0.15], [0.6, 0.5], [0.85, -0.05], [-0.55, -0.25], [0.15, -0.35]] as const;
  APPLES.forEach(([u, w], i) => {
    const a = u * 1.25 + Math.PI / 2 + (hash2(seed, i) - 0.5) * 0.25; // around the trunk, centred on the front
    const e = w * 0.9 + (hash2(i, seed) - 0.5) * 0.15; // up or down the crown
    const dx = Math.cos(a) * Math.cos(e), dz = Math.sin(a) * Math.cos(e), dy = Math.sin(e) * 0.86;
    const rr = cr * 0.98;
    parts.push(coloured(at(new IcosahedronGeometry(1.0 * s, 0), x + dx * rr, cy + dy * rr, z + dz * rr, i), i % 3 === 2 ? PAL.fruitDeep : PAL.fruit, 0.6, 0.3));
  });
  return parts;
}

/** A deer facing left (as the SVG game mark does), or right when flipped. */
function deer(x: number, z: number, s: number, flip: boolean): BufferGeometry[] {
  const S = 0.95 * s;
  const m = flip ? -1 : 1;
  const p: BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, px: number, py: number, pz: number, colour: string, rz = 0): void => {
    const g = new BoxGeometry(w * S, h * S, d * S);
    g.rotateZ(rz * m);
    g.translate(x + px * S * m, py * S, z + pz * S);
    p.push(coloured(g, colour, 0, 0.35));
  };
  for (const [lx, lz] of [[-3.6, -1.3], [3.6, -1.3], [-3.6, 1.3], [3.6, 1.3]] as const) box(1.2, 6, 1.2, lx, 3, lz, PAL.deerLeg);
  const body = new IcosahedronGeometry(1, 1);
  body.scale(6.2 * S, 3.1 * S, 2.8 * S);
  body.translate(x, 7.4 * S, z);
  p.push(coloured(body, PAL.deer));
  const belly = new IcosahedronGeometry(1, 1);
  belly.scale(4.2 * S, 1.4 * S, 2.3 * S);
  belly.translate(x + 0.3 * S * m, 5.6 * S, z + 0.6 * S);
  p.push(coloured(belly, PAL.deerBelly, 0, 0.2));
  box(2.2, 6, 2, -5.6, 10.6, 0, PAL.deer, -0.55); // neck
  const head = new IcosahedronGeometry(1, 1);
  head.scale(2.8 * S, 2.0 * S, 1.9 * S);
  head.translate(x - 8.6 * S * m, 13.4 * S, z);
  p.push(coloured(head, PAL.deer));
  box(1.2, 1.1, 1.1, -11.2, 12.8, 0, PAL.nose);
  for (const sz of [-1, 1]) {
    box(0.6, 5, 0.6, -8.4, 17.4, 0.9 * sz, PAL.antler, 0.25);
    box(0.5, 2.6, 0.5, -9.8, 18.6, 0.9 * sz, PAL.antler, 0.9);
    box(0.5, 2.4, 0.5, -7.4, 18.8, 0.9 * sz, PAL.antler, -0.6);
  }
  box(1.4, 1.6, 1.2, 6.4, 9.4, 0, PAL.deerBelly, 0.5); // tail
  return p;
}

/** Ore: dark rocks with pale crystals. The seed picks the arrangement, so ore tiles differ. */
function oreCluster(x: number, z: number, s: number, seed: number, flip: boolean): BufferGeometry[] {
  const p: BufferGeometry[] = [];
  const m = flip ? -1 : 1;
  const k = Math.floor(hash2(seed, 3.3) * 4);
  const rock = (r: number, px: number, py: number, pz: number, colour: string, rot: number): void => {
    const g = new DodecahedronGeometry(r * s, 0);
    g.rotateX(rot); g.rotateY(rot * 1.7 + seed);
    g.scale(1, 0.75, 1);
    g.translate(x + px * s * m, py * s, z + pz * s);
    p.push(coloured(g, colour));
  };
  rock(5.2, -1, 3.2, 0, PAL.oreDark, 0.4 + k);
  rock(3.6, 5, 2.2, 2, PAL.oreMid, 1.1 + k);
  if (k !== 1) rock(3.0, -6, 1.8, 2.5, PAL.oreMid, 2.0 + k);
  if (k === 2) rock(2.4, 2, 1.5, 5, PAL.oreDark, 0.7);
  const crystal = (h: number, px: number, pz: number, tilt: number, colour: string): void => {
    const g = new OctahedronGeometry(1, 0);
    g.scale(1.5 * s, h * s, 1.5 * s);
    g.rotateZ(tilt * m);
    g.translate(x + px * s * m, (4.5 + h * 0.7) * s, z + pz * s);
    p.push(coloured(g, colour, 1, 0.35));
  };
  crystal(4.6, -1.5, 1.5, 0.25, PAL.crystal);
  crystal(3.4, 1.8, 2.5, -0.4, PAL.crystalDeep);
  if (k !== 3) crystal(2.6, -4.2, 3.2, 0.6, PAL.crystal);
  if (k >= 2) crystal(2.2, 4.4, 4.0, -0.7, PAL.crystal);
  return p;
}

/**
 * Jewels: a fan of large six-sided crystals (ruby, amethyst, emerald, amber) growing straight from the ground, glossy,
 * with no rock under them, so they never read as ore (dark rock, small pale crystals). The seed turns the colours.
 */
function gemCluster(x: number, z: number, s: number, seed: number, flip: boolean): BufferGeometry[] {
  const p: BufferGeometry[] = [];
  const m = flip ? -1 : 1;
  // [x, z, height, radius, lean toward x, lean toward z, colour]
  const C: readonly (readonly [number, number, number, number, number, number, number])[] = [
    [0, 0, 11, 1.9, 0.05, 0.05, 0], [-2.6, 0.8, 8, 1.6, 0.42, 0.1, 1], [2.4, 1.2, 8.6, 1.6, -0.4, 0.15, 2],
    [-1.2, 2.6, 5.6, 1.3, 0.25, -0.35, 3], [1.6, 2.9, 5, 1.2, -0.3, -0.4, 1], [-4, 2.6, 4.2, 1.1, 0.7, -0.2, 2],
    [3.9, -0.6, 5.2, 1.2, -0.65, 0.2, 0],
  ];
  const turn = Math.floor(hash2(seed, 5.1) * 4);
  C.forEach(([px, pz, h, rad, tx, tz, k], i) => {
    const colour = PAL.gems[(k + turn) % 4]!;
    const prism = new CylinderGeometry(rad * s, rad * 1.05 * s, h * s, 6);
    prism.translate(0, (h * s) / 2, 0);
    const tip = new ConeGeometry(rad * s, rad * 1.8 * s, 6);
    tip.translate(0, h * s + rad * 0.9 * s, 0);
    for (const g of [prism, tip]) {
      g.rotateY(seed * 3 + i);
      g.rotateZ(-tx * 1.5 * m);
      g.rotateX(tz * 1.5);
      g.translate(x + px * 1.7 * s * m, -0.6 * s, z + pz * 1.7 * s);
      p.push(coloured(g, colour, 1, 0.3));
    }
  });
  return p;
}

/**
 * Fade a harvested resource's parts (rules 8), as the SVG draws its mark at 0.45 opacity over the ground: the colour
 * goes most of the way to the ground's own tone, the glint dims and the outline thins. Opaque, so the merged prop
 * mesh and its outline pass need no transparency.
 */
const GROUND_TONE: Record<string, string> = { field: '#A3D170', forest: '#6EA854', mountain: '#C7BFAB', water: '#87CCED' };
const FADE = 0.55; // 1 - the SVG mark's 0.45 opacity
function fade(parts: BufferGeometry[], terrain: string): BufferGeometry[] {
  const tone = new Color(GROUND_TONE[terrain] ?? GROUND_TONE.field);
  for (const g of parts) {
    const c = g.attributes.color as Float32BufferAttribute;
    for (let i = 0; i < c.count; i++) {
      c.setXYZ(i, c.getX(i) + (tone.r - c.getX(i)) * FADE, c.getY(i) + (tone.g - c.getY(i)) * FADE, c.getZ(i) + (tone.b - c.getZ(i)) * FADE);
    }
    const gl = g.attributes.aGloss as Float32BufferAttribute;
    for (let i = 0; i < gl.count; i++) if (gl.getX(i) > 0) gl.setX(i, gl.getX(i) * 0.3);
    const o = g.attributes.aOut as Float32BufferAttribute;
    for (let i = 0; i < o.count; i++) o.setXYZ(i, o.getX(i) * 0.4, o.getY(i) * 0.4, o.getZ(i) * 0.4);
  }
  return parts;
}

/**
 * A Matterhorn: four sharp ridges (front, back, left, right), so the two faces that look at the viewer split
 * into a lit left face and a shaded right one; steep, slightly hollow faces and maybe a shoulder on one ridge. The
 * summit stands straight above the centre of the base. Snow covers the upper faces with a broken line (or only a
 * cap, or none, on the smaller peaks). Vertex coloured per face.
 */
function matterhorn(cx: number, cz: number, y0: number, P: Peak, seed: number): BufferGeometry[] {
  const { h: H, b: B, rot, shoulder } = P;
  const RINGS = [0, 0.2, 0.38, 0.54, 0.68, 0.8, 0.92];
  const K = 4;
  let n = 0;
  const rnd = (): number => hash2(seed * 17.3 + n, ++n * 0.61 + seed);
  type V3 = [number, number, number];
  const rings = RINGS.map((t, i) => {
    const r = B * Math.pow(1 - t, 1.08);
    const ring: V3[] = [];
    for (let j = 0; j < 2 * K; j++) {
      const a = rot + (j * Math.PI) / K;
      const ridge = j % 2 === 0;
      let rr = r * (ridge ? 1 : 0.62) * (0.88 + 0.24 * rnd());
      if (ridge && j / 2 === shoulder && t > 0.3 && t < 0.62) rr *= 1.3;
      const y = i === 0 ? -2 : t * H * (0.96 + 0.08 * rnd()) + (ridge ? 0 : -1.2);
      ring.push([rr * Math.cos(a), y, rr * Math.sin(a)]);
    }
    return ring;
  });
  const apex: V3 = [0, H, 0]; // the summit, straight above the base centre
  const tris: [V3, V3, V3, number, number][] = [];
  const outward = (A: V3, Bv: V3, C: V3): [V3, V3, V3] => {
    const ux = Bv[0] - A[0], uy = Bv[1] - A[1], uz = Bv[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (A[0] + Bv[0] + C[0]) / 3, mz = (A[2] + Bv[2] + C[2]) / 3;
    return nx * mx + nz * mz + ny * 0.2 >= 0 ? [A, Bv, C] : [A, C, Bv];
  };
  for (let i = 0; i + 1 < rings.length; i++) {
    const lo = rings[i]!, hi = rings[i + 1]!;
    for (let j = 0; j < 2 * K; j++) {
      const j2 = (j + 1) % (2 * K);
      tris.push([...outward(lo[j]!, lo[j2]!, hi[j2]!), j, i], [...outward(lo[j]!, hi[j2]!, hi[j]!), j, i]);
    }
  }
  const last = rings[rings.length - 1]!;
  for (let j = 0; j < 2 * K; j++) tris.push([...outward(last[j]!, last[(j + 1) % (2 * K)]!, apex), j, RINGS.length]);

  const pos: number[] = [], col: number[] = [], gl: number[] = [], od: number[] = [];
  const c = new Color();
  const d = new Vector3();
  // Tones go by face of the pyramid (the slot between two ridge lines), not by triangle, so each face reads as
  // one painted plane. The snow line steps per face and band: a broken line, lower on the faces that look up.
  // An ore mountain's rock is darker and rust-tinted, so the tile reads as ore at a glance.
  const slotTone = Array.from({ length: 2 * K }, () => (rnd() < 0.5 ? (P.ore ? PAL.oreRockLight : PAL.rockLight) : (P.ore ? PAL.oreRockDark : PAL.rockDark)));
  const snowRing = Array.from({ length: 2 * K }, () => (P.snow === 2 ? 3 + Math.floor(rnd() * 1.6) : P.snow === 1 ? 6 : 99));
  for (const [A, Bv, C, j, ring] of tris) {
    const ux = Bv[0] - A[0], uy = Bv[1] - A[1], uz = Bv[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nyN = ny / Math.hypot(nx, ny, nz);
    const snow = ring >= snowRing[j]! - (nyN > 0.5 ? 1 : 0);
    c.set(snow ? PAL.snow : ring === 0 ? PAL.scree : slotTone[j]!);
    for (const V of [A, Bv, C]) {
      pos.push(cx + V[0], y0 + V[1], cz + V[2]);
      col.push(c.r, c.g, c.b);
      gl.push(-1); // rock: harder light bands (see propFrag)
      // Outline: push out from the peak's axis at that height, and up at the summit.
      const t = Math.max(0, V[1]) / H;
      d.set(V[0], (t - 0.55) * 6, V[2]).normalize();
      od.push(d.x, d.y, d.z);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('aGloss', new Float32BufferAttribute(gl, 1));
  g.setAttribute('aOut', new Float32BufferAttribute(od, 3));
  return [g];
}

/**
 * water3d: one tile's half of a mountain ridge (ridges.ts), as faceted rock: each section a seven point profile (foot,
 * low shoulder, high shoulder, crest and back down), joined section to section. The faces alternate light and dark
 * rock as a peak's do, snow above the snow line, scree at the foot. The half's open end at its peak is capped (it lies
 * inside the peak's rock); the crossing end meets the neighbour's half exactly, so it needs none.
 */
const PROFILE: readonly [number, number][] = [[-1, -2], [-0.74, 0.28], [-0.38, 0.7], [0.03, 1], [0.4, 0.68], [0.76, 0.26], [1, -2]];
function ridgeRock(half: RidgeHalf, ore: boolean): BufferGeometry {
  const pos: number[] = [], col: number[] = [], gl: number[] = [], od: number[] = [];
  const c = new Color();
  const snowLine = 0.5 * half.peak;
  type P = [number, number, number, number, number, number]; // x, y, z, and the outline's push
  const ring = half.sections.map((s): P[] => {
    const px = -s.tz, pz = s.tx; // across the ridge
    // A little unevenness on the shoulders, from the section's place, so both halves agree at the crossing.
    const j = hash2(s.x * 0.37, s.z * 0.53);
    return PROFILE.map(([l, y], i) => {
      const wob = i > 0 && i < PROFILE.length - 1 ? 1 + 0.16 * (hash2(j * 9 + i, s.x * 0.11) - 0.5) : 1;
      const lat = l * s.w * wob, yy = y < 0 ? y : y * s.h * (i === 3 ? 1 : wob);
      const ol = Math.hypot(l, y * 0.6) || 1;
      return [s.x + px * lat, yy, s.z + pz * lat, (px * l) / ol, (y * 0.6) / ol, (pz * l) / ol];
    });
  });
  // Each triangle is wound to face out: along `out` when given (the cap), else along its corners' outline push.
  const tri = (a: P, b: P, d: P, face: number, band: number, out?: [number, number, number]): void => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const o = out ?? [a[3] + b[3] + d[3], a[4] + b[4] + d[4], a[5] + b[5] + d[5]];
    if (nx * o[0] + ny * o[1] + nz * o[2] < 0) [b, d] = [d, b];
    const my = (a[1] + b[1] + d[1]) / 3;
    const tone = ore ? (face % 2 ? PAL.oreRockLight : PAL.oreRockDark) : (face % 2 ? PAL.rockLight : PAL.rockDark);
    c.set(my > snowLine ? PAL.snow : band === 0 || band === PROFILE.length - 2 ? PAL.scree : tone);
    for (const v of [a, b, d]) { pos.push(v[0], v[1], v[2]); col.push(c.r, c.g, c.b); gl.push(-1); od.push(v[3], v[4], v[5]); }
  };
  for (let i = 0; i + 1 < ring.length; i++) {
    const A = ring[i]!, B = ring[i + 1]!;
    // Tones go by stretch of the ridge and by side, so each run of rock reads as one painted plane.
    const stretch = Math.floor(hash2(half.sections[i]!.x * 0.05, half.sections[i]!.z * 0.05) * 4 + i / 3);
    for (let k = 0; k + 1 < PROFILE.length; k++) {
      const face = stretch + (k < 3 ? 0 : 1);
      tri(A[k]!, B[k]!, B[k + 1]!, face, k);
      tri(A[k]!, B[k + 1]!, A[k + 1]!, face, k);
    }
  }
  // Cap the start, inside the peak.
  const first = ring[0]!, s0 = half.sections[0]!, s1 = half.sections[1]!;
  const back: [number, number, number] = [s0.x - s1.x, 0, s0.z - s1.z];
  for (let k = 1; k + 1 < PROFILE.length; k++) tri(first[0]!, first[k + 1]!, first[k]!, 0, 1, back);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('aGloss', new Float32BufferAttribute(gl, 1));
  g.setAttribute('aOut', new Float32BufferAttribute(od, 3));
  return g;
}

// A wild tuft: a clump of blades leaning every way. About half are short green grass; the rest are wheat
// gone wild, taller straw-gold stalks with ears, a few green blades still at their foot. No rows, no plots.
function tuft(x: number, y: number, z: number, size: number, seed: number, grassOnly = false): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const wheat = !grassOnly && seed > 0.45;
  const nb = 5 + Math.floor(hash2(seed * 3, 1) * 4);
  const euler = new Euler();
  const up = new Vector3(0, 1, 0);
  for (let i = 0; i < nb; i++) {
    const hs = hash2(seed * 31 + i, i * 3.3);
    const stalk = wheat && i > 1;
    const L = (stalk ? 4.5 + 4.5 * hs : 2.2 + 2.6 * hs) * size;
    const lean = stalk ? 0.55 : 1.0;
    const ax = (hash2(i, seed * 9) - 0.5) * lean, az = (hash2(seed * 5, i * 1.7) - 0.5) * lean;
    const bx = x + (hash2(i * 2.1, seed) - 0.5) * 2.6 * size, bz = z + (hash2(seed, i * 4.3) - 0.5) * 1.8 * size;
    const g = new ConeGeometry((stalk ? 0.55 : 0.8) * size, L, 3, 1, true);
    g.translate(0, L / 2, 0);
    g.rotateX(az); g.rotateZ(ax); g.rotateY(seed * 6 + i);
    g.translate(bx, y - 0.3, bz);
    const colour = stalk ? PAL.straw[(i + Math.floor(seed * 7)) % 3]! : PAL.grass[(i + Math.floor(seed * 5)) % 3]!;
    parts.push(coloured(g, colour, 0, 0.12));
    if (stalk && hash2(i * 3.7, seed * 2) > 0.2) {
      const tip = new Vector3(0, L, 0).applyEuler(euler.set(az, 0, ax, 'XYZ'));
      tip.applyAxisAngle(up, seed * 6 + i);
      const ear = new OctahedronGeometry(1, 0);
      ear.scale(0.85 * size, 2.3 * size, 0.85 * size);
      ear.rotateX(az); ear.rotateZ(ax);
      ear.translate(bx + tip.x, y - 0.3 + tip.y + 1.0 * size, bz + tip.z);
      parts.push(coloured(ear, PAL.ear, 0, 0.15));
    }
  }
  return parts;
}

/** The small details of open fields and water. */
function bit(b: Bit, x: number, y: number, z: number, deep = 0): BufferGeometry[] {
  const s = b.s;
  switch (b.kind) {
    case 'grass':
      return tuft(x, y, z, s, b.seed, true);
    case 'bush': {
      const out: BufferGeometry[] = [];
      for (let i = 0; i < 3; i++) {
        const a = b.seed * 6 + i * 2.1;
        const g = new IcosahedronGeometry((2.6 - i * 0.5) * s, 0);
        g.scale(1, 0.8, 1);
        g.rotateY(a);
        g.translate(x + Math.cos(a) * 2 * s, y + (2 - i * 0.3) * s, z + Math.sin(a) * 1.4 * s);
        out.push(coloured(g, i === 1 ? PAL.bushLight : PAL.bush, 0, 0.35));
      }
      return out;
    }
    case 'stone': {
      const g = new DodecahedronGeometry(2.4 * s, 0);
      g.rotateX(b.seed * 3); g.rotateY(b.seed * 5);
      g.scale(1.2, 0.6, 1);
      g.translate(x, y + 0.8 * s, z);
      return [coloured(g, b.seed > 0.5 ? PAL.stone : PAL.stoneDark, 0, 0.3)];
    }
    case 'flower': {
      const g = new OctahedronGeometry(0.75, 0);
      g.translate(x, y + 1.4, z);
      const stem = new ConeGeometry(0.25, 1.6, 3, 1, true);
      stem.translate(x, y + 0.6, z);
      return [coloured(stem, PAL.grass[0], 0, 0.08), coloured(g, PAL.flowers[Math.floor(b.seed * 4) % 4]!, 0, 0.15)];
    }
    case 'lily': {
      const g = new CylinderGeometry(2.4 * s, 2.4 * s, 0.4, 7);
      g.translate(x, WATER_Y + 0.2, z);
      const out = [coloured(g, PAL.lily, 0, 0.2)];
      if (b.seed > 0.5) {
        const f = new OctahedronGeometry(0.9 * s, 0);
        f.translate(x + 0.6 * s, WATER_Y + 0.9, z - 0.4 * s);
        out.push(coloured(f, PAL.lilyFlower, 0, 0.15));
      }
      return out;
    }
    case 'reed': {
      const out: BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) {
        // Rooted on the bed, seen through the clear water, and standing out of it as before.
        const L = (4 + 3 * hash2(b.seed, i)) * s + deep;
        const g = new ConeGeometry(0.35 * s, L, 3, 1, true);
        g.translate(0, L / 2, 0);
        g.rotateZ((hash2(i, b.seed) - 0.5) * 0.4);
        g.translate(x + (i - 1.5) * 1.1 * s, WATER_Y - deep, z + (hash2(b.seed * 2, i) - 0.5) * 2);
        out.push(coloured(g, PAL.reed, 0, 0.1));
        if (i % 2 === 0) {
          const top = new CylinderGeometry(0.45 * s, 0.45 * s, 1.6 * s, 4);
          top.translate(x + (i - 1.5) * 1.1 * s, WATER_Y - deep + L * 0.8, z + (hash2(b.seed * 2, i) - 0.5) * 2);
          out.push(coloured(top, PAL.reedTop, 0, 0.12));
        }
      }
      return out;
    }
    case 'islet': {
      const out: BufferGeometry[] = [];
      for (const [dx, dz, r] of [[0, 0, 3.6], [3.2, 1.4, 2.4], [-2.6, 1.8, 2.0]] as const) {
        const g = new DodecahedronGeometry(r * s, 0);
        g.rotateY(b.seed * 4 + dx);
        g.scale(1.1, 0.55, 1);
        g.translate(x + dx * s, WATER_Y + 0.6, z + dz * s);
        out.push(coloured(g, r > 3 ? PAL.stone : PAL.stoneDark, 0, 0.3));
      }
      // The islet stands on the bed: its foot of rock shows through the clear water.
      const foot = new CylinderGeometry(3.4 * s, 4.6 * s, deep + 0.4, 6);
      foot.rotateY(b.seed * 3);
      foot.translate(x + 0.6 * s, WATER_Y - deep / 2, z + 0.6 * s);
      out.push(coloured(foot, PAL.stoneDark, 0, 0));
      return out;
    }
  }
}

/** The bed's stones, weeds and pebbles, under the water: no outline, so the surface lies clean over them. */
function bedBit(b: BedBit, x: number, y: number, z: number): BufferGeometry[] {
  const s = b.s;
  if (b.kind === 'rock') {
    const g = new DodecahedronGeometry(2.2 * s, 0);
    g.rotateX(b.seed * 3); g.rotateY(b.seed * 5);
    g.scale(1.25, 0.55, 1);
    g.translate(x, y + 0.5 * s, z);
    return [coloured(g, b.seed > 0.5 ? PAL.bedStone : PAL.bedStoneDark, 0, 0)];
  }
  if (b.kind === 'pebbles') {
    const out: BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const a = b.seed * 9 + i * 1.9, d = (1 + 1.6 * hash2(i, b.seed)) * s;
      const g = new DodecahedronGeometry((0.7 + 0.4 * hash2(b.seed, i)) * s, 0);
      g.scale(1.2, 0.6, 1);
      g.translate(x + Math.cos(a) * d, y + 0.25, z + Math.sin(a) * d * 0.8);
      out.push(coloured(g, i % 2 ? PAL.bedStone : PAL.bedPebble, 0, 0));
    }
    return out;
  }
  const out: BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const L = (2.6 + 2.6 * hash2(b.seed * 3, i)) * s;
    const g = new ConeGeometry(0.55 * s, L, 3, 1, true);
    g.translate(0, L / 2, 0);
    g.rotateZ((hash2(i, b.seed) - 0.5) * 0.9);
    g.rotateX((hash2(b.seed, i * 2) - 0.5) * 0.6);
    g.translate(x + (hash2(i * 1.3, b.seed) - 0.5) * 3 * s, y - 0.2, z + (hash2(b.seed * 2, i) - 0.5) * 2 * s);
    out.push(coloured(g, i % 2 ? PAL.weed : PAL.weedLight, 0, 0));
  }
  return out;
}

function propsFor(setup: Setup, c: { x: number; z: number }, height: (lx: number, lz: number) => number, bed: (lx: number, lz: number) => number): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const { q, r } = setup;
  const seed = hash2(q, r) * 6.28;
  // Everything stands on the ground's own height, so hills and foothills carry it.
  const put = (parts: BufferGeometry[], lx: number, lz: number): void => {
    const y = height(lx, lz);
    if (y) for (const g of parts) g.translate(0, y, 0);
    out.push(...parts);
  };
  // Every prop and tuft stands for the tile's resource; a harvested one is drawn faded (rules 8).
  const res = (parts: BufferGeometry[]): BufferGeometry[] => (setup.faded ? fade(parts, setup.t.terrain) : parts);
  setup.trees.forEach(([x, z, s], i) => put(pine(c.x + x, c.z + z, s * 1.08, seed + i), x, z));
  for (const p of setup.props as Prop[]) {
    if (p.kind === 'orchard') put(res(fruitTree(c.x + p.x, c.z + p.z, p.s, p.seed)), p.x, p.z);
    if (p.kind === 'deer') put(res(deer(c.x + p.x, c.z + p.z, p.s, p.flip)), p.x, p.z);
    // Fish swim under the surface on the figures' canvas (water.ts): nothing here.
    if (p.kind === 'ore' || p.kind === 'jewels') {
      const parts = res((p.kind === 'ore' ? oreCluster : gemCluster)(c.x + p.x, c.z + p.z, p.s, p.seed, p.flip));
      if (p.y === undefined) put(parts, p.x, p.z);
      else { for (const g of parts) g.translate(0, p.y - 1.2 * p.s, 0); out.push(...parts); } // set into the slope
    }
  }
  setup.peaks.forEach((p, i) => out.push(...matterhorn(c.x + p.x, c.z + p.z, 0, p, seed + i * 3.7)));
  for (const half of setup.ridges) {
    out.push(ridgeRock(half, setup.peaks[0]?.ore === true));
    const t = half.tooth;
    if (t !== null) out.push(...matterhorn(t.x, t.z, 0, { x: 0, z: 0, h: t.h, b: t.b, rot: t.rot, shoulder: -1, snow: t.h > 0.5 * half.peak ? 1 : 0 }, t.rot * 3.1));
  }
  if (setup.town !== null) out.push(...townParts(setup.town, c.x, c.z, height));
  if (setup.works !== null) out.push(...worksParts(setup.works, c.x, c.z, hash2(q * 1.7, r * 0.9)));
  if (setup.building !== null) out.push(...buildingParts(setup.building, c.x, c.z, height, setup.t.owner ?? null));
  if (setup.chest !== null) out.push(...chestPropParts(setup.chest, c.x, c.z, height(setup.chest.x, setup.chest.z)));
  for (const [x, z, size, sd] of setup.tufts) out.push(...res(tuft(c.x + x, height(x, z), c.z + z, size, sd)));
  for (const b of setup.bits) out.push(...bit(b, c.x + b.x, setup.t.terrain === 'water' ? 0 : height(b.x, b.z), c.z + b.z, bed(b.x, b.z)));
  for (const b of setup.bed) out.push(...bedBit(b, c.x + b.x, WATER_Y - bed(b.x, b.z), c.z + b.z));
  return out;
}
