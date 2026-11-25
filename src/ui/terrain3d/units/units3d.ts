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
import { ARM, buildFigure, STONE_PIECE } from './figures';
import type { Figure } from './figures';
import { CLEAN } from './parts';
import { armSwing, idleKind, idlePose, settleWeight, stoneLoaded } from './idle';
import type { IdleKind } from './idle';
import { AIM_TURN_MS, aimYaw, facingBusy, facingYaw, heldAt, moveYaw, queueTurn, REST_FACING, settle, TURN_MS, turnNow, wrap } from './facing';
import type { Facing as Face } from './facing';

export interface UnitsCamera { cx: number; cy: number; scale: number }
export interface UnitsViewport { w: number; h: number }

/** A unit's place for this frame, in board units, while the svg slides or lunges it, and how far into a lunge it is (0 to 1). */
export interface UnitPose { x: number; y: number; lunge?: number }
/** A fallen unit while the svg plays its fall: its figure tipping over (radians, clockwise on screen) and fading. */
export interface UnitFall { key: string; type: GlUnit['type']; look: GlUnit['look']; x: number; y: number; angle: number; alpha: number }

export interface Units3d {
  /**
   * The scene's units: new ones are added (in their rest facing), gone ones removed, changed ones rebuilt. One that
   * stands on a new point turns to face the way it went, and one that has just hunkered turns back to rest; the turns
   * start at `nowMs` (the clock tick is given; by default the last tick's time).
   */
  setUnits(units: readonly GlUnit[], nowMs?: number): void;
  /**
   * Unit `id` attacks the board point (x, y) from `from` (by default the point it stands on now; a unit that attacked
   * and then advanced lunged from its old point): it turns to aim at it, so that the turn is round by `atMs` (when
   * its lunge starts) or as soon after as the turns before it allow. Several aims in one action (a chain) are faced
   * in order. It keeps that facing until its next move, attack or hunker.
   */
  aim(id: number, x: number, y: number, nowMs: number, atMs?: number, from?: { x: number; y: number }): void;
  /**
   * Units that have died: their remembered facing is dropped (a unit that only went out of sight keeps it, and is
   * shown facing that way when it is seen again).
   */
  forget(ids: Iterable<number>): void;
  /** Whether any figure is still turning (or waiting to turn) at `nowMs`, so its frames must go on being drawn. */
  turning(nowMs: number): boolean;
  /** Where units stand this frame while they move (others stay on their tiles), and the falls playing. */
  pose(at: ReadonlyMap<number, UnitPose>, falls: readonly UnitFall[]): void;
  /**
   * Pose every figure for time `nowMs`: idle life scaled by `level` (0 still, 1 full; none for units that move, eased
   * out as they start and back in after), and the trebuchet's swing in a lunge.
   */
  tick(nowMs: number, level: number): void;
  /** Whether a figure with idle life stands in the camera's view. */
  onScreen(cam: UnitsCamera, vp: UnitsViewport): boolean;
  /** Drawn with the figures, on their canvas: the terrain puts its waterfalls here. */
  readonly extras: Group;
  draw(cam: UnitsCamera, vp: UnitsViewport, dpr: number): void;
  dispose(): void;
  stats(): { triangles: number; calls: number; units: number; looks: number; falls: number; dims: number };
}

/** The figures' hull, a little thinner than the terrain's (0.55), as the figures are small. */
const UNIT_OUTLINE = 0.5;
/** The soft blob under a figure: black at 18 percent, as the svg Shadow. */
const SHADOW_ALPHA = 0.18;

const lookKey = (type: string, look: GlUnit['look'], hero: boolean): string => `${type}|${look.main}|${look.dark}|${look.accent}|${hero ? 'h' : ''}`;

interface Built { group: Group; body: Group; arm: Group | null; armAxis: Vector3; stone: Group | null; shadow: Mesh; shadowX: number }
interface Placed extends Built {
  sig: string; unit: GlUnit; alpha: number; kind: IdleKind;
  /** Moving in this frame (a slide or a lunge), and when it last was (ms), so its idle life eases back in. */
  moving: boolean; restSince: number; lunge: number | null;
  /** The idle weight shown last frame, so a unit that starts to move eases out of its idle pose. */
  weight: number;
}
/** How long a figure takes to ease out of its idle pose when it starts to move or lunge. */
const EASE_OUT_MS = 150;
/** The figure's body stands this far toward the viewer from the tile centre: its feet are 4 board units lower on screen. */
const FEET_Z = 4 / SQUASH;
/** The ground shadow sits this far right of the figure's own centre (the light is from the upper left) and back. */
const SHADOW_DX = 1.2, SHADOW_DZ = -0.6;

