// water3d: the water's clear surface, and the fish swimming under it. Part of the lazy 3D chunk.
//
// The surface is one mesh for the whole map (six triangles a tile), drawn see-through on the terrain canvas over the
// bed (build.ts), so the bed's sand, pebbles and weeds show through, more tinted the deeper they lie. The foam and the
// depth are worked out per pixel from each tile's edges, so the surface needs no more triangles.
//
// The fish of a fish tile swim on the figures' canvas, which alone redraws in the board's ambient loop: one mesh for
// every fish on the map, posed in the vertex shader from the water's motion clock (waterLayout.ts fishAt, line for
// line), so a frame of fish costs a draw call and no geometry upload. Over the terrain canvas they are tinted as the
// surface would tint them, swells and all. What stands on the tiles in front of a fish tile (a peak, a tree, a town)
// is drawn there first as depth alone, so it still hides the fish behind it; then the depth is cleared, so the unit
// figures draw over everything as before. Without the figures' canvas the fish stand still on the terrain canvas,
// under the surface itself.
import {
  BufferGeometry, CustomBlending, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, OneMinusSrcAlphaFactor,
  ShaderMaterial, SrcAlphaFactor,
} from 'three';
import type { WebGLRenderer } from 'three';
import type { HexKey } from '../../engine';
import type { GlMap } from './input';
import { centre, COS_E, EDGE_NB, INR, parse, R, SQUASH, WATER_Y } from './layout';
import { LIGHT, NOISE, WATER } from './shaders';
import { BED_DEPTH, BED_MIN, BED_REACH, FISH_PERIOD, fishSpots, shallowEdges } from './waterLayout';
import type { FishSpot } from './waterLayout';

const hexId = (q: number, r: number): number => (q + 512) * 1024 + (r + 512);
const mask = (edges: readonly number[]): number => edges.reduce((m, e) => m + (1 << e), 0);

// The distance from a tile point to the nearest of the edges in a bit mask (60 when none), as layout.ts distToEdges.
const EDGES = /* glsl */ `
const float INR = ${INR.toFixed(4)};
float edgesDist(vec2 l, float m) {
  float d = 60.0, bit = 1.0;
  for (int e = 0; e < 6; e++) {
    bool on = mod(floor(m / bit + 0.01), 2.0) > 0.5;
    bit *= 2.0;
    if (!on) continue;
    float a = float(e) * 1.0471976;
    d = min(d, INR - dot(l, vec2(cos(a), sin(a))));
  }
  return d;
}
// The water's depth over the bed, as waterLayout.ts bedDepthFn without its ripples.
float bedDepth(vec2 l, float shallow) {
  float f = shallow < 0.5 ? 1.0 : smoothstep(0.0, ${BED_REACH.toFixed(1)}, edgesDist(l, shallow));
  return ${BED_MIN.toFixed(3)} + ${(BED_DEPTH - BED_MIN).toFixed(3)} * f;
}
`;

// ---------------------------------------------------------------------------------------------------------------
// The surface

const surfaceVert = /* glsl */ `
attribute vec2 aLocal; attribute vec2 aMask; attribute float aVeil;
varying vec2 vLocal; varying vec2 vMask; varying vec3 vWorld; varying float vVeil;
void main() {
  vLocal = aLocal; vMask = aMask; vVeil = aVeil * 0.3;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const surfaceFrag = /* glsl */ `
