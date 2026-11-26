// The 3D terrain renderer, loaded as its own chunk only when the option is on (Board imports it dynamically, so
// three.js is never downloaded otherwise). It draws on a canvas under the board's svg, aimed with the board's own
// camera, and renders only when asked: when the camera moves or the map changes, never in a loop. The waterfalls at
// the board's rim and the figures' idle life are drawn on the units canvas, which alone redraws in the board's
// ambient loop (ambient.ts), so the terrain itself is never redrawn for them.
import {
  BackSide, BufferGeometry, Color, ColorManagement, Float32BufferAttribute, LinearSRGBColorSpace, Mesh,
  OrthographicCamera, Scene, ShaderMaterial, Vector3, WebGLRenderer,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HexKey } from '../../engine';
import { fogGeometry, tilePieces } from './build';
import type { TilePieces } from './build';
import { tileCode } from './codes';
import type { GlMap, GlTile } from './input';
import { centre, COS_E, EDGE_NB, heightFn, parse, SQUASH, tileSetup } from './layout';
import { groundFrag, groundVert, propFrag, propVert } from './shaders';
import { createFalls } from './falls';
import { createBorders } from './borders';
import { createLanterns } from './lanterns';
import { anyInView } from './fallsLayout';
import { createUnits3d } from './units/units3d';
import { createWheels } from './wheels';
import { createChests } from './chests';
import { createSmoke } from './smoke';
import { createFish, createSurface, frontOf } from './water';
import { chestPlays, chestSpots } from './buildingLayout';
import type { Units3d } from './units/units3d';
import { createWeather } from './weather';
import { skyLight } from './sky';
import type { Look } from '../../app/advanced';

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
  /** Pose the figures and the falling water for `nowMs`, the motion scaled by `level` (0 holds everything still). */
  tick(nowMs: number, level: number): void;
  /** Whether anything that animates (a figure, a waterfall) is in view; false when nothing animates at all. */
  animating(cam: TerrainCamera, vp: TerrainViewport): boolean;
  /** The waterfalls on the map, for tests. */
  falls(): number;
  /**
   * The mine lanterns and furnaces on the map, each flicker voice's brightness now, and the triangles of the lit
   * tunnel insides and their depth-only fronts, for tests.
   */
  lanterns(): { count: number; glow: [number, number]; tunnel: { lit: number; front: number } };
  /** water3d: the water's surface triangles, and the fish (tiles, fish, their clock, triangles, occluder), for tests. */
  water(): { surface: number; fish: { tiles: number; fish: number; time: number; triangles: number; occluder: number } };
  /** The smoking chimneys on the map and the smoke's clock now, for tests. */
  smoke(): { count: number; time: number };
  /**
   * Treasure claimed (the action's claim effects: the tile and its delay): each chest the map showed there opens, its
   * lid swinging back, then fades away. Nothing with reduced motion (`reduced`), or without the units canvas.
   */
  chests(claims: readonly { at: HexKey; delay: number }[], nowMs: number, reduced: boolean): void;
  /** Whether a chest is opening at `nowMs` (the board keeps drawing the figures' canvas while one is). */
  playing(nowMs: number): boolean;
  /** The lumber mills' wheels on the map and the first one's turn now, for tests. */
  wheels(): { count: number; angle: number; triangles: number };
  /** The chests opening now, for tests. */
  opening(): { key: string; lid: number; alpha: number }[];
  /** Triangles in the territory border mesh, for tests. */
  borderTriangles(): number;
  /** The 3D unit figures, or null when there is no units canvas or it has no WebGL 2 (the svg then draws the units). */
  readonly units: Units3d | null;
  /**
   * The match's weather and time of day (a look only), at the round both players share (dawn and dusk change over
   * the match: daylight.ts). Takes effect on the next frame drawn.
   */
  setLook(look: Look, round?: number): void;
  /** The look in use and its weather's particles and triangles, for tests and tuning. */
  look(): Look & { particles: number; triangles: number; clock: number };
  /** Free every GPU resource and the context. */
  dispose(): void;
  /** Triangles and draw calls of the last frame, for tests and tuning. */
  stats(): { triangles: number; calls: number; tiles: number };
}

/** The highest device pixel ratio the terrain renders at: sharp on phones, without paying for 3x. */
export const MAX_DPR = 2;

