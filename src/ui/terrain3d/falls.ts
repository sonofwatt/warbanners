// The waterfalls at the board's rim: where a water tile's front side is open to the sky, a toon sheet of water curls
// over the lip and pours down the water column into the abyss, with soft mist rising at its foot. Part of the lazy
// 3D chunk. Two meshes for the whole map (the sheets, the mist), rebuilt only when the map changes; the flow is a
// scrolling pattern in the shader and the mist drifts in the vertex shader, both driven by one uniform, so a frame
// of falling water costs two draw calls and no geometry upload.
import {
  BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, ShaderMaterial,
} from 'three';
import type { HexKey } from '../../engine';
import { fallSpots, FALL_TAIL } from './fallsLayout';
import type { FallSpot } from './fallsLayout';
import type { GlMap } from './input';
import { parse, WALL, WATER_Y } from './layout';
import { LIGHT, NOISE } from './shaders';

export interface Falls {
  readonly group: Group;
  setMap(map: GlMap): void;
  setVeil(veiled: readonly HexKey[]): void;
  /** Move the water on: `t` in seconds (held still under reduced motion). */
  setTime(t: number): void;
  /** The on-screen boxes of every fall, in board units. */
  boxes(): readonly FallSpot['box'][];
  count(): number;
  dispose(): void;
}

const COLS = 6; // across the edge
const ROWS = 9; // down the fall
const PUFFS = 7; // mist sprites per fall

/** The depth below the water's surface where the wall ends. */
const FOOT = WATER_Y + WALL;

