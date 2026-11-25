import { describe, expect, test } from 'vitest';
import { hexToBoard } from '../../board/layout';
import { SQUASH } from '../layout';
import { ALL_TYPES } from './figures';
import {
  AIM_TURN_MS, aimYaw, frontsOf, headingOf, moveYaw, REST_TURN, TURN_MS, turnTo, turning, wrap, yawAt,
} from './facing';

/** Where a world heading points on screen (board units: x right, y down): the camera squashes depth by SQUASH. */
const onScreen = (h: number): [number, number] => [Math.sin(h), Math.cos(h) * SQUASH];
/** The six neighbours of a hex, as axial offsets. */
const SIX: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const along = (a: [number, number], b: [number, number]): void => {
  const la = Math.hypot(...a), lb = Math.hypot(...b);
  expect(Math.abs(a[0] * b[1] - a[1] * b[0]) / (la * lb), 'parallel on screen').toBeLessThan(1e-9);
  expect(a[0] * b[0] + a[1] * b[1], 'and the same way').toBeGreaterThan(0);
};

describe('3D unit facing', () => {
  test('a heading from a board vector: down the screen faces the viewer, up faces away, sideways is a profile', () => {
    expect(headingOf(0, 10)).toBeCloseTo(0, 12);
    expect(Math.abs(headingOf(0, -10)!)).toBeCloseTo(Math.PI, 12);
    expect(headingOf(10, 0)).toBeCloseTo(Math.PI / 2, 12);
    expect(headingOf(-10, 0)).toBeCloseTo(-Math.PI / 2, 12);
    expect(headingOf(0, 0)).toBeNull();
    expect(headingOf(Number.NaN, 1)).toBeNull();
  });

  test('for each of the six hex directions, every figure turns its moving front along the move on screen', () => {
    const o = hexToBoard('0,0');
    for (const [q, r] of SIX) {
      const p = hexToBoard(`${q},${r}`);
      const d: [number, number] = [p.x - o.x, p.y - o.y];
      along(onScreen(headingOf(...d)!), d);
      for (const type of ALL_TYPES) {
        const yaw = moveYaw(type, ...d)!;
        expect(Math.abs(yaw)).toBeLessThanOrEqual(Math.PI);
        along(onScreen(frontsOf(type).move + yaw), d);
        along(onScreen(frontsOf(type).aim + aimYaw(type, ...d)!), d);
      }
    }
  });

  test('the six hex steps are 60 degrees apart on the ground, at 30, 90 and 150 degrees from facing the viewer', () => {
    const o = hexToBoard('0,0');
    const hs = SIX.map(([q, r]) => { const p = hexToBoard(`${q},${r}`); return headingOf(p.x - o.x, p.y - o.y)!; }).map((h) => Math.round((h * 180) / Math.PI));
    expect(hs.sort((a, b) => a - b)).toEqual([-150, -90, -30, 30, 90, 150]);
  });

  test('rest is the built three-quarter view: no turn at all', () => {
    expect(yawAt(REST_TURN, 0)).toBe(0);
    expect(yawAt(REST_TURN, 1e9)).toBe(0);
    expect(turning(REST_TURN, 0)).toBe(false);
  });

  test('an archer aims side on (its arrow), a horse archer over the rump, a knight along its lance', () => {
    expect(wrap(frontsOf('archer').move - frontsOf('archer').aim)).toBeCloseTo(Math.PI / 2, 12);
    expect(Math.abs(wrap(frontsOf('horseArcher').move - frontsOf('horseArcher').aim))).toBeGreaterThan(2.3);
    expect(frontsOf('knight').aim).toBeCloseTo(Math.PI / 2 + 0.3, 12);
    expect(frontsOf('catapult').move).toBe(frontsOf('catapult').aim);
    // Facing a target straight down the screen, the archer's body turns its right side to the viewer.
    expect(aimYaw('archer', 0, 10)).toBeCloseTo(Math.PI / 2 - frontsOf('warrior').move, 12);
  });

  test('wrap brings any angle into (-pi, pi]', () => {
    for (const a of [-7, -Math.PI, -1, 0, 1, Math.PI, 4, 13]) {
      const w = wrap(a);
      expect(w).toBeGreaterThan(-Math.PI);
      expect(w).toBeLessThanOrEqual(Math.PI);
      expect(Math.cos(w)).toBeCloseTo(Math.cos(a), 12);
      expect(Math.sin(w)).toBeCloseTo(Math.sin(a), 12);
    }
  });

  test('a turn eases from where the figure is to the target over its time, never snapping', () => {
    const t = turnTo(REST_TURN, 1.2, 1000, TURN_MS);
    expect(yawAt(t, 1000)).toBe(0);
    let last = 0;
    for (let ms = 1000; ms <= 1000 + TURN_MS; ms += 10) {
      const y = yawAt(t, ms);
      expect(y).toBeGreaterThanOrEqual(last);
      expect(y - last, 'no step bigger than a small part of the turn').toBeLessThan(0.2);
      last = y;
    }
    expect(yawAt(t, 1000 + TURN_MS / 2)).toBeCloseTo(0.6, 9);
    expect(yawAt(t, 1000 + TURN_MS)).toBeCloseTo(1.2, 12);
    expect(turning(t, 1050)).toBe(true);
    expect(turning(t, 1000 + TURN_MS)).toBe(false);
    expect(TURN_MS).toBeGreaterThanOrEqual(120);
    expect(TURN_MS).toBeLessThanOrEqual(200);
    expect(AIM_TURN_MS).toBeGreaterThanOrEqual(120);
  });

  test('turns take the short way round', () => {
    const a = turnTo(turnTo(REST_TURN, 3, 0, 0), -3, 10, TURN_MS);
    expect(a.to - a.from).toBeCloseTo(Math.PI * 2 - 6, 12); // +0.28, through pi, not -6
    const b = turnTo(turnTo(REST_TURN, -2.5, 0, 0), 2.5, 10, TURN_MS);
    expect(b.to - b.from).toBeCloseTo(-(Math.PI * 2 - 5), 12);
    for (let ms = 10; ms <= 10 + TURN_MS; ms += 8) expect(Math.abs(wrap(yawAt(a, ms))), 'stays near the back').toBeGreaterThan(2.9);
  });

  test('a new turn starts from where the last one has got to', () => {
    const a = turnTo(REST_TURN, 1, 0, 100);
    const mid = yawAt(a, 50);
    const b = turnTo(a, -1, 50, 100);
    expect(yawAt(b, 50)).toBeCloseTo(mid, 12);
    expect(yawAt(b, 150)).toBeCloseTo(-1, 12);
  });

  test('a turn can wait to start (an attack whose lunge comes later), and with no time it turns at once', () => {
    const t = turnTo(REST_TURN, 1, 0, AIM_TURN_MS, 300);
    expect(yawAt(t, 200)).toBe(0);
    expect(turning(t, 200), 'waiting counts as turning, so frames keep coming').toBe(true);
    expect(yawAt(t, 300 + AIM_TURN_MS)).toBe(1);
    const now = turnTo(REST_TURN, 1, 0, 0, 300);
    expect(yawAt(now, 0), 'reduced motion: at once').toBe(1);
    expect(turning(now, 0)).toBe(false);
  });
});
