// The match's weather on the 3D board (a look only): falling rain with small splashes, falling snow, and soft cloud
// shadows drifting over the ground. Each is one mesh made once, the size of the board set by a uniform, so a new map
// rebuilds nothing; every particle is moved in its vertex shader by one uniform, the terrain's motion clock (as the
// smoke and the waterfalls' mist), so a frame costs one draw call per mesh and no geometry upload. The clock runs only
// while the ambient loop is awake: at rest and under reduced motion the rain and snow hang still. Drawn on the units
// canvas, above the tiles and below the units' status.
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, ShaderMaterial, Vector4 } from 'three';
import type { Weather } from '../../app/advanced';
import type { GlMap } from './input';
import { centre, COS_E, parse, R, SQUASH } from './layout';
import { NOISE } from './shaders';

export const RAIN_DROPS = 650;
export const RAIN_SPLASHES = 140;
export const SNOW_FLAKES = 420;
/** How high above the ground rain and snow start (world units), and how fast they fall (units a second). */
export const FALL_TOP = 220;
export const RAIN_SPEED = 380;
export const SNOW_SPEED = 30;

export interface WeatherFx {
  readonly group: Group;
  setMap(map: GlMap): void;
  setWeather(w: Weather): void;
  /** The motion clock in seconds (it stands still at rest and under reduced motion). */
  setTime(t: number): void;
  /** Whether anything moves (rain, snow or clouds are on). */
  active(): boolean;
  /** Triangles and particles of the weather drawn now, for tests and tuning. */
  stats(): { weather: Weather; particles: number; triangles: number; time: number };
  dispose(): void;
}

// A fixed pseudo-random value per particle and channel: the same on every phone, and no randomness at all.
function rnd(i: number, k: number): number {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// aP: x, z across the board box (0 to 1), the particle's phase (0 to 1) and its kind (0 a drop or flake, 1 a splash).
function particles(n: number, splashes: number): BufferGeometry {
  const p: number[] = [], corner: number[] = [], index: number[] = [];
  let v = 0;
  for (let i = 0; i < n + splashes; i++) {
    const kind = i < n ? 0 : 1;
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      p.push(rnd(i, 0), rnd(i, 1), rnd(i, 2), kind);
      corner.push(cx, cy);
    }
    index.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(new Float32Array(p.length / 4 * 3), 3)); // three needs one
  g.setAttribute('aP', new Float32BufferAttribute(p, 4));
  g.setAttribute('aCorner', new Float32BufferAttribute(corner, 2));
  g.setIndex(index);
  return g;
}

const fallVert = (snow: boolean): string => /* glsl */ `
attribute vec4 aP; attribute vec2 aCorner;
uniform vec4 uBox; uniform float uClock;
varying vec2 vCorner; varying float vAlpha; varying float vKind;
void main() {
  vCorner = aCorner; vKind = aP.w;
  vec3 c = vec3(uBox.x + aP.x * uBox.z, 0.0, uBox.y + aP.y * uBox.w);
  vec4 mv;
  if (aP.w > 0.5) {
    // A splash: a small ring on the ground that widens and fades, then comes back somewhere along the same line.
    float cyc = uClock * (1.6 + 0.8 * aP.z) + aP.z * 7.0;
    float life = fract(cyc);
    vec2 j = fract(aP.xy + vec2(0.618034, 0.381966) * floor(cyc));
    c = vec3(uBox.x + j.x * uBox.z, 0.4, uBox.y + j.y * uBox.w);
    float size = 0.8 + 2.6 * life;
    mv = viewMatrix * modelMatrix * vec4(c + vec3(aCorner.x * size, 0.0, aCorner.y * size * 0.9), 1.0);
    vAlpha = (1.0 - life) * 0.75;
  } else {
    float h = mod(uClock * ${snow ? `${SNOW_SPEED.toFixed(1)} * (0.75 + 0.5 * fract(aP.z * 31.0))` : `${RAIN_SPEED.toFixed(1)} * (0.85 + 0.3 * fract(aP.z * 31.0))`} + aP.z * ${FALL_TOP.toFixed(1)}, ${FALL_TOP.toFixed(1)});
    c.y = ${FALL_TOP.toFixed(1)} - h;
${snow
    ? '    c.x += 5.0 * sin(uClock * 1.1 + aP.z * 40.0) + 0.06 * h;\n    c.z += 3.0 * cos(uClock * 0.8 + aP.z * 23.0);'
    : '    c.x += 0.12 * h;'}
    mv = viewMatrix * modelMatrix * vec4(c, 1.0);
    ${snow
    ? 'float s = 1.0 + 0.8 * fract(aP.z * 17.0);\n    mv.xy += aCorner * s;'
    : 'mv.xy += vec2(aCorner.x * 0.32 + aCorner.y * 1.2, aCorner.y * 7.5);'}
    // Fade in at the top and out just above the ground, so nothing pops.
    vAlpha = smoothstep(0.0, 18.0, h) * (1.0 - smoothstep(${(FALL_TOP - 14).toFixed(1)}, ${FALL_TOP.toFixed(1)}, h));
  }
  gl_Position = projectionMatrix * mv;
}`;

