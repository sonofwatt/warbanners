// The 3D board's ambient loop: idle life for the unit figures and the flowing waterfalls. No three.js here (the board
// imports it whether the option is on or off) and nothing runs at import: the loop exists only while the 3D terrain
// is on, and it runs only while something on screen animates, at most AMBIENT_FPS frames a second. It never runs in a
// hidden tab, while a sheet or dialog covers the board, or when the player prefers reduced motion, and it stops for
// good when stopped.
//
// It also rests: after QUIET_MS without a wake (a tap, a pan or zoom, a game event), the motion eases down to stillness
// over REST_MS, one still frame is drawn and the loop stops. The next wake eases the motion back in over RISE_MS.

export const AMBIENT_FPS = 20;
/** How long the board may go without input or a game event before its idle motion rests. */
export const QUIET_MS = 20_000;
/** How long the motion takes to ease to rest once the quiet spell is over. */
export const REST_MS = 1500;
/** How long the motion takes to come back after a wake. */
export const RISE_MS = 600;

/** What the loop needs from the page, so tests can drive it without a browser. */
export interface AmbientEnv {
  raf(cb: (t: number) => void): number;
  caf(id: number): void;
  /** The clock the animation frames are stamped with. */
  now(): number;
  hidden(): boolean;
  reducedMotion(): boolean;
  /** Call back when the page is hidden or shown; returns a function that stops listening. */
  onVisibility(cb: () => void): () => void;
  /** Call back when the reduced motion preference changes; returns a function that stops listening. */
  onMotionPref(cb: () => void): () => void;
}

export interface AmbientLoop {
  /** Something happened (input, a camera move, a game event): wake, and run if anything on screen animates. */
  kick(): void;
  /** The figures were just drawn by someone else (a camera frame, a slide): wake, but draw no ambient frame for a gap. */
  drew(): void;
  /** A sheet, menu or dialog covers the board (true) or no longer does (false, which wakes it). */
  cover(on: boolean): void;
  /** How much idle motion to show now: 0 at rest (reduced motion, or after the quiet spell) to 1. */
  level(): number;
  /** Whether motion is allowed at all (not reduced). */
  motion(): boolean;
  /** Whether a frame is scheduled. */
  running(): boolean;
  /** Stop for good and stop listening. */
  stop(): void;
}

/**
 * `frame(now, level)` draws one ambient frame with the motion scaled by `level` (0 to 1) and returns whether anything
 * on screen still animates (false ends the loop until the next kick). `still()` is called when motion becomes
 * reduced, to draw the figures at rest once.
 */
export function createAmbientLoop(env: AmbientEnv, frame: (now: number, level: number) => boolean, still: () => void = () => {}, fps = AMBIENT_FPS): AmbientLoop {
  let id = 0;
  let stopped = false;
  let covered = false;
  let last = -Infinity; // the last time the figures were drawn, by this loop or by someone else
  let stepAt = -Infinity; // the last ambient step, for the level's easing
  let woke = env.now();
  let level = 1;
  const gap = 1000 / fps;
  const can = (): boolean => !stopped && !covered && !env.hidden() && !env.reducedMotion();
  const cancel = (): void => {
    if (id !== 0) env.caf(id);
    id = 0;
  };
  const step = (t: number): void => {
    id = 0;
    if (!can()) return;
    // Called at the display's rate; draw only once a gap has passed (a little early is fine, the rate is not exact).
    if (t - last < gap - 4) {
      id = env.raf(step);
      return;
    }
    const dt = Math.min(Math.max(0, t - stepAt), gap * 2);
    stepAt = t;
    last = t;
    const resting = t - woke >= QUIET_MS;
    level = resting ? Math.max(0, level - dt / REST_MS) : Math.min(1, level + dt / RISE_MS);
    const more = frame(t, level);
    // At rest after the quiet spell: that was the last, still frame.
    if (resting && level === 0) return;
    if (more) id = env.raf(step);
  };
  const wake = (): void => {
    woke = env.now();
    if (id !== 0 || !can()) return;
    // Coming back from rest: the level climbs from where it is; from a long pause it starts the easing fresh.
    stepAt = Math.max(stepAt, woke - gap);
    id = env.raf(step);
  };
  const offVis = env.onVisibility(() => {
    if (env.hidden()) cancel();
    else wake();
  });
  const offPref = env.onMotionPref(() => {
    if (env.reducedMotion()) {
      cancel();
      if (!stopped) still();
    } else wake();
  });
  return {
    kick: wake,
    drew: () => {
      last = env.now();
      wake();
    },
    cover: (on) => {
      if (on === covered) return;
      covered = on;
      if (on) cancel();
      else wake();
    },
    level: () => (env.reducedMotion() ? 0 : level),
    motion: () => !env.reducedMotion(),
    running: () => id !== 0,
    stop: () => {
      stopped = true;
      cancel();
      offVis();
      offPref();
    },
  };
}

/** The page's own environment. Touches the document only when called. */
export function domAmbientEnv(): AmbientEnv {
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  return {
    raf: (cb) => requestAnimationFrame(cb),
    caf: (n) => cancelAnimationFrame(n),
    now: () => performance.now(),
    hidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
    reducedMotion: () => mq?.matches === true,
    onVisibility: (cb) => {
      if (typeof document === 'undefined') return () => {};
      document.addEventListener('visibilitychange', cb);
      return () => document.removeEventListener('visibilitychange', cb);
    },
    onMotionPref: (cb) => {
      if (mq === null || typeof mq.addEventListener !== 'function') return () => {};
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
  };
}
