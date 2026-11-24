// The 3D board's ambient loop: idle life for the unit figures and the flowing waterfalls. No three.js here (the board
// imports it whether the option is on or off) and nothing runs at import: the loop exists only while the 3D terrain
// is on, and it runs only while something on screen animates, at most AMBIENT_FPS frames a second. It never runs in a
// hidden tab or when the player prefers reduced motion; it stops for good when stopped.

export const AMBIENT_FPS = 30;

/** What the loop needs from the page, so tests can drive it without a browser. */
export interface AmbientEnv {
  raf(cb: (t: number) => void): number;
  caf(id: number): void;
  hidden(): boolean;
  reducedMotion(): boolean;
  /** Call back when the page is hidden or shown; returns a function that stops listening. */
  onVisibility(cb: () => void): () => void;
  /** Call back when the reduced motion preference changes; returns a function that stops listening. */
  onMotionPref(cb: () => void): () => void;
}

export interface AmbientLoop {
  /** Something changed (the camera, the units, the map): run if anything on screen animates. */
  kick(): void;
  /** Whether motion is allowed now (not reduced). */
  motion(): boolean;
  /** Whether a frame is scheduled. */
  running(): boolean;
  /** Stop for good and stop listening. */
  stop(): void;
}

/**
 * `frame(now)` draws one ambient frame and returns whether anything on screen still animates (false ends the loop
 * until the next kick). `still()` is called when motion becomes reduced, to draw the figures at rest once.
 */
export function createAmbientLoop(env: AmbientEnv, frame: (now: number) => boolean, still: () => void = () => {}, fps = AMBIENT_FPS): AmbientLoop {
  let id = 0;
  let stopped = false;
  let last = -Infinity;
  const gap = 1000 / fps;
  const can = (): boolean => !stopped && !env.hidden() && !env.reducedMotion();
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
    last = t;
    if (frame(t)) id = env.raf(step);
  };
  const kick = (): void => {
    if (id !== 0 || !can()) return;
    id = env.raf(step);
  };
  const offVis = env.onVisibility(() => {
    if (env.hidden()) cancel();
    else kick();
  });
  const offPref = env.onMotionPref(() => {
    if (env.reducedMotion()) {
      cancel();
      if (!stopped) still();
    } else kick();
  });
  return {
    kick,
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
