// The 3D unit figures, drawn on their own canvas above the board's tile svg and below the svg that carries every unit's
// status, badges and effects. Part of the lazy 3D chunk (terrain3d.ts creates it). The figures come from the board's
// scene (input.ts `glUnitsOf`), so they are exactly the units the svg would draw; nothing else ever enters this scene.
//
// Geometry is built once per figure look (type, colours, hero) and shared by every unit that looks the same; the
// materials are shared by all. Units are rebuilt only when the scene's units change; a move or a lunge only moves
// a unit's group for the frames it plays.
import {
  BackSide, CircleGeometry, Group, LinearSRGBColorSpace, Mesh, MeshBasicMaterial, OrthographicCamera, Quaternion,
  Scene, ShaderMaterial, Vector3, WebGLRenderer,
} from 'three';
import type { Material } from 'three';
import type { GlUnit } from '../unitsInput';
import { COS_E, SQUASH } from '../layout';
import { propFrag, propVert } from '../shaders';
import { buildFigure } from './figures';
import type { Figure } from './figures';
import { CLEAN } from './parts';

export interface UnitsCamera { cx: number; cy: number; scale: number }
export interface UnitsViewport { w: number; h: number }

/** A unit's place for this frame, in board units, while the svg slides or lunges it. */
export interface UnitPose { x: number; y: number }
/** A fallen unit while the svg plays its fall: its figure tipping over (radians, clockwise on screen) and fading. */
export interface UnitFall { key: string; type: GlUnit['type']; look: GlUnit['look']; x: number; y: number; angle: number; alpha: number }

export interface Units3d {
  /** The scene's units: new ones are added, gone ones removed, changed ones rebuilt. */
  setUnits(units: readonly GlUnit[]): void;
  /** Where units stand this frame while they move (others stay on their tiles), and the falls playing. */
  pose(at: ReadonlyMap<number, UnitPose>, falls: readonly UnitFall[]): void;
  draw(cam: UnitsCamera, vp: UnitsViewport, dpr: number): void;
  dispose(): void;
  stats(): { triangles: number; calls: number; units: number; looks: number; falls: number; dims: number };
}

/** The figures' hull, a little thinner than the terrain's (0.55), as the figures are small. */
const UNIT_OUTLINE = 0.5;
/** The soft blob under a figure: black at 18 percent, as the svg Shadow. */
const SHADOW_ALPHA = 0.18;

const lookKey = (type: string, look: GlUnit['look'], hero: boolean): string => `${type}|${look.main}|${look.dark}|${look.accent}|${hero ? 'h' : ''}`;

interface Placed { sig: string; unit: GlUnit; group: Group; alpha: number }

