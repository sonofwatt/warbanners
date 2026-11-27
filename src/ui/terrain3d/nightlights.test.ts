import { expect, test, vi } from 'vitest';
import type { TimeOfDay, Weather } from '../../app/advanced';
import type { GlMap, GlTile } from './input';

// The renderers without a GPU: three.js runs for real except the WebGLRenderer, a stand-in.
vi.mock('three', async (orig) => {
  const three = await orig<typeof import('three')>();
  class FakeRenderer {
    info = { render: { triangles: 0, calls: 0 }, reset(): void {} };
    outputColorSpace = '';
    clear(): void {}
    setClearColor(): void {}
    setPixelRatio(): void {}
    setSize(): void {}
    render(): void {}
    dispose(): void {}
    forceContextLoss(): void {}
  }
  return { ...three, WebGLRenderer: FakeRenderer };
});

// Through layout.ts first, as the renderer loads them (layout, buildingLayout and townLayout import one another).
const { centre } = await import('./layout');
const { skyLight } = await import('./sky');
const { DAYLIGHT_ROUNDS } = await import('./daylight');
const { MAX_SPILLS, pieceSpill, townPlan, townSpills, villagePlan } = await import('./townLayout');
const { windowSpills } = await import('./buildingLayout');

const TIMES: TimeOfDay[] = ['day', 'dawn', 'dusk', 'night'];
const WEATHERS: Weather[] = ['clear', 'cloudy', 'rain', 'snow'];

test('the windows light up by the bonfires\' night factor: none by day, full at night, fading with the light at dawn and dusk', () => {
  for (const w of WEATHERS) {
    expect(skyLight({ weather: w, time: 'day' }).windows).toBe(0);
    expect(skyLight({ weather: w, time: 'night' }).windows).toBe(1);
    for (const t of TIMES) for (let round = 1; round <= DAYLIGHT_ROUNDS + 2; round++) {
      const s = skyLight({ weather: w, time: t }, round);
      expect(s.windows, `${w} ${t} ${round}`).toBeCloseTo(s.fire, 10);
    }
  }
  const at = (time: TimeOfDay, round: number): number => skyLight({ weather: 'clear', time }, round).windows;
  for (let r = 1; r < DAYLIGHT_ROUNDS; r++) {
    expect(at('dawn', r + 1)).toBeLessThanOrEqual(at('dawn', r));
    expect(at('dusk', r + 1)).toBeGreaterThanOrEqual(at('dusk', r));
  }
  expect(at('dawn', 1)).toBe(1);
  expect(at('dawn', DAYLIGHT_ROUNDS)).toBe(0);
  // The shots' rounds: dawn 15 and dusk 20 are both partly lit.
  expect(at('dawn', 15)).toBeGreaterThan(0.1);
  expect(at('dawn', 15)).toBeLessThan(0.9);
  expect(at('dusk', 20)).toBeGreaterThan(0.3);
});

test('each lit building throws its light out from its front, under its windows or doorway; a watchtower throws none', () => {
  for (const faction of ['spartans', 'mongols'] as const) {
    for (const level of [1, 3, 6, 9]) {
      const plan = townPlan({ faction, level, capital: level === 6, walls: level > 3 } as never, 2, -1);
      const spills = townSpills(plan);
      expect(spills.length).toBeLessThanOrEqual(MAX_SPILLS);
      const lit = plan.pieces.filter((p) => pieceSpill(p, faction === 'spartans') !== null);
      expect(spills.length).toBe(lit.length);
      for (const s of spills) {
        expect(Math.hypot(s.dx, s.dz)).toBeCloseTo(1);
        // The nearest piece is the one it came from: the light starts at its front, facing away from its middle.
        const p = plan.pieces.reduce((a, b) => (Math.hypot(b.x - s.x, b.z - s.z) < Math.hypot(a.x - s.x, a.z - s.z) ? b : a));
        expect((s.x - p.x) * s.dx + (s.z - p.z) * s.dz).toBeGreaterThan(1.2);
        expect(s.weight).toBeGreaterThan(0);
      }
    }
  }
  // A village: one window on each hut.
  const v = villagePlan(1, 0, 3, 4);
  expect(townSpills(v)).toHaveLength(2);
  expect(pieceSpill({ kind: 'tower', x: 0, z: 0, rot: 0, foot: 3, h: 24, seed: 0 }, false)).toBeNull();
});

test('the windows\' light is laid only on cities and villages, in world space round their tiles', () => {
  const bare: GlTile = { terrain: 'field', resource: null, harvested: false, building: null, village: false, treasure: false, road: false, city: false, town: null };
  const map: GlMap = {
    radius: 3, fog: [], tiles: {
      '0,0': { ...bare, city: true, town: { faction: 'spartans', level: 4, capital: true, walls: false } } as GlTile,
      '2,-1': { ...bare, village: true },
      '1,1': { ...bare },
      '-1,1': { ...bare, building: 'farm', village: true },
    },
  };
  const s = windowSpills(map);
  expect(s.map((x) => x.key)).toEqual(['0,0', '2,-1']);
  for (const w of s) {
    const [q, r] = w.key.split(',').map(Number) as [number, number];
    const c = centre(q, r);
    for (const l of w.lights) expect(Math.hypot(l.x - c.x, l.z - c.z)).toBeLessThan(30);
  }
});