const code = (t: GlTile | undefined): string => (t === undefined ? 'x' : tileCode(t));

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
    // The match's look (sky.ts): snow dusting, wet ground, lit windows, and the lanterns' brightness.
    uSnow: { value: 0 }, uWet: { value: 0 }, uWindows: { value: 0 }, uGlowBoost: { value: 1 },
    // The light on mist and smoke (1 by day), and how dark the figures' cast shadows are (units3d.ts).
    uAir: { value: new Color(1, 1, 1) }, uCast: { value: 0.42 },
  };
  // The unit figures draw on a second canvas, above the tile svg (cities, villages and marks) and below the svg
  // that carries every unit's status, so a unit standing in a city is never covered by it. Same light, same shaders,
  // but their own lighter grade and no snow or wet, so the figures stay readable at night and in any weather.
  const unitShared = { ...shared, uTint: { value: new Color(1, 1, 1) }, uSnow: { value: 0 }, uWet: { value: 0 }, uWindows: { value: 0 } };
  const units = opts.units ? createUnits3d(opts.units, unitShared) : null;
  // The waterfalls go with the figures, whose canvas redraws on its own; without it they stand still on the terrain.
  const falls = createFalls(shared);
  // Territory borders lie on the ground; what stands in front of one hides it, and it shows through faintly.
  const borders = createBorders();
  // The mines' lanterns (and the foundries' furnaces) flicker, so their light goes with the figures too.
  // With the figures' canvas, the lantern also lights its tunnel's inside there, over the terrain's unlit copy.
  const lanterns = createLanterns(shared, units !== null);
  // The lumber mills' wheels turn in the same loop; a claimed chest opens on the figures' canvas.
  const wheels = createWheels(shared);
  // Chimney smoke (camps, mills, foundries) drifts on the same clock as the waterfalls' mist.
  const smoke = createSmoke(shared);
  const chestsFx = units ? createChests(shared) : null;
  // water3d: the clear surface over the beds lies on the terrain; the fish swim on the figures' canvas, which redraws.
  const surface = createSurface(shared);
  const fish = createFish(shared, units !== null);
  // The weather (rain, snow, cloud shadows): with the figures, which redraw in the ambient loop.
  const weather = createWeather(shared);
  const groundMat = new ShaderMaterial({ uniforms: shared, vertexShader: groundVert, fragmentShader: groundFrag });
  const propUniforms = (outline: boolean): Record<string, { value: unknown }> => ({ ...shared, uOutline: { value: outline ? 0.55 : 0 }, uIsOutline: { value: outline } });
  const propMat = new ShaderMaterial({ uniforms: propUniforms(false), vertexShader: propVert, fragmentShader: propFrag, vertexColors: true });
  const outlineMat = new ShaderMaterial({ uniforms: propUniforms(true), vertexShader: propVert, fragmentShader: propFrag, vertexColors: true, side: BackSide });

  const scene = new Scene();
  const ground = new Mesh(new BufferGeometry(), groundMat);
  const props = new Mesh(new BufferGeometry(), propMat);
  const outline = new Mesh(props.geometry, outlineMat);
  for (const m of [ground, props, outline]) m.frustumCulled = false;
  scene.add(ground, outline, props, surface.mesh, borders.group);
  if (units) units.extras.add(falls.group, lanterns.group, wheels.group, smoke.group, chestsFx!.group, fish.group, weather.group);
  else scene.add(falls.group, lanterns.group, wheels.group, smoke.group, fish.group, weather.group);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 4000);

  const cache = new Map<string, TilePieces>();
  let tileCount = 0;
  let size = { w: 0, h: 0, dpr: 0 };

  function setMap(map: GlMap): void {
    const want = new Map<string, () => TilePieces>();
    const sigOf = new Map<HexKey, string>();
    for (const k of Object.keys(map.tiles)) {
      const { q, r } = parse(k);
      const sig = `${k}|${map.seed ?? 0}|${code(map.tiles[k])}|${EDGE_NB.map(([dq, dr]) => code(map.tiles[`${q + dq},${r + dr}`])).join(',')}`;
      want.set(sig, () => tilePieces(map, k));
      sigOf.set(k, sig);
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
    falls.setMap(map);
    borders.setMap(map);
    lanterns.setMap(map);
    wheels.setMap(map);
    smoke.setMap(map);
    surface.setMap(map);
    // What stands in front of each fish tile hides its fish, on the figures' canvas too.
    const occluders: BufferGeometry[] = [];
    for (const [k, t] of Object.entries(map.tiles)) {
      if (t.resource !== 'fish' || t.terrain !== 'water') continue;
      for (const f of frontOf(k)) {
        const g = cache.get(sigOf.get(f) ?? '')?.props;
        if (g) occluders.push(g);
      }
    }
    fish.setMap(map, occluders);
    weather.setMap(map);
    paintVeil();
    noteChests(map);
  }

  // Where each chest on the map stands (world space, on its ground), and those the last maps took away: a claim
  // reaches the board after the map without the chest, so it opens where the chest stood.
  let chestsNow = new Map<HexKey, { x: number; y: number; z: number; s: number }>();
  const chestsGone = new Map<HexKey, { x: number; y: number; z: number; s: number }>();
  function noteChests(map: GlMap): void {
    const next = new Map<HexKey, { x: number; y: number; z: number; s: number }>();
    for (const [k, s] of chestSpots(map)) {
      const was = chestsNow.get(k);
      const { q, r } = parse(k);
      const c = centre(q, r);
      const y = was !== undefined && was.x === c.x + s.x && was.z === c.z + s.z ? was.y : heightFn(tileSetup(map, k))(s.x, s.z);
      next.set(k, { x: c.x + s.x, y, z: c.z + s.z, s: s.s });
    }
    for (const [k, s] of chestsNow) if (!next.has(k)) chestsGone.set(k, s);
    for (const k of next.keys()) chestsGone.delete(k);
    while (chestsGone.size > 16) chestsGone.delete(chestsGone.keys().next().value!);
    chestsNow = next;
  }
  function chests(claims: readonly { at: HexKey; delay: number }[], nowMs: number, reduced: boolean): void {
    if (chestsFx === null) return;
    const spots = new Map([...chestsGone, ...chestsNow]);
    chestsFx.play(chestPlays(claims, spots, nowMs, reduced));
    for (const c of claims) chestsGone.delete(c.at);
  }

  // The veil: aVeil on every vertex, 1 where its tile (aHex) is veiled. Rewritten in place, so no rebuild.
  let veiledNow = new Set<number>();
  const hexId = (q: number, r: number): number => (q + 512) * 1024 + (r + 512);
  function paintVeil(): void {
    for (const geo of [ground.geometry, props.geometry, surface.mesh.geometry]) {
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
    falls.setVeil(veiled);
    lanterns.setVeil(veiled);
    wheels.setVeil(veiled);
    smoke.setVeil(veiled);
    fish.setVeil(veiled);
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

  // The water's own clock: it runs at the motion level, so it slows to a stop with the figures and starts where it left.
  let flowAt = -1, flow = 0;
  function tick(nowMs: number, level: number): void {
    units?.tick(nowMs, level);
    const dt = flowAt < 0 ? 0 : Math.min(0.1, Math.max(0, (nowMs - flowAt) / 1000));
    flowAt = nowMs;
    flow += dt * Math.min(1, Math.max(0, level));
    falls.setTime(flow);
    wheels.setTime(flow);
    smoke.setTime(flow);
    fish.setTime(flow);
    weather.setTime(flow);
    chestsFx?.tick(nowMs);
    // The lanterns flicker on the wall clock, scaled by the level: at rest and under reduced motion they hold steady.
    lanterns.setTime(nowMs / 1000, level);
  }
  function animating(cam: TerrainCamera, vp: TerrainViewport): boolean {
    if (units === null) return false;
    if (units.onScreen(cam, vp)) return true;
    if (chestsFx?.playing(performance.now()) === true) return true;
    if (weather.active()) return true; // rain, snow and clouds cover the whole board
    const hw = vp.w / 2 / cam.scale, hh = vp.h / 2 / cam.scale;
    const view = { x0: cam.cx - hw, x1: cam.cx + hw, y0: cam.cy - hh, y1: cam.cy + hh };
    return anyInView(falls.boxes(), view) || anyInView(lanterns.boxes(), view) || anyInView(wheels.boxes(), view) || anyInView(smoke.boxes(), view) || anyInView(fish.boxes(), view);
  }

  // The match's weather and time of day: new light, grade and weather, no geometry rebuilt. Day and Clear are the
  // light the board always had.
  let lookNow: Look = { weather: 'clear', time: 'day' };
  const setRgb = (u: { value: unknown }, c: readonly [number, number, number]): void => { (u.value as Color).setRGB(c[0], c[1], c[2]); };
  function setLook(look: Look, round = 1): void {
    lookNow = look;
    const sky = skyLight(look, round);
    (shared.uLightDir.value).set(sky.dir[0], sky.dir[1], sky.dir[2]).normalize();
    setRgb(shared.uLightColor, sky.light);
    setRgb(shared.uShadowColor, sky.shadow);
    setRgb(shared.uTint, sky.tint);
    setRgb(unitShared.uTint, sky.unitTint);
    shared.uGlowBoost.value = sky.glow;
    shared.uWindows.value = sky.windows;
    setRgb(shared.uAir, sky.air);
    shared.uCast.value = sky.cast;
    shared.uSnow.value = look.weather === 'snow' ? 1 : 0;
    shared.uWet.value = look.weather === 'rain' ? 1 : 0;
    weather.setWeather(look.weather);
  }

  function dispose(): void {
    weather.dispose();
    falls.dispose();
    borders.dispose();
    lanterns.dispose();
    wheels.dispose();
    smoke.dispose();
    surface.dispose();
    fish.dispose();
    chestsFx?.dispose();
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
    setMap, setVeil, draw, drawUnits, tick, animating, dispose, units, falls: () => falls.count(),
    setLook, look: () => { const w = weather.stats(); return { ...lookNow, particles: w.particles, triangles: w.triangles, clock: w.time }; },
    lanterns: () => ({ count: lanterns.count(), glow: lanterns.glow(), tunnel: lanterns.tunnel() }),
    smoke: () => ({ count: smoke.count(), time: smoke.time() }),
    water: () => ({ surface: surface.triangles(), fish: fish.stats() }),
    chests, playing: (nowMs) => chestsFx?.playing(nowMs) === true,
    wheels: () => ({ count: wheels.count(), angle: wheels.angle(), triangles: wheels.triangles() }),
    opening: () => chestsFx?.state() ?? [],
    borderTriangles: () => borders.triangles(),
    stats: () => ({ triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, tiles: tileCount }),
  };
}
