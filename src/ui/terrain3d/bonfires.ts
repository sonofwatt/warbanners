// The villages' bonfires, what moves of them: the flames, and after dark the fire's flickering glow round the flames
// and on the ground. The stones and logs are still parts of the village (town.ts), and the steady light the fire
// casts on the ground, the huts and the figures is in the terrain's own shaders (shaders.ts FIRE_GLSL); the thin
// wisp of smoke goes with the chimneys' (smoke.ts). One mesh for the whole map, rebuilt only when the villages
// change. The flames move in the vertex shader on the motion clock, as the smoke does, and the glow breathes with two
// flicker voices (as the mine lanterns, townLayout.ts lanternFlicker), so a frame costs one draw call per part and
// no geometry upload. Drawn with the waterfalls on the units canvas, which alone redraws in the ambient loop; still
// at rest and under reduced motion.
//
// On the units canvas the village's own parts are drawn first into the depth only, so a hut standing in front of the
// fire hides the flames and the glow on the ground behind it; the depth is then cleared again, so a figure standing
// in a village is never hidden by it (as the svg board draws it).
import {
  BufferGeometry, CustomBlending, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, OneMinusSrcAlphaFactor, ShaderMaterial,
  SrcAlphaFactor,
} from 'three';
import type { WebGLRenderer } from 'three';
import type { HexKey } from '../../engine';
import { fireSpots } from './buildingLayout';
import type { FireSpot } from './buildingLayout';
import type { GlMap } from './input';
import { parse } from './layout';
import { FIRE_REACH } from './shaders';
import { lanternFlicker } from './townLayout';

export interface Bonfires {
  readonly group: Group;
  /** `occluders`: the props of the village tiles, which hide what of the fire stands behind them. */
  setMap(map: GlMap, occluders: readonly BufferGeometry[]): void;
  setVeil(veiled: readonly HexKey[]): void;
  /** The motion clock in seconds (the flames), the wall clock in seconds and the motion level (the glow's flicker). */
  setTime(flow: number, t: number, level: number): void;
  /** How much light the fires cast now (sky.ts fire): 0 by day, when only the flames show. */
  setLight(light: number): void;
  boxes(): readonly FireSpot['box'][];
  count(): number;
  /** The flames' clock, each voice's flicker now, and the glow's strength, for tests. */
  state(): { time: number; flicker: [number, number]; light: number };
  dispose(): void;
}

/** The flames' clock wraps every FLAME_PERIOD seconds; each of their waves is a whole number of cycles per period. */
export const FLAME_PERIOD = 100;
/** How far the flickering glow on the ground reaches (world units): the steady light reaches FIRE_REACH. */
export const POOL_REACH = FIRE_REACH * 0.6;
/** The halo round the flames by day, as a share of the night's: the flames glow a little, the ground takes no light. */
export const DAY_HALO = 0.3;

// aPart: x the part (0 a flame, 1 the halo round the flames, 2 the pool on the ground), y its half width, z its
// height (a flame) or half depth (the pool), w the fire's seed (its voice: below or above 0.5) plus the flame's index.
// A flame and the halo face the camera; the pool lies on the ground.
const vert = /* glsl */ `
attribute vec3 aCentre; attribute vec2 aCorner; attribute vec4 aPart; attribute float aOff; attribute float aVeil;
uniform float uFlame, uFlick0, uFlick1, uLight;
varying vec2 vCorner; varying float vKind; varying float vSeed; varying float vBright; varying float vVeil;
const float W = 6.2831853 / ${FLAME_PERIOD.toFixed(1)};
void main() {
  float kind = aPart.x, seed = aPart.w;
  vKind = kind; vSeed = seed; vCorner = aCorner; vVeil = aVeil * 0.3;
  vBright = fract(seed) < 0.5 ? uFlick0 : uFlick1;
  vec4 mv;
  if (kind < 0.5) {
    // A flame, standing on the embers: it stretches and shrinks, and its tip sways, on whole cycles of the period.
    float t = uFlame, ph = seed * 6.2831853;
    float h = aPart.z * (0.84 + 0.1 * sin(t * W * 116.0 + ph) + 0.06 * sin(t * W * 208.0 + ph * 1.7));
    float lean = 0.32 * sin(t * W * 49.0 + ph * 0.6) + 0.14 * sin(t * W * 139.0 + ph * 2.3);
    mv = viewMatrix * modelMatrix * vec4(aCentre + vec3(aOff, 0.5, 0.0), 1.0);
    mv.x += aCorner.x * aPart.y + lean * aCorner.y * aCorner.y * aPart.y;
    mv.y += aCorner.y * h;
  } else if (kind < 1.5) {
    mv = viewMatrix * modelMatrix * vec4(aCentre + vec3(0.0, 2.8, 0.0), 1.0);
    mv.xy += aCorner * aPart.y * (0.94 + 0.06 * vBright);
  } else {
    // The pool on the ground: by day (no light) it folds to a point, so it costs no fill at all.
    float on = uLight > 0.0 ? 1.0 : 0.0;
    mv = viewMatrix * modelMatrix * vec4(aCentre + on * vec3(aCorner.x * aPart.y, 0.35, aCorner.y * aPart.z), 1.0);
  }
  gl_Position = projectionMatrix * mv;
}`;

