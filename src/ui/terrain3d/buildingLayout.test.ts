import { expect, test } from 'vitest';
import type { GlMap, GlTile } from './input';
import {
  buildingPieceFits, buildingPlan, CHEST_BESIDE, CHEST_MS, chestOpen, chestPlays, chestSpot, chestSpots, COINS, coinAt, FADE_MS,
  FIELD_BUILDINGS, FOUNDRY_CHIMNEY, HOLD_MS, LID_MS, LID_OPEN, PIECE_SIZE, SMOKE_PERIOD, SMOKE_PUFFS, smokePuff, smokeRate, smokeSpots,
  WHEEL, wheelAngle, wheelSpots,
} from './buildingLayout';
import { centre, edgeDist, tileSetup } from './layout';

const bare: GlTile = { terrain: 'field', resource: null, harvested: false, building: null, village: false, treasure: false, road: false, city: false, town: null };

test('every tile building has a plan, on any turn of its tile, with every piece on the tile and tall ones clear of the middle', () => {
  for (const b of FIELD_BUILDINGS) {
    for (let turn = 0; turn < 6; turn++) {
      const plan = buildingPlan(b, turn, 3, -2);
      expect(plan.pieces.length, b).toBeGreaterThan(2);
      for (const p of plan.pieces) expect(buildingPieceFits(p), `${b} ${p.kind} at ${p.x},${p.z}`).toBe(true);
    }
  }
});

test('each upgrade keeps what it grew from and adds to it', () => {
  const kinds = (b: (typeof FIELD_BUILDINGS)[number]): string[] => buildingPlan(b, 0, 0, 0).pieces.map((p) => p.kind);
  expect(kinds('farm')).toContain('barn');
  expect(kinds('granary')).toEqual(expect.arrayContaining(['barn', 'granary', 'wheatPlot']));
  expect(kinds('orchard').filter((k) => k === 'tree').length).toBe(5);
  expect(kinds('plantation').filter((k) => k === 'fullTree').length).toBe(7);
  expect(kinds('lumberCamp')).toContain('logPile');
  expect(kinds('lumberMill')).toEqual(expect.arrayContaining(['mill', 'race', 'bigLogPile']));
  expect(buildingPlan('lumberMill', 0, 0, 0).wheel).toEqual(WHEEL);
  expect(buildingPlan('lumberCamp', 0, 0, 0).wheel).toBeNull();
  expect(kinds('market').filter((k) => k === 'stall').length).toBe(3);
});

test('the market keeps an open square in the middle, where a unit stands', () => {
  for (const p of buildingPlan('market', 0, 0, 0).pieces) expect(Math.hypot(p.x, p.z), p.kind).toBeGreaterThan(12);
});

test('a building on a tile is laid out by tileSetup, which leaves out its resource, harvested or not', () => {
  const map = (t: Partial<GlTile>): GlMap => ({ radius: 3, tiles: { '1,0': { ...bare, ...t } }, fog: [] });
  for (const harvested of [false, true]) {
    const s = tileSetup(map({ resource: 'cropland', harvested, building: 'farm' }), '1,0');
    expect(s.building?.building).toBe('farm');
    expect([s.res, s.faded, s.tufts.length, s.props.length]).toEqual([null, false, 0, 0]);
  }
  expect(tileSetup(map({ terrain: 'mountain', building: 'mine' }), '1,0').building).toBeNull(); // the mine is its own
  // The mill's wheel stands on its tile, in front of the grove.
  expect(edgeDist(WHEEL.x, WHEEL.z)).toBeGreaterThan(WHEEL.r * 0.6);
});

test('the chest stands where the svg puts it: the middle, before a grove, before a peak, or beside a unit', () => {
  const field = chestSpot({ ...bare, treasure: true })!;
  const forest = chestSpot({ ...bare, terrain: 'forest', treasure: true })!;
  const mountain = chestSpot({ ...bare, terrain: 'mountain', treasure: true })!;
  expect(Math.hypot(field.x, field.z)).toBeLessThan(5);
  expect(forest.z).toBeGreaterThan(0);
  expect(mountain.z).toBeGreaterThan(8);
  expect(chestSpot({ ...bare, treasure: true, beside: true })).toEqual(CHEST_BESIDE);
  expect(CHEST_BESIDE.x).toBeGreaterThan(12); // clear of the figure in the middle
  // None without a treasure, or where a building, a village or a city hides it (as the svg draws it).
  for (const t of [{}, { building: 'farm' as const }, { village: true }, { city: true }]) expect(chestSpot({ ...bare, ...t, treasure: 'building' in t || 'village' in t || 'city' in t })).toBeNull();
  const map: GlMap = { radius: 3, tiles: { '0,0': { ...bare, treasure: true }, '1,0': bare }, fog: [] };
  expect([...chestSpots(map).keys()]).toEqual(['0,0']);
  expect(tileSetup(map, '0,0').chest).toEqual(field);
});

