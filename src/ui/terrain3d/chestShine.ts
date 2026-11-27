// The shut treasure chests' twinkle (art/twinkle.ts): a few small glints on each chest's gold bands and lock, lit for
// a moment at their own pace. The chest itself is a part of the terrain's prop mesh, which never redraws for motion,
// so the glints are drawn on the units canvas, which alone redraws in the ambient loop (as the bonfires' flames).
// One mesh for every chest on the map, a camera facing quad per glint, rebuilt only when the chests change; a frame
// writes one brightness per glint (a few hundred floats at most) and costs one draw call. A glint that is dark folds
// to a point, so it costs no fill. Unlit, so a glint stays bright at dawn, dusk and night. The brightness is scaled by
// the motion level: as the loop rests, and under reduced motion, the glints fade away and the chest keeps the static
// sparkle it always had (buildings.ts chestParts). A claimed chest leaves the map, so it never twinkles as it opens.
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, ShaderMaterial } from 'three';
import type { HexKey } from '../../engine';
import { twinkle, twinkleSeed, TWINKLES } from '../art/twinkle';
import { COS_E, SQUASH } from './layout';

/** A shut chest on the map, in world space: where its foot stands and its scale (terrain3d.ts noteChests). */
export interface ChestAt { x: number; y: number; z: number; s: number }

/**
 * Where each glint sits on the chest (chest-local, its foot's centre at the origin, +z its front: buildings.ts CHEST,
 * 8 wide, 5.2 deep, 4.4 tall, the lid's top 7 up) and its size there. In the order of TWINKLES: the lock, the top of
 * the left band where it crosses the lid, and the foot of the right band.
 */
export const CHEST_GLINTS: readonly { x: number; y: number; z: number; s: number }[] = [
  { x: 0, y: 3.2, z: 2.95, s: 3.8 },
  { x: -2.4, y: 7.0, z: 0.6, s: 3.4 },
  { x: 2.4, y: 0.7, z: 2.8, s: 3.0 },
];

export interface ChestShine {
  readonly group: Group;
  setChests(chests: ReadonlyMap<HexKey, ChestAt>): void;
  setVeil(veiled: readonly HexKey[]): void;
  /** The motion clock in seconds and the motion level (0 at rest: no glint shows). */
  setTime(flow: number, level: number): void;
  boxes(): readonly { x0: number; x1: number; y0: number; y1: number }[];
  /** The chests twinkling, and each glint's brightness now (chest by chest, in TWINKLES order), for tests. */
  state(): { chests: HexKey[]; shine: number[] };
  dispose(): void;
}

const vert = /* glsl */ `
attribute vec3 aCentre; attribute vec2 aCorner; attribute float aSize; attribute float aShine; attribute float aVeil;
varying vec2 vCorner; varying float vShine;
void main() {
  vCorner = aCorner;
  vShine = aShine * (1.0 - 0.7 * aVeil);
  vec4 mv = viewMatrix * modelMatrix * vec4(aCentre, 1.0);
  // It grows as it brightens; dark, it is a point and draws nothing.
  mv.xy += aCorner * aSize * (aShine > 0.004 ? 0.45 + 0.55 * aShine : 0.0);
  mv.z += 4.0; // a little toward the camera, so the chest's front never cuts it
  gl_Position = projectionMatrix * mv;
}`;

// A four-point star, as the chest's own sparkles: two thin rays tapering to their tips, and a soft round heart.
const frag = /* glsl */ `
varying vec2 vCorner; varying float vShine;
void main() {
  float ax = abs(vCorner.x), ay = abs(vCorner.y);
  float h = max(1.0 - ax, 0.0) * (1.0 - smoothstep(0.0, 0.05 + 0.2 * (1.0 - ax), ay));
  float v = max(1.0 - ay, 0.0) * (1.0 - smoothstep(0.0, 0.05 + 0.2 * (1.0 - ay), ax));
  float heart = 1.0 - smoothstep(0.0, 0.4, length(vCorner));
  float a = clamp(max(max(h, v), heart * 0.85), 0.0, 1.0) * vShine;
  if (a < 0.01) discard;
  vec3 c = mix(vec3(1.0, 0.86, 0.42), vec3(1.0, 0.99, 0.9), clamp(heart + 0.35, 0.0, 1.0));
  gl_FragColor = vec4(c, a);
}`;

