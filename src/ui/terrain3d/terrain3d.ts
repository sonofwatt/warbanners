// The 3D terrain renderer, loaded as its own chunk only when the option is on (Board imports it dynamically, so
// three.js is never downloaded otherwise). It draws on a canvas under the board's svg, aimed with the board's own
// camera, and renders only when asked: when the camera moves or the map changes, never in a loop.
import {
  BackSide, BufferGeometry, Color, ColorManagement, Float32BufferAttribute, LinearSRGBColorSpace, Mesh,
  OrthographicCamera, Scene, ShaderMaterial, Vector3, WebGLRenderer,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HexKey } from '../../engine';
import { fogGeometry, tilePieces } from './build';
import type { TilePieces } from './build';
import type { GlMap, GlTile } from './input';
import { COS_E, EDGE_NB, parse, SQUASH } from './layout';
import { groundFrag, groundVert, propFrag, propVert } from './shaders';
import { createUnits3d } from './units/units3d';
import type { Units3d } from './units/units3d';

export interface TerrainCamera { cx: number; cy: number; scale: number }
export interface TerrainViewport { w: number; h: number }

export interface Terrain3d {
  /** Rebuild what changed. Tiles are cached by what they show and what their neighbours show. */
  setMap(map: GlMap): void;
  /** Dim the tiles no unit can see now, as the SVG veil does. Cheap: no geometry is rebuilt. */
  setVeil(veiled: readonly HexKey[]): void;
  /** Aim at the board camera and render one frame, of the terrain and of the unit figures. */
  draw(cam: TerrainCamera, vp: TerrainViewport): void;
  /** Render the unit figures alone (they move; the terrain does not), on their own canvas. */
  drawUnits(cam: TerrainCamera, vp: TerrainViewport): void;
  /** The 3D unit figures, or null when there is no units canvas or it has no WebGL 2 (the svg then draws the units). */
  readonly units: Units3d | null;
  /** Free every GPU resource and the context. */
  dispose(): void;
  /** Triangles and draw calls of the last frame, for tests and tuning. */
  stats(): { triangles: number; calls: number; tiles: number };
}

/** The highest device pixel ratio the terrain renders at: sharp on phones, without paying for 3x. */
export const MAX_DPR = 2;

const code = (t: GlTile | undefined): string =>
  t === undefined ? 'x' : `${t.terrain[0]}${t.resource ?? '-'}${t.building ?? '-'}${t.village ? 'v' : ''}${t.treasure ? 't' : ''}${t.road ? 'r' : ''}${t.city ? 'c' : ''}`;

/**
 * Make the renderer, or null when this device has no WebGL 2 (the board then stays all SVG). The options are for
 * the art sample and tests: an opaque background, and a drawing buffer kept for reading back.
 */
