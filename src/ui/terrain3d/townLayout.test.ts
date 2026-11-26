import { expect, test } from 'vitest';
import type { GlMap, GlTile, GlTown } from './input';
import { COS_E, edgeDist, SQUASH, tileSetup } from './layout';
import {
  housesFor, LANTERN, LANTERN_SWING, LANTERN_WALL, lanternFlicker, lanternSpots, MAX_HOUSES, MINE, pieceFits, tallFor, towersFor, townPlan,
  villagePlan, WALL_R,
} from './townLayout';

const town = (p: Partial<GlTown> = {}): GlTown => ({ faction: 'spartans', level: 1, capital: false, walls: false, ...p });
const bare: GlTile = { terrain: 'field', resource: null, harvested: false, building: null, village: false, treasure: false, road: false, city: false, town: null };

test('a city grows with its level: more houses, then taller ones, then towers', () => {
  let last = 0;
  for (let level = 1; level <= 8; level++) {
    for (const faction of ['spartans', 'mongols'] as const) {
      const plan = townPlan(town({ faction, level }), 2, -1);
      const houses = plan.pieces.filter((p) => p.kind === 'house' || p.kind === 'tall' || p.kind === 'yurt' || p.kind === 'tallYurt');
      expect(houses.length).toBe(housesFor(level));
      expect(houses.filter((p) => p.kind === 'tall' || p.kind === 'tallYurt').length).toBe(Math.min(houses.length, tallFor(level)));
      expect(plan.pieces.filter((p) => p.kind === 'tower').length).toBe(towersFor(level));
    }
    const size = townPlan(town({ level }), 0, 0).pieces.reduce((s, p) => s + p.h * p.foot, 0);
    expect(size).toBeGreaterThan(last); // every level adds something you can see, to level 6
    if (level < 6) last = size;
    else break;
  }
  expect(housesFor(1)).toBe(2);
  expect(housesFor(20)).toBe(MAX_HOUSES);
});

test('the capital has the grand hall and the tall banner; another city a small pennant on its hall', () => {
  for (const faction of ['spartans', 'mongols'] as const) {
    const cap = townPlan(town({ faction, capital: true, level: 2 }), 0, 0);
    const city = townPlan(town({ faction, level: 2 }), 0, 0);
    const hall = (p: typeof cap) => p.pieces[0]!;
    expect(hall(cap).kind).toBe(faction === 'spartans' ? 'grandHall' : 'greatYurt');
    expect(hall(city).kind).toBe(faction === 'spartans' ? 'hall' : 'yurtHall');
    expect(hall(cap).h).toBeGreaterThan(hall(city).h);
    expect(hall(cap).foot).toBeGreaterThan(hall(city).foot);
    expect(cap.banner).not.toBeNull();
    expect(cap.pennant).toBeNull();
    expect(city.banner).toBeNull();
    expect(city.pennant).not.toBeNull();
    expect(cap.faction).toBe(faction);
  }
});