const sheetVert = /* glsl */ `
attribute vec3 aFall; attribute float aVeil;
varying vec3 vFall; varying vec3 vNormal; varying float vVeil;
void main() {
  vFall = aFall; vNormal = normal; vVeil = aVeil * 0.3;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

// aFall: x along the edge (world units), y the distance fallen below the lip (world units), z the side fade (0 at
// the corners, 1 in the middle). The water is banded as the toon water column is: pale at the lip, deep below, with
// pale streaks that run down at uFlow and a white curl of foam over the lip. It fades out below the wall's foot.
const sheetFrag = /* glsl */ `
${NOISE}
${LIGHT}
uniform float uFlow;
varying vec3 vFall; varying vec3 vNormal; varying float vVeil;
const float FOOT = ${FOOT.toFixed(3)};
const float TAIL = ${FALL_TAIL.toFixed(1)};
void main() {
  float d = vFall.y;
  float t = clamp(d / FOOT, 0.0, 1.0);
  vec3 c = mix(vec3(0.50, 0.80, 0.94), vec3(0.16, 0.38, 0.64), smoothstep(0.0, 1.0, t));
  // Streaks: long in the fall direction, scrolling down; two hard toon steps.
  vec2 p = vec2(vFall.x * 0.32, (d - uFlow * 16.0) * 0.045);
  float s = noise(p) * 0.65 + noise(p * vec2(2.3, 1.7) + 9.0) * 0.35;
  c = mix(c, vec3(0.70, 0.90, 0.99), step(0.62, s) * 0.75);
  c = mix(c, vec3(0.93, 0.98, 1.0), step(0.76, s) * 0.85);
  // The lip's curl of foam, and foam where the sheet breaks up toward the foot.
  c = mix(c, vec3(0.95, 0.99, 1.0), 1.0 - smoothstep(1.2, 1.8, d));
  float broken = step(0.55, noise(vec2(vFall.x * 0.5, (d - uFlow * 22.0) * 0.12) + 3.0));
  c = mix(c, vec3(0.90, 0.96, 1.0), broken * smoothstep(FOOT * 0.75, FOOT, d) * 0.8);
  float band = toon(vNormal);
  vec3 lit = mix(c * mix(uShadowColor, uLightColor, 0.5), c * uLightColor, band);
  float a = 1.0 - smoothstep(FOOT + 2.0, FOOT + TAIL, d + (noise(vec2(vFall.x * 0.4, d * 0.1 - uFlow)) - 0.5) * 8.0);
  a *= smoothstep(0.0, 0.18, vFall.z);
  if (a < 0.02) discard;
  gl_FragColor = vec4(finish(lit, vVeil), a);
}`;

// Mist: soft round puffs at the foot of each fall, each a quad turned to face the camera, that swell, rise and fade
// over its own life (aPuff.w is its seed). With the flow held still they hold one shape: static mist.
const mistVert = /* glsl */ `
attribute vec3 aCentre; attribute vec2 aCorner; attribute vec4 aPuff; attribute float aVeil;
uniform float uFlow;
varying vec2 vCorner; varying float vAlpha; varying float vVeil;
void main() {
  float life = fract(uFlow * 0.09 * (0.8 + 0.4 * aPuff.w) + aPuff.w);
  vec3 c = aCentre + vec3(aPuff.x, 0.0, aPuff.y) * life * 6.0 + vec3(0.0, life * 12.0, 0.0);
  float size = aPuff.z * (0.65 + 0.6 * life);
  vec4 mv = viewMatrix * modelMatrix * vec4(c, 1.0);
  mv.xy += aCorner * size;
  gl_Position = projectionMatrix * mv;
  vCorner = aCorner;
  vAlpha = sin(3.14159 * clamp(life, 0.0, 1.0));
  vVeil = aVeil * 0.3;
}`;

const mistFrag = /* glsl */ `
${LIGHT}
varying vec2 vCorner; varying float vAlpha; varying float vVeil;
void main() {
  float d = length(vCorner);
  if (d > 1.0) discard;
  // Toon softness: a firm core and one soft outer band.
  float a = mix(0.5, 0.22, smoothstep(0.45, 0.55, d)) * (1.0 - smoothstep(0.85, 1.0, d));
  vec3 c = mix(vec3(0.86, 0.93, 0.98), vec3(1.0), 1.0 - smoothstep(0.0, 0.6, d));
  gl_FragColor = vec4(finish(c, vVeil), a * (0.35 + 0.65 * vAlpha));
}`;

const hexId = (q: number, r: number): number => (q + 512) * 1024 + (r + 512);

function sheetGeometry(spots: readonly FallSpot[]): BufferGeometry {
  const pos: number[] = [], nor: number[] = [], fall: number[] = [], hex: number[] = [], index: number[] = [];
  let base = 0;
  const depth = FOOT + FALL_TAIL;
  for (const s of spots) {
    const [ax, az] = s.a, [bx, bz] = s.b, [nx, nz] = s.n;
    const len = Math.hypot(bx - ax, bz - az);
    for (let j = 0; j <= ROWS; j++) {
      // Rows: a curl over the lip (j 0, 1), then the drop, spaced closer near the top where the curl bends.
      let y: number, out: number, ny: number;
      if (j === 0) { y = WATER_Y + 0.35; out = -1.6; ny = 1; }
      else if (j === 1) { y = WATER_Y - 0.5; out = 1.1; ny = 0.5; }
      else {
        const f = (j - 1) / (ROWS - 1);
        y = WATER_Y - 0.5 - depth * f;
        out = 1.1 + 5.5 * f * f; // it leans out as it falls
        ny = -0.15 * f;
      }
      for (let i = 0; i <= COLS; i++) {
        const u = i / COLS;
        // The sides draw in a little as it falls, so the sheet tapers into the abyss.
        const inset = 0.6 + (j > 1 ? 2.2 * ((j - 1) / (ROWS - 1)) : 0);
        const tx = (bx - ax) / len, tz = (bz - az) / len;
        const along = (u - 0.5) * (len - 2 * inset);
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        pos.push(mx + tx * along + nx * out, y, mz + tz * along + nz * out);
        const l = Math.hypot(nx, ny, nz);
        nor.push(nx / l, ny / l, nz / l);
        fall.push(u * len, Math.max(0, WATER_Y + 0.35 - y), Math.min(u, 1 - u) * 2);
        hex.push(s.q, s.r);
      }
    }
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const a = base + j * (COLS + 1) + i, b = a + 1, c = a + COLS + 1, d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    }
    base += (ROWS + 1) * (COLS + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('aFall', new Float32BufferAttribute(fall, 3));
  g.setAttribute('aHex', new Float32BufferAttribute(hex, 2));
  g.setIndex(index);
  return g;
}

function mistGeometry(spots: readonly FallSpot[]): BufferGeometry {
  const centre: number[] = [], corner: number[] = [], puff: number[] = [], hex: number[] = [], index: number[] = [];
  let n = 0;
  const footY = -WALL - 12; // where the falling water thins out into the abyss
  spots.forEach((s, si) => {
    const [ax, az] = s.a, [bx, bz] = s.b, [nx, nz] = s.n;
    for (let p = 0; p < PUFFS; p++) {
      const u = (p + 0.5) / PUFFS;
      const seed = ((si * 7 + p * 13) % 29) / 29;
      const out = 5 + 3 * ((p * 5) % 3);
      const cx = ax + (bx - ax) * (u * 1.2 - 0.1) + nx * out, cz = az + (bz - az) * (u * 1.2 - 0.1) + nz * out;
      const size = 9 + 3.5 * ((p * 3 + si) % 3);
      // Each puff drifts out from the fall, a little to one side.
      const dx = nx + 0.35 * (u - 0.5), dz = nz;
      for (const [cxr, cyr] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        centre.push(cx, footY + ((p % 3) * 4), cz);
        corner.push(cxr, cyr);
        puff.push(dx, dz, size, seed);
        hex.push(s.q, s.r);
      }
      index.push(n, n + 1, n + 2, n, n + 2, n + 3);
      n += 4;
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(centre, 3)); // three needs a position; the shader uses aCentre
  g.setAttribute('aCentre', new Float32BufferAttribute(centre, 3));
  g.setAttribute('aCorner', new Float32BufferAttribute(corner, 2));
  g.setAttribute('aPuff', new Float32BufferAttribute(puff, 4));
  g.setAttribute('aHex', new Float32BufferAttribute(hex, 2));
  g.setIndex(index);
  return g;
}

export function createFalls(shared: Record<string, { value: unknown }>): Falls {
  const flow = { value: 0 };
  const uniforms = { ...shared, uFlow: flow };
  const sheetMat = new ShaderMaterial({ uniforms, vertexShader: sheetVert, fragmentShader: sheetFrag, transparent: true, depthWrite: false, side: DoubleSide });
  const mistMat = new ShaderMaterial({ uniforms, vertexShader: mistVert, fragmentShader: mistFrag, transparent: true, depthWrite: false });
  const group = new Group();
  const sheet = new Mesh(new BufferGeometry(), sheetMat);
  const mist = new Mesh(new BufferGeometry(), mistMat);
  sheet.frustumCulled = false;
  mist.frustumCulled = false;
  sheet.renderOrder = 1; // after the figures, as transparent things go
  mist.renderOrder = 2;
  group.add(sheet, mist);
  let spots: FallSpot[] = [];
  let sig = '';
  let veiledNow = new Set<number>();

  function paintVeil(): void {
    for (const geo of [sheet.geometry, mist.geometry]) {
      const hex = geo.attributes.aHex;
      if (hex === undefined) continue;
      const arr = new Float32Array(hex.count);
      for (let i = 0; i < hex.count; i++) arr[i] = veiledNow.has(hexId(hex.getX(i), hex.getY(i))) ? 1 : 0;
      geo.setAttribute('aVeil', new Float32BufferAttribute(arr, 1));
    }
  }

  return {
    group,
    setMap(map) {
      const next = fallSpots(map);
      const s = next.map((f) => `${f.key}/${f.edge}`).join(' ');
      if (s === sig) return;
      sig = s;
      spots = next;
      sheet.geometry.dispose();
      mist.geometry.dispose();
      sheet.geometry = next.length ? sheetGeometry(next) : new BufferGeometry();
      mist.geometry = next.length ? mistGeometry(next) : new BufferGeometry();
      group.visible = next.length > 0;
      paintVeil();
    },
    setVeil(veiled) {
      veiledNow = new Set(veiled.map((k) => { const { q, r } = parse(k); return hexId(q, r); }));
      paintVeil();
    },
    setTime(t) { flow.value = t; },
    boxes: () => spots.map((s) => s.box),
    count: () => spots.length,
    dispose() {
      sheet.geometry.dispose();
      mist.geometry.dispose();
      sheetMat.dispose();
      mistMat.dispose();
      group.clear();
    },
  };
}
