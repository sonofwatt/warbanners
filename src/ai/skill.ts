import type { Skill } from './types';

const EASIEST: Skill = { topK: 4, temperature: 3, margin: 6, lookahead: 0, danger: 0.3, focus: 0, economy: 0.5, evals: 150 };
const HARDEST: Skill = { topK: 1, temperature: 0.1, margin: 1, lookahead: 2, danger: 1, focus: 1, economy: 1, evals: 1200 };

const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t; // exact at both ends

// Turns the skill dial (0 easiest, 1 hardest, clamped) into planning settings.
export function skillFor(dial: number): Skill {
  const t = Math.min(1, Math.max(0, dial));
  return {
    topK: Math.round(mix(EASIEST.topK, HARDEST.topK, t)),
    temperature: mix(EASIEST.temperature, HARDEST.temperature, t),
    margin: mix(EASIEST.margin, HARDEST.margin, t),
    lookahead: Math.round(mix(EASIEST.lookahead, HARDEST.lookahead, t)),
    danger: mix(EASIEST.danger, HARDEST.danger, t),
    focus: mix(EASIEST.focus, HARDEST.focus, t),
    economy: mix(EASIEST.economy, HARDEST.economy, t),
    evals: Math.round(mix(EASIEST.evals, HARDEST.evals, t)),
  };
}