${NOISE}
${LIGHT}
${WATER}
${EDGES}
varying vec2 vLocal; varying vec2 vMask; varying vec3 vWorld; varying float vVeil;
void main() {
  vec4 w = waterSurface(vWorld.xz, edgesDist(vLocal, vMask.x), bedDepth(vLocal, vMask.y));
  // Lit as the old opaque water was: the full light band, facing up.
  gl_FragColor = vec4(finish(lightUp(w.rgb, 1.0), vVeil), w.a);
}`;

/** The water's surface over every water tile on the map: a flat hexagon a tile, at the water's height. */
export function surfaceGeometry(map: GlMap): BufferGeometry {
  const pos: number[] = [], local: number[] = [], masks: number[] = [], hex: number[] = [], index: number[] = [];
  let n = 0;
  for (const k of Object.keys(map.tiles).sort()) {
    const t = map.tiles[k]!;
    if (t.terrain !== 'water' || t.city) continue;
    const { q, r } = parse(k);
    const c = centre(q, r);
    // Foam where the water meets land, as the ground's shore: a neighbour that is drawn and is not water.
    const shore: number[] = [];
    EDGE_NB.forEach(([dq, dr], e) => {
      const nt = map.tiles[`${q + dq},${r + dr}`];
      if (nt !== undefined && (nt.terrain !== 'water' || nt.city)) shore.push(e);
    });
    const m: [number, number] = [mask(shore), mask(shallowEdges(map, k))];
    const corners: [number, number][] = [[0, 0]];
    for (let i = 0; i < 6; i++) { const a = ((30 + 60 * i) * Math.PI) / 180; corners.push([R * Math.cos(a), R * Math.sin(a)]); }
    for (const [lx, lz] of corners) {
      pos.push(c.x + lx, WATER_Y, c.z + lz);
      local.push(lx, lz);
      masks.push(...m);
      hex.push(q, r);
    }
    for (let i = 0; i < 6; i++) index.push(n, n + 1 + ((i + 1) % 6), n + 1 + i);
    n += 7;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aLocal', new Float32BufferAttribute(local, 2));
  g.setAttribute('aMask', new Float32BufferAttribute(masks, 2));
  g.setAttribute('aHex', new Float32BufferAttribute(hex, 2));
  g.setIndex(index);
  return g;
}

export interface WaterSurface {
  readonly mesh: Mesh;
  setMap(map: GlMap): void;
  triangles(): number;
  dispose(): void;
}

/** The surface: see-through, drawn after everything opaque on the terrain canvas, writing no depth. */
export function createSurface(shared: Record<string, { value: unknown }>): WaterSurface {
  const mat = new ShaderMaterial({ uniforms: shared, vertexShader: surfaceVert, fragmentShader: surfaceFrag, transparent: true, depthWrite: false });
  const mesh = new Mesh(new BufferGeometry(), mat);
  mesh.frustumCulled = false;
  return {
    mesh,
    setMap(map) {
      mesh.geometry.dispose();
      mesh.geometry = surfaceGeometry(map);
    },
    triangles: () => (mesh.geometry.index?.count ?? 0) / 3,
    dispose() { mesh.geometry.dispose(); mat.dispose(); },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Fish

/** A fish's body in its own frame (x forward to the nose, y up, z to its left), at size 1: [x, height, width]. */
const RINGS: readonly [number, number, number][] = [[2.8, 0.72, 0.5], [1.5, 1.12, 0.74], [0, 1.22, 0.78], [-1.5, 0.92, 0.6], [-2.7, 0.48, 0.32], [-3.3, 0.24, 0.16]];
const NOSE = 3.6;
const AROUND = 6;
const PAL = { back: '#C9702F', side: '#E08E42', belly: '#F6CD8E', fin: '#B35F25', eye: '#2A1A10' } as const;

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** One fish's triangles in its frame: corners, flat normals and colours, flat lists. */
export function fishBody(): { pos: number[]; nor: number[]; col: number[] } {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  type V = [number, number, number];
  const tone = (v: V): [number, number, number] => hexRgb(v[1] > 0.35 ? PAL.back : v[1] < -0.3 ? PAL.belly : PAL.side);
  const tri = (a: V, b: V, c: V, colour?: string): void => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const mid: V = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const rgb = colour !== undefined ? hexRgb(colour) : tone(mid);
    for (const v of [a, b, c]) { pos.push(...v); nor.push(nx, ny, nz); col.push(...rgb); }
  };
  const ring = (i: number): V[] => {
    const [x, h, w] = RINGS[i]!;
    return Array.from({ length: AROUND }, (_, j) => {
      const a = (j / AROUND) * Math.PI * 2 + Math.PI / AROUND;
      return [x, Math.sin(a) * h, Math.cos(a) * w] as V;
    });
  };
  // The nose, then the body ring to ring (outward winding: the shader draws both sides, but the light needs outward
  // normals), then the tail fin, a V, and a dorsal fin.
  const nose: V = [NOSE, 0.05, 0];
  const r0 = ring(0);
  for (let j = 0; j < AROUND; j++) tri(nose, r0[(j + 1) % AROUND]!, r0[j]!);
  for (let i = 0; i + 1 < RINGS.length; i++) {
    const a = ring(i), b = ring(i + 1);
    for (let j = 0; j < AROUND; j++) {
      const j2 = (j + 1) % AROUND;
      tri(a[j]!, a[j2]!, b[j2]!);
      tri(a[j]!, b[j2]!, b[j]!);
    }
  }
  const tail = ring(RINGS.length - 1);
  const end: V = [-3.5, 0, 0];
  for (let j = 0; j < AROUND; j++) tri(end, tail[j]!, tail[(j + 1) % AROUND]!);
  tri([-3.1, 0.1, 0], [-5.4, 1.9, 0], [-4.7, 0, 0], PAL.fin);
  tri([-3.1, -0.1, 0], [-4.7, 0, 0], [-5.4, -1.7, 0], PAL.fin);
  tri([1.2, 1.05, 0], [-1.6, 0.85, 0], [-0.8, 2.0, 0], PAL.fin);
  // Two eyes: a small dark facet each side of the head.
  for (const s of [1, -1]) tri([2.55, 0.42, 0.56 * s], [2.15, 0.3, 0.68 * s], [2.2, 0.62, 0.62 * s], PAL.eye);
  return { pos, nor, col };
}

// The pose, from waterLayout.ts fishAt: aPath0 = loop centre (world x, z), radii; aPath1 = turn, phase, laps, depth;
// aPath2 = size, wags, the tile's shallow edges (a bit mask), and the tile's centre (world z, for the bed).
const fishPose = /* glsl */ `
attribute vec4 aPath0; attribute vec4 aPath1; attribute vec4 aPath2; attribute vec2 aCentre;
uniform float uFish;
${EDGES}
vec2 loopAt(float th) {
  float k = 1.0 + 0.12 * sin(2.0 * th + aPath1.y);
  vec2 l = vec2(aPath0.z * cos(th) * k, aPath0.w * sin(th) * k);
  float c = cos(aPath1.x), s = sin(aPath1.x);
  return aPath0.xy + vec2(l.x * c - l.y * s, l.x * s + l.y * c);
}
// The fish's place on its loop (tile local x, z), its heading (unit, in x z), and its depth under the surface,
// held above the bed.
struct Pose { vec2 at; vec2 dir; float y; float bed; float u; };
Pose pose() {
  float u = uFish / ${FISH_PERIOD.toFixed(1)};
  float th = aPath1.y + 6.2831853 * aPath1.z * u;
  float d = 0.01 * sign(aPath1.z);
  Pose p;
  p.at = loopAt(th);
  p.dir = normalize(loopAt(th + d) - loopAt(th - d));
  p.bed = bedDepth(p.at, aPath2.z);
  p.y = ${WATER_Y.toFixed(2)} - min(aPath1.w + 0.35 * sin(2.0 * th), p.bed - 1.6 * aPath2.x);
  p.u = u;
  return p;
}
`;

const fishVert = /* glsl */ `
attribute float aVeil;
${fishPose}
varying vec3 vColor; varying vec3 vNormal; varying vec3 vWorld; varying float vVeil;
void main() {
  Pose p = pose();
  float size = aPath2.x;
  vec3 b = position * size;
  // The tail wags: a wave running from the head to the tail, nothing at the nose, most at the fin.
  float tail = smoothstep(1.2, -5.0, position.x);
  float wave = sin(6.2831853 * aPath2.y * p.u - position.x * 0.55);
  float sway = (0.75 * tail + 0.06) * wave * size;
  vec2 side = vec2(-p.dir.y, p.dir.x);
  vec2 xz = p.at + p.dir * b.x + side * (b.z + sway);
  vec3 w = vec3(aCentre.x + xz.x, p.y + b.y, aCentre.y + xz.y);
  vWorld = w;
  vNormal = vec3(p.dir.x, 0.0, p.dir.y) * normal.x + vec3(0.0, normal.y, 0.0) + vec3(side.x, 0.0, side.y) * normal.z;
  vColor = color; vVeil = aVeil * 0.3;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const fishFrag = /* glsl */ `
${NOISE}
${LIGHT}
${WATER}
varying vec3 vColor; varying vec3 vNormal; varying vec3 vWorld; varying float vVeil;
void main() {
  vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
  vec3 col = lightUp(vColor, 0.5 + 0.5 * toon(n));
#ifdef UNDER
  // Seen through the surface: tinted by the water between it and the eye, with the surface's own swells over it.
  float deep = ${WATER_Y.toFixed(2)} - vWorld.y;
  vec2 at = vWorld.xz + vec2(0.0, deep * ${(COS_E / SQUASH).toFixed(4)});
  vec4 s = waterSurface(at, 60.0, deep);
  col = mix(col, lightUp(s.rgb, 1.0), s.a);
#endif
  gl_FragColor = vec4(finish(col, vVeil), 1.0);
}`;

// Each fish's soft shadow on the bed below it, cast down and to the right, as the light falls from the upper left.
const shadowVert = /* glsl */ `
attribute float aVeil; attribute vec2 aCorner;
${fishPose}
varying vec2 vCorner;
void main() {
  Pose p = pose();
  float size = aPath2.x;
  float bedY = ${WATER_Y.toFixed(2)} - p.bed;
  float lift = p.y - bedY;
  vec2 side = vec2(-p.dir.y, p.dir.x);
  vec2 xz = p.at + vec2(0.69, -0.35) * lift + p.dir * aCorner.x * 4.6 * size + side * aCorner.y * 1.7 * size;
  vCorner = aCorner;
  gl_Position = projectionMatrix * viewMatrix * vec4(aCentre.x + xz.x, bedY + 0.15, aCentre.y + xz.y, 1.0);
}`;
const shadowFrag = /* glsl */ `
varying vec2 vCorner;
void main() {
  float d = length(vCorner);
  if (d > 1.0) discard;
  gl_FragColor = vec4(0.06, 0.16, 0.2, 0.22 * (1.0 - smoothstep(0.45, 1.0, d)));
}`;

/** Fade a harvested tile's fish toward the water, as the other harvested resources fade (build.ts FADE). */
const FADE = 0.55;
const WATER_TONE = hexRgb('#87CCED');

/** Every fish on the map in one geometry, and their bed shadows in another. */
export function fishGeometry(spots: readonly FishSpot[], map: GlMap): { fish: BufferGeometry; shadows: BufferGeometry } {
  const body = fishBody();
  const per = body.pos.length / 3;
  const F = { pos: [] as number[], nor: [] as number[], col: [] as number[], p0: [] as number[], p1: [] as number[], p2: [] as number[], c: [] as number[], hex: [] as number[] };
  const S = { pos: [] as number[], corner: [] as number[], p0: [] as number[], p1: [] as number[], p2: [] as number[], c: [] as number[], hex: [] as number[], index: [] as number[] };
  let sn = 0;
  for (const s of spots) {
    const t = map.tiles[s.key];
    const faded = t?.harvested === true;
    const shallow = mask(shallowEdges(map, s.key));
    for (const p of s.paths) {
      const p0 = [p.cx, p.cz, p.ra, p.rb], p1 = [p.rot, p.phase, p.laps, p.depth], p2 = [p.size, p.wag, shallow, 0];
      for (let i = 0; i < per; i++) {
        F.pos.push(body.pos[i * 3]!, body.pos[i * 3 + 1]!, body.pos[i * 3 + 2]!);
        F.nor.push(body.nor[i * 3]!, body.nor[i * 3 + 1]!, body.nor[i * 3 + 2]!);
        for (let k = 0; k < 3; k++) {
          const v = body.col[i * 3 + k]!;
          F.col.push(faded ? v + (WATER_TONE[k]! - v) * FADE : v);
        }
        F.p0.push(...p0); F.p1.push(...p1); F.p2.push(...p2); F.c.push(s.x, s.z); F.hex.push(s.q, s.r);
      }
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        S.pos.push(s.x, WATER_Y, s.z);
        S.corner.push(cx, cy);
        S.p0.push(...p0); S.p1.push(...p1); S.p2.push(...p2); S.c.push(s.x, s.z); S.hex.push(s.q, s.r);
      }
      S.index.push(sn, sn + 2, sn + 1, sn, sn + 3, sn + 2);
      sn += 4;
    }
  }
  const fish = new BufferGeometry();
  fish.setAttribute('position', new Float32BufferAttribute(F.pos, 3));
  fish.setAttribute('normal', new Float32BufferAttribute(F.nor, 3));
  fish.setAttribute('color', new Float32BufferAttribute(F.col, 3));
  fish.setAttribute('aPath0', new Float32BufferAttribute(F.p0, 4));
  fish.setAttribute('aPath1', new Float32BufferAttribute(F.p1, 4));
  fish.setAttribute('aPath2', new Float32BufferAttribute(F.p2, 4));
  fish.setAttribute('aCentre', new Float32BufferAttribute(F.c, 2));
  fish.setAttribute('aHex', new Float32BufferAttribute(F.hex, 2));
  const shadows = new BufferGeometry();
  shadows.setAttribute('position', new Float32BufferAttribute(S.pos, 3));
  shadows.setAttribute('aCorner', new Float32BufferAttribute(S.corner, 2));
  shadows.setAttribute('aPath0', new Float32BufferAttribute(S.p0, 4));
  shadows.setAttribute('aPath1', new Float32BufferAttribute(S.p1, 4));
  shadows.setAttribute('aPath2', new Float32BufferAttribute(S.p2, 4));
  shadows.setAttribute('aCentre', new Float32BufferAttribute(S.c, 2));
  shadows.setAttribute('aHex', new Float32BufferAttribute(S.hex, 2));
  shadows.setIndex(S.index);
  return { fish, shadows };
}