/** A unit's facing, kept by id across rebuilds (a unit that is spent after a move is rebuilt dimmed, still facing its move). */
interface Facing { type: GlUnit['type']; x: number; y: number; hunkered: boolean; face: Face }

/** Whether the player asks for less motion: turns are then made at once. Read when a turn starts, never at import. */
function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Turn the figure's body and its ground shadow to yaw `yaw` from rest (radians about the vertical). */
function placeShadow(b: Pick<Built, 'shadow' | 'shadowX'>, yaw: number): void {
  // The footprint turns with the figure; the light's offset does not.
  b.shadow.rotation.set(-Math.PI / 2, 0, yaw);
  b.shadow.position.set(b.shadowX * Math.cos(yaw) + SHADOW_DX, 0.15, FEET_Z - b.shadowX * Math.sin(yaw) + SHADOW_DZ);
}

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
  // The figures turn (facing.ts), so their normals are taken to world space for the light, which stays put.
  const fillMat = new ShaderMaterial({ uniforms: uniforms(false), vertexShader: propVert, fragmentShader: propFrag, vertexColors: true, defines: { WORLD_NORMAL: '' } });
  const hullMat = new ShaderMaterial({ uniforms: uniforms(true), vertexShader: propVert, fragmentShader: propFrag, vertexColors: true, side: BackSide, defines: { WORLD_NORMAL: '' } });
  const shadowGeo = new CircleGeometry(1, 20);
  const shadowMat = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOW_ALPHA, depthWrite: false });

  // A dimmed figure (an own spent or hidden unit, a fading fall) is see-through as one piece, as the svg group
  // opacity draws it: a depth-only pass first, then the colour pass blends only the nearest surface, once.
  interface Dim { depthFill: ShaderMaterial; depthHull: ShaderMaterial; fill: ShaderMaterial; hull: ShaderMaterial; shadow: MeshBasicMaterial }
  const dims = new Map<number, Dim>();
  function makeDim(a: number): Dim {
    const mk = (outline: boolean, colour: boolean): ShaderMaterial => new ShaderMaterial({
      uniforms: uniforms(outline, a), vertexShader: propVert, fragmentShader: propFrag, vertexColors: true,
      side: outline ? BackSide : undefined, defines: { UNIT_ALPHA: '', WORLD_NORMAL: '' },
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
  function makeGroup(type: GlUnit['type'], look: GlUnit['look'], hero: boolean, alpha: number, own?: Dim): Built {
    const f = figureOf(type, look, hero);
    const g = new Group();
    const body = new Group();
    body.position.set(0, 0, FEET_Z);
    const dim = own ?? (alpha < 1 ? dimOf(alpha) : null);
    // The shadow lies in the figure's group, not its body: idle life does not lift it, and a turn turns only its shape.
    const sh = new Mesh(shadowGeo, dim !== null ? dim.shadow : shadowMat);
    sh.scale.set(f.shadow.rx, f.shadow.rz, 1);
    sh.renderOrder = -1;
    sh.frustumCulled = false;
    const meshes: Mesh[] = [];
    if (dim !== null) {
      const d = dim;
      meshes.push(new Mesh(f.hull, d.depthHull), new Mesh(f.fill, d.depthFill), new Mesh(f.hull, d.hull), new Mesh(f.fill, d.fill));
    } else {
      meshes.push(new Mesh(f.hull, hullMat), new Mesh(f.fill, fillMat));
    }
    for (const m of meshes) { m.frustumCulled = false; body.add(m); }
    // Moving pieces (the trebuchet's arm and stone): each in a group at its pivot, so turning the group swings it.
    const piece = (name: string): Group | null => {
      const pc = f.pieces[name];
      if (pc === undefined) return null;
      const at = new Group();
      at.position.set(...pc.pivot);
      const inner = new Group();
      inner.position.set(-pc.pivot[0], -pc.pivot[1], -pc.pivot[2]);
      const ms = dim !== null
        ? [new Mesh(pc.hull, dim.depthHull), new Mesh(pc.fill, dim.depthFill), new Mesh(pc.hull, dim.hull), new Mesh(pc.fill, dim.fill)]
        : [new Mesh(pc.hull, hullMat), new Mesh(pc.fill, fillMat)];
      for (const m of ms) { m.frustumCulled = false; inner.add(m); }
      at.add(inner);
      body.add(at);
      return at;
    };
    const arm = piece(ARM);
    const stone = piece(STONE_PIECE);
    const axis = f.pieces[ARM]?.axis;
    g.add(body);
    g.add(sh);
    const built = { group: g, body, arm, stone, armAxis: axis ? new Vector3(...axis) : new Vector3(0, 0, 1), shadow: sh, shadowX: f.shadow.x };
    placeShadow(built, 0);
    return built;
  }

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  const placed = new Map<number, Placed>();
  const ground = (x: number, y: number, out: Vector3): Vector3 => out.set(x, 0, y / SQUASH);
  const facings = new Map<number, Facing>();
  const turnMs = (ms: number): number => (reducedMotion() ? 0 : ms);
  // The facing of a unit that has just left the scene, by its look and tile, so its fall starts the way it stood.
  const gone = new Map<string, { yaw: number; at: number }>();
  // The facing of each unit that has gone out of sight (not died), by id, so it is seen again the way it stood.
  const unseen = new Map<number, { type: GlUnit['type']; yaw: number }>();
  const spot = (type: string, x: number, y: number): string => `${type}@${Math.round(x * 10)},${Math.round(y * 10)}`;
  const GONE_MS = 3000;

  function setUnits(units: readonly GlUnit[], nowMs?: number): void {
    const now = nowMs ?? clock;
    const keep = new Set<number>();
    for (const u of units) {
      keep.add(u.id);
      const fc = facings.get(u.id);
      if (fc === undefined) {
        // First seen: at rest. Seen again after it went out of sight: as it stood when last seen (where it went
        // meanwhile is not known, so it is not turned for that).
        const was = unseen.get(u.id);
        unseen.delete(u.id);
        const face = was !== undefined && was.type === u.type ? heldAt(was.yaw) : REST_FACING;
        facings.set(u.id, { type: u.type, x: u.x, y: u.y, hunkered: u.hunkered, face });
      } else {
        if (u.x !== fc.x || u.y !== fc.y) {
          // A move (a slide, a lure, an advance): face the way it went.
          const yaw = moveYaw(u.type, u.x - fc.x, u.y - fc.y);
          if (yaw !== null) fc.face = turnNow(fc.face, yaw, now, turnMs(TURN_MS));
        } else if (u.hunkered && !fc.hunkered) {
          fc.face = turnNow(fc.face, 0, now, turnMs(TURN_MS));
        }
        fc.type = u.type; fc.x = u.x; fc.y = u.y; fc.hunkered = u.hunkered;
      }
      const sig = `${lookKey(u.type, u.look, u.hero)}|${u.alpha}`;
      let p = placed.get(u.id);
      if (p !== undefined && p.sig !== sig) {
        scene.remove(p.group);
        p = undefined;
      }
      if (p === undefined) {
        p = { sig, unit: u, ...makeGroup(u.type, u.look, u.hero, u.alpha), alpha: u.alpha, kind: idleKind(u.type), moving: false, restSince: -Infinity, lunge: null, weight: 0 };
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
    for (const [k, g] of gone) if (now - g.at > GONE_MS) gone.delete(k);
    for (const [id, fc] of facings) {
      if (keep.has(id)) continue;
      const yaw = wrap(facingYaw(fc.face, now));
      gone.set(spot(fc.type, fc.x, fc.y), { yaw, at: now });
      unseen.set(id, { type: fc.type, yaw });
      facings.delete(id);
    }
  }

  function aim(id: number, x: number, y: number, nowMs: number, atMs = nowMs, from?: { x: number; y: number }): void {
    const fc = facings.get(id);
    if (fc === undefined) return;
    const yaw = aimYaw(fc.type, x - (from?.x ?? fc.x), y - (from?.y ?? fc.y));
    if (yaw === null) return;
    fc.face = queueTurn(fc.face, yaw, nowMs, turnMs(AIM_TURN_MS), atMs);
  }
  function forget(ids: Iterable<number>): void {
    for (const id of ids) unseen.delete(id);
  }
  function anyTurning(nowMs: number): boolean {
    for (const id of placed.keys()) {
      const fc = facings.get(id);
      if (fc === undefined) continue;
      fc.face = settle(fc.face, nowMs);
      if (facingBusy(fc.face, nowMs)) return true;
    }
    return false;
  }

  // Falls: a figure of the fallen unit, turned about the line of sight through its tile centre and fading.
  const axis = new Vector3(0, -SQUASH, -COS_E); // the camera's view direction: a turn about it is a turn on screen
  const fallen = new Map<string, { group: Group; dim: Dim }>();
  const q = new Quaternion();
  const Z = new Vector3(0, 0, 1), Y = new Vector3(0, 1, 0);
  function pose(at: ReadonlyMap<number, UnitPose>, falls: readonly UnitFall[]): void {
    for (const p of placed.values()) {
      const now = at.get(p.unit.id);
      ground(now?.x ?? p.unit.x, now?.y ?? p.unit.y, p.group.position);
      p.moving = now !== undefined;
      p.lunge = now?.lunge ?? null;
      if (p.moving) p.restSince = clock;
    }
    const live = new Set<string>();
    for (const f of falls) {
      if (!(f.alpha > 0)) continue;
      const k = `${f.key}|${lookKey(f.type, f.look, false)}`;
      live.add(k);
      let g = fallen.get(k);
      if (g === undefined) {
        const dim = makeDim(f.alpha);
        const b = makeGroup(f.type, f.look, false, f.alpha, dim);
        // It falls facing the way it stood.
        const yaw = gone.get(spot(f.type, f.x, f.y))?.yaw ?? 0;
        b.body.quaternion.setFromAxisAngle(Y, yaw);
        placeShadow(b, yaw);
        g = { group: b.group, dim };
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

  // Idle life and the trebuchet's throw, posed for the time of the frame. Only the body group and the arm's pivot
  // group turn; the figure's group stays on its tile, so a figure never leaves its tile or its status plate.
  let clock = 0;
  const qa = new Quaternion(), qb = new Quaternion();
  function tick(nowMs: number, level: number): void {
    const dt = Math.min(100, Math.max(0, nowMs - clock));
    clock = nowMs;
    for (const p of placed.values()) {
      if (p.moving) p.restSince = nowMs;
      const target = p.moving ? 0 : settleWeight(nowMs - p.restSince);
      // Into motion: ease out over EASE_OUT_MS rather than snap; back to rest: the settle curve brings it in.
      p.weight = target < p.weight ? Math.max(target, p.weight - dt / EASE_OUT_MS) : target;
      const ip = idlePose(p.kind, p.unit.id, nowMs / 1000, p.weight * Math.min(1, Math.max(0, level)));
      p.body.position.set(ip.shift, ip.bob, FEET_Z);
      // The facing turns the body about its feet; the idle tilt stays a sway in the plane of the screen.
      const fc = facings.get(p.unit.id);
      if (fc !== undefined) fc.face = settle(fc.face, nowMs);
      const face = fc === undefined ? 0 : facingYaw(fc.face, nowMs);
      p.body.quaternion.copy(qa.setFromAxisAngle(Z, ip.tilt)).multiply(qb.setFromAxisAngle(Y, face + ip.yaw));
      placeShadow(p, face);
      p.body.scale.set(1, 1 + ip.breathe, 1);
      if (p.arm !== null) {
        const angle = armSwing(p.lunge) + ip.arm;
        p.arm.quaternion.setFromAxisAngle(p.armAxis, angle);
        if (p.stone !== null) {
          p.stone.quaternion.copy(p.arm.quaternion);
          p.stone.visible = stoneLoaded(p.lunge);
        }
      }
    }
  }
  function onScreen(cam: UnitsCamera, vp: UnitsViewport): boolean {
    const hw = vp.w / 2 / cam.scale + 40, hh = vp.h / 2 / cam.scale + 60;
    for (const p of placed.values()) {
      if (p.kind === 'none') continue;
      if (Math.abs(p.unit.x - cam.cx) <= hw && Math.abs(p.unit.y - cam.cy) <= hh) return true;
    }
    return false;
  }
  const extras = new Group();
  scene.add(extras);

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
    facings.clear();
    gone.clear();
    unseen.clear();
    for (const g of fallen.values()) disposeDim(g.dim);
    fallen.clear();
    for (const f of looks.values()) {
      f.fill.dispose(); f.hull.dispose();
      for (const pc of Object.values(f.pieces)) { pc.fill.dispose(); pc.hull.dispose(); }
    }
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
    setUnits, aim, forget, turning: anyTurning, pose, tick, onScreen, extras, draw, dispose,
    stats: () => ({ triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, units: placed.size, looks: looks.size, falls: fallen.size, dims: dims.size }),
  };
}

