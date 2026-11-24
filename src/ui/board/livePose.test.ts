import { afterEach, expect, test, vi } from 'vitest';
import { hexToBoard } from './layout';
import { livePose, lungePhase, unitPoseOf } from './livePose';

// The 3D figures follow the svg's animations through these. Node has no DOM, so the elements are small stand-ins.

interface Fake { attrs: Record<string, string>; transform: string; body?: Fake }
const el = (f: Fake): Element => ({
  getAttribute: (k: string) => f.attrs[k] ?? null,
  querySelector: (sel: string) => (sel === '.unit-body' && f.body ? el(f.body) : null),
  closest: (sel: string) => (sel === '[data-unit]' && 'data-unit' in f.attrs ? el(f) : null),
  __transform: f.transform,
}) as unknown as Element;

const styles = (): void => {
  vi.stubGlobal('getComputedStyle', (e: Element & { __transform: string }) => ({ transform: e.__transform, opacity: '1' }));
};
class Matrix {
  a: number; b: number; e: number; f: number;
  constructor(t: string) {
    const n = t.slice(t.indexOf('(') + 1, -1).split(',').map(Number);
    [this.a, this.b, , , this.e, this.f] = n as [number, number, number, number, number, number];
  }
}
afterEach(() => { vi.unstubAllGlobals(); });

test('a unit slides where its live transform is, plus a lunge on its body', () => {
  styles();
  vi.stubGlobal('DOMMatrixReadOnly', Matrix);
  const u = el({ attrs: { 'data-unit': '3', 'data-at': '0,0' }, transform: 'matrix(1, 0, 0, 1, 40, 12)', body: { attrs: {}, transform: 'matrix(1, 0, 0, 1, 5, -2)' } });
  expect(unitPoseOf(u)).toEqual({ x: 45, y: 10 });
});

test('a transform that cannot be read falls back to the unit\'s own tile, never the board origin', () => {
  const at = hexToBoard('2,-1');
  expect(at.x === 0 && at.y === 0).toBe(false);
  styles();
  // No DOMMatrixReadOnly (Node, or an old browser): nothing can be read.
  const u = el({ attrs: { 'data-unit': '3', 'data-at': '2,-1' }, transform: 'matrix(1, 0, 0, 1, 40, 12)', body: { attrs: {}, transform: 'none' } });
  expect(unitPoseOf(u)).toEqual(at);
  // A browser that reports 'none' for the group but reads the lunge on the body.
  vi.stubGlobal('DOMMatrixReadOnly', Matrix);
  const lunge = el({ attrs: { 'data-unit': '3', 'data-at': '2,-1' }, transform: 'none', body: { attrs: {}, transform: 'matrix(1, 0, 0, 1, 6, 3)' } });
  expect(unitPoseOf(lunge)).toEqual({ x: at.x + 6, y: at.y + 3 });
  const empty = el({ attrs: { 'data-unit': '3', 'data-at': '2,-1' }, transform: '' });
  expect(unitPoseOf(empty)).toEqual(at);
  expect(unitPoseOf(el({ attrs: { 'data-unit': '3' }, transform: 'none' })), 'no tile either: no pose, so the unit stays on its own spot').toBeNull();
});

test('livePose reads the units with a running animation, through the animation target', () => {
  styles();
  vi.stubGlobal('DOMMatrixReadOnly', undefined);
  const unit = { attrs: { 'data-unit': '7', 'data-at': '1,0' }, transform: 'none' };
  const target = el(unit);
  const g = {
    getAnimations: () => [{ playState: 'running', effect: { target } }, { playState: 'finished', effect: { target: el({ attrs: { 'data-unit': '8', 'data-at': '0,0' }, transform: 'none' }) } }],
    querySelectorAll: () => [],
  } as unknown as Element;
  const out = livePose(g, ['spartans', 'mongols']);
  expect(out.moving).toBe(true);
  expect([...out.at.keys()]).toEqual([7]);
  expect(out.at.get(7)).toEqual(hexToBoard('1,0'));
});

test('a lunge on a unit body carries how far into it the unit is, for the trebuchet arm', () => {
  styles();
  vi.stubGlobal('DOMMatrixReadOnly', undefined);
  const timing = (localTime: number) => ({ getComputedTiming: () => ({ localTime, delay: 100, duration: 400 }) });
  expect(lungePhase({ effect: timing(50) } as unknown as Animation), 'waiting out its delay').toBe(0);
  expect(lungePhase({ effect: timing(300) } as unknown as Animation)).toBeCloseTo(0.5, 9);
  expect(lungePhase({ effect: timing(900) } as unknown as Animation)).toBe(1);
  expect(lungePhase({ effect: null } as unknown as Animation)).toBeNull();
  const unit = { attrs: { 'data-unit': '4', 'data-at': '1,0' }, transform: 'none' };
  const body = { ...el(unit), classList: { contains: (c: string) => c === 'unit-body' } } as unknown as Element;
  const slide = el({ attrs: { 'data-unit': '5', 'data-at': '0,0' }, transform: 'none' });
  const g = {
    getAnimations: () => [{ playState: 'running', effect: { target: body, ...timing(200) } }, { playState: 'running', effect: { target: slide, ...timing(200) } }],
    querySelectorAll: () => [],
  } as unknown as Element;
  const out = livePose(g, ['spartans', 'mongols']);
  expect(out.at.get(4)?.lunge).toBeCloseTo(0.25, 9);
  expect(out.at.get(5)?.lunge, 'a slide is no lunge').toBeUndefined();
});
