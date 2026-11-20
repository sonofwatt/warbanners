// The adaptive skill dial: how hard the AI plays, nudged toward an even game.
import { UNITS, playerIncome } from '../engine';
import type { MatchState, PlayerId } from '../engine';
import { unitWorth } from './assess';

export const ADAPT = { smooth: 0.7, gain: 0.5, maxStep: 0.04, deadband: 0.05, min: 0.1, max: 0.95, start: 0.5, winShift: 0.05 } as const;

export interface AdaptState { dial: number; trend: number }

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

// 4 * cities + 2 * sum of city levels + army / 4 + 2 * techs + income
export function standingOf(state: MatchState, p: PlayerId): number {
  let cities = 0; let levels = 0; let army = 0;
  for (const c of state.cities) if (c.owner === p) { cities += 1; levels += c.level; }
  for (const u of state.units) if (u.owner === p) army += unitWorth(u.type) * u.hp / UNITS[u.type].hp;
  return 4 * cities + 2 * levels + army / 4 + 2 * state.players[p]!.techs.length + playerIncome(state, p);
}

// Positive when the AI is ahead. Against the average of the other players.
export function gapOf(state: MatchState, ai: PlayerId): number {
  const mine = standingOf(state, ai);
  const others = state.players.filter(pl => pl.id !== ai).map(pl => standingOf(state, pl.id));
  const theirs = others.length === 0 ? 0 : others.reduce((a, b) => a + b, 0) / others.length;
  return (mine - theirs) / Math.max(1, mine + theirs);
}

// Once at the start of each AI turn, never during one.
export function adaptStep(a: AdaptState, gap: number): AdaptState {
  const trend = ADAPT.smooth * a.trend + (1 - ADAPT.smooth) * gap;
  if (Math.abs(trend) < ADAPT.deadband) return { dial: a.dial, trend };
  const move = clamp(-ADAPT.gain * trend, -ADAPT.maxStep, ADAPT.maxStep);
  return { dial: clamp(a.dial + move, ADAPT.min, ADAPT.max), trend };
}

export function betweenMatches(dial: number, result: 'person' | 'ai' | 'none'): number {
  const shift = result === 'person' ? ADAPT.winShift : result === 'ai' ? -ADAPT.winShift : 0;
  return clamp(dial + shift, ADAPT.min, ADAPT.max);
}
