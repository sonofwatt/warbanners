// The lumber mills' water wheels: one mesh for the whole map (a fill and its toon outline), rebuilt only when the mills
// change. The turn is done in the vertex shader about each wheel's own hub, from one uniform set by the ambient loop's
// motion clock, so a frame of turning wheels costs two draw calls and no geometry upload. Drawn with the waterfalls on
// the units canvas, which alone redraws in that loop; at rest and under reduced motion the clock stands still, and
// so do the wheels.
import { BackSide, BufferGeometry, Float32BufferAttribute, Group, Mesh, ShaderMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HexKey } from '../../engine';
import { WHEEL_SPEED, wheelAngle, wheelSpots } from './buildingLayout';
import type { WheelSpotOnMap } from './buildingLayout';
import { wheelParts } from './buildings';
import type { GlMap } from './input';
import { parse } from './layout';
import { propFrag } from './shaders';

export interface Wheels {
  readonly group: Group;
  setMap(map: GlMap): void;
  setVeil(veiled: readonly HexKey[]): void;
  /** The motion clock in seconds (it stands still at rest and under reduced motion). */
  setTime(flow: number): void;
  /** The turn of the first wheel now, radians; for tests. */
  angle(): number;
  boxes(): readonly WheelSpotOnMap['box'][];
  count(): number;
  triangles(): number;
  dispose(): void;
}

// propVert, with every corner (and its normal and outline push) turned about its wheel's hub (aHub.xyz) by the clock
// plus the wheel's own phase (aHub.w), about the axle (z).
const vert = /* glsl */ `
attribute float aGloss; attribute vec3 aOut; attribute float aVeil; attribute vec4 aHub;
uniform float uOutline, uSpin;
varying vec3 vColor; varying vec3 vNormal; varying float vGloss; varying vec3 vWorld; varying float vVeil;
vec3 spinZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
void main() {
  float a = -(uSpin + aHub.w);
  vColor = color; vGloss = aGloss;
  vNormal = spinZ(normal, a);
  vVeil = aVeil * 0.3;
  vec3 p = aHub.xyz + spinZ(position - aHub.xyz + aOut * uOutline, a);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const hexId = (q: number, r: number): number => (q + 512) * 1024 + (r + 512);

function geometryOf(spots: readonly WheelSpotOnMap[]): BufferGeometry {
  const parts = wheelParts();
  const one = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  const all: BufferGeometry[] = [];
  for (const s of spots) {
    const g = one.clone();
    g.translate(s.x, s.y, s.z);
    const n = g.attributes.position!.count;
    const hub = new Float32Array(n * 4), hex = new Float32Array(n * 2);
    const { q, r } = parse(s.key);
    for (let i = 0; i < n; i++) {
      hub[i * 4] = s.x; hub[i * 4 + 1] = s.y; hub[i * 4 + 2] = s.z; hub[i * 4 + 3] = s.phase;
      hex[i * 2] = q; hex[i * 2 + 1] = r;
    }
    g.setAttribute('aHub', new Float32BufferAttribute(hub, 4));
    g.setAttribute('aHex', new Float32BufferAttribute(hex, 2));
    all.push(g);
  }
  one.dispose();
  const merged = mergeGeometries(all)!;
  for (const g of all) g.dispose();
  return merged;
}

export function createWheels(shared: Record<string, { value: unknown }>): Wheels {
  const spin = { value: 0 };
  const uniforms = (outline: boolean): Record<string, { value: unknown }> => ({
    ...shared, uSpin: spin, uOutline: { value: outline ? 0.55 : 0 }, uIsOutline: { value: outline },
  });
  const fill = new ShaderMaterial({ uniforms: uniforms(false), vertexShader: vert, fragmentShader: propFrag, vertexColors: true });
  const hull = new ShaderMaterial({ uniforms: uniforms(true), vertexShader: vert, fragmentShader: propFrag, vertexColors: true, side: BackSide });
  const group = new Group();
  const fillMesh = new Mesh(new BufferGeometry(), fill);
  const hullMesh = new Mesh(fillMesh.geometry, hull);
  for (const m of [fillMesh, hullMesh]) m.frustumCulled = false;
  group.add(hullMesh, fillMesh);
  group.visible = false;
  let spots: WheelSpotOnMap[] = [];
  let sig = '';
  let flowNow = 0;
  let veiledNow = new Set<number>();
  function paintVeil(): void {
    const geo = fillMesh.geometry;
    const hex = geo.attributes.aHex;
    if (hex === undefined) return;
    const arr = new Float32Array(hex.count);
    for (let i = 0; i < hex.count; i++) arr[i] = veiledNow.has(hexId(hex.getX(i), hex.getY(i))) ? 1 : 0;
    geo.setAttribute('aVeil', new Float32BufferAttribute(arr, 1));
  }
  return {
    group,
    setMap(map) {
      const next = wheelSpots(map);
      const s = next.map((w) => w.key).join(' ');
      if (s === sig) return;
      sig = s;
      spots = next;
      fillMesh.geometry.dispose();
      fillMesh.geometry = next.length ? geometryOf(next) : new BufferGeometry();
      hullMesh.geometry = fillMesh.geometry;
      group.visible = next.length > 0;
      paintVeil();
    },
    setVeil(veiled) {
      veiledNow = new Set(veiled.map((k) => { const { q, r } = parse(k); return hexId(q, r); }));
      paintVeil();
    },
    setTime(flow) {
      flowNow = flow;
      spin.value = flow * WHEEL_SPEED;
    },
    angle: () => (spots[0] === undefined ? 0 : wheelAngle(flowNow, spots[0].phase)),
    boxes: () => spots.map((s) => s.box),
    count: () => spots.length,
    triangles: () => {
      const g = fillMesh.geometry;
      return g.attributes.position === undefined ? 0 : (g.index ? g.index.count : g.attributes.position.count) / 3;
    },
    dispose() {
      fillMesh.geometry.dispose();
      fill.dispose();
      hull.dispose();
      group.clear();
    },
  };
}
