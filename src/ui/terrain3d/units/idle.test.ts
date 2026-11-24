import { describe, expect, test } from 'vitest';
import {
  AIM_MOVE, AIM_PERIOD, aimAt, ARM_SWING, ARM_TOP, armSwing, idleKind, idlePhase, idlePose, idleRate, REST, settleWeight, SETTLE_MS, stoneLoaded,
} from './idle';

describe('idle life', () => {
  test('each unit has its own phase and pace, so neighbours never move in lockstep', () => {
    const phases = Array.from({ length: 60 }, (_, i) => idlePhase(i + 1));
    for (const p of phases) { expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThan(Math.PI * 2); }
    // Consecutive ids are far apart in phase, and the phases cover the circle.
    const gaps = phases.slice(1).map((p, i) => Math.abs(p - phases[i]!));
    expect(gaps.filter((g) => g < 0.05).length).toBeLessThan(4);
    expect(Math.max(...phases) - Math.min(...phases)).toBeGreaterThan(5);
    for (let i = 1; i < 60; i++) { expect(idleRate(i)).toBeGreaterThanOrEqual(0.85); expect(idleRate(i)).toBeLessThanOrEqual(1.15); }
    expect(idlePhase(7)).toBe(idlePhase(7));
    // Two units at the same moment are in different poses.
    expect(idlePose('foot', 1, 2).tilt).not.toBeCloseTo(idlePose('foot', 2, 2).tilt, 3);
  });

  test('kinds: mounts shift their weight, the trebuchet adjusts its aim, the camp stands still', () => {
    expect(idleKind('warrior')).toBe('foot');
    expect(idleKind('knight')).toBe('mounted');
    expect(idleKind('horseArcher')).toBe('mounted');
    expect(idleKind('catapult')).toBe('siege');
    expect(idleKind('camp')).toBe('none');
    expect(idlePose('none', 3, 1.5)).toEqual(REST);
    let shift = 0;
    for (let t = 0; t < 10; t += 0.1) shift = Math.max(shift, Math.abs(idlePose('mounted', 3, t).shift));
    expect(shift).toBeGreaterThan(0.1);
  });

  test('motion is small for every kind, and none at weight 0', () => {
    for (const kind of ['foot', 'mounted', 'siege'] as const) {
      for (let t = 0; t < 30; t += 0.07) {
        const p = idlePose(kind, 11, t);
        expect(Math.abs(p.tilt)).toBeLessThanOrEqual(0.03);
        expect(Math.abs(p.yaw)).toBeLessThanOrEqual(0.08);
        expect(Math.abs(p.shift) + Math.abs(p.bob)).toBeLessThan(0.6);
        expect(Math.abs(p.breathe)).toBeLessThan(0.02);
        expect(Math.abs(p.arm)).toBeLessThanOrEqual(0.05);
      }
      expect(idlePose(kind, 11, 4, 0)).toEqual(REST);
    }
  });

  test('the trebuchet changes its aim now and then and holds still in between', () => {
    const period = AIM_PERIOD / idleRate(5);
    let holds = 0, moves = 0;
    for (let t = 0; t < period * 6; t += 0.05) {
      const a = aimAt(5, t), b = aimAt(5, t + 0.05);
      if (a.yaw === b.yaw && a.arm === b.arm) holds++;
      else moves++;
    }
    expect(moves).toBeGreaterThan(0);
    // It moves for AIM_MOVE seconds of each period and holds for the rest.
    expect(holds / (holds + moves)).toBeGreaterThan(1 - AIM_MOVE / period - 0.05);
    // Continuous: no jumps between steps.
    for (let t = 0; t < period * 4; t += 0.01) expect(Math.abs(aimAt(5, t + 0.01).yaw - aimAt(5, t).yaw)).toBeLessThan(0.01);
  });

  test('the trebuchet arm by lunge phase: cocked, up and over, a shudder at the top, back to cocked', () => {
    expect(armSwing(null)).toBe(0);
    expect(armSwing(0)).toBe(0);
    expect(armSwing(1)).toBe(0);
    expect(armSwing(ARM_TOP / 2)).toBeCloseTo(ARM_SWING / 4, 6); // accelerating
    expect(armSwing(ARM_TOP)).toBeCloseTo(ARM_SWING, 6);
    expect(armSwing(0.34)).toBeGreaterThan(ARM_SWING); // the shudder overshoots
    expect(armSwing(0.7)).toBeGreaterThan(0);
    expect(armSwing(0.7)).toBeLessThan(ARM_SWING);
    expect(armSwing(0.999)).toBeLessThan(0.01);
    // Monotone up, then down.
    for (let p = 0; p < ARM_TOP; p += 0.01) expect(armSwing(p + 0.01)).toBeGreaterThanOrEqual(armSwing(p));
    for (let p = 0.4; p < 0.99; p += 0.01) expect(armSwing(p + 0.01)).toBeLessThanOrEqual(armSwing(p) + 1e-9);
    expect(stoneLoaded(null)).toBe(true);
    expect(stoneLoaded(0.1)).toBe(true);
    expect(stoneLoaded(0.5)).toBe(false);
    expect(stoneLoaded(0.95)).toBe(true);
  });

  test('a unit that stops eases back in', () => {
    expect(settleWeight(0)).toBe(0);
    expect(settleWeight(SETTLE_MS / 2)).toBeCloseTo(0.5, 6);
    expect(settleWeight(SETTLE_MS * 2)).toBe(1);
    expect(settleWeight(Infinity)).toBe(1);
  });
});
