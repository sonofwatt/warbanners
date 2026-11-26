import { describe, expect, test } from 'vitest';
import { ALL_TYPES } from './figures';
import { CROUCH_MS, crouchAt, crouchBusy, crouchNow, crouchTo, FOOT_DROP, guardOf } from './crouch';

describe('the hunker crouch', () => {
  test('a unit first seen stands or crouches at once', () => {
    expect(crouchAt(crouchNow(false, 100), 100)).toBe(0);
    expect(crouchAt(crouchNow(true, 100), 100)).toBe(1);
    expect(crouchBusy(crouchNow(true, 100), 100)).toBe(false);
  });

  test('it eases in over about 200 to 250 ms, with no jump, and eases out the same way', () => {
    expect(CROUCH_MS).toBeGreaterThanOrEqual(200);
    expect(CROUCH_MS).toBeLessThanOrEqual(250);
    const c = crouchTo(crouchNow(false, 0), true, 1000);
    expect(crouchAt(c, 1000)).toBe(0);
    expect(crouchBusy(c, 1000 + CROUCH_MS / 2)).toBe(true);
    let last = 0, step = 0;
    for (let t = 1000; t <= 1000 + CROUCH_MS; t += 10) {
      const v = crouchAt(c, t);
      expect(v).toBeGreaterThanOrEqual(last);
      step = Math.max(step, v - last);
      last = v;
    }
    expect(step, 'no frame jumps').toBeLessThan(0.08);
    expect(crouchAt(c, 1000 + CROUCH_MS)).toBe(1);
    expect(crouchBusy(c, 1000 + CROUCH_MS)).toBe(false);
    const up = crouchTo(c, false, 2000);
    expect(crouchAt(up, 2000 + CROUCH_MS / 2)).toBeCloseTo(0.5, 5);
    expect(crouchAt(up, 2000 + CROUCH_MS)).toBe(0);
  });

  test('a change half way eases back from where it got to', () => {
    const c = crouchTo(crouchNow(false, 0), true, 0);
    const mid = crouchAt(c, CROUCH_MS / 2);
    const back = crouchTo(c, false, CROUCH_MS / 2);
    expect(crouchAt(back, CROUCH_MS / 2)).toBeCloseTo(mid, 9);
    expect(crouchAt(back, CROUCH_MS / 2 + 1)).toBeLessThanOrEqual(mid);
    expect(crouchAt(back, CROUCH_MS * 2)).toBe(0);
  });

  test('with no time (reduced motion) it crouches and stands at once', () => {
    const c = crouchTo(crouchNow(false, 0), true, 50, 0);
    expect(crouchAt(c, 50)).toBe(1);
    expect(crouchBusy(c, 50)).toBe(false);
    expect(crouchAt(crouchTo(c, false, 60, 0), 60)).toBe(0);
  });

  test('every unit type has a guard; idle life goes on in it, smaller', () => {
    for (const type of ALL_TYPES) {
      const g = guardOf(type);
      expect(g.idle, type).toBeGreaterThan(0);
      expect(g.idle, type).toBeLessThan(1);
      // Its feet and legs stay on the ground: what the body drops, they are lifted back.
      for (const name of ['feet', 'legs']) {
        const p = g.pieces[name];
        if (p !== undefined) expect(p.shift[1], `${type} ${name}`).toBeCloseTo(g.drop, 9);
      }
    }
  });

  test('foot units sink about a quarter of their height and bend their knees', () => {
    for (const type of ['warrior', 'spearman', 'swordsman', 'defender', 'archer', 'sellsword', 'hoplite', 'kingsGuard', 'piper'] as const) {
      const g = guardOf(type);
      expect(g.drop, type).toBe(FOOT_DROP);
      expect(g.pieces.legs!.angle, `${type}: the shins tip forward`).toBeGreaterThan(0.5);
      expect(g.lean, type).toBeGreaterThan(0);
    }
    // About 33.6 world units from feet to eyes: a drop of 8 is about a quarter.
    expect(FOOT_DROP / 33.6).toBeGreaterThan(0.2);
    expect(FOOT_DROP / 33.6).toBeLessThan(0.3);
  });

  test('shield bearers bring the shield to the middle and raise it; spears stay on the ground', () => {
    for (const type of ['warrior', 'spearman', 'hoplite', 'kingsGuard', 'defender'] as const) {
      const s = guardOf(type).pieces.shield!;
      expect(s.shift[0], `${type}: toward the middle`).toBeGreaterThan(2);
      expect(s.shift[1], `${type}: raised`).toBeGreaterThan(0);
    }
    for (const type of ['spearman', 'hoplite', 'kingsGuard'] as const) {
      const w = guardOf(type).pieces.weapon!;
      // The spear slides up through the hand as far as the body sinks (its butt was 0.6 above the ground).
      expect(w.shift[1], type).toBeCloseTo(FOOT_DROP - 0.6, 9);
      expect(w.angle, `${type}: angled out past the shield's edge`).toBeLessThan(0);
    }
  });

  test('no shield: the weapon is held close (crossed blades, the bow low)', () => {
    const sw = guardOf('swordsman').pieces;
    expect(Math.sign(sw.weapon!.angle)).toBe(-Math.sign(sw.weapon2!.angle));
    expect(guardOf('archer').pieces.bow!.angle).toBeGreaterThan(0.5);
  });

  test('riders hunch over the neck; the horse lowers its head and settles; siege only settles', () => {
    for (const type of ['horseman', 'knight', 'horseArcher', 'khansGuard', 'skyCaller'] as const) {
      const g = guardOf(type);
      expect(g.pieces.rider!.angle, type).toBeGreaterThan(0.2);
      expect(g.pieces.neck!.angle, type).toBeLessThan(-0.2);
      expect(g.drop, type).toBeGreaterThan(0);
      expect(g.drop, type).toBeLessThan(3);
    }
    for (const type of ['catapult', 'camp'] as const) {
      const g = guardOf(type);
      expect(g.drop).toBe(0);
      expect(g.squash).toBeGreaterThan(0);
      expect(g.squash).toBeLessThan(0.08);
    }
    expect(guardOf('catapult').arm).toBeLessThan(0);
  });
});
