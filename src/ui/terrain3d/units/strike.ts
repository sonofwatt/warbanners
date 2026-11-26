// An attack in the 3D look: the attacker's strike, fitted to its weapon, and the defender's block or flinch, timed to
// the moment the blow lands. Pure maths, no three.js and no clock: the caller passes how far into the strike or the
// reaction it is.
//
// The strike plays during the svg lunge (EFFECT_MS, its furthest point at 0.3 of it), so a melee blow lands as the
// lunge peaks. A shot lands later, after its flight. A defender that survives raises its shield (or flinches, without
// one) as the blow lands; one that dies falls as before. A defender that strikes back plays a quicker strike once its
// block is up, and the attacker reacts to that blow the same way.
import { ARM_TOP } from './idle';

/** How each unit strikes. */
export type StrikeKind = 'swing' | 'thrust' | 'jab' | 'couch' | 'bow' | 'bash' | 'sling' | 'rear' | 'lunge' | 'none';
/** How a unit takes a blow it survives. */
export type ReactKind = 'block' | 'flinch';

const KINDS: Record<string, StrikeKind> = {
  warrior: 'swing', swordsman: 'swing', sellsword: 'swing',
  // Spears on foot jab; a rider's spear or lance is couched and driven home; the scout stabs with his dagger.
  spearman: 'jab', hoplite: 'jab', kingsGuard: 'jab', horseman: 'couch', knight: 'couch', scout: 'thrust',
  archer: 'bow', horseArcher: 'bow',
  defender: 'bash',
  catapult: 'sling',
  khansGuard: 'rear', skyCaller: 'rear',
  piper: 'lunge',
  camp: 'none',
};

export function strikeKind(type: string): StrikeKind {
  return KINDS[type] ?? 'lunge';
}

/** The units that carry a shield, and so block. */
const SHIELDED = new Set(['warrior', 'spearman', 'defender', 'hoplite', 'kingsGuard']);

export function reactKind(type: string): ReactKind {
  return SHIELDED.has(type) ? 'block' : 'flinch';
}

/** A strike lasts as long as the svg lunge it plays with; a counter strike is quicker. */
export const STRIKE_MS = 450;
export const COUNTER_STRIKE_MS = 340;
/** A block or a flinch. */
export const REACT_MS = 300;
/** Where in a strike a melee blow lands (the lunge's furthest point), and where a bow looses its arrow. */
export const MELEE_HIT = 0.3;
export const BOW_LOOSE = 0.26;
/** How long an arrow and a stone take per hex of flight. */
export const ARROW_MS_PER_HEX = 55;
export const STONE_MS_PER_HEX = 90;

/** When the blow of a strike of kind `kind` lasting `ms` lands, in ms from its start, at `hexes` hexes away. */
export function impactMs(kind: StrikeKind, ms: number, hexes: number): number {
  const h = Math.max(1, hexes);
  if (kind === 'bow') return Math.round(BOW_LOOSE * ms + ARROW_MS_PER_HEX * h);
  if (kind === 'sling') return Math.round(ARM_TOP * ms + STONE_MS_PER_HEX * h);
  return Math.round(MELEE_HIT * ms);
}

/**
 * When a defender that strikes back starts its counter strike, in ms after the first blow lands: once its block (or
 * flinch) has peaked.
 */
export const COUNTER_AFTER_MS = 110;

/**
 * One frame of a strike, for the weapon piece: a turn about the piece's axis (radians: a blade or a spear tips its
 * point toward the target about the grip; an archer's drawing arm comes back), a push along its `fwd` and a lift
 * along its `up` (world units); how far the arrow is drawn along its own `fwd` (`draw`, world units) and whether it is
 * on the string; a lean of the whole figure toward its aim (radians, forward positive) and a rear (radians, the front
 * of a horse up).
 *
 * A jab or a couched lance adds: `level`, how far the spear or lance is brought from its rest to level at the target
 * (0 to 1; units3d.ts turns it about the piece's axis by what that takes for the figure's own weapon), `reach`, how far
 * it then travels along its own line (world units, toward the point positive; the holding arm reaches with it),
 * `step`, a step of the whole figure toward its aim (world units), and `hunch`, a rider's tip forward over the horse
 * (radians).
 */
export interface StrikePose {
  angle: number; push: number; lift: number; draw: number; lean: number; rear: number; arrow: boolean;
  level: number; reach: number; step: number; hunch: number;
}

export const AT_REST: StrikePose = Object.freeze({ angle: 0, push: 0, lift: 0, draw: 0, lean: 0, rear: 0, arrow: true, level: 0, reach: 0, step: 0, hunch: 0 });

/** A jab's keys (phases of the strike): levelled and drawn back by JAB_WIND, driven home by MELEE_HIT, held to JAB_HOLD. */
export const JAB_WIND = 0.15;
export const JAB_HOLD = 0.44;
/** How far a spear is drawn back, and how far it is then driven along its own line past its rest (world units). */
export const JAB_DRAW = 3.2;
export const JAB_REACH = 5.5;
/** A couched lance moves less in the hand: the rider and the horse drive it home. */
export const COUCH_DRAW = 1.6;
export const COUCH_REACH = 3.4;
/** How far above level a jab's spear or a couched lance points (radians): at the chest of a figure on its own ground. */
export const LEVEL_TILT = 0.06;

