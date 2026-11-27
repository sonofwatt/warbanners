// The buildings that hide the units' lantern light, on the figures' canvas. The lanterns' pools of light lie on the
// ground (units/units3d.ts) but are drawn on the figures' canvas, over the whole terrain, so without this a pool
// that reaches behind a hut or a house would be painted over the building itself. Here the built tiles' parts
// (cities, villages and buildings) are drawn into the depth only, just before the pools, which are depth tested
// against them; the depth is then cleared again, before the fish and the figures, so no figure is ever hidden by a
// building. One mesh for the map, rebuilt only when the built tiles change.
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three';
import type { WebGLRenderer } from 'three';
import type { GlTile } from './input';

/** The draw order round the pools (units3d.ts, -5): the buildings' depth before them, the clear after. */
export const LAMP_MASK_ORDER = { occluder: -5.5, clear: -4.5 } as const;

/** Whether a tile's parts hide the lantern light behind them: a city, a village or a building stands on it. */
export const hidesLampLight = (t: GlTile): boolean => t.city || t.village || t.building !== null;

export interface LampMask {
  readonly group: Group;
  /** The built tiles' parts (their props geometry), in a stable order. */
  setParts(parts: readonly BufferGeometry[]): void;
  /** Triangles in the mask, for tests. */
  triangles(): number;
  dispose(): void;
}

export function createLampMask(): LampMask {
  const occluder = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ colorWrite: false }));
  const clearGeo = new BufferGeometry();
  clearGeo.setAttribute('position', new Float32BufferAttribute([0, -9999, 0, 0, -9999, 0, 0, -9999, 0], 3));
  const clear = new Mesh(clearGeo, new MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  clear.onBeforeRender = (renderer: WebGLRenderer) => {
    renderer.state.buffers.depth.setMask(true);
    renderer.clearDepth();
  };
  occluder.renderOrder = LAMP_MASK_ORDER.occluder;
  clear.renderOrder = LAMP_MASK_ORDER.clear;
  for (const m of [occluder, clear]) m.frustumCulled = false;
  const group = new Group();
  group.add(occluder, clear);
  let sig = '';
  return {
    group,
    setParts(parts) {
      const s = parts.map((g) => g.uuid).join(' ');
      if (s === sig) return;
      sig = s;
      occluder.geometry.dispose();
      const pos: number[] = [];
      for (const g of parts) {
        const p = g.attributes.position!;
        const idx = g.index;
        const n = idx ? idx.count : p.count;
        for (let i = 0; i < n; i++) { const j = idx ? idx.getX(i) : i; pos.push(p.getX(j), p.getY(j), p.getZ(j)); }
      }
      const og = new BufferGeometry();
      og.setAttribute('position', new Float32BufferAttribute(pos, 3));
      occluder.geometry = og;
    },
    triangles: () => (occluder.geometry.attributes.position?.count ?? 0) / 3,
    dispose() {
      occluder.geometry.dispose();
      clearGeo.dispose();
      (occluder.material as MeshBasicMaterial).dispose();
      (clear.material as MeshBasicMaterial).dispose();
      group.clear();
    },
  };
}
