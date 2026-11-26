// A treasure chest opening as a unit claims it: the same chest the prop mesh drew (buildings.ts chestParts), now on
// the units canvas, its lid swinging back on its hinge, a burst of light and gold coins, then the open chest fading
// and sinking away (buildingLayout.ts chestOpen). The prop mesh drops its chest in the same frame (the claimed tile
// no longer has one), so the chest never shows twice. Each opening is a handful of meshes made when it starts and
// freed when it ends; nothing is drawn or kept when no chest is opening. Driven by the board's follow loop, like the
// figures' strikes; with reduced motion nothing plays (the chest is simply gone).
import {
  BackSide, BufferGeometry, CircleGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, ShaderMaterial,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHEST_MS, chestOpen, COINS, coinAt } from './buildingLayout';
import type { ChestPlay } from './buildingLayout';
import { chestParts, CHEST } from './buildings';
import { coloured } from './geom';
import { SQUASH } from './layout';
import { propFrag, propVert } from './shaders';

export interface Chests {
  readonly group: Group;
  /** Start these openings (from buildingLayout.ts chestPlays). */
  play(list: readonly ChestPlay[]): void;
  /** Pose every opening for `nowMs`, and free those that have ended. */
  tick(nowMs: number): void;
  /** Whether an opening is waiting or under way at `nowMs`. */
  playing(nowMs: number): boolean;
  /** The openings under way, for tests: each one's lid turn and opacity. */
  state(): { key: string; lid: number; alpha: number }[];
  dispose(): void;
}

interface Opening {
  play: ChestPlay;
  root: Group;
  lid: Group;
  coins: Mesh[];
  glow: Mesh;
  mats: (ShaderMaterial | MeshBasicMaterial)[];
  last: { lid: number; alpha: number };
}

export function createChests(shared: Record<string, { value: unknown }>): Chests {
  const group = new Group();
  const openings: Opening[] = [];
  // Shaped once: the chest's body (with its sparkles), its lid about the hinge, and a coin.
  let shapes: { body: BufferGeometry; lid: BufferGeometry; hinge: [number, number, number]; coin: BufferGeometry; glow: BufferGeometry } | null = null;
  function shapesOf(): NonNullable<typeof shapes> {
    if (shapes !== null) return shapes;
    const p = chestParts();
    const body = mergeGeometries([...p.body, ...p.glints])!;
    const lid = mergeGeometries(p.lid)!;
    for (const g of [...p.body, ...p.glints, ...p.lid]) g.dispose();
    const coin = new CylinderGeometry(0.95, 0.95, 0.3, 8);
    coin.rotateX(Math.PI / 2);
    const glow = new CircleGeometry(1, 20);
    glow.rotateX(-Math.asin(SQUASH)); // facing the camera
    shapes = { body, lid, hinge: p.hinge, coin: coloured(coin, '#F2C230', 0.8, 0.12), glow };
    return shapes;
  }
  const mat = (outline: boolean): ShaderMaterial => new ShaderMaterial({
    uniforms: { ...shared, uOutline: { value: outline ? 0.55 : 0 }, uIsOutline: { value: outline } },
    vertexShader: propVert, fragmentShader: propFrag, vertexColors: true,
    ...(outline ? { side: BackSide } : {}), defines: { WORLD_NORMAL: '' },
  });
  function start(play: ChestPlay): Opening {
    const s = shapesOf();
    const fill = mat(false), hull = mat(true);
    const glowMat = new MeshBasicMaterial({ color: 0xffe07a, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide });
    const root = new Group();
    root.position.set(play.x, play.y, play.z);
    root.scale.setScalar(play.s);
    root.add(new Mesh(s.body, hull), new Mesh(s.body, fill));
    const lid = new Group();
    lid.position.set(...s.hinge);
    lid.add(new Mesh(s.lid, hull), new Mesh(s.lid, fill));
    root.add(lid);
    const coins: Mesh[] = [];
    for (let i = 0; i < COINS; i++) {
      const c = new Mesh(s.coin, fill);
      c.visible = false;
      coins.push(c);
      root.add(c);
    }
    const glow = new Mesh(s.glow, glowMat);
    // Behind the open mouth, so the chest's front stays clear and the light rises from inside it.
    glow.position.set(0, CHEST.h + 1.2, -CHEST.d / 2);
    glow.renderOrder = 4;
    glow.visible = false;
    root.add(glow);
    for (const m of root.children) m.frustumCulled = false;
    group.add(root);
    return { play, root, lid, coins, glow, mats: [fill, hull, glowMat], last: { lid: 0, alpha: 1 } };
  }
  function pose(o: Opening, nowMs: number): void {
    const p = chestOpen(nowMs - o.play.start);
    o.lid.rotation.x = -p.lid;
    // It goes by shrinking into the ground about its foot as it sinks: the parts stay opaque, so its outline never
    // shows through a see-through body.
    o.root.position.y = o.play.y - p.sink;
    o.root.scale.setScalar(o.play.s * Math.max(0.001, p.alpha));
    const glowMat = o.mats[2] as MeshBasicMaterial;
    glowMat.opacity = 0.6 * p.glow;
    o.glow.visible = p.glow > 0.01;
    o.glow.scale.setScalar(3 + 5 * p.glow);
    o.coins.forEach((c, i) => {
      c.visible = p.coins !== null;
      if (p.coins === null) return;
      const [x, y, z] = coinAt(i, p.coins);
      c.position.set(x, CHEST.h + 1 + y, z);
      c.rotation.set(0, p.coins * 9 + i, p.coins * 5);
    });
    o.last = { lid: p.lid, alpha: p.alpha };
  }
  function end(o: Opening): void {
    group.remove(o.root);
    for (const m of o.mats) m.dispose();
  }
  return {
    group,
    play(list) {
      for (const p of list) {
        // A chest already opening on that tile is replaced, never doubled.
        const i = openings.findIndex((o) => o.play.key === p.key);
        if (i >= 0) { end(openings[i]!); openings.splice(i, 1); }
        const o = start(p);
        pose(o, p.start);
        openings.push(o);
      }
    },
    tick(nowMs) {
      for (let i = openings.length - 1; i >= 0; i--) {
        const o = openings[i]!;
        if (nowMs - o.play.start >= CHEST_MS) {
          end(o);
          openings.splice(i, 1);
        } else pose(o, nowMs);
      }
    },
    playing: (nowMs) => openings.some((o) => nowMs - o.play.start < CHEST_MS),
    state: () => openings.map((o) => ({ key: o.play.key, ...o.last })),
    dispose() {
      for (const o of openings) end(o);
      openings.length = 0;
      if (shapes !== null) for (const g of [shapes.body, shapes.lid, shapes.coin, shapes.glow]) g.dispose();
      shapes = null;
      group.clear();
    },
  };
}
