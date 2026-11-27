// The 3D unit figures, drawn on their own canvas above the board's tile svg and below the svg that carries every unit's
// status, badges and effects. Part of the lazy 3D chunk (terrain3d.ts creates it). The figures come from the board's
// scene (input.ts `glUnitsOf`), so they are exactly the units the svg would draw; nothing else ever enters this scene.
//
// Geometry is built once per figure look (type, colours, hero) and shared by every unit that looks the same; the
// materials are shared by all. Units are rebuilt only when the scene's units change; a move or a lunge only moves
// a unit's group for the frames it plays.
import {
  BackSide, BoxGeometry, BufferGeometry, CircleGeometry, ConeGeometry, CustomBlending, DoubleSide, Float32BufferAttribute, Group,
  LinearSRGBColorSpace, MaxEquation, Mesh, MeshBasicMaterial, OneFactor, OneMinusSrcAlphaFactor, OrthographicCamera, Quaternion, Scene,
  ShaderMaterial, SrcAlphaFactor, Vector3, Vector4, WebGLRenderer,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { coloured } from '../geom';
import { LAMP_REACH, LANTERN_GLSL, lampShape, lanternHang } from './lantern';
import { castShadow } from '../daylight';
import type { Material } from 'three';
import type { GlUnit } from '../unitsInput';
import { COS_E, R, SQ3, SQUASH } from '../layout';
// After layout.ts: layout, buildingLayout and townLayout import one another, and must load from layout.
import { lanternFlicker } from '../townLayout';
import { LANTERN_GLASS, MAX_LAMPS, propFrag, propVert } from '../shaders';
import { ARM, ARROW, buildFigure, RIDER, SHIELD, SPEAR_ARM, STONE_PIECE, WEAPON, WEAPON2 } from './figures';
import type { Figure } from './figures';
import { CLEAN } from './parts';
import { armSwing, idleKind, idlePose, settleWeight, stoneLoaded } from './idle';
import type { IdleKind } from './idle';
import { AIM_TURN_MS, aimYaw, facingBusy, facingYaw, frontsOf, heldAt, moveYaw, queueTurn, REST_FACING, settle, TURN_MS, turnNow, wrap } from './facing';
import type { Facing as Face } from './facing';
import { gaitKind, gaitPose, gaitWeight } from './gait';
import type { GaitKind } from './gait';
import { exchange, levelTurn, REACT_MS, reactPose, strikePose } from './strike';
import type { ReactKind, StrikeKind, StrikePose } from './strike';
import { CROUCH_MS, crouchAt, crouchBusy, crouchNow, crouchTo, guardOf } from './crouch';
import { SHADE_MS, SHADE_STEPS, shadeStep } from './shade';
import type { Crouch, Guard } from './crouch';

export interface UnitsCamera { cx: number; cy: number; scale: number }
export interface UnitsViewport { w: number; h: number }

/**
 * A unit's place for this frame, in board units, while the svg slides or lunges it, how far into a lunge it is (0 to
 * 1), and how far through the travel of a slide (0 to 1; absent while it turns on the spot before setting off).
 */
export interface UnitPose { x: number; y: number; lunge?: number; travel?: number }

/**
 * One attack of an action, for the strike and the block: the attacker, the unit attacked (when known), the board
 * points struck from and at, when the lunge starts (ms after `nowMs`), whether the unit attacked survives and
 * whether it strikes back.
 */
export interface AttackPlay {
  unit: number; target?: number; from: { x: number; y: number }; to: { x: number; y: number }; delay: number; survives: boolean; counter: boolean;
}
/** A fallen unit while the svg plays its fall: its figure tipping over (radians, clockwise on screen) and fading. */
export interface UnitFall { key: string; type: GlUnit['type']; look: GlUnit['look']; x: number; y: number; angle: number; alpha: number }

export interface Units3d {
  /**
   * The scene's units: new ones are added (in their rest facing, crouched if they are hunkered, darker if spent), gone
   * ones removed, changed ones rebuilt. One that is newly spent darkens over SHADE_MS, and lightens the same way when
   * its next turn starts (units/shade.ts); never see-through. One that stands on a new point turns to face the way it went, and one that has just
   * hunkered turns back to rest and eases into its crouch (units/crouch.ts); one no longer hunkered stands up. The
   * turns start at `nowMs` (the clock tick is given; by default the last tick's time).
   */
  setUnits(units: readonly GlUnit[], nowMs?: number, moveDelays?: ReadonlyMap<number, number>): void;
  /**
   * Unit `id` attacks the board point (x, y) from `from` (by default the point it stands on now; a unit that attacked
   * and then advanced lunged from its old point): it turns to aim at it, so that the turn is round by `atMs` (when
   * its lunge starts) or as soon after as the turns before it allow. Several aims in one action (a chain) are faced
   * in order. It keeps that facing until its next move, attack or hunker.
   */
  aim(id: number, x: number, y: number, nowMs: number, atMs?: number, from?: { x: number; y: number }): void;
  /**
   * Play the strikes of an action's attacks (each fitted to the attacker's weapon), the blocks or flinches of the
   * units that survive them, and any counter strikes, timed from `nowMs` (units/strike.ts). Nothing with reduced motion.
   */
  strikes(list: readonly AttackPlay[], nowMs: number): void;
  /**
   * Units that have died: their remembered facing is dropped (a unit that only went out of sight keeps it, and is
   * shown facing that way when it is seen again).
   */
  forget(ids: Iterable<number>): void;
  /**
   * Whether any figure is still turning (or waiting to turn), crouching or standing up, darkening or lightening, striking or blocking at
   * `nowMs`, so its frames must go on being drawn.
   */
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
  /** `lamps`: the lanterns lit in the last frame drawn (their pools are one draw call). */
  stats(): { triangles: number; calls: number; units: number; looks: number; falls: number; shades: number; lamps: number };
}

/** The figures' hull, a little thinner than the terrain's (0.55), as the figures are small. */
const UNIT_OUTLINE = 0.5;
/** The soft blob under a figure: black at 18 percent, as the svg Shadow. */
const SHADOW_ALPHA = 0.18;

const lookKey = (type: string, look: GlUnit['look'], hero: boolean, lantern = false): string =>
  `${type}|${look.main}|${look.dark}|${look.accent}|${hero ? 'h' : ''}|${lantern ? 'l' : ''}`;

/**
 * The lantern a unit carries (units/lantern.ts): a small iron frame round amber glass, with a cap and a ring. Its
 * glass is painted LANTERN_GLASS, which the figures' shader lights after dark (shaders.ts uLantern). Built once.
 */
function lanternGeometry(): BufferGeometry {
  const iron = '#3A3532', parts: BufferGeometry[] = [];
  const put = (g: BufferGeometry, x: number, y: number, z: number, colour: string, out: number): void => { g.translate(x, y, z); parts.push(coloured(g, colour, 0, out)); };
  put(new BoxGeometry(1.5, 2.0, 1.5), 0, 0, 0, LANTERN_GLASS, 0.5);
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]] as const) put(new BoxGeometry(0.3, 2.1, 0.3), x, 0, z, iron, 0);
  put(new BoxGeometry(1.9, 0.4, 1.9), 0, -1.15, 0, iron, 0.4);
  const cap = new ConeGeometry(1.35, 1.0, 4);
  cap.rotateY(Math.PI / 4);
  put(cap, 0, 1.5, 0, iron, 0.4);
  put(new BoxGeometry(0.3, 1.0, 0.3), 0, 2.3, 0, iron, 0.3);
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  g.scale(1.6, 1.6, 1.6);
  return g;
}

