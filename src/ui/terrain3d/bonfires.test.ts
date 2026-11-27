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
const { fireSpots, smokeSpots, FLAME_TOP, SMOKE_ALPHA, SMOKE_SIZE } = await import('./buildingLayout');
const { FIRE_RING, HUT_REACH, pieceFits, villagePlan } = await import('./townLayout');
const { skyLight } = await import('./sky');
const { DAYLIGHT_ROUNDS } = await import('./daylight');
const { lanternFlicker } = await import('./townLayout');

const bare: GlTile = { terrain: 'field', resource: null, harvested: false, building: null, village: false, treasure: false, road: false, city: false, town: null };
const mapOf = (tiles: Record<string, Partial<GlTile>>): GlMap => ({
  radius: 3, fog: [], tiles: Object.fromEntries(Object.entries(tiles).map(([k, t]) => [k, { ...bare, ...t }])),
});
const make = () => createTerrain3d({} as HTMLCanvasElement, { units: {} as HTMLCanvasElement })!;

test('a village\'s bonfire burns halfway between its huts, its stones clear of both huts\' eaves, and the huts still fit', () => {
  for (let v = 0; v < 4; v++) {
    for (const turn of [0, 1]) {
      const plan = villagePlan(v, turn, v, turn);
      const huts = plan.pieces.filter((p) => p.kind === 'hut');
      expect(plan.fire).not.toBeNull();
      const f = plan.fire!;
      expect(f.x).toBeCloseTo((huts[0]!.x + huts[1]!.x) / 2);
      expect(f.z).toBeCloseTo((huts[0]!.z + huts[1]!.z) / 2);
      for (const h of huts) expect(Math.hypot(h.x - f.x, h.z - f.z) - HUT_REACH - FIRE_RING, `variant ${v} turn ${turn}`).toBeGreaterThan(1.5);
      // The woodpile keeps clear of the fire too.
      const pile = plan.pieces.find((p) => p.kind === 'woodpile')!;
      expect(Math.hypot(pile.x - f.x, pile.z - f.z)).toBeGreaterThan(FIRE_RING + pile.foot + 2);
      // Near the middle of the tile.
      expect(Math.hypot(f.x, f.z)).toBeLessThan(5);
      for (const p of plan.pieces) expect(pieceFits(p)).toBe(true);
    }
  }
});

test('every unclaimed village has a bonfire with a thin wisp of smoke; a city, a built tile or a plain field has none', () => {
  const map = mapOf({ '0,0': { village: true }, '1,0': { village: true, city: true }, '2,0': {}, '0,1': { terrain: 'forest', village: true } });
  const fires = fireSpots(map);
  expect(fires.map((f) => f.key).sort()).toEqual(['0,0', '0,1']);
  const smoke = smokeSpots(map).filter((s) => s.kind === 'thin');
  expect(smoke.map((s) => s.key).sort()).toEqual(['0,0', '0,1']);
  for (const s of smoke) {
    const f = fires.find((x) => x.key === s.key)!;
    expect(s.x).toBeCloseTo(f.x);
    expect(s.z).toBeCloseTo(f.z);
    expect(s.y).toBeCloseTo(f.y + FLAME_TOP);
  }
  // Light and thin, so it never hides the huts: smaller and fainter than a lumber camp's wisp.
  expect(SMOKE_SIZE.thin).toBeLessThan(SMOKE_SIZE.wisp);
  expect(SMOKE_ALPHA.thin).toBeLessThan(0.6);
});

test('the fire casts light only after dark: none by day, full at night, and at dawn and dusk it fades with the light', () => {
  expect(skyLight({ weather: 'clear', time: 'day' }).fire).toBe(0);
  expect(skyLight({ weather: 'clear', time: 'night' }).fire).toBe(1);
  for (const time of ['dawn', 'dusk'] as const) {
    const at = (round: number): number => skyLight({ weather: 'clear', time }, round).fire;
    let last = time === 'dawn' ? 2 : -1;
    for (let round = 1; round <= DAYLIGHT_ROUNDS; round++) {
      const f = at(round);
      // Dawn's fire fades as the day comes; dusk's grows as the night comes.
      if (time === 'dawn') expect(f).toBeLessThanOrEqual(last); else expect(f).toBeGreaterThanOrEqual(last);
      last = f;
    }
    expect(at(1)).toBe(time === 'dawn' ? 1 : 0);
    expect(at(DAYLIGHT_ROUNDS)).toBe(time === 'dawn' ? 0 : 1);
  }
  // The rounds David looks at: weaker than the night's, but well lit.
  const dawn15 = skyLight({ weather: 'clear', time: 'dawn' }, 15).fire, dusk20 = skyLight({ weather: 'clear', time: 'dusk' }, 20).fire;
  for (const f of [dawn15, dusk20]) { expect(f).toBeGreaterThan(0.3); expect(f).toBeLessThan(0.9); }
});

test('the bonfires are one mesh for the map: the flames move on the motion clock and hold still at rest; the glow follows the light', () => {
  const t = make();
  t.setMap(mapOf({ '0,0': { village: true }, '2,0': { village: true }, '1,0': {} }));
  expect(t.bonfires().count).toBe(2);
  expect(t.smoke().count).toBe(2); // each fire's wisp
  t.tick(0, 1);
  t.tick(80, 1);
  const moving = t.bonfires().time;
  expect(moving).toBeGreaterThan(0);
  t.tick(160, 0);
  const held = t.bonfires();
  t.tick(5000, 0);
  expect(t.bonfires().time).toBe(held.time);
  expect(t.bonfires().flicker).toEqual([1, 1]); // the glow is steady at rest and under reduced motion
  t.tick(5050, 1);
  expect(t.bonfires().flicker).toEqual([lanternFlicker(5.05, 1, 0), lanternFlicker(5.05, 1, 1)]);
  // In view, the fire keeps the ambient loop running.
  expect(t.animating({ cx: 0, cy: 0, scale: 1 }, { w: 400, h: 400 })).toBe(true);
  // The light: none by day, all of it at night, part of it at dusk round 20.
  expect(t.bonfires().light).toBe(0);
  t.setLook({ weather: 'clear', time: 'night' });
  expect(t.bonfires().light).toBe(1);
  t.setLook({ weather: 'clear', time: 'dusk' }, 20);
  expect(t.bonfires().light).toBeCloseTo(skyLight({ weather: 'clear', time: 'dusk' }, 20).fire);
  // A village taken (it is a city now) puts its fire out.
  t.setMap(mapOf({ '0,0': { village: false, city: true }, '2,0': { village: true } }));
  expect(t.bonfires().count).toBe(1);
  t.setMap(mapOf({ '1,0': {} }));
  expect(t.bonfires().count).toBe(0);
  expect(t.animating({ cx: 0, cy: 0, scale: 1 }, { w: 400, h: 400 })).toBe(false);
  t.dispose();
});
