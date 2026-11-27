import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { FLASH, twinkle, twinkleCss, twinkleSeed, twinkleStops, TWINKLES } from './twinkle';

const sample = (i: number, seed: number, from: number, to: number, step = 0.01): number[] => {
  const out: number[] = [];
  for (let t = from; t < to; t += step) out.push(twinkle(t, i, seed));
  return out;
};

test('the same time gives the same brightness: no clock, no randomness', () => {
  for (const t of [0, 1.234, 17.5, 1000.01]) expect(twinkle(t, 1, 0.3)).toBe(twinkle(t, 1, 0.3));
  expect(twinkleSeed('3,-2')).toBe(twinkleSeed('3,-2'));
  expect(twinkleSeed('3,-2')).not.toBe(twinkleSeed('-2,3'));
});

test('each glint is dark most of its cycle and lit once a cycle, briefly, peaking at full brightness', () => {
  TWINKLES.forEach((g, i) => {
    const s = sample(i, 0.2, 0, g.period, 0.002);
    const lit = s.filter((b) => b > 0).length / s.length;
    expect(lit).toBeGreaterThan(FLASH * 0.9);
    expect(lit).toBeLessThan(FLASH * 1.1);
    expect(Math.max(...s)).toBeGreaterThan(0.98);
    expect(Math.min(...s)).toBe(0);
    // One flash per cycle: the brightness rises from dark once.
    let rises = 0;
    for (let k = 1; k < s.length; k++) if (s[k - 1] === 0 && s[k]! > 0) rises++;
    expect(rises).toBeLessThanOrEqual(1);
    // It repeats after its period.
    expect(twinkle(2.5 + g.period, i, 0.2)).toBeCloseTo(twinkle(2.5, i, 0.2), 6);
  });
});

test('the glints of a chest, and two chests, light at different moments', () => {
  const peakAt = (i: number, seed: number): number => {
    const s = sample(i, seed, 0, 30, 0.01);
    return s.indexOf(Math.max(...s.slice(0, 600)));
  };
  const own = TWINKLES.map((_, i) => peakAt(i, 0.1));
  expect(new Set(own).size).toBe(TWINKLES.length);
  expect(peakAt(0, twinkleSeed('1,0'))).not.toBe(peakAt(0, twinkleSeed('2,0')));
  // Two glints of a chest bright together only now and then, over a long spell.
  let both = 0, n = 0;
  for (let t = 0; t < 600; t += 0.05, n++) if (TWINKLES.filter((_, i) => twinkle(t, i, 0.1) > 0.5).length > 1) both++;
  expect(both / n).toBeLessThan(0.03);
});

test('the svg look plays the same cycle: its CSS delay and keyframe stops match the timing', () => {
  TWINKLES.forEach((g, i) => {
    const css = twinkleCss(i, 0.37);
    expect(css.animationDuration).toBe(`${g.period}s`);
    // At time 0 the CSS animation is -delay into its cycle; the timing's cycle position there is phase + seed.
    const into = -Number(css.animationDelay.replace('s', ''));
    expect(into / g.period).toBeCloseTo((g.phase + 0.37) % 1, 2);
  });
  const css = readFileSync(new URL('../theme.css', import.meta.url), 'utf8');
  const [start, peak] = twinkleStops();
  expect(css).toMatch(new RegExp(`0%, ${start}% \\{ opacity: 0;`));
  expect(css).toMatch(new RegExp(`${peak}% \\{ opacity: 1;`));
  expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.ready-glow \{ animation: none; \}\s*\.chest-twinkle \{ animation: none; opacity: 0; \}/);
});