// The lanterns' light on the ground: one quad per lit lantern, laid on the ground about the point under the lantern
// and turned the way it shines (units/lantern.ts lampShape), all in one mesh (one draw call for every unit),
// rewritten each frame (a few floats a unit). The fragment shader shapes the light (units/lantern.ts lampLight: a
// smooth gradient brightest ahead, dark under the lantern, none behind and none where the unit's body blocks it).
/** The halo's radius round a lit lantern (world units). */
const HALO = 6;
// Each lantern also has a soft halo round the lantern itself (aKind 1), a quad facing the camera.
const poolVert = /* glsl */ `
attribute vec3 aCentre; attribute vec2 aHead; attribute vec2 aCorner; attribute float aBright; attribute float aKind; attribute vec2 aShape;
varying vec2 vLocal; varying float vBright; varying float vKind; varying vec2 vShape;
void main() {
  vLocal = aCorner; vBright = aBright; vKind = aKind; vShape = aShape;
  if (aKind > 0.5) {
    vec4 mv = viewMatrix * vec4(aCentre, 1.0);
    mv.xy += aCorner * ${HALO.toFixed(2)};
    gl_Position = projectionMatrix * mv;
    return;
  }
  vec3 side = vec3(aHead.y, 0.0, -aHead.x);
  vec3 w = aCentre + vec3(aHead.x, 0.0, aHead.y) * aCorner.x + side * aCorner.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const poolFrag = /* glsl */ `
${LANTERN_GLSL}
uniform float uLight;
varying vec2 vLocal; varying float vBright; varying float vKind; varying vec2 vShape;
void main() {
  if (vKind > 0.5) {
    float d = length(vLocal);
    if (d >= 1.0) discard;
    float n = 1.0 - d;
    gl_FragColor = vec4(1.0, 0.80, 0.45, clamp(0.9 * uLight * vBright * n * n, 0.0, 1.0));
    return;
  }
  float l = lampLight(vLocal, vShape);
  if (l <= 0.0) discard;
  gl_FragColor = vec4(1.0, 0.70, 0.34, clamp(1.25 * uLight * vBright * l, 0.0, 0.9));
}`;

/** The quad round a lantern's light: from LAMP_REACH ahead to 0.75 of it behind (the side quarters reach back). */
const POOL_BACK = LAMP_REACH * 0.75;

/**
 * A moving piece of a figure (the trebuchet's arm, a weapon, a shield, an arrow, the legs, a rider): its group,
 * turned about its pivot, and its crouch guard (units/crouch.ts) in figure space: a turn about `gAxis` and a shift.
 */
interface Piece {
  group: Group; pivot: Vector3; axis: Vector3; fwd: Vector3; up: Vector3; gAxis: Vector3; gAngle: number; gShift: Vector3;
  /** A spear's or a lance's line (figure space, unit length) and the turn about `axis` that levels it at the target. */
  shaft: Vector3 | null; levelTurn: number;
  /**
   * An arm that reaches with its weapon: the group that stretches it along its length (turned so its x runs from the
   * shoulder to the hand), the shoulder-to-hand line at rest (unit length) and its length.
   */
  reach: { stretch: Group; dir: Vector3; len: number } | null;
}
interface Built {
  group: Group; body: Group; arm: Group | null; armAxis: Vector3; stone: Group | null; pieces: Map<string, Piece>; shadow: Mesh; shadowX: number;
  /** Its opaque meshes (a fall's see-through ones are not listed), and whether each is the hull: a shade repaints them. */
  paint: { mesh: Mesh; hull: boolean }[];
  /** The lantern it carries (in its body), or null. */
  lamp: Group | null;
}
/** A strike or a reaction under way or waiting its time, on one unit (ms on the frame clock). */
type Act =
  | { kind: 'strike'; at: number; ms: number; strike: StrikeKind }
  | { kind: 'react'; at: number; react: ReactKind; dx: number; dz: number };
interface Placed extends Built {
  sig: string; unit: GlUnit; kind: IdleKind; gait: GaitKind;
  /** The shade step it is painted with now (0 as fresh, SHADE_STEPS fully spent). */
  step: number;
  /** Moving in this frame (a slide or a lunge), and when it last was (ms), so its idle life eases back in. */
  moving: boolean; restSince: number; lunge: number | null;
  /** The idle weight shown last frame, so a unit that starts to move eases out of its idle pose. */
  weight: number;
  /** The last move (board points), how far along it the figure is (hexes) and through its travel (0 to 1, or null). */
  trip: { x0: number; y0: number } | null; stride: number; travel: number | null;
  /** The crouch it takes when hunkered. */
  guard: Guard;
  /** The heading its front leads with this frame (radians, facing.ts), where its lantern's light falls. */
  heading: number;
}
/** The distance between neighbouring tile centres, in board units. */
const TILE_STEP = R * SQ3;
/** How long a figure takes to ease out of its idle pose when it starts to move or lunge. */
const EASE_OUT_MS = 150;
/** The figure's body stands this far toward the viewer from the tile centre: its feet are 4 board units lower on screen. */
const FEET_Z = 4 / SQUASH;
/**
 * The soft blob under a figure sits this far from its own centre, away from the light: the cast shadow's reach per
 * unit of height (daylight.ts castShadow) times BLOB_REACH, at most BLOB_MAX. By day that is about 1.2 right and 0.6
 * back, where it always sat.
 */
const BLOB_REACH = 2.85, BLOB_MAX = 1.8;
/** The cast shadow's layer: only the figures' opaque fills are on it (not their hulls, the blobs or the extras). */
const CAST_LAYER = 1;
/** The ground the figures stand on (world y), where their shadows lie, as the blob does. */
const CAST_PLANE = 0.15;
/** The cast shadow fades toward its tip, by up to CAST_FADE, over the height of a figure (world units). */
const CAST_FADE = 0.35, CAST_HEIGHT = 45;

// The cast shadow: each figure's opaque fill drawn again, squashed onto the ground along the light (a planar
// projection, in the vertex shader, so it follows every pose: a walk, a turn, a crouch, a strike) in flat black.
// Blended by MAX, so where parts or neighbours overlap the shadow is no darker; it lightens toward its tip.
const castVert = /* glsl */ `
uniform vec2 uStep;
varying float vH;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  float h = max(w.y - ${CAST_PLANE.toFixed(2)}, 0.0);
  vH = h;
  w.xz += uStep * h;
  w.y = ${CAST_PLANE.toFixed(2)};
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const castFrag = /* glsl */ `
uniform float uAlpha;
varying float vH;
void main() {
  gl_FragColor = vec4(0.0, 0.0, 0.0, uAlpha * (1.0 - ${CAST_FADE.toFixed(2)} * smoothstep(0.0, ${CAST_HEIGHT.toFixed(1)}, vH)));
}`;
/** MAX blending, for shadows laid on the clear canvas: overlaps keep the darker, never add up. */
const MAX_BLEND = { blending: CustomBlending, blendEquation: MaxEquation, blendEquationAlpha: MaxEquation } as const;