export function createChestShine(): ChestShine {
  const mat = new ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false });
  const mesh = new Mesh(new BufferGeometry(), mat);
  // After the figures, tested against their depth, so a figure standing in front of a chest hides its glints.
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  const group = new Group();
  group.add(mesh);
  group.visible = false;
  let keys: HexKey[] = [];
  let seeds: number[] = [];
  let boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
  let shine = new Float32Array(0); // one per glint
  let sig = '';
  let veiled = new Set<HexKey>();
  function paintVeil(): void {
    const n = keys.length * TWINKLES.length;
    const arr = new Float32Array(n * 4);
    keys.forEach((k, c) => { if (veiled.has(k)) arr.fill(1, c * TWINKLES.length * 4, (c + 1) * TWINKLES.length * 4); });
    mesh.geometry.setAttribute('aVeil', new Float32BufferAttribute(arr, 1));
  }
  return {
    group,
    setChests(chests) {
      const list = [...chests].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      const s = list.map(([k, c]) => `${k}/${c.x.toFixed(2)},${c.y.toFixed(2)},${c.z.toFixed(2)},${c.s}`).join(' ');
      if (s === sig) return;
      sig = s;
      keys = list.map(([k]) => k);
      seeds = keys.map((k) => twinkleSeed(k));
      boxes = list.map(([, c]) => {
        const by = c.z * SQUASH - (c.y + 4 * c.s) * COS_E;
        return { x0: c.x - 12 * c.s, x1: c.x + 12 * c.s, y0: by - 9 * c.s, y1: by + 9 * c.s };
      });
      const centre: number[] = [], corner: number[] = [], size: number[] = [], index: number[] = [];
      let n = 0;
      for (const [, c] of list) {
        for (const g of CHEST_GLINTS) {
          for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
            centre.push(c.x + g.x * c.s, c.y + g.y * c.s, c.z + g.z * c.s);
            corner.push(cx, cy);
            size.push(g.s * c.s);
          }
          index.push(n, n + 1, n + 2, n, n + 2, n + 3);
          n += 4;
        }
      }
      mesh.geometry.dispose();
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(centre, 3)); // three needs a position; the shader uses aCentre
      geo.setAttribute('aCentre', new Float32BufferAttribute(centre, 3));
      geo.setAttribute('aCorner', new Float32BufferAttribute(corner, 2));
      geo.setAttribute('aSize', new Float32BufferAttribute(size, 1));
      geo.setAttribute('aShine', new Float32BufferAttribute(new Float32Array(n), 1));
      geo.setIndex(index);
      mesh.geometry = geo;
      shine = new Float32Array(keys.length * TWINKLES.length);
      group.visible = keys.length > 0;
      paintVeil();
    },
    setVeil(v) {
      veiled = new Set(v);
      paintVeil();
    },
    setTime(flow, level) {
      const attr = mesh.geometry.attributes.aShine as Float32BufferAttribute | undefined;
      if (attr === undefined) return;
      const lv = Math.min(1, Math.max(0, level));
      const arr = attr.array as Float32Array;
      let changed = false;
      for (let c = 0; c < keys.length; c++) {
        for (let i = 0; i < TWINKLES.length; i++) {
          const j = c * TWINKLES.length + i;
          const b = lv === 0 ? 0 : twinkle(flow, i, seeds[c]!) * lv;
          if (b === shine[j]) continue;
          shine[j] = b;
          arr.fill(b, j * 4, j * 4 + 4);
          changed = true;
        }
      }
      if (changed) attr.needsUpdate = true;
    },
    boxes: () => boxes,
    state: () => ({ chests: [...keys], shine: [...shine] }),
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
      group.clear();
    },
  };
}