test('the lid swings open in about 360 ms with no jump, then the chest goes over 300 ms', () => {
  expect(LID_MS).toBeGreaterThanOrEqual(300);
  expect(LID_MS).toBeLessThanOrEqual(400);
  expect(FADE_MS).toBe(300);
  expect(CHEST_MS).toBe(LID_MS + HOLD_MS + FADE_MS);
  expect(chestOpen(-50)).toMatchObject({ lid: 0, alpha: 1, sink: 0, coins: null, glow: 0 });
  expect(chestOpen(0).lid).toBe(0);
  expect(chestOpen(LID_MS).lid).toBeCloseTo(LID_OPEN, 6);
  expect(chestOpen(LID_MS / 2).lid).toBeGreaterThan(LID_OPEN * 0.8); // an ease out: most of the swing comes early
  let last = chestOpen(0);
  for (let ms = 10; ms <= CHEST_MS + 100; ms += 10) {
    const p = chestOpen(ms);
    expect(p.lid).toBeGreaterThanOrEqual(last.lid);
    expect(p.lid - last.lid, `lid at ${ms}`).toBeLessThan(0.2); // at most about ten degrees a 10 ms frame
    expect(p.alpha).toBeLessThanOrEqual(last.alpha);
    expect(Math.abs(p.alpha - last.alpha)).toBeLessThan(0.08);
    last = p;
  }
  expect(chestOpen(LID_MS + HOLD_MS).alpha).toBe(1);
  expect(chestOpen(CHEST_MS).alpha).toBe(0);
  expect(chestOpen(CHEST_MS).sink).toBeGreaterThan(0);
  // The burst of light and coins comes while the lid opens and is over before the chest has gone.
  expect(chestOpen(LID_MS * 0.7).glow).toBeGreaterThan(0.5);
  expect(chestOpen(LID_MS * 0.7).coins).not.toBeNull();
  expect(chestOpen(CHEST_MS - 50).coins).toBeNull();
  expect(chestOpen(CHEST_MS - 50).glow).toBe(0);
});

test('the coins leap up out of the chest, spread and fall back', () => {
  for (let i = 0; i < COINS; i++) {
    for (const v of coinAt(i, 0)) expect(Math.abs(v)).toBe(0);
    expect(coinAt(i, 0.4)[1]).toBeGreaterThan(5);
    expect(coinAt(i, 1)[1]).toBeCloseTo(0, 6);
  }
  const ends = Array.from({ length: COINS }, (_, i) => coinAt(i, 1));
  expect(new Set(ends.map(([x]) => Math.sign(Math.round(x)))).size).toBeGreaterThan(1);
});

test('a claim opens the chest the map showed on that tile, timed from its effect; reduced motion plays nothing', () => {
  const spots = new Map([['2,1', { x: 10, y: 1, z: 20, s: 1.2 }]]);
  const claims = [{ at: '2,1', delay: 120 }, { at: '2,1', delay: 240 }, { at: '5,5', delay: 0 }];
  expect(chestPlays(claims, spots, 1000, false)).toEqual([{ key: '2,1', x: 10, y: 1, z: 20, s: 1.2, start: 1120 }]);
  expect(chestPlays(claims, spots, 1000, true)).toEqual([]);
  expect(chestPlays([], spots, 1000, false)).toEqual([]);
});

test('the mill wheel turns steadily with the motion clock and stands still when the clock does', () => {
  const map: GlMap = { radius: 3, tiles: { '0,0': { ...bare, terrain: 'forest', building: 'lumberMill' }, '1,0': { ...bare, terrain: 'forest', building: 'lumberCamp' } }, fog: [] };
  const w = wheelSpots(map);
  expect(w.map((s) => s.key)).toEqual(['0,0']);
  expect(w[0]).toMatchObject({ x: WHEEL.x, y: WHEEL.y, z: WHEEL.z, r: WHEEL.r });
  expect(wheelAngle(5, 0)).toBe(wheelAngle(5, 0));
  const step = wheelAngle(0.05, 0) - wheelAngle(0, 0);
  expect(Math.abs(step)).toBeLessThan(0.1); // a 20 fps frame turns it a few degrees: calm, never a blur
  expect(wheelAngle(10.05, 0) - wheelAngle(10, 0)).toBeCloseTo(step, 9);
  expect(wheelSpots({ ...map, tiles: { '0,0': { ...map.tiles['0,0']!, city: true } } })).toEqual([]);
});