const fallFrag = (snow: boolean): string => /* glsl */ `
uniform vec3 uTint;
varying vec2 vCorner; varying float vAlpha; varying float vKind;
void main() {
  vec3 c; float a;
  if (vKind > 0.5) {
    float d = length(vCorner);
    a = smoothstep(0.55, 0.75, d) * (1.0 - smoothstep(0.85, 1.0, d)) * 0.55;
    c = vec3(0.86, 0.92, 1.0);
  } else {
${snow
    ? '    float d = length(vCorner);\n    if (d > 1.0) discard;\n    a = 0.95 * (1.0 - smoothstep(0.55, 1.0, d));\n    c = vec3(1.0);'
    : '    a = (1.0 - abs(vCorner.x)) * (0.3 + 0.35 * (vCorner.y + 1.0) * 0.5);\n    c = vec3(0.80, 0.87, 0.98);'}
  }
  // At night the rain and snow take some of the dark, but stay lighter than the ground they fall on.
  c *= mix(vec3(1.0), uTint, 0.55);
  gl_FragColor = vec4(c, a * vAlpha);
}`;

// Cloud shadows: one quad over the board on the ground, a slow drifting noise field, soft-edged patches of shade.
const cloudVert = /* glsl */ `
uniform vec4 uBox;
varying vec2 vP;
void main() {
  vec3 c = vec3(uBox.x + (position.x * 0.5 + 0.5) * uBox.z, 0.5, uBox.y + (position.z * 0.5 + 0.5) * uBox.w);
  vP = c.xz;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(c, 1.0);
}`;

const cloudFrag = /* glsl */ `
${NOISE}
uniform float uClock; uniform vec4 uBox;
varying vec2 vP;
void main() {
  vec2 p = vP * 0.0085 + vec2(uClock * 0.03, uClock * 0.012);
  float n = 0.65 * noise(p) + 0.35 * noise(p * 2.3 + 5.1);
  // Soft toward the box's edges, so no straight line shows over the sea.
  vec2 e = min(vP - uBox.xy, uBox.xy + uBox.zw - vP);
  float a = smoothstep(0.45, 0.58, n) * 0.36 * smoothstep(0.0, 90.0, min(e.x, e.y));
  gl_FragColor = vec4(0.10, 0.12, 0.18, a);
}`;

export function createWeather(shared: Record<string, { value: unknown }>): WeatherFx {
  const box = { value: new Vector4(-400, -400, 800, 800) };
  const clock = { value: 0 };
  const mat = (vert: string, frag: string): ShaderMaterial => new ShaderMaterial({
    uniforms: { uBox: box, uClock: clock, uTint: shared.uTint! }, vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: false,
  });
  const rainMat = mat(fallVert(false), fallFrag(false));
  const snowMat = mat(fallVert(true), fallFrag(true));
  const cloudMat = mat(cloudVert, cloudFrag);
  cloudMat.side = DoubleSide; // the quad is seen from above whichever way it winds
  const rainGeo = particles(RAIN_DROPS, RAIN_SPLASHES);
  const snowGeo = particles(SNOW_FLAKES, 0);
  const cloudGeo = new BufferGeometry();
  cloudGeo.setAttribute('position', new Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
  cloudGeo.setIndex([0, 2, 1, 0, 3, 2]);
  const rain = new Mesh(rainGeo, rainMat);
  const snow = new Mesh(snowGeo, snowMat);
  const cloud = new Mesh(cloudGeo, cloudMat);
  // The cloud shade lies under the figures; the rain and snow fall in front of everything but the status svg.
  cloud.renderOrder = -1;
  rain.renderOrder = 7;
  snow.renderOrder = 7;
  for (const m of [rain, snow, cloud]) { m.frustumCulled = false; m.visible = false; }
  const group = new Group();
  group.add(cloud, rain, snow);
  let weather: Weather = 'clear';
  return {
    group,
    setMap(map) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const k of [...Object.keys(map.tiles), ...map.fog]) {
        const { q, r } = parse(k);
        const c = centre(q, r);
        x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); z0 = Math.min(z0, c.z); z1 = Math.max(z1, c.z);
      }
      if (!Number.isFinite(x0)) return;
      // A tile and a half beyond the outer tiles, more to the left, where the falling slant starts, and more toward
      // the viewer: a drop high over ground nearer the eye shows against the land further back, so without that
      // strip the bottom of the screen would see only drops about to land.
      const m = R * 1.5;
      const near = FALL_TOP * COS_E / SQUASH;
      box.value.set(x0 - m - 0.12 * FALL_TOP, z0 - m, x1 - x0 + 2 * m + 0.12 * FALL_TOP, z1 - z0 + 2 * m + near);
    },
    setWeather(w) {
      weather = w;
      rain.visible = w === 'rain';
      snow.visible = w === 'snow';
      cloud.visible = w === 'cloudy';
    },
    setTime(t) { clock.value = t; },
    active: () => weather !== 'clear',
    stats() {
      const particlesNow = weather === 'rain' ? RAIN_DROPS + RAIN_SPLASHES : weather === 'snow' ? SNOW_FLAKES : 0;
      const triangles = weather === 'cloudy' ? 2 : particlesNow * 2;
      return { weather, particles: particlesNow, triangles, time: clock.value };
    },
    dispose() {
      rainGeo.dispose(); snowGeo.dispose(); cloudGeo.dispose();
      rainMat.dispose(); snowMat.dispose(); cloudMat.dispose();
      group.clear();
    },
  };
}