/** The tiles whose props can stand in front of a fish tile on screen: the two below it (edges 1 and 2). */
export function frontOf(k: HexKey): HexKey[] {
  const { q, r } = parse(k);
  return [1, 2].map((e) => { const [dq, dr] = EDGE_NB[e]!; return `${q + dq},${r + dr}`; });
}

export interface Fish {
  readonly group: Group;
  /** Rebuild the fish for the map; `occluders` are the props of the tiles in front of fish tiles (frontOf). */
  setMap(map: GlMap, occluders: readonly BufferGeometry[]): void;
  setVeil(veiled: readonly HexKey[]): void;
  /** The water's motion clock, seconds (it stands still at rest and under reduced motion, and so do the fish). */
  setTime(t: number): void;
  boxes(): readonly FishSpot['box'][];
  /** Fish tiles, fish, and the fish clock now, for tests. */
  stats(): { tiles: number; fish: number; time: number; triangles: number; occluder: number };
  dispose(): void;
}

/**
 * The fish. `under`: drawn on the figures' canvas over the finished terrain (tinted as the surface would, behind a
 * depth-only copy of what stands in front, the depth cleared after); otherwise in the terrain scene, under the surface.
 */
export function createFish(shared: Record<string, { value: unknown }>, under: boolean): Fish {
  const clock = { value: 0 };
  const uniforms = { ...shared, uFish: clock };
  const fishMat = new ShaderMaterial({
    uniforms, vertexShader: fishVert, fragmentShader: fishFrag, vertexColors: true, side: DoubleSide,
    defines: under ? { UNDER: '' } : {},
  });
  // Blended, but drawn with the opaque things, so it comes before the depth is cleared and the fish still hide it.
  const shadowMat = new ShaderMaterial({
    uniforms, vertexShader: shadowVert, fragmentShader: shadowFrag, depthWrite: false, side: DoubleSide,
    blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor,
  });
  const group = new Group();
  const fish = new Mesh(new BufferGeometry(), fishMat);
  const shadows = new Mesh(new BufferGeometry(), shadowMat);
  const occluder = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ colorWrite: false }));
  // The depth clear: a mesh that draws nothing, whose only work is to clear the depth before the figures draw.
  const clearGeo = new BufferGeometry();
  clearGeo.setAttribute('position', new Float32BufferAttribute([0, -9999, 0, 0, -9999, 0, 0, -9999, 0], 3));
  const clear = new Mesh(clearGeo, new MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  clear.onBeforeRender = (renderer: WebGLRenderer) => {
    renderer.state.buffers.depth.setMask(true);
    renderer.clearDepth();
  };
  occluder.renderOrder = -4;
  fish.renderOrder = -3;
  shadows.renderOrder = -2;
  clear.renderOrder = -1;
  for (const m of [fish, shadows, occluder, clear]) m.frustumCulled = false;
  group.add(fish, shadows);
  if (under) group.add(occluder, clear);
  let spots: FishSpot[] = [];
  let sig = '', occSig = '';
  let veiledNow = new Set<number>();
  let time = 0;

  function paintVeil(): void {
    for (const geo of [fish.geometry, shadows.geometry]) {
      const hex = geo.attributes.aHex;
      if (hex === undefined) continue;
      const arr = new Float32Array(hex.count);
      for (let i = 0; i < hex.count; i++) arr[i] = veiledNow.has(hexId(hex.getX(i), hex.getY(i))) ? 1 : 0;
      geo.setAttribute('aVeil', new Float32BufferAttribute(arr, 1));
    }
  }

  return {
    group,
    setMap(map, occluders) {
      const next = fishSpots(map);
      const s = next.map((f) => `${f.key}${map.tiles[f.key]!.harvested ? 'h' : ''}/${mask(shallowEdges(map, f.key))}`).join(' ');
      if (s !== sig) {
        sig = s;
        spots = next;
        fish.geometry.dispose();
        shadows.geometry.dispose();
        const g = fishGeometry(next, map);
        fish.geometry = g.fish;
        shadows.geometry = g.shadows;
        group.visible = next.length > 0;
        paintVeil();
      }
      const os = occluders.map((g) => g.uuid).join(' ');
      if (under && os !== occSig) {
        occSig = os;
        occluder.geometry.dispose();
        const pos: number[] = [];
        for (const g of occluders) {
          const p = g.attributes.position!;
          const idx = g.index;
          const n = idx ? idx.count : p.count;
          for (let i = 0; i < n; i++) { const j = idx ? idx.getX(i) : i; pos.push(p.getX(j), p.getY(j), p.getZ(j)); }
        }
        const og = new BufferGeometry();
        og.setAttribute('position', new Float32BufferAttribute(pos, 3));
        occluder.geometry = og;
      }
    },
    setVeil(veiled) {
      veiledNow = new Set(veiled.map((k) => { const { q, r } = parse(k); return hexId(q, r); }));
      paintVeil();
    },
    setTime(t) {
      time = ((t % FISH_PERIOD) + FISH_PERIOD) % FISH_PERIOD;
      clock.value = time;
    },
    boxes: () => spots.map((s) => s.box),
    stats: () => ({
      tiles: spots.length, fish: spots.reduce((n, s) => n + s.paths.length, 0), time,
      triangles: fish.geometry.attributes.position === undefined ? 0 : fish.geometry.attributes.position.count / 3,
      occluder: occluder.geometry.attributes.position === undefined ? 0 : occluder.geometry.attributes.position.count / 3,
    }),
    dispose() {
      for (const m of [fish, shadows, occluder, clear]) { m.geometry.dispose(); (m.material as ShaderMaterial).dispose(); }
      group.clear();
    },
  };
}