test('smoke rises from the lumber camp\'s stovepipe (a wisp), the mill\'s chimney and the foundry\'s (fuller); nowhere else', () => {
  const map: GlMap = {
    radius: 4, fog: [], tiles: {
      '0,0': { ...bare, terrain: 'forest', building: 'lumberCamp' }, '1,0': { ...bare, terrain: 'forest', building: 'lumberMill' },
      '2,0': { ...bare, terrain: 'mountain', building: 'foundry' }, '3,0': { ...bare, terrain: 'mountain', building: 'mine' },
      '0,1': { ...bare, building: 'farm' }, '1,1': { ...bare, terrain: 'forest', building: 'lumberCamp', city: true },
    },
  };
  const s = smokeSpots(map);
  expect(s.map((x) => `${x.key}:${x.kind}`)).toEqual(['0,0:wisp', '1,0:full', '2,0:full']);
  expect(SMOKE_PUFFS.full).toBeGreaterThan(SMOKE_PUFFS.wisp);
  // Each starts at its chimney's top: above the cabin's and the mill's roofs, at the foundry chimney's cap.
  const camp = s[0]!, mill = s[1]!;
  const cabin = tileSetup(map, '0,0').building!.pieces.find((p) => p.kind === 'cabin')!;
  const millP = tileSetup(map, '1,0').building!.pieces.find((p) => p.kind === 'mill')!;
  expect(camp.y).toBeGreaterThan(10 * (PIECE_SIZE.cabin ?? 1));
  expect(Math.hypot(camp.x - (cabin.x), camp.z - cabin.z)).toBeLessThan(cabin.foot);
  expect(mill.y).toBeGreaterThan(17 * (PIECE_SIZE.mill ?? 1));
  expect(Math.hypot(mill.x - (centre(1, 0).x + millP.x), mill.z - (centre(1, 0).z + millP.z))).toBeLessThan(millP.foot);
  expect(s[2]!.y).toBe(FOUNDRY_CHIMNEY.y);
});

test('a puff of smoke rises, swells, drifts to the right and fades, smoothly, and the clock wraps seamlessly', () => {
  for (let i = 0; i < SMOKE_PUFFS.full; i++) {
    let prev = smokePuff(0, i, SMOKE_PUFFS.full, 0.3);
    let maxStep = 0, maxAlpha = 0;
    for (let f = 1; f < 20 * 30; f++) {
      const p = smokePuff(f / 20, i, SMOKE_PUFFS.full, 0.3); // the ambient loop's 20 fps, 30 s
      if (p.life > prev.life) {
        // Within one life: up, wider, further right.
        expect(p.y).toBeGreaterThan(prev.y);
        expect(p.size).toBeGreaterThan(prev.size);
        maxStep = Math.max(maxStep, Math.hypot(p.x - prev.x, p.y - prev.y));
      }
      maxAlpha = Math.max(maxAlpha, p.alpha);
      prev = p;
    }
    expect(maxStep).toBeLessThan(0.5); // a gentle drift: under half a unit a frame
    expect(maxAlpha).toBeGreaterThan(0.5);
  }
  const start = smokePuff(0, 0, 4, 0), born = smokePuff(0, 0, 4, 0.999);
  expect(born.alpha).toBeLessThan(0.05); // a puff is born faint at the chimney
  expect(smokePuff(10, 0, 4, 0).x).toBeGreaterThanOrEqual(-1); // drifts right, never far left
  const late = Array.from({ length: 50 }, (_, j) => smokePuff(j * 0.71, 2, 6, 0.4)).filter((p) => p.life > 0.9);
  for (const p of late) expect(p.alpha).toBeLessThan(0.05); // it fades away before it ends
  expect(smokePuff(SMOKE_PERIOD + 1.25, 1, 4, 0.2).life).toBeCloseTo(smokePuff(1.25, 1, 4, 0.2).life, 6);
  expect(start.y).toBeGreaterThanOrEqual(0);
  // The clock stands still at rest and under reduced motion: the smoke holds one still shape.
  expect(smokePuff(12.5, 3, 6, 0.1)).toEqual(smokePuff(12.5, 3, 6, 0.1));
  for (let i = 0; i < 6; i++) expect(smokeRate(i, 0.3) * SMOKE_PERIOD % 1).toBeCloseTo(0, 9);
});