export function createTerrain3d(canvas: HTMLCanvasElement, opts: { background?: string; keepFrame?: boolean; units?: HTMLCanvasElement | null } = {}): Terrain3d | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: opts.keepFrame === true });
  } catch {
    return null;
  }
  ColorManagement.enabled = false; // every colour here is a display value, used as written
  renderer.outputColorSpace = LinearSRGBColorSpace;
  // The sea behind the board is the slot's own background, so the canvas is clear where there are no tiles.
  if (opts.background !== undefined) renderer.setClearColor(opts.background, 1);
  else renderer.setClearColor(0x000000, 0);
  // A lost context is handled by lifecycle.ts (the board shows SVG) and by three.js itself, which rebuilds its GPU
  // state when the context is restored; geometry and materials are uploaded again on the next frame.

  const shared = {
    uLightDir: { value: new Vector3(-0.55, 0.8, 0.28).normalize() }, // from the upper left, as the SVG art
    uLightColor: { value: new Color(1.05, 1.02, 0.96) }, // warm key
    uShadowColor: { value: new Color(0.68, 0.70, 0.80) }, // cool shade: the toon dark band
    uTint: { value: new Color(1, 1, 1) }, // a time of day grade, multiplied in last
    uVeilColor: { value: new Color('#1E2833') }, // theme.css .veil
    uTime: { value: 0 },
  };
  // The unit figures draw on a second canvas, above the tile svg (cities, villages and marks) and below the svg
  // that carries every unit's status, so a unit standing in a city is never covered by it. Same light, same shaders.
  const units = opts.units ? createUnits3d(opts.units, shared) : null;
  const groundMat = new ShaderMaterial({ uniforms: shared, vertexShader: groundVert, fragmentShader: groundFrag });
  const propUniforms = (outline: boolean): Record<string, { value: unknown }> => ({ ...shared, uOutline: { value: outline ? 0.55 : 0 }, uIsOutline: { value: outline } });
  const propMat = new ShaderMaterial({ uniforms: propUniforms(false), vertexShader: propVert, fragmentShader: propFrag, vertexColors: true });
  const outlineMat = new ShaderMaterial({ uniforms: propUniforms(true), vertexShader: propVert, fragmentShader: propFrag, vertexColors: true, side: BackSide });

  const scene = new Scene();
  const ground = new Mesh(new BufferGeometry(), groundMat);
  const props = new Mesh(new BufferGeometry(), propMat);
  const outline = new Mesh(props.geometry, outlineMat);
  for (const m of [ground, props, outline]) m.frustumCulled = false;
  scene.add(ground, outline, props);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 4000);

  const cache = new Map<string, TilePieces>();
  let tileCount = 0;
  let size = { w: 0, h: 0, dpr: 0 };

  function setMap(map: GlMap): void {
    const want = new Map<string, () => TilePieces>();
    for (const k of Object.keys(map.tiles)) {
      const { q, r } = parse(k);
      const sig = `${k}|${code(map.tiles[k])}|${EDGE_NB.map(([dq, dr]) => code(map.tiles[`${q + dq},${r + dr}`])).join(',')}`;
      want.set(sig, () => tilePieces(map, k));
    }
    for (const k of map.fog) want.set(`fog|${k}`, () => ({ ground: fogGeometry(k), props: null }));
    for (const [sig, pieces] of cache) {
      if (want.has(sig)) continue;
      pieces.ground.dispose();
      pieces.props?.dispose();
      cache.delete(sig);
    }
    for (const [sig, make] of want) if (!cache.has(sig)) cache.set(sig, make());
    const grounds: BufferGeometry[] = [], parts: BufferGeometry[] = [];
    for (const p of cache.values()) {
      grounds.push(p.ground);
      if (p.props) parts.push(p.props);
    }
    tileCount = cache.size;
    const oldGround = ground.geometry, oldProps = props.geometry;
    ground.geometry = grounds.length ? mergeGeometries(grounds) ?? new BufferGeometry() : new BufferGeometry();
    props.geometry = parts.length ? mergeGeometries(parts) ?? new BufferGeometry() : new BufferGeometry();
    outline.geometry = props.geometry;
    oldGround.dispose();
    oldProps.dispose();
    paintVeil();
  }

  // The veil: aVeil on every vertex, 1 where its tile (aHex) is veiled. Rewritten in place, so no rebuild.
  let veiledNow = new Set<number>();
  const hexId = (q: number, r: number): number => (q + 512) * 1024 + (r + 512);
  function paintVeil(): void {
    for (const geo of [ground.geometry, props.geometry]) {
      const hex = geo.attributes.aHex;
      if (hex === undefined) continue;
      let veil = geo.attributes.aVeil as Float32BufferAttribute | undefined;
      if (veil === undefined || veil.count !== hex.count) {
        veil = new Float32BufferAttribute(new Float32Array(hex.count), 1);
        geo.setAttribute('aVeil', veil);
      }
      const arr = veil.array as Float32Array;
      for (let i = 0; i < hex.count; i++) arr[i] = veiledNow.has(hexId(hex.getX(i), hex.getY(i))) ? 1 : 0;
      veil.needsUpdate = true;
    }
  }
  function setVeil(veiled: readonly HexKey[]): void {
    veiledNow = new Set(veiled.map((k) => { const { q, r } = parse(k); return hexId(q, r); }));
    paintVeil();
  }

  // The SVG board's camera (cx, cy, scale in board units and px per unit) and viewport, unchanged. The camera looks
  // down at the elevation whose sine is SQUASH, so a ground point lands on exactly the SVG board point.
  const target = new Vector3();
  const dir = new Vector3(0, -SQUASH, -COS_E);
  const dprNow = (): number => Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, MAX_DPR);
  function drawUnits(cam: TerrainCamera, vp: TerrainViewport): void {
    units?.draw(cam, vp, dprNow());
  }
  function draw(cam: TerrainCamera, vp: TerrainViewport): void {
    const dpr = dprNow();
    if (size.w !== vp.w || size.h !== vp.h || size.dpr !== dpr) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(vp.w, vp.h, false);
      size = { w: vp.w, h: vp.h, dpr };
    }
    const { cx, cy, scale } = cam;
    camera.left = -vp.w / 2 / scale; camera.right = vp.w / 2 / scale;
    camera.top = vp.h / 2 / scale; camera.bottom = -vp.h / 2 / scale;
    target.set(cx, 0, cy / SQUASH);
    camera.position.copy(target).addScaledVector(dir, -2000);
    camera.up.set(0, COS_E, -SQUASH);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    units?.draw(cam, vp, dpr);
  }

  function dispose(): void {
    units?.dispose();
    for (const p of cache.values()) { p.ground.dispose(); p.props?.dispose(); }
    cache.clear();
    ground.geometry.dispose();
    props.geometry.dispose();
    groundMat.dispose(); propMat.dispose(); outlineMat.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return {
    setMap, setVeil, draw, drawUnits, dispose, units,
    stats: () => ({ triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, tiles: tileCount }),
  };
}
