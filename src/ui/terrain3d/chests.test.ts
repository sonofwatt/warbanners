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

test('chimney smoke: one mesh for the map, on the motion clock, standing still at rest', () => {
  const t = make();
  t.setMap(mapOf({ '0,0': { terrain: 'forest', building: 'lumberCamp' }, '1,0': { terrain: 'forest', building: 'lumberMill' }, '2,0': { terrain: 'mountain', building: 'foundry' } }));
  expect(t.smoke().count).toBe(3);
  t.tick(0, 1);
  t.tick(80, 1);
  const moving = t.smoke().time;
  expect(moving).toBeGreaterThan(0);
  t.tick(160, 0);
  const held = t.smoke().time;
  t.tick(5000, 0);
  expect(t.smoke().time).toBe(held); // at rest and under reduced motion the clock, and so the smoke, holds still
  expect(t.animating({ cx: 0, cy: 0, scale: 1 }, { w: 400, h: 400 })).toBe(true);
  t.setMap(mapOf({ '0,0': { terrain: 'forest', building: 'lumberCamp' } }));
  expect(t.smoke().count).toBe(1);
  t.dispose();
});

test('the lantern lights its tunnel\'s inside on the figures\' canvas, behind a depth-only copy of the mine\'s front', async () => {
  const { worksPieces, worksParts } = await import('./town');
  const { MINE } = await import('./townLayout');
  const t = make();
  t.setMap(mapOf({ '0,0': { terrain: 'mountain', building: 'mine' }, '1,0': { terrain: 'mountain', building: 'foundry' } }));
  const { lit, front } = t.lanterns().tunnel;
  expect(lit).toBeGreaterThan(100);
  expect(front).toBeGreaterThan(100);
  t.dispose();
  // Without the figures' canvas the lanterns draw in the terrain scene, which already has the inside: no second copy.
  const bare = createTerrain3d({} as HTMLCanvasElement, {})!;
  bare.setMap(mapOf({ '0,0': { terrain: 'mountain', building: 'mine' } }));
  expect(bare.lanterns().tunnel).toEqual({ lit: 0, front: 0 });
  bare.dispose();
  // The three sets are the whole mine, and everything lit lies inside the tunnel or on its rails.
  const count = (gs: { attributes: { position?: { count: number } } }[]): number => gs.reduce((n, g) => n + (g.attributes.position?.count ?? 0), 0);
  const w = worksPieces('foundry', 0, 0, 0.3);
  expect(count(w.outside) + count(w.occluder) + count(w.interior)).toBe(count(worksParts('foundry', 0, 0, 0.3)));
  for (const g of w.interior) {
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(b.min.z).toBeGreaterThanOrEqual(MINE.z - MINE.depth - 0.5);
    expect(b.max.x).toBeLessThanOrEqual(MINE.x + MINE.openW + 1.5);
    expect(b.min.x).toBeGreaterThanOrEqual(MINE.x - MINE.openW - 1.5);
    expect(b.max.y).toBeLessThanOrEqual(MINE.openH + 0.5);
  }
});

test('a shut chest twinkles on the ambient clock; a claimed chest does not, and the twinkle rests with the motion', async () => {
  const { twinkle, TWINKLES, twinkleSeed } = await import('../art/twinkle');
  const t = make();
  t.setMap(mapOf({ '1,0': { treasure: true }, '0,0': {}, '0,1': { treasure: true, village: true } }));
  expect(t.shine().chests).toEqual(['1,0']); // a village hides its chest, so only one twinkles
  // The motion clock runs at the level; at level 1 it follows the wall clock.
  const seen: number[][] = [];
  for (let ms = 0; ms <= 8000; ms += 50) {
    t.tick(ms, 1);
    seen.push(t.shine().shine);
  }
  const flow = 8; // seconds of motion at level 1 (tick's first call starts the clock)
  TWINKLES.forEach((_, i) => expect(seen.at(-1)![i]).toBeCloseTo(twinkle(flow, i, twinkleSeed('1,0')), 5));
  // Every glint lit at some moment, and most of the time all dark.
  TWINKLES.forEach((_, i) => expect(Math.max(...seen.map((s) => s[i]!))).toBeGreaterThan(0.5));
  expect(seen.filter((s) => s.every((b) => b === 0)).length / seen.length).toBeGreaterThan(0.4);
  // At rest (level 0, also what reduced motion draws) no glint shows.
  t.tick(8050, 0);
  expect(t.shine().shine.every((b) => b === 0)).toBe(true);
  // Claimed: the chest leaves the map and opens, and twinkles no more.
  t.setMap(mapOf({ '1,0': {}, '0,0': {}, '0,1': { treasure: true, village: true } }));
  t.chests([{ at: '1,0', delay: 0 }], 9000, false);
  t.tick(9100, 1);
  expect(t.opening().map((o) => o.key)).toEqual(['1,0']);
  expect(t.shine()).toEqual({ chests: [], shine: [] });
  t.dispose();
});
