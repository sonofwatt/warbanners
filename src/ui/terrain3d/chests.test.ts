import { expect, test, vi } from 'vitest';
import type { GlMap, GlTile } from './input';

// The terrain renderer without a GPU: three.js runs for real except the WebGLRenderer, a stand-in.
vi.mock('three', async (orig) => {
  const three = await orig<typeof import('three')>();
  class FakeRenderer {
    info = { render: { triangles: 0, calls: 0 } };
    outputColorSpace = '';
    setClearColor(): void {}
    setPixelRatio(): void {}
    setSize(): void {}
    render(): void {}
    dispose(): void {}
    forceContextLoss(): void {}
  }
  return { ...three, WebGLRenderer: FakeRenderer };
});

const { createTerrain3d } = await import('./terrain3d');
const { CHEST_MS, LID_MS, LID_OPEN } = await import('./buildingLayout');

const bare: GlTile = { terrain: 'field', resource: null, harvested: false, building: null, village: false, treasure: false, road: false, city: false, town: null };
const mapOf = (tiles: Record<string, Partial<GlTile>>): GlMap => ({
  radius: 3, fog: [], tiles: Object.fromEntries(Object.entries(tiles).map(([k, t]) => [k, { ...bare, ...t }])),
});
const make = () => createTerrain3d({} as HTMLCanvasElement, { units: {} as HTMLCanvasElement })!;

test('a claimed chest opens where the map showed it, after the map has dropped it, and is gone after CHEST_MS', () => {
  const t = make();
  t.setMap(mapOf({ '1,0': { treasure: true, beside: true }, '0,0': {} }));
  t.setMap(mapOf({ '1,0': {}, '0,0': {} })); // the claim: the tile has no treasure any more
  t.chests([{ at: '1,0', delay: 100 }], 1000, false);
  expect(t.playing(1000)).toBe(true);
  t.tick(1000, 1);
  expect(t.opening()).toEqual([{ key: '1,0', lid: 0, alpha: 1 }]); // shut, as it stood, until its effect starts
  t.tick(1100 + LID_MS, 1);
  expect(t.opening()[0]!.lid).toBeCloseTo(LID_OPEN, 5);
  expect(t.opening()[0]!.alpha).toBe(1);
  t.tick(1100 + CHEST_MS - 60, 1);
  expect(t.opening()[0]!.alpha).toBeLessThan(0.2);
  t.tick(1100 + CHEST_MS, 1);
  expect(t.opening()).toEqual([]);
  expect(t.playing(1100 + CHEST_MS)).toBe(false);
  t.dispose();
});

test('reduced motion: no swing, the chest is simply gone', () => {
  const t = make();
  t.setMap(mapOf({ '1,0': { treasure: true } }));
  t.setMap(mapOf({ '1,0': {} }));
  t.chests([{ at: '1,0', delay: 0 }], 1000, true);
  expect(t.playing(1000)).toBe(false);
  t.tick(1100, 0);
  expect(t.opening()).toEqual([]);
  t.dispose();
});

test('a claim where the viewer saw no chest plays nothing; a chest is opened once however often its claim is told', () => {
  const t = make();
  t.setMap(mapOf({ '1,0': { treasure: true }, '2,0': {} }));
  t.setMap(mapOf({ '1,0': {}, '2,0': {} }));
  t.chests([{ at: '2,0', delay: 0 }], 1000, false);
  expect(t.opening()).toEqual([]);
  t.chests([{ at: '1,0', delay: 0 }, { at: '1,0', delay: 50 }], 1000, false);
  expect(t.opening().length).toBe(1);
  t.chests([{ at: '1,0', delay: 0 }], 1200, false); // told again later: the chest it played is gone, nothing more
  t.tick(1200, 1);
  expect(t.opening().length).toBe(1);
  t.dispose();
});

test('the mill wheel is one mesh for the map, turns with the motion clock, holds still at level 0', () => {
  const t = make();
  t.setMap(mapOf({ '0,0': { terrain: 'forest', building: 'lumberMill' }, '1,0': { terrain: 'forest', building: 'lumberMill' }, '2,0': { terrain: 'forest', building: 'lumberCamp' } }));
  const w = t.wheels();
  expect(w.count).toBe(2);
  expect(w.triangles).toBeGreaterThan(100);
  expect(w.triangles / 2).toBeLessThan(600);
  t.tick(0, 1);
  const a0 = t.wheels().angle;
  t.tick(50, 1);
  const a1 = t.wheels().angle;
  expect(a1).not.toBe(a0);
  t.tick(100, 0);
  t.tick(2000, 0);
  expect(t.wheels().angle).toBe(t.wheels().angle);
  const still = t.wheels().angle;
  t.tick(3000, 0);
  expect(t.wheels().angle).toBe(still);
  // In view, the wheels keep the ambient loop running; with no mill they do not.
  const cam = { cx: 0, cy: 0, scale: 1 }, vp = { w: 400, h: 400 };
  expect(t.animating(cam, vp)).toBe(true);
  t.setMap(mapOf({ '0,0': { terrain: 'forest' } }));
  expect(t.wheels().count).toBe(0);
  t.dispose();
});