test('every building stands on the tile, clear of the square in the middle, of the others and inside the walls', () => {
  for (const capital of [false, true]) {
    for (let level = 1; level <= 7; level++) {
      const plan = townPlan(town({ level, capital, walls: true }), 3, 1);
      for (const p of plan.pieces) {
        expect(pieceFits(p), `${p.kind} at level ${level}`).toBe(true);
        // Inside the ring of walls (the towers stand on its line at the back corners, part of it).
        if (p.kind !== 'tower') {
          for (let e = 0; e < 6; e++) {
            const a = (e * Math.PI) / 3;
            expect(p.x * Math.cos(a) + p.z * Math.sin(a) + p.foot).toBeLessThanOrEqual(WALL_R * Math.cos(Math.PI / 6) + 0.1);
          }
        }
      }
      for (let i = 0; i < plan.pieces.length; i++) {
        for (let j = i + 1; j < plan.pieces.length; j++) {
          const a = plan.pieces[i]!, b = plan.pieces[j]!;
          expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.kind} and ${b.kind}`).toBeGreaterThanOrEqual((a.foot + b.foot) * 0.85);
        }
      }
      if (plan.banner) for (const p of plan.pieces) expect(Math.hypot(plan.banner.x - p.x, plan.banner.z - p.z)).toBeGreaterThan(p.foot * 0.9);
    }
  }
});

test('walls are drawn only when the city has them: a closed ring with a gate at the front', () => {
  expect(townPlan(town(), 0, 0).walls).toBeNull();
  const w = townPlan(town({ walls: true }), 0, 0).walls!;
  expect(w.towers.length).toBe(6);
  expect(w.runs.length).toBe(7); // six sides, the gate's side in two
  expect(w.gate.z).toBeGreaterThan(0); // toward the viewer
  for (const [x0, z0, x1, z1] of w.runs) {
    expect(edgeDist(x0, z0)).toBeGreaterThan(0);
    expect(edgeDist(x1, z1)).toBeGreaterThan(0);
  }
});

test('a village is two huts and a woodpile, neutral, on the tile and off the middle', () => {
  for (let v = 0; v < 4; v++) {
    for (const turn of [0, 1]) {
      const plan = villagePlan(v, turn, v, turn);
      expect(plan.faction).toBeNull();
      expect(plan.pieces.filter((p) => p.kind === 'hut').length).toBe(2);
      expect(plan.pieces.filter((p) => p.kind === 'woodpile').length).toBe(1);
      for (const p of plan.pieces) expect(pieceFits(p)).toBe(true);
      expect(plan.walls ?? plan.banner ?? plan.pennant).toBeNull();
    }
  }
});

test('tileSetup gives a city its plan (with its shadows) and a village its huts; a grove in a forest village makes room', () => {
  const map = (t: Partial<GlTile>): GlMap => ({ radius: 3, tiles: { '1,0': { ...bare, ...t } }, fog: [] });
  const city = tileSetup(map({ city: true, town: town({ level: 4, walls: true }) }), '1,0');
  expect(city.town?.pieces.length).toBe(1 + housesFor(4) + towersFor(4));
  expect(city.blobs.length).toBe(city.town!.pieces.length);
  expect(city.peaks).toEqual([]);
  // A city tile whose owner has no faction draws no town (the svg leaves it blank too).
  expect(tileSetup(map({ city: true, town: null }), '1,0').town).toBeNull();
  const village = tileSetup(map({ terrain: 'forest', village: true }), '1,0');
  expect(village.town?.faction).toBeNull();
  for (const [x, z] of village.trees) for (const p of village.town!.pieces) expect(Math.hypot(x - p.x, z - p.z)).toBeGreaterThan(p.foot);
});

test('a mine or a foundry sets its tunnel in the mountain: the main peak stands behind the tunnel and the yard is level', () => {
  for (const building of ['mine', 'foundry'] as const) {
    for (const k of ['0,0', '1,0', '2,0', '3,0']) {
      const s = tileSetup({ radius: 4, tiles: { [k]: { ...bare, terrain: 'mountain', resource: 'ore', building } }, fog: [] }, k);
      expect(s.works).toBe(building);
      const main = s.peaks[0]!;
      // The main peak's foot is behind the tunnel's far end along the tunnel's width.
      for (const x of [MINE.x - MINE.openW, MINE.x, MINE.x + MINE.openW]) {
        const dz = Math.sqrt(Math.max(0, main.b * main.b - (x - main.x) ** 2));
        expect(main.z + dz, k).toBeLessThan(MINE.z - MINE.depth + 1.5);
      }
    }
  }
  expect(tileSetup({ radius: 4, tiles: { '0,0': { ...bare, terrain: 'mountain', resource: 'ore' } }, fog: [] }, '0,0').works).toBeNull();
});

test('every mine has a lantern, a foundry a furnace too; none on other tiles', () => {
  const map: GlMap = {
    radius: 4, fog: [],
    tiles: {
      '0,0': { ...bare, terrain: 'mountain', building: 'mine' },
      '1,0': { ...bare, terrain: 'mountain', building: 'foundry' },
      '1,1': { ...bare, terrain: 'mountain', resource: 'ore' },
      '3,1': { ...bare, terrain: 'field', building: 'farm' },
    },
  };
  const spots = lanternSpots(map);
  expect(spots.map((s) => `${s.key}:${s.kind}`)).toEqual(['0,0:lantern', '1,0:lantern', '1,0:furnace']);
  expect(spots[0]!.y).toBe(LANTERN.y);
  expect(new Set(spots.filter((s) => s.kind === 'lantern').map((s) => s.voice)).size).toBe(2); // neighbours differ
  for (const s of spots) expect(s.box.x1).toBeGreaterThan(s.box.x0);
});

test('the lantern flickers gently on the ambient clock, never strobes, and holds a steady glow at rest', () => {
  let min = Infinity, max = -Infinity, jump = 0;
  let prev = lanternFlicker(0, 1);
  for (let i = 1; i < 20 * 120; i++) {
    const t = i / 20; // the loop's 20 frames a second, two minutes
    const v = lanternFlicker(t, 1);
    min = Math.min(min, v); max = Math.max(max, v);
    jump = Math.max(jump, Math.abs(v - prev));
    prev = v;
  }
  expect(min).toBeGreaterThanOrEqual(1 - LANTERN_SWING);
  expect(max).toBeLessThanOrEqual(1 + LANTERN_SWING);
  expect(max - min).toBeGreaterThan(0.15); // it does flicker
  expect(jump).toBeLessThan(0.12); // no frame to frame flash
  // Level 0 (reduced motion, or the board at rest) is the steady glow, whatever the clock says.
  for (const t of [0, 1.3, 77.7, 999.9]) expect(lanternFlicker(t, 0)).toBe(1);
  // Easing to rest scales it down smoothly; the two voices differ; the clock wraps seamlessly.
  expect(Math.abs(lanternFlicker(3.3, 0.25) - 1)).toBeLessThanOrEqual(Math.abs(lanternFlicker(3.3, 1) - 1) * 0.25 + 1e-9);
  expect(lanternFlicker(3.3, 1, 0)).not.toBeCloseTo(lanternFlicker(3.3, 1, 1), 3);
  expect(lanternFlicker(1000.05, 1)).toBeCloseTo(lanternFlicker(0.05, 1), 6);
});

test('buildings3d: the lantern is fixed to the tunnel\'s wall deep inside, and the camera sees it under the mouth\'s lintel', () => {
  // Inside: well behind the mouth, under the tunnel's roof.
  expect(LANTERN.z).toBeLessThan(MINE.z - MINE.depth / 2);
  expect(LANTERN.z).toBeGreaterThan(MINE.z - MINE.depth);
  expect(LANTERN.y + 1).toBeLessThan(MINE.openH - 2);
  // On the wall: the tunnel's left wall, a short bracket's reach from it, not hanging in the middle.
  expect(LANTERN_WALL).toBe(MINE.x - MINE.openW);
  expect(LANTERN.x - LANTERN_WALL).toBeGreaterThan(0.6); // the lantern clears the rock
  expect(LANTERN.x - LANTERN_WALL).toBeLessThan(2);
  // Seen: the camera looks down at the elevation whose sine is SQUASH, so the line from the lantern's glass toward it
  // climbs SQUASH / COS_E per unit toward the viewer; at the front of the mouth's lintel it must still pass beneath,
  // and it passes the inner frame's post in front (inset 0.6, 1.2 wide) on the tunnel's side.
  const lintelFront = MINE.z + 0.4 + 0.7, lintelBottom = MINE.openH - 1.4;
  expect(LANTERN.y + (lintelFront - LANTERN.z) * (SQUASH / COS_E)).toBeLessThan(lintelBottom);
  const postInner = MINE.x - (MINE.openW - 0.6) - 0.5 + 0.6;
  expect(LANTERN.x - 0.63).toBeGreaterThan(postInner);
});
