// The treasure chest's twinkle, in both looks: a few small glints on its gold bands and lock, each lighting up for a
// moment and fading, at its own pace, so a chest catches the eye on a busy board now and then without flashing.
// Pure timing, no clock and no DOM: the svg look plays it as a CSS animation (theme.css .chest-twinkle, with the
// stops below), the 3D look computes it on its ambient clock (terrain3d/chestShine.ts).

/** One glint's pace: it lights once every `period` seconds, `phase` (0 to 1) through its cycle at time 0. */
export interface Twinkle { period: number; phase: number }

/** The glints of a chest, in the same order in both looks. Periods that share no rhythm, so the pattern wanders. */
export const TWINKLES: readonly Twinkle[] = [
  { period: 4.3, phase: 0 },
  { period: 5.9, phase: 0.41 },
  { period: 3.7, phase: 0.73 },
];

/** The share of its cycle a glint is lit: about two thirds of a second. */
export const FLASH = 0.16;
/** Where in the flash it is brightest, as a share of the flash: a quick rise and a slower fade. */
export const PEAK = 0.35;

/** A chest's own offset (0 to 1) from its tile, so chests on the board never twinkle together. */
export function twinkleSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10007) / 10007;
}

const smooth = (x: number): number => x * x * (3 - 2 * x);

/** How bright glint `i` of a chest with `seed` is at `t` seconds: 0 most of the time, up to 1 at the flash's peak. */
export function twinkle(t: number, i: number, seed: number): number {
  const g = TWINKLES[i % TWINKLES.length]!;
  const f = (((t / g.period + g.phase + seed) % 1) + 1) % 1;
  const start = 1 - FLASH;
  if (f < start) return 0;
  const u = (f - start) / FLASH;
  return u < PEAK ? smooth(u / PEAK) : smooth((1 - u) / (1 - PEAK));
}

/** The CSS animation of glint `i` that plays `twinkle` (the keyframes' stops are `twinkleStops`). */
export function twinkleCss(i: number, seed: number): { animationDuration: string; animationDelay: string } {
  const g = TWINKLES[i % TWINKLES.length]!;
  // A negative delay starts the cycle part way through, as `twinkle` does at time 0.
  const into = ((g.phase + seed) % 1) * g.period;
  return { animationDuration: `${g.period}s`, animationDelay: `${(-into).toFixed(2)}s` };
}

/** The keyframe stops (percent) of theme.css @keyframes chest-twinkle: dark until the flash, its peak, its end. */
export function twinkleStops(): [number, number, number] {
  const start = (1 - FLASH) * 100;
  return [Number(start.toFixed(1)), Number((start + FLASH * PEAK * 100).toFixed(1)), 100];
}
