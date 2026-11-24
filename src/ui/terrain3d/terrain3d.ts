// The 3D terrain renderer, loaded as its own chunk only when the option is on (Board imports it dynamically, so
// three.js is never downloaded otherwise). It draws on a canvas under the board's svg, aimed with the board's own
// camera, and renders only when asked: when the camera moves or the map changes, never in a loop.
import {
  BackSide, BufferGeometry, Color, ColorManagement, DataTexture, LinearSRGBColorSpace, Mesh, NearestFilter,
  OrthographicCamera, RGBAFormat, Scene, ShaderMaterial, Vector3, WebGLRenderer,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HexKey } from '../../engine';
import { fogGeometry, tilePieces } from './build';
import type { TilePieces } from './build';
import type { GlMap, GlTile } from './input';
import { COS_E, EDGE_NB, parse, SQUASH } from './layout';
import { groundFrag, groundVert, propFrag, propVert } from './shaders';

export interface TerrainCamera { cx: number; cy: number; scale: number }
export interface TerrainViewport { w: number; h: number }

export interface Terrain3d {
  /** Rebuild what changed. Tiles are cached by what they show and what their neighbours show. */
  setMap(map: GlMap): void;
  /** Dim the tiles no unit can see now, as the SVG veil does. Cheap: no geometry is rebuilt. */
  setVeil(veiled: readonly HexKey[]): void;
  /** Aim at the board camera and render one frame. */
  draw(cam: TerrainCamera, vp: TerrainViewport): void;
  /** Free every GPU resource and the context. */
  dispose(): void;
  /** Triangles and draw calls of the last frame, for tests and tuning. */
  stats(): { triangles: number; calls: number; tiles: number };
}

/** The highest device pixel ratio the terrain renders at: sharp on phones, without paying for 3x. */
export const MAX_DPR = 2;
const VEIL_SIZE = 64;
const VEIL_OFFSET = 32;

const code = (t: GlTile | undefined): string =>
  t === undefined ? 'x' : `${t.terrain[0]}${t.resource ?? '-'}${t.building ?? '-'}${t.village ? 'v' : ''}${t.treasure ? 't' : ''}${t.road ? 'r' : ''}${t.city ? 'c' : ''}`;

/**
 * Make the renderer, or null when this device has no WebGL 2 (the board then stays all SVG). The options are for
 * the art sample and tests: an opaque background, and a drawing buffer kept for reading back.
 */
export function createTerrain3d(canvas: HTMLCanvasElement, onLost: () => void, opts: { background?: string; keepFrame?: boolean } = {}): Terrain3d | null {
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
  const lost = (e: Event): void => { e.preventDefault(); onLost(); };
  canvas.addEventListener('webglcontextlost', lost);

  const veilData = new Uint8Array(VEIL_SIZE * VEIL_SIZE * 4);
  const veilTex = new DataTexture(veilData, VEIL_SIZE, VEIL_SIZE, RGBAFormat);
  veilTex.magFilter = NearestFilter;
  veilTex.minFilter = NearestFilter;
  veilTex.needsUpdate = true;

  const shared = {
    uLightDir: { value: new Vector3(-0.55, 0.8, 0.28).normalize() }, // from the upper left, as the SVG art
    uLightColor: { value: new Color(1.05, 1.02, 0.96) }, // warm key
    uShadowColor: { value: new Color(0.68, 0.70, 0.80) }, // cool shade: the toon dark band
    uTint: { value: new Color(1, 1, 1) }, // a time of day grade, multiplied in last
    uVeilColor: { value: new Color('#1E2833') }, // theme.css .veil
    uTime: { value: 0 },
    uVeil: { value: veilTex },
  };
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
  }

  function setVeil(veiled: readonly HexKey[]): void {
    veilData.fill(0);
    for (const k of veiled) {
      const { q, r } = parse(k);
      const x = q + VEIL_OFFSET, y = r + VEIL_OFFSET;
      if (x < 0 || y < 0 || x >= VEIL_SIZE || y >= VEIL_SIZE) continue;
      veilData[(y * VEIL_SIZE + x) * 4] = 255;
    }
    veilTex.needsUpdate = true;
  }

  // The SVG board's camera (cx, cy, scale in board units and px per unit) and viewport, unchanged. The camera looks
  // down at the elevation whose sine is SQUASH, so a ground point lands on exactly the SVG board point.
  const target = new Vector3();
  const dir = new Vector3(0, -SQUASH, -COS_E);
  function draw(cam: TerrainCamera, vp: TerrainViewport): void {
    const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, MAX_DPR);
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
  }

  function dispose(): void {
    canvas.removeEventListener('webglcontextlost', lost);
    for (const p of cache.values()) { p.ground.dispose(); p.props?.dispose(); }
    cache.clear();
    ground.geometry.dispose();
    props.geometry.dispose();
    groundMat.dispose(); propMat.dispose(); outlineMat.dispose();
    veilTex.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return {
    setMap, setVeil, draw, dispose,
    stats: () => ({ triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, tiles: tileCount }),
  };
}
