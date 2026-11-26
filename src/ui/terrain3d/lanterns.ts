// The light of the mines' lanterns and the foundries' furnaces: a warm glow round each lantern, a pool of its light on
// the tunnel floor and out of the mouth, and a glow at each furnace mouth. One mesh for the whole map, rebuilt only
// when the mines change; the flicker is two uniforms (two voices, so neighbouring mines do not flicker together) set
// from the ambient loop's clock, so a frame costs one draw call and no geometry upload. Drawn with the waterfalls on
// the units canvas, which alone redraws in that loop; held at its steady glow at rest and under reduced motion.
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, ShaderMaterial } from 'three';
import type { HexKey } from '../../engine';
import type { GlMap } from './input';
import { parse } from './layout';
import { LANTERN, lanternFlicker, lanternSpots, MINE } from './townLayout';
import type { LanternSpot } from './townLayout';

export interface Lanterns {
  readonly group: Group;
  setMap(map: GlMap): void;
  setVeil(veiled: readonly HexKey[]): void;
  /** The clock in seconds and the motion level (0: the steady glow). */
  setTime(t: number, level: number): void;
  /** The current brightness of each voice, for tests. */
  glow(): [number, number];
  boxes(): readonly LanternSpot['box'][];
  count(): number;
  dispose(): void;
}

// aGlow: x the kind (0 a lantern's halo, 1 the floor pool, 2 a furnace), y the voice, zw the quad corner (-1 to 1).
// A halo turns to face the camera; the pool lies on the floor.
const vert = /* glsl */ `
attribute vec3 aCentre; attribute vec4 aGlow; attribute vec2 aSize; attribute float aVeil;
uniform float uGlow0, uGlow1;
varying vec4 vGlow; varying float vBright; varying float vVeil;
void main() {
  vGlow = aGlow; vVeil = aVeil * 0.3;
  vBright = aGlow.y < 0.5 ? uGlow0 : uGlow1;
  vec4 mv;
  if (aGlow.x > 0.5 && aGlow.x < 1.5) {
    mv = viewMatrix * modelMatrix * vec4(aCentre + vec3(aGlow.z * aSize.x, 0.0, aGlow.w * aSize.y), 1.0);
  } else {
    mv = viewMatrix * modelMatrix * vec4(aCentre, 1.0);
    mv.xy += aGlow.zw * aSize * (0.92 + 0.08 * vBright);
  }
  gl_Position = projectionMatrix * mv;
}`;

const frag = /* glsl */ `
uniform vec3 uVeilColor;
varying vec4 vGlow; varying float vBright; varying float vVeil;
void main() {
  float d = length(vGlow.zw);
  if (d > 1.0) discard;
  float kind = vGlow.x;
  // A firm warm core and a soft halo in two toon bands; the pool is softer and fades toward the mouth.
  float core = 1.0 - smoothstep(0.18, 0.26, d);
  float halo = mix(0.55, 0.22, smoothstep(0.42, 0.5, d)) * (1.0 - smoothstep(0.82, 1.0, d));
  vec3 warm = kind > 1.5 ? vec3(1.0, 0.55, 0.16) : vec3(1.0, 0.72, 0.30);
  vec3 c = mix(warm, vec3(1.0, 0.95, 0.75), core);
  float a = max(core * 0.95, halo);
  if (kind > 0.5 && kind < 1.5) { a = 0.4 * (1.0 - smoothstep(0.0, 1.0, d)); c = warm; }
  a *= clamp(vBright, 0.0, 1.4) * (1.0 - vVeil * 2.0);
  gl_FragColor = vec4(mix(c, uVeilColor, vVeil), clamp(a, 0.0, 1.0));
}`;

const hexId = (q: number, r: number): number => (q + 512) * 1024 + (r + 512);

function geometryOf(spots: readonly LanternSpot[]): BufferGeometry {
  const centre: number[] = [], glow: number[] = [], size: number[] = [], hex: number[] = [], index: number[] = [];
  let n = 0;
  const quad = (x: number, y: number, z: number, kind: number, voice: number, sx: number, sy: number, q: number, r: number): void => {
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      centre.push(x, y, z);
      glow.push(kind, voice, cx, cy);
      size.push(sx, sy);
      hex.push(q, r);
    }
    index.push(n, n + 1, n + 2, n, n + 2, n + 3);
    n += 4;
  };
  for (const s of spots) {
    const { q, r } = parse(s.key);
    if (s.kind === 'lantern') {
      // The pool first (it lies under the halo), from the lantern's foot out past the mouth.
      const px = s.x + (MINE.x - LANTERN.x) * 0.45, pz = s.z + 1.2;
      quad(px, 0.25, pz, 1, s.voice, MINE.openW - 0.6, 4.6, q, r);
      quad(s.x, s.y - 0.6, s.z, 0, s.voice, 4.2, 4.2, q, r);
    } else {
      quad(s.x, s.y, s.z, 2, s.voice, 5.2, 4.2, q, r);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(centre, 3)); // three needs a position; the shader uses aCentre
  g.setAttribute('aCentre', new Float32BufferAttribute(centre, 3));
  g.setAttribute('aGlow', new Float32BufferAttribute(glow, 4));
  g.setAttribute('aSize', new Float32BufferAttribute(size, 2));
  g.setAttribute('aHex', new Float32BufferAttribute(hex, 2));
  g.setIndex(index);
  return g;
}

export function createLanterns(shared: Record<string, { value: unknown }>): Lanterns {
  const g0 = { value: 1 }, g1 = { value: 1 };
  const mat = new ShaderMaterial({
    uniforms: { uVeilColor: shared.uVeilColor!, uGlow0: g0, uGlow1: g1 }, vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: false,
  });
  const group = new Group();
  const mesh = new Mesh(new BufferGeometry(), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  group.add(mesh);
  group.visible = false;
  let spots: LanternSpot[] = [];
  let sig = '';
  let veiledNow = new Set<number>();
  function paintVeil(): void {
    const geo = mesh.geometry;
    const hex = geo.attributes.aHex;
    if (hex === undefined) return;
    const arr = new Float32Array(hex.count);
    for (let i = 0; i < hex.count; i++) arr[i] = veiledNow.has(hexId(hex.getX(i), hex.getY(i))) ? 1 : 0;
    geo.setAttribute('aVeil', new Float32BufferAttribute(arr, 1));
  }
  return {
    group,
    setMap(map) {
      const next = lanternSpots(map);
      const s = next.map((l) => `${l.key}/${l.kind}`).join(' ');
      if (s === sig) return;
      sig = s;
      spots = next;
      mesh.geometry.dispose();
      mesh.geometry = next.length ? geometryOf(next) : new BufferGeometry();
      group.visible = next.length > 0;
      paintVeil();
    },
    setVeil(veiled) {
      veiledNow = new Set(veiled.map((k) => { const { q, r } = parse(k); return hexId(q, r); }));
      paintVeil();
    },
    setTime(t, level) {
      g0.value = lanternFlicker(t, level, 0);
      g1.value = lanternFlicker(t, level, 1);
    },
    glow: () => [g0.value, g1.value],
    boxes: () => spots.map((s) => s.box),
    count: () => spots.length,
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
      group.clear();
    },
  };
}