/**
 * The turn about `axis` (a level axis) that brings a weapon along `shaft` (both unit length, in the figure's frame, y
 * up) from its rest to pointing LEVEL_TILT above level, toward the side a positive turn tips it to (axis cross up).
 */
export function levelTurn(shaft: readonly [number, number, number], axis: readonly [number, number, number]): number {
  const [ax, ay, az] = axis;
  const along = shaft[0] * ax + shaft[1] * ay + shaft[2] * az;
  const px = shaft[0] - along * ax, py = shaft[1] - along * ay, pz = shaft[2] - along * az;
  // The way a positive turn takes the top: axis cross up is (-az, 0, ax).
  return Math.atan2(py, -az * px + ax * pz) - LEVEL_TILT;
}

const smooth = (x: number): number => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
/** Quick into the blow: an ease in that ends at full speed. */
const accel = (x: number): number => { const t = Math.min(1, Math.max(0, x)); return t * t; };
/** A value that goes a to b over [p0, p1] of the strike with ease `e`. */
const seg = (p: number, p0: number, p1: number, a: number, b: number, e: (x: number) => number = smooth): number => a + (b - a) * e((p - p0) / (p1 - p0));

/** The keys of a strike: wind up to `back`, strike through to `hit` at MELEE_HIT, hold a moment, then recover. */
function blow(p: number, back: number, hit: number, wind = 0.14, holdTo = 0.42): number {
  if (p < wind) return seg(p, 0, wind, 0, back);
  if (p < MELEE_HIT) return seg(p, wind, MELEE_HIT, back, hit, accel);
  if (p < holdTo) return hit;
  return seg(p, holdTo, 1, hit, 0);
}

/** The strike of kind `kind` at phase `p` (0 to 1 of the strike; outside that, at rest). */
export function strikePose(kind: StrikeKind, p: number | null | undefined): StrikePose {
  if (p === null || p === undefined || !(p > 0) || p >= 1) return AT_REST;
  const lean = 0.09 * (p < MELEE_HIT ? seg(p, 0.1, MELEE_HIT, 0, 1) : seg(p, 0.42, 1, 1, 0));
  switch (kind) {
    case 'swing':
      // The blade raised back over the shoulder, then brought down and through in front.
      return { ...AT_REST, angle: blow(p, -0.85, 1.35), lean };
    case 'thrust': {
      // Drawn back a little, then levelled and driven forward.
      const push = blow(p, -1.6, 3.4);
      return { ...AT_REST, angle: blow(p, -0.12, 0.95), push, draw: push, lean };
    }
    case 'jab':
    case 'couch': {
      // Levelled at the target and drawn back; driven straight out along its own line, fast, the body leaning in and
      // stepping after it; held a moment at full reach; then drawn back in and raised to rest. A rider couches the
      // lance and hunches over it as the horse lunges.
      const foot = kind === 'jab';
      const draw = foot ? JAB_DRAW : COUCH_DRAW, far = foot ? JAB_REACH : COUCH_REACH;
      const level = p < JAB_WIND ? seg(p, 0, JAB_WIND * 0.85, 0, 1) : p < JAB_HOLD ? 1 : 1 - smooth((p - 0.58) / 0.42);
      const reach = p < JAB_WIND ? seg(p, 0, JAB_WIND, 0, -draw) : p < MELEE_HIT ? seg(p, JAB_WIND, MELEE_HIT, -draw, far, accel)
        : p < JAB_HOLD ? far : seg(p, JAB_HOLD, 0.82, far, 0);
      const into = p < JAB_WIND ? 0 : p < MELEE_HIT ? smooth((p - JAB_WIND) / (MELEE_HIT - JAB_WIND)) : p < JAB_HOLD ? 1 : 1 - smooth((p - JAB_HOLD) / (1 - JAB_HOLD));
      const back = p < JAB_WIND ? smooth(p / JAB_WIND) : p < MELEE_HIT ? 1 - smooth((p - JAB_WIND) / (MELEE_HIT - JAB_WIND)) : 0;
      if (foot) return { ...AT_REST, level, reach, lean: 0.13 * into - 0.04 * back, step: 2.4 * into };
      return { ...AT_REST, level, reach, lean: 0.03 * into, step: 3.2 * into, hunch: 0.3 * into - 0.06 * back, rear: 0.05 * back - 0.06 * into };
    }
    case 'bash': {
      // The shield driven forward into the enemy.
      const push = blow(p, -1.2, 4.2);
      return { ...AT_REST, angle: blow(p, 0.05, -0.25), push, draw: push, lean: lean * 1.3 };
    }
    case 'bow': {
      // Drawn back to the cheek, loosed (the arrow leaves the string), the hand flicks back, a fresh arrow is nocked.
      const pull = p < BOW_LOOSE ? smooth(p / (BOW_LOOSE - 0.02)) : p < BOW_LOOSE + 0.06 ? 1 + 0.3 * smooth((p - BOW_LOOSE) / 0.06) : 1.3 * (1 - smooth((p - BOW_LOOSE - 0.06) / (0.94 - BOW_LOOSE)));
      return {
        ...AT_REST, angle: 0.5 * pull, draw: -2.6 * Math.min(1, pull),
        lean: -0.04 * smooth(p / BOW_LOOSE) * (p < BOW_LOOSE ? 1 : 1 - smooth((p - BOW_LOOSE) / 0.3)), arrow: p < BOW_LOOSE || p > 0.86,
      };
    }
    case 'rear': {
      // The horse rears, then comes down hard into the enemy.
      const rear = p < 0.24 ? seg(p, 0, 0.24, 0, 0.3) : p < 0.34 ? seg(p, 0.24, 0.34, 0.3, -0.1, accel) : seg(p, 0.34, 1, -0.1, 0);
      return { ...AT_REST, rear, lean: lean * 0.5 };
    }
    case 'lunge':
      return { ...AT_REST, lean: lean * 1.5 };
    case 'sling':
    case 'none':
      return AT_REST;
  }
}

