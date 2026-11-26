// Chimney smoke: the lumber camps' stovepipes, the lumber mills' chimneys and the foundries' chimneys send up soft
// puffs that rise, swell and fade while the wind carries them gently to the right. One mesh for the whole map,
// rebuilt only when the chimneys change; each puff is a quad turned to face the camera and moved in the vertex
// shader by one uniform, the terrain's motion clock (as the waterfalls' mist), so a frame of smoke costs one draw call
// and no geometry upload. The clock runs only while the ambient loop is awake; at rest and under reduced motion it
// stands still, and the smoke holds one still shape. Drawn with the waterfalls on the units canvas.
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, ShaderMaterial } from 'three';
import type { HexKey } from '../../engine';
import { SMOKE_DRIFT, SMOKE_PERIOD, SMOKE_PUFFS, SMOKE_RISE, smokeSpots } from './buildingLayout';
import type { SmokeSpot } from './buildingLayout';
import type { GlMap } from './input';
import { parse } from './layout';
import { LIGHT } from './shaders';

export interface Smoke {
  readonly group: Group;
  setMap(map: GlMap): void;
  setVeil(veiled: readonly HexKey[]): void;
  /** The motion clock in seconds (it stands still at rest and under reduced motion). */
  setTime(t: number): void;
  boxes(): readonly SmokeSpot['box'][];
  count(): number;
  /** The clock the smoke is drawn at, for tests. */
  time(): number;
  dispose(): void;
}

// aPuff: x the puff's index, y how many the chimney sends, z its size, w the chimney's seed. The shader is
// buildingLayout.ts smokePuff, line for line.
const vert = /* glsl */ `
attribute vec3 aCentre; attribute vec2 aCorner; attribute vec4 aPuff; attribute float aVeil;
uniform float uSmoke;
varying vec2 vCorner; varying float vAlpha; varying float vVeil; varying float vLife;
void main() {
  float i = aPuff.x, w = aPuff.w;
  float tw = mod(uSmoke, ${SMOKE_PERIOD.toFixed(1)});
  float rate = floor(300.0 * (0.85 + 0.3 * fract(i * 0.37 + w))) / ${SMOKE_PERIOD.toFixed(1)};
  float life = fract(tw * rate + i / aPuff.y + w);
  float sway = sin(life * 5.0 + i * 1.7) * 0.6;
  vec3 c = aCentre + vec3(${SMOKE_DRIFT.toFixed(1)} * life * life + sway * life, ${SMOKE_RISE.toFixed(1)} * life, 0.0);
  float size = aPuff.z * (0.45 + 1.05 * sqrt(life));
  vec4 mv = viewMatrix * modelMatrix * vec4(c, 1.0);
  mv.xy += aCorner * size;
  gl_Position = projectionMatrix * mv;
  vCorner = aCorner;
  vLife = life;
  vAlpha = min(1.0, life / 0.12) * (1.0 - life) * (1.0 - life) * 1.15;
  vVeil = aVeil * 0.3;
}`;

const frag = /* glsl */ `
${LIGHT}
uniform vec3 uAir; // the time of day's light on smoke (sky.ts air): 1 by day, the moonlight's blue at night
varying vec2 vCorner; varying float vAlpha; varying float vVeil; varying float vLife;
void main() {
  float d = length(vCorner);
  if (d > 1.0) discard;
  // Toon softness, as the mist: a firm core and one soft band; lit from the upper left, greyer as it thins.
  float a = mix(0.85, 0.45, smoothstep(0.5, 0.58, d)) * (1.0 - smoothstep(0.88, 1.0, d));
  float lit = 1.0 - 0.16 * smoothstep(-0.2, 0.6, vCorner.x - vCorner.y);
  vec3 c = mix(vec3(0.90, 0.89, 0.87), vec3(0.74, 0.74, 0.77), vLife) * lit;
  // In the dark the smoke is lit only by the moon and reads as dark smoke, not as pale cloud.
  float dark = clamp(1.0 - dot(uAir, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  c *= uAir * (1.0 - 0.8 * dark);
  gl_FragColor = vec4(finish(c, vVeil), a * clamp(vAlpha, 0.0, 1.0));
}`;

const hexId = (q: number, r: number): number => (q + 512) * 1024 + (r + 512);

function geometryOf(spots: readonly SmokeSpot[]): BufferGeometry {
  const centre: number[] = [], corner: number[] = [], puff: number[] = [], hex: number[] = [], index: number[] = [];
  let n = 0;
  for (const s of spots) {
    const { q, r } = parse(s.key);
    const count = SMOKE_PUFFS[s.kind];
    const size = s.kind === 'wisp' ? 3.2 : 4.4;
    for (let i = 0; i < count; i++) {
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        centre.push(s.x, s.y, s.z);
        corner.push(cx, cy);
        puff.push(i, count, size, s.seed);
        hex.push(q, r);
      }
      index.push(n, n + 1, n + 2, n, n + 2, n + 3);
      n += 4;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(centre, 3)); // three needs a position; the shader uses aCentre
  g.setAttribute('aCentre', new Float32BufferAttribute(centre, 3));
  g.setAttribute('aCorner', new Float32BufferAttribute(corner, 2));
  g.setAttribute('aPuff', new Float32BufferAttribute(puff, 4));
  g.setAttribute('aHex', new Float32BufferAttribute(hex, 2));
  g.setIndex(index);
  return g;
}

export function createSmoke(shared: Record<string, { value: unknown }>): Smoke {
  const clock = { value: 0 };
  const mat = new ShaderMaterial({ uniforms: { ...shared, uSmoke: clock }, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false });
  const group = new Group();
  const mesh = new Mesh(new BufferGeometry(), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  group.add(mesh);
  group.visible = false;
  let spots: SmokeSpot[] = [];
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
      const next = smokeSpots(map);
      const s = next.map((p) => `${p.key}/${p.kind}/${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`).join(' ');
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
    setTime(t) {
      // Every puff lives a whole number of times per period, so the clock wraps seamlessly.
      clock.value = t % SMOKE_PERIOD;
    },
    boxes: () => spots.map((s) => s.box),
    count: () => spots.length,
    time: () => clock.value,
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
      group.clear();
    },
  };
}