const frag = /* glsl */ `
uniform vec3 uVeilColor;
uniform float uFlame, uLight;
varying vec2 vCorner; varying float vKind; varying float vSeed; varying float vBright; varying float vVeil;
void main() {
  if (vKind < 0.5) {
    // A flame: a tongue round at the foot and pointed at the tip, its edge licking upward; crisp toon bands, a thin
    // dark rim (so it reads against sunlit grass, as the props' outlines do), a red-orange edge, a bright orange body
    // and a big pale yellow heart, unlit by the time of day, so it reads at noon as well as at night.
    float v = vCorner.y, u = vCorner.x;
    float lick = 0.13 * v * sin(v * 9.0 - uFlame * 11.0 + vSeed * 40.0);
    float x = abs(u + lick);
    float hw = sqrt(clamp(v * 2.6, 0.0, 1.0)) * pow(max(1.0 - v, 0.0), 0.8);
    if (x > hw) discard;
    float k = x / max(hw, 0.001);
    vec3 c = vec3(1.0, 0.40, 0.08);
    if (k > 0.86) c = vec3(0.72, 0.16, 0.04);
    if (k < 0.74 && v < 0.8) c = vec3(1.0, 0.66, 0.12);
    if (k < 0.48 && v < 0.6) c = vec3(1.0, 0.93, 0.55);
    gl_FragColor = vec4(mix(c, uVeilColor, vVeil), 1.0);
    return;
  }
  // The glow: a soft warm halo round the flames (faint by day, so the flames still shine), and the pool of light on
  // the ground (after dark only).
  float d = length(vCorner);
  float light = vKind < 1.5 ? max(uLight, ${DAY_HALO.toFixed(2)}) : uLight;
  if (d > 1.0 || light <= 0.0) discard;
  float a;
  vec3 c;
  if (vKind < 1.5) {
    a = 0.36 * (1.0 - smoothstep(0.0, 1.0, d)) * (1.0 - smoothstep(0.0, 1.0, d));
    c = vec3(1.0, 0.60, 0.24);
  } else {
    float n = 1.0 - smoothstep(0.0, 1.0, d);
    a = 0.3 * n * n;
    c = vec3(1.0, 0.50, 0.16);
  }
  a *= light * clamp(vBright, 0.0, 1.4) * (1.0 - vVeil * 2.0);
  gl_FragColor = vec4(mix(c, uVeilColor, vVeil), clamp(a, 0.0, 1.0));
}`;

const hexId = (q: number, r: number): number => (q + 512) * 1024 + (r + 512);

// The flames of one fire: [x offset, half width, height]; the tallest in the middle, two smaller either side.
const FLAMES: readonly [number, number, number][] = [[-1.0, 1.3, 4.3], [1.05, 1.2, 3.8], [0.0, 1.7, 6.8]];