/**
 * One frame of a defender's reaction: the shield's turn about the shoulder (radians; negative brings it up and
 * forward), push and lift (world units); the figure's lean (radians, positive away from the blow) and how far it is
 * knocked back from the blow (world units).
 */
export interface ReactPose { angle: number; push: number; lift: number; lean: number; knock: number }

export const UNMOVED: ReactPose = Object.freeze({ angle: 0, push: 0, lift: 0, lean: 0, knock: 0 });

/** A shape over a reaction: up fast to its peak at `peak`, held to `hold`, then eased back down. */
function pulse(p: number, peak = 0.16, hold = 0.45): number {
  if (p < peak) return smooth(p / peak);
  if (p < hold) return 1;
  return 1 - smooth((p - hold) / (1 - hold));
}

/** The reaction of kind `kind` at phase `p` (0 to 1 of REACT_MS; outside that, unmoved). Phase 0 is the blow landing. */
export function reactPose(kind: ReactKind, p: number | null | undefined): ReactPose {
  if (p === null || p === undefined || !(p >= 0) || p >= 1) return UNMOVED;
  // The shield goes up a moment before the blow (it saw it coming); the start of the pulse is the blow.
  const k = pulse(p);
  if (kind === 'block') return { angle: -0.75 * k, push: 0.8 * k, lift: 1.4 * k, lean: 0.05 * k, knock: 0.8 * k };
  return { angle: 0, push: 0, lift: 0, lean: 0.16 * pulse(p, 0.12, 0.3), knock: 1.6 * pulse(p, 0.12, 0.3) };
}

/** Where a block starts, before the blow lands, so the shield is up in time. */
export const BLOCK_LEAD_MS = 60;

/**
 * The timeline of one attack in the 3D look, all in ms from the attack's lunge start: the attacker's strike, the
 * defender's reaction (when it survives), and the counter strike and the attacker's reaction to it (when the defender
 * strikes back). Reactions start BLOCK_LEAD_MS before their blow for a block, at the blow for a flinch.
 */
export interface Exchange {
  strike: { at: number; ms: number; kind: StrikeKind };
  react: { at: number; kind: ReactKind } | null;
  counter: { at: number; ms: number; kind: StrikeKind } | null;
  counterReact: { at: number; kind: ReactKind } | null;
  /** When the last of it is over. */
  end: number;
}

export function exchange(o: { attacker: string; defender: string; hexes: number; survives: boolean; counter: boolean }): Exchange {
  const kind = strikeKind(o.attacker);
  const hit = impactMs(kind, STRIKE_MS, o.hexes);
  const rk = reactKind(o.defender);
  const lead = (r: ReactKind): number => (r === 'block' ? BLOCK_LEAD_MS : 0);
  const react = o.survives ? { at: hit - lead(rk), kind: rk } : null;
  let counter: Exchange['counter'] = null;
  let counterReact: Exchange['counterReact'] = null;
  if (o.survives && o.counter) {
    const ck = strikeKind(o.defender);
    counter = { at: hit + COUNTER_AFTER_MS, ms: COUNTER_STRIKE_MS, kind: ck };
    const back = counter.at + impactMs(ck, COUNTER_STRIKE_MS, o.hexes);
    const ark = reactKind(o.attacker);
    counterReact = { at: back - lead(ark), kind: ark };
  }
  const end = Math.max(
    STRIKE_MS,
    react === null ? 0 : react.at + REACT_MS,
    counter === null ? 0 : counter.at + counter.ms,
    counterReact === null ? 0 : counterReact.at + REACT_MS,
  );
  return { strike: { at: 0, ms: STRIKE_MS, kind }, react, counter, counterReact, end };
}
