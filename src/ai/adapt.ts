// The adaptive skill dial: how hard the AI plays, nudged toward an even game.
import { maxHpOf, playerIncome } from '../engine';
import type { MatchState, PlayerId } from '../engine';
import { unitValue } from './assess';

// gain: how much of the trend comes off the dial; drift: how fast the level follows a lasting edge; winShift: the
// step between matches by who won, the surest sign of who is stronger (0.05 before the adaptive fix).
export const ADAPT = { smooth: 0.7, gain: 0.3, drift: 0.02, maxStep: 0.04, deadband: 0.05, min: 0.1, max: 0.95, start: 0.5, winShift: 0.1 } as const;

export interface AdaptState { dial: number; trend: number }

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

// 4 * cities + 2 * sum of city levels + army / 4 + 2 * techs + income
export function standingOf(state: MatchState, p: PlayerId): number {
  let cities = 0; let levels = 0; let army = 0;
  for (const c of state.cities) if (c.owner === p) { cities += 1; levels += c.level; }
  for (const u of state.units) if (u.owner === p) army += unitValue(u) * u.hp / maxHpOf(u);
  return 4 * cities + 2 * levels + army / 4 + 2 * state.players[p]!.techs.length + playerIncome(state, p);
}

// Positive when the AI is ahead. Against the average of the other players.
export function gapOf(state: MatchState, ai: PlayerId): number {
  const mine = standingOf(state, ai);
  const others = state.players.filter(pl => pl.id !== ai).map(pl => standingOf(state, pl.id));
  const theirs = others.length === 0 ? 0 : others.reduce((a, b) => a + b, 0) / others.length;
  return (mine - theirs) / Math.max(1, mine + theirs);
}

// The part of the trend outside the deadband: a close game counts as even.
const edge = (t: number): number => Math.sign(t) * Math.max(0, Math.abs(t) - ADAPT.deadband);

// Once at the start of each AI turn, never during one.
// The gap is a standing, so it already sums how the play has gone; the dial sets how fast it changes, not where it
// is. Stepping the dial by the gap (as before) summed it a second time, and a double sum swings: the dial ran from
// one end to the other and back within a match, and where a match ended on that swing decided what it carried.
// So the dial sits at a level less a share of the trend (gain), and only the level drifts with a lasting edge
// (drift). The level is not stored: it is the old dial plus what the old trend took off it.
export function adaptStep(a: AdaptState, gap: number): AdaptState {
  const trend = ADAPT.smooth * a.trend + (1 - ADAPT.smooth) * gap;
  const level = a.dial + ADAPT.gain * edge(a.trend) - ADAPT.drift * edge(trend);
  const target = clamp(level - ADAPT.gain * edge(trend), ADAPT.min, ADAPT.max);
  const move = clamp(target - a.dial, -ADAPT.maxStep, ADAPT.maxStep);
  return { dial: clamp(a.dial + move, ADAPT.min, ADAPT.max), trend };
}

export function betweenMatches(dial: number, result: 'person' | 'ai' | 'none'): number {
  const shift = result === 'person' ? ADAPT.winShift : result === 'ai' ? -ADAPT.winShift : 0;
  return clamp(dial + shift, ADAPT.min, ADAPT.max);
}