/** A unit's facing, kept by id across rebuilds (a unit seen again keeps the way it stood), with its crouch and shade. */
interface Facing {
  type: GlUnit['type']; x: number; y: number; hunkered: boolean; face: Face;
  /** A move's turn that waits for its slide to start (an advance waits for its blow). */
  later: { yaw: number; at: number } | null;
  /** Strikes and reactions to play. */
  acts: Act[];
  /** The hunker crouch, easing in or out. */
  crouch: Crouch;
  /** How spent it looks (0 fresh, 1 spent), easing as a crouch does. */
  shade: Crouch;
  spent: boolean;
}

/** Whether the player asks for less motion: turns are then made at once. Read when a turn starts, never at import. */
function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Turn the figure's ground shadow (the blob) to yaw `yaw` from rest (radians about the vertical), `off` from the light. */
function placeShadow(b: Pick<Built, 'shadow' | 'shadowX'>, yaw: number, off: { dx: number; dz: number }): void {
  // The footprint turns with the figure; the light's offset does not.
  b.shadow.rotation.set(-Math.PI / 2, 0, yaw);
  b.shadow.position.set(b.shadowX * Math.cos(yaw) + off.dx, CAST_PLANE, FEET_Z - b.shadowX * Math.sin(yaw) + off.dz);
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
  // Two passes a frame (the cast shadows, then the figures), cleared once and counted together.
  renderer.autoClear = false;
  renderer.info.autoReset = false;

  // The lit lanterns nearest the middle of the view (world positions, w 1 when lit) and how bright they are now: the
  // figures' vertex shader warms the faces turned toward them (shaders.ts, WORLD_NORMAL).
  const lampU = { uLamps: { value: Array.from({ length: MAX_LAMPS }, () => new Vector4(0, 0, 0, 0)) }, uLampLight: { value: 0 } };
  const uniforms = (outline: boolean, alpha?: number): Record<string, { value: unknown }> => ({
    ...shared, ...lampU, uOutline: { value: outline ? UNIT_OUTLINE : 0 }, uIsOutline: { value: outline }, ...(alpha === undefined ? {} : { uAlpha: { value: alpha } }),
  });
  // The figures turn (facing.ts), so their normals are taken to world space for the light, which stays put.
  const fillMat = new ShaderMaterial({ uniforms: uniforms(false), vertexShader: propVert, fragmentShader: propFrag, vertexColors: true, defines: { WORLD_NORMAL: '' } });
  const hullMat = new ShaderMaterial({ uniforms: uniforms(true), vertexShader: propVert, fragmentShader: propFrag, vertexColors: true, side: BackSide, defines: { WORLD_NORMAL: '' } });
  const shadowGeo = new CircleGeometry(1, 20);
  const lanternGeo = lanternGeometry();
  // The lanterns' pools of light on the ground (poolVert): grown as more units carry one, never shrunk.
  const poolU = { uLight: { value: 0 } };
  const poolMat = new ShaderMaterial({
    uniforms: poolU, vertexShader: poolVert, fragmentShader: poolFrag, depthWrite: false, depthTest: true,
    blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor,
  });
  const pools = new Mesh(new BufferGeometry(), poolMat);
  pools.frustumCulled = false;
  // After the bonfires' depth is cleared (bonfires.ts, -6), before the figures and their blobs; depth tested against
  // the built tiles' parts (lampMask.ts, drawn just before), so a building hides the light on the ground behind it.
  pools.renderOrder = -5;
  let poolCap = 0;
  function poolGeometry(cap: number): BufferGeometry {
    const g = new BufferGeometry();
    const corner: number[] = [], kind: number[] = [], index: number[] = [];
    for (let i = 0; i < cap; i++) {
      // Eight corners a lantern: its pool on the ground, then its halo.
      corner.push(-POOL_BACK, -LAMP_REACH, LAMP_REACH, -LAMP_REACH, LAMP_REACH, LAMP_REACH, -POOL_BACK, LAMP_REACH, -1, -1, 1, -1, 1, 1, -1, 1);
      kind.push(0, 0, 0, 0, 1, 1, 1, 1);
      for (const o of [0, 4]) index.push(8 * i + o, 8 * i + o + 1, 8 * i + o + 2, 8 * i + o, 8 * i + o + 2, 8 * i + o + 3);
    }
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(cap * 24), 3));
    g.setAttribute('aCentre', new Float32BufferAttribute(new Float32Array(cap * 24), 3));
    g.setAttribute('aHead', new Float32BufferAttribute(new Float32Array(cap * 16), 2));
    g.setAttribute('aCorner', new Float32BufferAttribute(corner, 2));
    g.setAttribute('aKind', new Float32BufferAttribute(kind, 1));
    g.setAttribute('aBright', new Float32BufferAttribute(new Float32Array(cap * 8), 1));
    g.setAttribute('aShape', new Float32BufferAttribute(new Float32Array(cap * 16), 2));
    g.setIndex(index);
    return g;
  }
  /** Lay each lit lantern's pool where its unit stands now, turned to its heading; and pick the lamps that warm the figures. */
  const lampAt = new Vector3();
  const lampList: { x: number; y: number; z: number; d: number }[] = [];
  function placeLamps(cx: number, cz: number): void {
    const light = typeof shared.uLantern?.value === 'number' ? shared.uLantern.value : 0;
    poolU.uLight.value = light;
    lampU.uLampLight.value = light;
    const lit: Placed[] = [];
    if (light > 0) for (const p of placed.values()) if (p.lamp !== null) lit.push(p);
    pools.visible = lit.length > 0;
    litNow = lit.length;
    for (const v of lampU.uLamps.value) v.w = 0;
    if (lit.length === 0) return;
    if (lit.length > poolCap) {
      poolCap = Math.max(16, 2 ** Math.ceil(Math.log2(lit.length)));
      pools.geometry.dispose();
      pools.geometry = poolGeometry(poolCap);
    }
    const g = pools.geometry;
    const c = g.attributes.aCentre!.array as Float32Array, h = g.attributes.aHead!.array as Float32Array, b = g.attributes.aBright!.array as Float32Array;
    const sh = g.attributes.aShape!.array as Float32Array;
    lampList.length = 0;
    lit.forEach((p, i) => {
      // The light falls about the point under the lantern, aimed the way it shines: the heading turned toward the
      // lantern's side by its shape's aim (a rider's out to its side, the trebuchet's straight out sideways).
      p.lamp!.getWorldPosition(lampAt);
      const shape = lampShape(p.unit.type);
      const aim = p.heading + shape.aim;
      const hx = Math.sin(aim), hz = Math.cos(aim);
      const fl = lanternFlicker(flickT, flickLevel, (p.unit.id % 2) as 0 | 1);
      for (let k = 0; k < 8; k++) {
        if (k < 4) c.set([lampAt.x, CAST_PLANE + 0.05, lampAt.z], 24 * i + 3 * k);
        else c.set([lampAt.x, lampAt.y, lampAt.z], 24 * i + 3 * k);
        h.set([hx, hz], 16 * i + 2 * k);
        sh.set([shape.core, shape.cut], 16 * i + 2 * k);
        b[8 * i + k] = fl;
      }
      lampList.push({ x: lampAt.x, y: lampAt.y, z: lampAt.z, d: Math.hypot(lampAt.x - cx, lampAt.z - cz) });
    });
    g.attributes.aCentre!.needsUpdate = true;
    g.attributes.aHead!.needsUpdate = true;
    g.attributes.aShape!.needsUpdate = true;
    g.attributes.aBright!.needsUpdate = true;
    g.setDrawRange(0, lit.length * 12);
    lampList.sort((a, z2) => a.d - z2.d);
    lampList.slice(0, MAX_LAMPS).forEach((l, i) => lampU.uLamps.value[i]!.set(l.x, l.y, l.z, 1));
  }
  let flickT = 0, flickLevel = 0, litNow = 0;
  const shadowMat = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOW_ALPHA, depthWrite: false, ...MAX_BLEND });
  const castMat = new ShaderMaterial({
    uniforms: { uStep: { value: [0, 0] }, uAlpha: { value: 0 } }, vertexShader: castVert, fragmentShader: castFrag,
    transparent: true, depthTest: false, depthWrite: false, side: DoubleSide, ...MAX_BLEND,
  });
  // The light as last read from the shared uniforms (the terrain's setLook changes them): the blob's offset and
  // strength, and the cast shadow's reach and darkness. By day the blob is where and as dark as it always was.
  const blobOff = { dx: 1.2, dz: -0.6 };
  let blobK = 1, castOn = true, lightKey = '';
  function readLight(): void {
    const d = shared.uLightDir?.value as Vector3 | undefined;
    const strength = typeof shared.uCast?.value === 'number' ? shared.uCast.value : 0.42;
    const key = d === undefined ? `-|${strength}` : `${d.x}|${d.y}|${d.z}|${strength}`;
    if (key === lightKey) return;
    lightKey = key;
    const c = castShadow(d === undefined ? [-0.55, 0.8, 0.28] : [d.x, d.y, d.z], strength);
    const len = Math.hypot(c.step[0], c.step[1]);
    const k = len > 0 ? Math.min(BLOB_MAX, len * BLOB_REACH) / len : 0;
    blobOff.dx = c.step[0] * k; blobOff.dz = c.step[1] * k;
    (castMat.uniforms.uStep as { value: number[] }).value = [c.step[0], c.step[1]];
    (castMat.uniforms.uAlpha as { value: number }).value = c.alpha;
    castOn = c.alpha > 0.004;
    // The blob is the figure's contact shade: it stays under every light, a little fainter when the light is.
    blobK = Math.min(1, 0.4 + 0.6 * (c.alpha / 0.42));
    shadowMat.opacity = SHADOW_ALPHA * blobK;
    for (const g of fallen.values()) setDimAlpha(g.dim, (g.dim.fill.uniforms.uAlpha as { value: number }).value);
    for (const p of placed.values()) placeShadow(p, p.shadow.rotation.z, blobOff);
  }

  // A fading fall is see-through as one piece, as the svg group opacity draws it: a depth-only pass first, then the
  // colour pass blends only the nearest surface, once. (No standing unit is ever see-through.)
  interface Dim { depthFill: ShaderMaterial; depthHull: ShaderMaterial; fill: ShaderMaterial; hull: ShaderMaterial; shadow: MeshBasicMaterial }
  function makeDim(a: number): Dim {
    const mk = (outline: boolean, colour: boolean): ShaderMaterial => new ShaderMaterial({
      uniforms: uniforms(outline, a), vertexShader: propVert, fragmentShader: propFrag, vertexColors: true,
      side: outline ? BackSide : undefined, defines: { UNIT_ALPHA: '', WORLD_NORMAL: '' },
      colorWrite: colour, transparent: colour, depthWrite: !colour,
    });
    return {
      depthFill: mk(false, false), depthHull: mk(true, false), fill: mk(false, true), hull: mk(true, true),
      shadow: new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOW_ALPHA * blobK * a, depthWrite: false, ...MAX_BLEND }),
    };
  }
  /** A fading figure's own materials take a new opacity in place: nothing is rebuilt while it fades. */
  function setDimAlpha(d: Dim, a: number): void {
    for (const m of [d.fill, d.hull]) (m.uniforms.uAlpha as { value: number }).value = a;
    d.shadow.opacity = SHADOW_ALPHA * blobK * a;
  }
  const disposeDim = (d: Dim): void => { for (const m of [d.depthFill, d.depthHull, d.fill, d.hull, d.shadow]) m.dispose(); };
  /** The shared opaque materials of each shade step (step 0 is the plain pair), made when first needed. */
  const shades = new Map<number, { fill: ShaderMaterial; hull: ShaderMaterial }>();
  function shadeMats(step: number): { fill: ShaderMaterial; hull: ShaderMaterial } {
    if (step <= 0) return { fill: fillMat, hull: hullMat };
    let m = shades.get(step);
    if (m === undefined) {
      const mk = (outline: boolean): ShaderMaterial => new ShaderMaterial({
        uniforms: { ...uniforms(outline), uShade: { value: step / SHADE_STEPS } }, vertexShader: propVert, fragmentShader: propFrag,
        vertexColors: true, side: outline ? BackSide : undefined, defines: { UNIT_SHADE: '', WORLD_NORMAL: '' },
      });
      m = { fill: mk(false), hull: mk(true) };
      shades.set(step, m);
    }
    return m;
  }
  /** Paint a figure's opaque meshes with a shade step. */
  function repaint(b: Pick<Built, 'paint'>, step: number): void {
    const m = shadeMats(step);
    for (const p of b.paint) p.mesh.material = p.hull ? m.hull : m.fill;
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
  function makeGroup(type: GlUnit['type'], look: GlUnit['look'], hero: boolean, own?: Dim, lantern = false): Built {
    const f = figureOf(type, look, hero);
    const g = new Group();
    const body = new Group();
    body.position.set(0, 0, FEET_Z);
    const dim = own ?? null;
    const paint: Built['paint'] = [];
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
      const hull = new Mesh(f.hull, hullMat), fill = new Mesh(f.fill, fillMat);
      fill.layers.enable(CAST_LAYER);
      meshes.push(hull, fill);
      paint.push({ mesh: hull, hull: true }, { mesh: fill, hull: false });
    }
    for (const m of meshes) { m.frustumCulled = false; body.add(m); }
    // Moving pieces (the trebuchet's arm and stone, weapons, shields, legs, a rider): each in a group at its pivot,
    // so turning the group swings it. A piece built inside another is carried by it (a rider's lance).
    const guard = guardOf(type);
    const inners = new Map<string, Group>();
    const pieces = new Map<string, Piece>();
    const piece = (name: string): Group | null => {
      const pc = f.pieces[name];
      if (pc === undefined) return null;
      const made = inners.get(name);
      if (made !== undefined) return made;
      const at = new Group();
      at.name = name;
      at.position.set(...pc.pivot);
      const inner = new Group();
      inner.position.set(-pc.pivot[0], -pc.pivot[1], -pc.pivot[2]);
      // An arm that reaches: stretched along its own shoulder-to-hand line, between a turn that lays that line on x
      // and the turn back.
      let reach: Piece['reach'] = null;
      if (pc.hand !== null) {
        const line = new Vector3(pc.hand[0] - pc.pivot[0], pc.hand[1] - pc.pivot[1], pc.hand[2] - pc.pivot[2]);
        const len = line.length();
        const dir = line.divideScalar(len);
        const stretch = new Group(), back = new Group();
        stretch.quaternion.setFromUnitVectors(new Vector3(1, 0, 0), dir);
        back.quaternion.copy(stretch.quaternion).invert();
        at.add(stretch);
        stretch.add(back);
        back.add(inner);
        reach = { stretch, dir, len };
      }
      const ms = dim !== null
        ? [new Mesh(pc.hull, dim.depthHull), new Mesh(pc.fill, dim.depthFill), new Mesh(pc.hull, dim.hull), new Mesh(pc.fill, dim.fill)]
        : [new Mesh(pc.hull, hullMat), new Mesh(pc.fill, fillMat)];
      if (dim === null) {
        paint.push({ mesh: ms[0]!, hull: true }, { mesh: ms[1]!, hull: false });
        ms[1]!.layers.enable(CAST_LAYER);
      }
      for (const m of ms) { m.frustumCulled = false; inner.add(m); }
      if (reach === null) at.add(inner);
      const carrier = pc.parent === null ? null : piece(pc.parent);
      (carrier ?? body).add(at);
      inners.set(name, inner);
      // The guard is set in the piece's own frame: turned into figure space here, once.
      const g = guard.pieces[name];
      const [bx, by, bz] = pc.basis;
      const inFigure = (v: readonly [number, number, number]): Vector3 => new Vector3(
        bx[0] * v[0] + by[0] * v[1] + bz[0] * v[2], bx[1] * v[0] + by[1] * v[1] + bz[1] * v[2], bx[2] * v[0] + by[2] * v[1] + bz[2] * v[2],
      );
      pieces.set(name, {
        group: at, pivot: new Vector3(...pc.pivot), axis: new Vector3(...pc.axis), fwd: new Vector3(...pc.fwd), up: new Vector3(...pc.up),
        gAxis: g?.axis !== undefined ? inFigure(g.axis).normalize() : new Vector3(...pc.axis),
        gAngle: g?.angle ?? 0, gShift: g !== undefined ? inFigure(g.shift) : new Vector3(),
        shaft: pc.shaft === null ? null : new Vector3(...pc.shaft), levelTurn: pc.shaft === null ? 0 : levelTurn(pc.shaft, pc.axis), reach,
      });
      return inner;
    };
    for (const name of Object.keys(f.pieces)) piece(name);
    let lamp: Group | null = null;
    if (lantern && dim === null) {
      // The lantern hangs at the figure's side, a little ahead (units/lantern.ts lanternHang), turning with the body.
      lamp = new Group();
      const h = lanternHang(type), m = frontsOf(type).move;
      lamp.position.set(Math.sin(m) * h.ahead + Math.cos(m) * h.side, h.y, Math.cos(m) * h.ahead - Math.sin(m) * h.side);
      const lh = new Mesh(lanternGeo, hullMat), lf = new Mesh(lanternGeo, fillMat);
      lf.layers.enable(CAST_LAYER);
      for (const m2 of [lh, lf]) { m2.frustumCulled = false; lamp.add(m2); }
      paint.push({ mesh: lh, hull: true }, { mesh: lf, hull: false });
      body.add(lamp);
    }
    const arm = pieces.get(ARM)?.group ?? null;
    const stone = pieces.get(STONE_PIECE)?.group ?? null;
    const axis = f.pieces[ARM]?.axis;
    g.add(body);
    g.add(sh);
    const built = { group: g, body, arm, stone, pieces, armAxis: axis ? new Vector3(...axis) : new Vector3(0, 0, 1), shadow: sh, shadowX: f.shadow.x, paint, lamp };
    placeShadow(built, 0, blobOff);
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

  function setUnits(units: readonly GlUnit[], nowMs?: number, moveDelays?: ReadonlyMap<number, number>): void {
    const now = nowMs ?? clock;
    const keep = new Set<number>();
    const trips = new Map<number, { x0: number; y0: number }>();
    for (const u of units) {
      keep.add(u.id);
      const fc = facings.get(u.id);
      if (fc === undefined) {
        // First seen: at rest. Seen again after it went out of sight: as it stood when last seen (where it went
        // meanwhile is not known, so it is not turned for that).
        const was = unseen.get(u.id);
        unseen.delete(u.id);
        const face = was !== undefined && was.type === u.type ? heldAt(was.yaw) : REST_FACING;
        facings.set(u.id, {
          type: u.type, x: u.x, y: u.y, hunkered: u.hunkered, face, later: null, acts: [], crouch: crouchNow(u.hunkered, now),
          shade: crouchNow(u.spent, now), spent: u.spent,
        });
      } else {
        if (u.x !== fc.x || u.y !== fc.y) {
          // A move (a slide, a lure, an advance): face the way it went, as its slide starts (an advance waits for its
          // blow), and walk along it.
          trips.set(u.id, { x0: fc.x, y0: fc.y });
          const yaw = moveYaw(u.type, u.x - fc.x, u.y - fc.y);
          const delay = moveDelays?.get(u.id) ?? 0;
          if (yaw !== null && delay > 0 && turnMs(TURN_MS) > 0) fc.later = { yaw, at: now + delay };
          else if (yaw !== null) { fc.face = turnNow(fc.face, yaw, now, turnMs(TURN_MS)); fc.later = null; }
        } else if (u.hunkered && !fc.hunkered) {
          fc.face = turnNow(fc.face, 0, now, turnMs(TURN_MS));
        }
        // Hunkered: it eases into its crouch; no longer hunkered (it moved, acted or was attacked out of it): it stands.
        if (u.hunkered !== fc.hunkered) fc.crouch = crouchTo(fc.crouch, u.hunkered, now, turnMs(CROUCH_MS));
        // Spent: it darkens; its next turn: it lightens (the same easing as the crouch, over SHADE_MS).
        if (u.spent !== fc.spent) fc.shade = crouchTo(fc.shade, u.spent, now, turnMs(SHADE_MS));
        fc.spent = u.spent;
        fc.type = u.type; fc.x = u.x; fc.y = u.y; fc.hunkered = u.hunkered;
      }
      const sig = lookKey(u.type, u.look, u.hero, u.lantern === true);
      let p = placed.get(u.id);
      if (p !== undefined && p.sig !== sig) {
        scene.remove(p.group);
        p = undefined;
      }
      if (p === undefined) {
        p = {
          sig, unit: u, ...makeGroup(u.type, u.look, u.hero, undefined, u.lantern === true), step: 0, kind: idleKind(u.type), gait: gaitKind(u.type),
          moving: false, restSince: -Infinity, lunge: null, weight: 0, trip: null, stride: 0, travel: null, guard: guardOf(u.type),
          heading: frontsOf(u.type).move,
        };
        scene.add(p.group);
        placed.set(u.id, p);
      }
      const trip = trips.get(u.id);
      if (trip !== undefined) { p.trip = trip; p.stride = 0; p.travel = null; }
      p.unit = u;
      ground(u.x, u.y, p.group.position);
      const fs = facings.get(u.id);
      const step = fs === undefined ? 0 : shadeStep(crouchAt(fs.shade, now));
      if (step !== p.step) { repaint(p, step); p.step = step; }
    }
    for (const [id, p] of placed) {
      if (keep.has(id)) continue;
      scene.remove(p.group);
      placed.delete(id);
    }
    for (const [k, g] of gone) if (now - g.at > GONE_MS) gone.delete(k);
    for (const [k, l] of left) if (now - l.at > GONE_MS) left.delete(k);
    for (const [k, f] of fallStrikes) if (now - f.at > GONE_MS) fallStrikes.delete(k);
    for (const [id, fc] of facings) {
      if (keep.has(id)) continue;
      const yaw = wrap(facingYaw(fc.face, now));
      gone.set(spot(fc.type, fc.x, fc.y), { yaw, at: now });
      unseen.set(id, { type: fc.type, yaw });
      left.set(id, { type: fc.type, x: fc.x, y: fc.y, at: now });
      // Whatever it was waiting to do (a delayed turn, a strike, a block) goes with it: seen again, it starts afresh.
      fc.later = null;
      fc.acts = [];
      facings.delete(id);
    }
  }
  // Units that have just left the scene (by id), and the strike a fallen attacker plays as it falls (by its spot):
  // an attacker killed by the blow it drew back still swings, on the figure that stands in for its fall.
  const left = new Map<number, { type: GlUnit['type']; x: number; y: number; at: number }>();
  const fallStrikes = new Map<string, { at: number; ms: number; strike: StrikeKind; yaw: number | null }>();

  function aim(id: number, x: number, y: number, nowMs: number, atMs = nowMs, from?: { x: number; y: number }): void {
    const fc = facings.get(id);
    if (fc === undefined) return;
    const yaw = aimYaw(fc.type, x - (from?.x ?? fc.x), y - (from?.y ?? fc.y));
    if (yaw === null) return;
    fc.face = queueTurn(fc.face, yaw, nowMs, turnMs(AIM_TURN_MS), atMs);
  }
  function strikes(list: readonly AttackPlay[], nowMs: number): void {
    if (reducedMotion()) return;
    for (const a of list) {
      const att = facings.get(a.unit);
      const dx = a.to.x - a.from.x, dy = a.to.y - a.from.y;
      if (att === undefined) {
        // Killed in this same action (by the counter): its figure is gone, and its fall stands in; it still swings.
        const l = left.get(a.unit);
        if (l === undefined) continue;
        const kind = exchange({ attacker: l.type, defender: 'warrior', hexes: 1, survives: false, counter: false }).strike;
        if (kind.kind !== 'sling' && kind.kind !== 'none') {
          fallStrikes.set(spot(l.type, l.x, l.y), { at: nowMs + a.delay, ms: kind.ms, strike: kind.kind, yaw: aimYaw(l.type, dx, dy) });
        }
        continue;
      }
      const def = a.target === undefined ? undefined : facings.get(a.target);
      const hexes = Math.max(1, Math.round(Math.hypot(dx, dy) / TILE_STEP));
      const ex = exchange({ attacker: att.type, defender: def?.type ?? 'warrior', hexes, survives: def !== undefined && a.survives, counter: a.counter });
      const t0 = nowMs + a.delay;
      // The blow comes along (dx, dy) on the board; on the ground that is (dx, dy / SQUASH).
      const len = Math.hypot(dx, dy / SQUASH) || 1;
      const dir = { dx: dx / len, dz: dy / SQUASH / len };
      if (ex.strike.kind !== 'sling' && ex.strike.kind !== 'none') att.acts.push({ kind: 'strike', at: t0 + ex.strike.at, ms: ex.strike.ms, strike: ex.strike.kind });
      if (def !== undefined && ex.react !== null) def.acts.push({ kind: 'react', at: t0 + ex.react.at, react: ex.react.kind, ...dir });
      if (def !== undefined && ex.counter !== null) {
        // It turns to strike back at its attacker (a unit attacked is otherwise not turned), round by its blow.
        const yaw = aimYaw(def.type, -dx, -dy);
        if (yaw !== null) def.face = queueTurn(def.face, yaw, nowMs, AIM_TURN_MS, t0 + ex.counter.at + 0.2 * ex.counter.ms);
        if (ex.counter.kind !== 'sling' && ex.counter.kind !== 'none') def.acts.push({ kind: 'strike', at: t0 + ex.counter.at, ms: ex.counter.ms, strike: ex.counter.kind });
      }
      if (ex.counterReact !== null) att.acts.push({ kind: 'react', at: t0 + ex.counterReact.at, react: ex.counterReact.kind, dx: -dir.dx, dz: -dir.dz });
    }
  }
  /** The end of an act (ms). */
  const actEnd = (a: Act): number => a.at + (a.kind === 'strike' ? a.ms : REACT_MS);
  /** A move's turn that was waiting for its slide starts once its time has come. */
  function startLater(fc: Facing, nowMs: number): void {
    if (fc.later === null || fc.later.at > nowMs) return;
    fc.face = turnNow(fc.face, fc.later.yaw, fc.later.at, turnMs(TURN_MS));
    fc.later = null;
  }

  function forget(ids: Iterable<number>): void {
    for (const id of ids) unseen.delete(id);
  }
  function anyTurning(nowMs: number): boolean {
    for (const id of placed.keys()) {
      const fc = facings.get(id);
      if (fc === undefined) continue;
      startLater(fc, nowMs);
      fc.face = settle(fc.face, nowMs);
      if (fc.later !== null || facingBusy(fc.face, nowMs)) return true;
      if (fc.acts.some((a) => actEnd(a) > nowMs)) return true;
      if (crouchBusy(fc.crouch, nowMs) || crouchBusy(fc.shade, nowMs)) return true;
    }
    for (const f of fallStrikes.values()) if (f.at + f.ms > nowMs) return true;
    return false;
  }

  // Falls: a figure of the fallen unit, turned about the line of sight through its tile centre and fading.
  const axis = new Vector3(0, -SQUASH, -COS_E); // the camera's view direction: a turn about it is a turn on screen
  const fallen = new Map<string, { group: Group; dim: Dim; pieces: Map<string, Piece>; spot: string }>();
  const q = new Quaternion();
  const Z = new Vector3(0, 0, 1), Y = new Vector3(0, 1, 0);
  function pose(at: ReadonlyMap<number, UnitPose>, falls: readonly UnitFall[]): void {
    for (const p of placed.values()) {
      const now = at.get(p.unit.id);
      const x = now?.x ?? p.unit.x, y = now?.y ?? p.unit.y;
      ground(x, y, p.group.position);
      p.moving = now !== undefined;
      p.lunge = now?.lunge ?? null;
      p.travel = now?.travel ?? null;
      // How far along its move the figure has come, in hexes: the gait keeps pace with the slide, ease and all.
      p.stride = p.trip !== null && p.travel !== null ? Math.hypot(x - p.trip.x0, y - p.trip.y0) / TILE_STEP : 0;
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
        const b = makeGroup(f.type, f.look, false, dim);
        // It falls facing the way it stood (or toward the unit it struck, if it struck as it fell).
        const at = spot(f.type, f.x, f.y);
        const yaw = fallStrikes.get(at)?.yaw ?? gone.get(at)?.yaw ?? 0;
        b.body.quaternion.setFromAxisAngle(Y, yaw);
        placeShadow(b, yaw, blobOff);
        g = { group: b.group, dim, pieces: b.pieces, spot: at };
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
  const qa = new Quaternion(), qb = new Quaternion(), qc = new Quaternion(), qw = new Quaternion();
  const fwdM = new Vector3(), sideM = new Vector3(), sideA = new Vector3(), knockAxis = new Vector3();
  const qg = new Quaternion();
  /**
   * A piece turned by `angle` about its axis and pushed along its fwd and up, from where it was built, on top of its
   * crouch guard at `crouch` (0 standing, 1 crouched): a strike or a block plays from the guard.
   */
  function posePiece(pc: Piece, angle: number, push: number, lift: number, crouch = 0): void {
    pc.group.quaternion.setFromAxisAngle(pc.axis, angle);
    if (crouch > 0 && pc.gAngle !== 0) pc.group.quaternion.premultiply(qg.setFromAxisAngle(pc.gAxis, pc.gAngle * crouch));
    pc.group.position.copy(pc.pivot).addScaledVector(pc.fwd, push).addScaledVector(pc.up, lift);
    if (crouch > 0) pc.group.position.addScaledVector(pc.gShift, crouch);
  }
  const grip = new Vector3(), toHand = new Vector3();
  /**
   * The weapon (and a second blade) at strike pose `sp` from the guard at `crouch`; a spear or a lance is levelled
   * and driven along its own line, and the arm that holds it reaches so its hand stays on the grip.
   */
  function poseWeapons(pieces: ReadonlyMap<string, Piece>, sp: StrikePose, crouch: number): void {
    const w = pieces.get(WEAPON), w2 = pieces.get(WEAPON2);
    grip.set(0, 0, 0);
    if (w !== undefined) {
      if (w.shaft === null || (sp.level === 0 && sp.reach === 0)) posePiece(w, sp.angle, sp.push, sp.lift, crouch);
      else {
        // Levelled out of its guard: a spear that slid up through the hand in the crouch comes back down into it.
        posePiece(w, sp.angle + sp.level * w.levelTurn, sp.push, sp.lift, crouch * (1 - sp.level));
        grip.copy(w.shaft).applyQuaternion(w.group.quaternion).multiplyScalar(sp.reach).addScaledVector(w.fwd, sp.push).addScaledVector(w.up, sp.lift);
        w.group.position.add(grip);
      }
    }
    if (w2 !== undefined) posePiece(w2, sp.angle, sp.push, sp.lift, crouch);
    const a = pieces.get(SPEAR_ARM);
    if (a !== undefined && a.reach !== null) {
      // The hand goes where the grip goes; the arm turns from the shoulder toward it and stretches to reach it.
      const r = a.reach;
      toHand.copy(r.dir).multiplyScalar(r.len).add(grip);
      const len = toHand.length();
      a.group.position.copy(a.pivot);
      a.group.quaternion.setFromUnitVectors(r.dir, toHand.divideScalar(len));
      r.stretch.scale.set(len / r.len, 1, 1);
    }
  }
  function tick(nowMs: number, level: number): void {
    flickT = nowMs / 1000;
    flickLevel = level;
    const dt = Math.min(100, Math.max(0, nowMs - clock));
    clock = nowMs;
    tickFalls(nowMs);
    for (const p of placed.values()) {
      if (p.moving) p.restSince = nowMs;
      const target = p.moving ? 0 : settleWeight(nowMs - p.restSince);
      // Into motion: ease out over EASE_OUT_MS rather than snap; back to rest: the settle curve brings it in.
      p.weight = target < p.weight ? Math.max(target, p.weight - dt / EASE_OUT_MS) : target;
      const fc = facings.get(p.unit.id);
      // The hunker crouch (0 standing, 1 crouched): idle life goes on in it, smaller.
      const cr = fc === undefined ? 0 : crouchAt(fc.crouch, nowMs);
      const step = fc === undefined ? 0 : shadeStep(crouchAt(fc.shade, nowMs));
      if (step !== p.step) { repaint(p, step); p.step = step; }
      const g = p.guard;
      const idleScale = 1 - (1 - g.idle) * cr;
      const ip = idlePose(p.kind, p.unit.id, nowMs / 1000, p.weight * Math.min(1, Math.max(0, level)) * idleScale);
      // The facing turns the body about its feet; the idle tilt stays a sway in the plane of the screen.
      if (fc !== undefined) { startLater(fc, nowMs); fc.face = settle(fc.face, nowMs); }
      const face = fc === undefined ? 0 : facingYaw(fc.face, nowMs);
      // The gait along a slide, and the strike and the block of an attack, in world space about the feet.
      const fronts = frontsOf(p.unit.type);
      const gp = gaitPose(p.gait, p.stride, gaitWeight(p.travel));
      let sp = strikePose('none', null), rp = reactPose('block', null), rdx = 0, rdz = 0;
      if (fc !== undefined && fc.acts.length > 0) {
        fc.acts = fc.acts.filter((a) => actEnd(a) > nowMs);
        for (const a of fc.acts) {
          if (a.at > nowMs) continue;
          if (a.kind === 'strike') sp = strikePose(a.strike, (nowMs - a.at) / a.ms);
          else { rp = reactPose(a.react, (nowMs - a.at) / REACT_MS); rdx = a.dx; rdz = a.dz; }
        }
      }
      const mh = fronts.move + face, ah = fronts.aim + face;
      p.heading = mh;
      fwdM.set(Math.sin(mh), 0, Math.cos(mh)); sideM.set(Math.cos(mh), 0, -Math.sin(mh));
      sideA.set(Math.cos(ah), 0, -Math.sin(ah));
      p.body.position.set(
        ip.shift + sideM.x * gp.sway + rdx * rp.knock + Math.sin(ah) * sp.step, ip.bob + gp.bob - g.drop * cr,
        FEET_Z + sideM.z * gp.sway + rdz * rp.knock + Math.cos(ah) * sp.step,
      );
      // A positive turn about a side axis tips the figure's top forward along that heading (a crouch leans in).
      qw.setFromAxisAngle(sideM, gp.pitch - sp.rear + g.lean * cr)
        .multiply(qb.setFromAxisAngle(fwdM, gp.roll))
        .multiply(qc.setFromAxisAngle(sideA, sp.lean));
      if (rp.lean !== 0) qw.premultiply(qc.setFromAxisAngle(knockAxis.set(rdz, 0, -rdx), rp.lean));
      p.body.quaternion.copy(qw).multiply(qa.setFromAxisAngle(Z, ip.tilt)).multiply(qb.setFromAxisAngle(Y, face + ip.yaw));
      placeShadow(p, face, blobOff);
      p.body.scale.set(1, (1 + ip.breathe) * (1 - g.squash * cr), 1);
      // The weapon strikes; the shield blocks (or, for a unit whose shield is its weapon, bashes too); the rest of
      // the pieces hold their guard.
      const strikeOnShield = !p.pieces.has(WEAPON);
      poseWeapons(p.pieces, sp, cr);
      for (const [name, pc] of p.pieces) {
        if (name === WEAPON || name === WEAPON2 || name === SPEAR_ARM) continue;
        if (name === RIDER) posePiece(pc, sp.hunch, 0, 0, cr);
        else if (name === ARROW) { posePiece(pc, 0, sp.draw, 0, cr); pc.group.visible = sp.arrow; }
        else if (name === SHIELD) {
          posePiece(pc, rp.angle + (strikeOnShield ? sp.angle : 0), rp.push + (strikeOnShield ? sp.push : 0), rp.lift + (strikeOnShield ? sp.lift : 0), cr);
        } else if (name !== ARM && name !== STONE_PIECE) posePiece(pc, 0, 0, 0, cr);
      }
      if (p.arm !== null) {
        const angle = armSwing(p.lunge) + ip.arm + g.arm * cr;
        p.arm.quaternion.setFromAxisAngle(p.armAxis, angle);
        if (p.stone !== null) {
          p.stone.quaternion.copy(p.arm.quaternion);
          p.stone.visible = stoneLoaded(p.lunge);
        }
      }
    }
  }
  /** The strike an attacker that has fallen plays on its falling figure. */
  function tickFalls(nowMs: number): void {
    for (const g of fallen.values()) {
      const f = fallStrikes.get(g.spot);
      if (f === undefined) continue;
      const sp = strikePose(f.strike, nowMs < f.at ? null : (nowMs - f.at) / f.ms);
      const weapon = g.pieces.get(WEAPON), shield = g.pieces.get(SHIELD), arrow = g.pieces.get(ARROW), rider = g.pieces.get(RIDER);
      poseWeapons(g.pieces, sp, 0);
      if (rider !== undefined) posePiece(rider, sp.hunch, 0, 0);
      if (weapon === undefined && shield !== undefined) posePiece(shield, sp.angle, sp.push, sp.lift);
      if (arrow !== undefined) { posePiece(arrow, 0, sp.draw, 0); arrow.group.visible = sp.arrow; }
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
  extras.add(pools);

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
    readLight();
    scene.updateMatrixWorld();
    placeLamps(target.x, target.z);
    renderer.info.reset();
    renderer.clear();
    // The cast shadows first, on the clear canvas, so the figures and everything else are drawn over them.
    if (castOn) {
      camera.layers.set(CAST_LAYER);
      scene.overrideMaterial = castMat;
      renderer.render(scene, camera);
      scene.overrideMaterial = null;
      camera.layers.set(0);
    }
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
    const mats: Material[] = [fillMat, hullMat, shadowMat, castMat, poolMat];
    lanternGeo.dispose();
    pools.geometry.dispose();
    for (const m of shades.values()) mats.push(m.fill, m.hull);
    shades.clear();
    for (const m of mats) m.dispose();
    shadowGeo.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return {
    setUnits, aim, strikes, forget, turning: anyTurning, pose, tick, onScreen, extras, draw, dispose,
    stats: () => ({ triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, units: placed.size, looks: looks.size, falls: fallen.size, shades: shades.size, lamps: litNow }),
  };
}

