import { expect, test } from 'vitest';
import { IDLE, follows, gesture } from './gesture';
import type { GestureOut, PointerInput } from './gesture';

const run = (events: PointerInput[]) => {
  let s = IDLE;
  const outs: GestureOut[] = [];
  for (const e of events) {
    const r = gesture(s, e);
    s = r.state;
    if (r.out) outs.push(r.out);
  }
  return outs;
};
const ev = (type: PointerInput['type'], id: number, x: number, y: number, t: number): PointerInput => ({
  type,
  id,
  x,
  y,
  t,
});

test('a short still touch is a tap', () => {
  expect(run([ev('down', 1, 50, 50, 0), ev('move', 1, 54, 53, 40), ev('up', 1, 54, 53, 120)])).toEqual([
    { kind: 'tap', at: { x: 54, y: 53 } },
  ]);
});

test('a slow still touch is still a tap', () => {
  expect(run([ev('down', 1, 50, 50, 0), ev('up', 1, 50, 50, 500)])).toEqual([{ kind: 'tap', at: { x: 50, y: 50 } }]);
  expect(run([ev('down', 1, 50, 50, 0), ev('up', 1, 50, 50, 600)])).toEqual([{ kind: 'tap', at: { x: 50, y: 50 } }]);
});

test('a very long touch is not a tap', () => {
  expect(run([ev('down', 1, 50, 50, 0), ev('up', 1, 50, 50, 900)])).toEqual([]);
});

test('a drag pans and never taps', () => {
  const o = run([ev('down', 1, 50, 50, 0), ev('move', 1, 80, 50, 30), ev('move', 1, 90, 60, 60), ev('up', 1, 90, 60, 90)]);
  expect(o.every((x) => x!.kind === 'pan')).toBe(true);
  expect(o.reduce((n, x) => n + (x as { dx: number }).dx, 0)).toBe(40);
});

test('moving out and back within slop is still not a tap once it panned', () => {
  const o = run([ev('down', 1, 50, 50, 0), ev('move', 1, 80, 50, 30), ev('move', 1, 50, 50, 60), ev('up', 1, 50, 50, 90)]);
  expect(o.every((x) => x!.kind === 'pan')).toBe(true);
});

test('two fingers zoom and no tap follows', () => {
  const o = run([
    ev('down', 1, 100, 100, 0),
    ev('down', 2, 200, 100, 10),
    ev('move', 2, 300, 100, 30),
    ev('up', 2, 300, 100, 50),
    ev('up', 1, 100, 100, 60),
  ]);
  expect(o).toEqual([{ kind: 'zoom', factor: 2, at: { x: 200, y: 100 } }]);
});

test('lifting one finger of a pinch does not jump the board', () => {
  const o = run([ev('down', 1, 100, 100, 0), ev('down', 2, 200, 100, 10), ev('up', 1, 100, 100, 20), ev('move', 2, 210, 100, 40)]);
  expect(o).toEqual([{ kind: 'pan', dx: 10, dy: 0 }]);
});

test('a third pointer is ignored', () => {
  const o = run([
    ev('down', 1, 100, 100, 0),
    ev('down', 2, 200, 100, 10),
    ev('down', 3, 0, 0, 15),
    ev('move', 3, 500, 500, 20),
    ev('up', 3, 500, 500, 25),
    ev('move', 2, 300, 100, 30),
  ]);
  expect(o).toEqual([{ kind: 'zoom', factor: 2, at: { x: 200, y: 100 } }]);
});

test('cancel resets', () => {
  expect(run([ev('down', 1, 5, 5, 0), ev('cancel', 1, 5, 5, 10), ev('up', 1, 5, 5, 20)])).toEqual([]);
});

test('the reducer says which pointers it follows', () => {
  expect(follows(IDLE, 1)).toBe(false);
  const one = gesture(IDLE, ev('down', 1, 50, 50, 0)).state;
  expect(follows(one, 1)).toBe(true); expect(follows(one, 2)).toBe(false);
  const two = gesture(one, ev('down', 2, 90, 50, 10)).state;
  expect(follows(two, 1)).toBe(true); expect(follows(two, 2)).toBe(true);
  // Lifting one finger of a pinch: the lifted one is no longer followed, so losing it changes nothing.
  const rest = gesture(two, ev('up', 1, 50, 50, 20)).state;
  expect(follows(rest, 1)).toBe(false); expect(follows(rest, 2)).toBe(true);
});