export function createUnits3d(canvas: HTMLCanvasElement, shared: Record<string, { value: unknown }>): Units3d | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const uniforms = (outline: boolean, alpha?: number): Record<string, { value: unknown }> => ({
    ...shared, uOutline: { value: outline ? UNIT_OUTLINE : 0 }, uIsOutline: { value: outline }, ...(alpha === undefined ? {} : { uAlpha: { value: alpha } }),
  });
  const fillMat = new ShaderMaterial({ uniforms: uniforms(false), vertexShader: propVert, fragmentShader: propFrag, vertexColors: true });
  const hullMat = new ShaderMaterial({ uniforms: uniforms(true), vertexShader: propVert, fragmentShader: propFrag, vertexColors: true, side: BackSide });
  const shadowGeo = new CircleGeometry(1, 20);
  const shadowMat = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOW_ALPHA, depthWrite: false });

  // A dimmed figure (an own spent or hidden unit, a fading fall) is see-through as one piece, as the svg group
  // opacity draws it: a depth-only pass first, then the colour pass blends only the nearest surface, once.
  interface Dim { depthFill: ShaderMaterial; depthHull: ShaderMaterial; fill: ShaderMaterial; hull: ShaderMaterial; shadow: MeshBasicMaterial }
  const dims = new Map<number, Dim>();
  function makeDim(a: number): Dim {
    const mk = (outline: boolean, colour: boolean): ShaderMaterial => new ShaderMaterial({
      uniforms: uniforms(outline, a), vertexShader: propVert, fragmentShader: propFrag, vertexColors: true,
      side: outline ? BackSide : undefined, defines: { UNIT_ALPHA: '' },
      colorWrite: colour, transparent: colour, depthWrite: !colour,
    });
    return {
      depthFill: mk(false, false), depthHull: mk(true, false), fill: mk(false, true), hull: mk(true, true),
      shadow: new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOW_ALPHA * a, depthWrite: false }),
    };
  }
  /** A fading figure's own materials take a new opacity in place: nothing is rebuilt while it fades. */
  function setDimAlpha(d: Dim, a: number): void {
    for (const m of [d.fill, d.hull]) (m.uniforms.uAlpha as { value: number }).value = a;
    d.shadow.opacity = SHADOW_ALPHA * a;
  }
  const disposeDim = (d: Dim): void => { for (const m of [d.depthFill, d.depthHull, d.fill, d.hull, d.shadow]) m.dispose(); };
  /** The shared materials of a steady dim level (spent 0.55, hidden 0.7). */
  function dimOf(alpha: number): Dim {
    const a = Math.round(alpha * 20) / 20;
    let d = dims.get(a);
    if (d === undefined) {
      d = makeDim(a);
      dims.set(a, d);
    }
    return d;
  }

  const looks = new Map<string, Figure>();
  function figureOf(type: GlUnit['type'], look: GlUnit['look'], hero: boolean): Figure {
    const k = lookKey(type, look, hero);
    let f = looks.get(k);
    if (f === undefined) {
      f = buildFigure(type, { look, wear: CLEAN, hero });
      looks.set(k, f);
    }
    return f;
  }

  /** One figure's meshes in a group whose origin is the tile centre on the ground; the feet stand 4 board units lower on screen, as the svg feet. */
  function makeGroup(type: GlUnit['type'], look: GlUnit['look'], hero: boolean, alpha: number, own?: Dim): Group {
    const f = figureOf(type, look, hero);
    const g = new Group();
    const body = new Group();
    body.position.set(0, 0, 4 / SQUASH);
    const dim = own ?? (alpha < 1 ? dimOf(alpha) : null);
    const sh = new Mesh(shadowGeo, dim !== null ? dim.shadow : shadowMat);
    sh.rotation.x = -Math.PI / 2;
    sh.scale.set(f.shadow.rx, f.shadow.rz, 1);
    sh.position.set(f.shadow.x + 1.2, 0.15, -0.6);
    sh.renderOrder = -1;
    const meshes: Mesh[] = [sh];
    if (dim !== null) {
      const d = dim;
      meshes.push(new Mesh(f.hull, d.depthHull), new Mesh(f.fill, d.depthFill), new Mesh(f.hull, d.hull), new Mesh(f.fill, d.fill));
    } else {
      meshes.push(new Mesh(f.hull, hullMat), new Mesh(f.fill, fillMat));
    }
    for (const m of meshes) { m.frustumCulled = false; body.add(m); }
    g.add(body);
    return g;
  }

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  const placed = new Map<number, Placed>();
  const ground = (x: number, y: number, out: Vector3): Vector3 => out.set(x, 0, y / SQUASH);

  function setUnits(units: readonly GlUnit[]): void {
    const keep = new Set<number>();
    for (const u of units) {
      keep.add(u.id);
      const sig = `${lookKey(u.type, u.look, u.hero)}|${u.alpha}`;
      let p = placed.get(u.id);
      if (p !== undefined && p.sig !== sig) {
        scene.remove(p.group);
        p = undefined;
      }
      if (p === undefined) {
        p = { sig, unit: u, group: makeGroup(u.type, u.look, u.hero, u.alpha), alpha: u.alpha };
        scene.add(p.group);
        placed.set(u.id, p);
      }
      p.unit = u;
      ground(u.x, u.y, p.group.position);
    }
    for (const [id, p] of placed) {
      if (keep.has(id)) continue;
      scene.remove(p.group);
      placed.delete(id);
    }
  }

  // Falls: a figure of the fallen unit, turned about the line of sight through its tile centre and fading.
  const axis = new Vector3(0, -SQUASH, -COS_E); // the camera's view direction: a turn about it is a turn on screen
  const fallen = new Map<string, { group: Group; dim: Dim }>();
  const q = new Quaternion();
  function pose(at: ReadonlyMap<number, UnitPose>, falls: readonly UnitFall[]): void {
    for (const p of placed.values()) {
      const now = at.get(p.unit.id);
      ground(now?.x ?? p.unit.x, now?.y ?? p.unit.y, p.group.position);
    }
    const live = new Set<string>();
    for (const f of falls) {
      if (!(f.alpha > 0)) continue;
      const k = `${f.key}|${lookKey(f.type, f.look, false)}`;
      live.add(k);
      let g = fallen.get(k);
      if (g === undefined) {
        const dim = makeDim(f.alpha);
        g = { group: makeGroup(f.type, f.look, false, f.alpha, dim), dim };
        scene.add(g.group);
        fallen.set(k, g);
      }
      setDimAlpha(g.dim, f.alpha);
      ground(f.x, f.y, g.group.position);
      g.group.quaternion.copy(q.setFromAxisAngle(axis, f.angle));
    }
    for (const [k, g] of fallen) {
      if (live.has(k)) continue;
      scene.remove(g.group);
      disposeDim(g.dim);
      fallen.delete(k);
    }
  }

  const target = new Vector3();
  const dir = new Vector3(0, -SQUASH, -COS_E);
  let size = { w: 0, h: 0, dpr: 0 };
  function draw(cam: UnitsCamera, vp: UnitsViewport, dpr: number): void {
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
    scene.clear();
    placed.clear();
    for (const g of fallen.values()) disposeDim(g.dim);
    fallen.clear();
    for (const f of looks.values()) { f.fill.dispose(); f.hull.dispose(); }
    looks.clear();
    const mats: Material[] = [fillMat, hullMat, shadowMat];
    for (const d of dims.values()) mats.push(d.depthFill, d.depthHull, d.fill, d.hull, d.shadow);
    dims.clear();
    for (const m of mats) m.dispose();
    shadowGeo.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return {
    setUnits, pose, draw, dispose,
    stats: () => ({ triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, units: placed.size, looks: looks.size, falls: fallen.size, dims: dims.size }),
  };
}