function geometryOf(spots: readonly FireSpot[]): { flames: BufferGeometry; glow: BufferGeometry } {
  const make = (): { centre: number[]; corner: number[]; part: number[]; off: number[]; hex: number[]; index: number[]; n: number } =>
    ({ centre: [], corner: [], part: [], off: [], hex: [], index: [], n: 0 });
  const fl = make(), gw = make();
  const quad = (o: ReturnType<typeof make>, s: FireSpot, part: [number, number, number, number], off: number, bottom: number): void => {
    const { q, r } = parse(s.key);
    for (const [cx, cy] of [[-1, bottom], [1, bottom], [1, 1], [-1, 1]] as const) {
      o.centre.push(s.x, s.y, s.z);
      o.corner.push(cx, cy);
      o.part.push(...part);
      o.off.push(off);
      o.hex.push(q, r);
    }
    o.index.push(o.n, o.n + 1, o.n + 2, o.n, o.n + 2, o.n + 3);
    o.n += 4;
  };
  for (const s of spots) {
    quad(gw, s, [2, POOL_REACH, POOL_REACH, s.seed], 0, -1);
    quad(gw, s, [1, 7.5, 7.5, s.seed], 0, -1);
    FLAMES.forEach(([x, w, h], i) => quad(fl, s, [0, w, h, s.seed + i * 0.13], x, 0));
  }
  const build = (o: ReturnType<typeof make>): BufferGeometry => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(o.centre, 3)); // three needs a position; the shader uses aCentre
    g.setAttribute('aCentre', new Float32BufferAttribute(o.centre, 3));
    g.setAttribute('aCorner', new Float32BufferAttribute(o.corner, 2));
    g.setAttribute('aPart', new Float32BufferAttribute(o.part, 4));
    g.setAttribute('aOff', new Float32BufferAttribute(o.off, 1));
    g.setAttribute('aHex', new Float32BufferAttribute(o.hex, 2));
    g.setIndex(o.index);
    return g;
  };
  return { flames: build(fl), glow: build(gw) };
}

/** `under`: drawn on the units canvas, over the terrain (the village's parts then hide the fire by depth). */
export function createBonfires(shared: Record<string, { value: unknown }>, under = false): Bonfires {
  const clock = { value: 0 }, f0 = { value: 1 }, f1 = { value: 1 }, light = { value: 0 };
  const uniforms = { uVeilColor: shared.uVeilColor!, uFlame: clock, uFlick0: f0, uFlick1: f1, uLight: light };
  const flameMat = new ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag });
  // The glow is blended but drawn with the opaque things, so it comes before the depth is cleared (as the fish's
  // shadows, water.ts); on the terrain it is an ordinary transparent mesh.
  const glowMat = new ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag, depthWrite: false, transparent: !under,
    blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor,
  });
  const group = new Group();
  const flames = new Mesh(new BufferGeometry(), flameMat);
  const glow = new Mesh(new BufferGeometry(), glowMat);
  const occluder = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ colorWrite: false }));
  const clearGeo = new BufferGeometry();
  clearGeo.setAttribute('position', new Float32BufferAttribute([0, -9999, 0, 0, -9999, 0, 0, -9999, 0], 3));
  const clear = new Mesh(clearGeo, new MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  clear.onBeforeRender = (renderer: WebGLRenderer) => {
    renderer.state.buffers.depth.setMask(true);
    renderer.clearDepth();
  };
  // On the units canvas: the village's parts into the depth, then the flames and the glow, then the depth cleared,
  // all before the fish (water.ts, -4 on) and the figures. On the terrain: after the props, as the lanterns.
  occluder.renderOrder = -9;
  flames.renderOrder = under ? -8 : 3;
  glow.renderOrder = under ? -7 : 4;
  clear.renderOrder = -6;
  for (const m of [flames, glow, occluder, clear]) m.frustumCulled = false;
  group.add(flames, glow);
  if (under) group.add(occluder, clear);
  group.visible = false;
  let spots: FireSpot[] = [];
  let sig = '', occSig = '';
  let veiledNow = new Set<number>();
  function paintVeil(): void {
    for (const geo of [flames.geometry, glow.geometry]) {
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
      const next = fireSpots(map);
      const s = next.map((f) => `${f.key}/${f.x.toFixed(2)},${f.y.toFixed(2)},${f.z.toFixed(2)}`).join(' ');
      if (s !== sig) {
        sig = s;
        spots = next;
        flames.geometry.dispose();
        glow.geometry.dispose();
        const g = next.length ? geometryOf(next) : { flames: new BufferGeometry(), glow: new BufferGeometry() };
        flames.geometry = g.flames;
        glow.geometry = g.glow;
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
    setTime(flow, t, level) {
      clock.value = ((flow % FLAME_PERIOD) + FLAME_PERIOD) % FLAME_PERIOD;
      f0.value = lanternFlicker(t, level, 0);
      f1.value = lanternFlicker(t, level, 1);
    },
    setLight(l) {
      light.value = Math.max(0, l);
    },
    boxes: () => spots.map((s) => s.box),
    count: () => spots.length,
    state: () => ({ time: clock.value, flicker: [f0.value, f1.value], light: light.value }),
    dispose() {
      for (const m of [flames, glow, occluder, clear]) { m.geometry.dispose(); (m.material as ShaderMaterial).dispose(); }
      group.clear();
    },
  };
}
