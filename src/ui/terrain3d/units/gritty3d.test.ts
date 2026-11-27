import { describe, expect, test, vi } from 'vitest';
import type { GlUnit } from '../unitsInput';
import type { Wear } from './parts';

// The Gritty realistic Hoplite, and the 3D layer's Gritty path. The renderer runs without a GPU, as in units3d.test.ts.
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

const { ALL_TYPES, buildFigure, GRITTY_TYPES, REAL_TYPES } = await import('./figures');
const { CLEAN } = await import('./parts');
const { createUnits3d } = await import('./units3d');
const { mute } = await import('../../art/palette');

const RED = { main: '#B3261E', dark: '#8E1D17', accent: '#C8963E' };
const positions = (f: { fill: { attributes: { position?: { array: ArrayLike<number> } } } }): number[] => Array.from(f.fill.attributes.position!.array);
const gritty = (wear: Wear) => buildFigure('hoplite', { look: RED, wear, gritty: true });

/** Every look the wear can take: the five stages, blood 1 and 2, scarred, and scarred and wounded again. */
const LOOKS: Wear[] = [
  { stage: 0, blood: 0 }, { stage: 1, blood: 0 }, { stage: 2, blood: 0 }, { stage: 3, blood: 0 }, { stage: 3, blood: 1 },
  { stage: 4, blood: 1 }, { stage: 4, blood: 2 }, { stage: 1, blood: 0, scarred: true }, { stage: 3, blood: 1, scarred: true },
];

/**
 * Triangle budgets. The Bright toon figures stay under 2000 at their most worn. Gritty's own figures have more
 * shape: the detailed toon Hoplite (a faceted helm with its plume, a domed shield, hands) gets 3100, and the
 * realistic Catapult (timber, iron and fire) 6000; a phone board seldom shows more than a dozen or two of them.
 */
const TOON_BUDGET = 2000;
const HOPLITE_BUDGET = 3100;
const GRITTY_BUDGET = 6000;

describe("Gritty's Hoplite (the detailed toon)", () => {
  test('Gritty builds it for the Hoplite; Bright builds the toon figure, the same to the last vertex as before', () => {
    expect([...REAL_TYPES]).toEqual(['catapult']);
    expect([...GRITTY_TYPES].sort()).toEqual(['catapult', 'defender', 'hoplite', 'sellsword', 'spearman', 'swordsman', 'warrior']);
    const bright = buildFigure('hoplite', { look: RED, wear: CLEAN });
    expect(gritty(CLEAN).real, 'a toon figure, drawn in the toon light').toBe(false);
    expect(positions(gritty(CLEAN))).not.toEqual(positions(bright));
    expect(positions(buildFigure('hoplite', { look: RED, wear: CLEAN, gritty: false }))).toEqual(positions(bright));
    // Every other type keeps its toon figure in Gritty.
    for (const t of ALL_TYPES) if (!GRITTY_TYPES.has(t)) expect(positions(buildFigure(t, { look: RED, wear: CLEAN, gritty: true }))).toEqual(positions(buildFigure(t, { look: RED, wear: CLEAN })));
  });

  test('it is built from numbers alone: the same twice', () => {
    for (const w of [CLEAN, { stage: 4, blood: 2 } as Wear]) expect(positions(gritty(w))).toEqual(positions(gritty(w)));
  });

  test('every wear look is a different model', () => {
    const seen = new Set<string>();
    for (const w of LOOKS) {
      const f = gritty(w);
      const sig = `${f.triangles}|${positions(f).reduce((a, v, i) => a + v * ((i % 7) + 1), 0).toFixed(3)}`;
      expect(seen.has(sig), JSON.stringify(w)).toBe(false);
      seen.add(sig);
    }
  });

  test('it stays inside its triangle budget at every wear look; the toon figures inside theirs', () => {
    for (const w of LOOKS) expect(gritty(w).triangles, JSON.stringify(w)).toBeLessThanOrEqual(HOPLITE_BUDGET);
    for (const t of ALL_TYPES) {
      expect(buildFigure(t, { look: RED, wear: { stage: 4, blood: 2 } }).triangles, t).toBeLessThanOrEqual(TOON_BUDGET);
    }
  });

  test('it keeps the moving pieces the strike, block and crouch drive', () => {
    expect(Object.keys(gritty(CLEAN).pieces).sort()).toEqual(['feet', 'legs', 'shield', 'weapon']);
    expect(Object.keys(gritty({ stage: 4, blood: 2 }).pieces).sort()).toEqual(['feet', 'legs', 'shield', 'weapon']);
  });

  test('its feet stand on the ground', () => {
    const f = gritty(CLEAN);
    const p = [...positions(f), ...Object.values(f.pieces).flatMap((pc) => Array.from(pc.fill.attributes.position!.array))];
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < p.length; i += 3) { minY = Math.min(minY, p[i]!); maxY = Math.max(maxY, p[i]!); }
    expect(minY).toBeGreaterThanOrEqual(-0.1);
    expect(minY).toBeLessThan(0.6);
    expect(maxY).toBeLessThan(60);
  });
});

describe("Gritty's realistic Catapult", () => {
  const cat = (wear: Wear) => buildFigure('catapult', { look: RED, wear, gritty: true });
  test('built in Gritty only, the same twice, each wear look different, inside the budget', () => {
    expect(cat(CLEAN).real).toBe(true);
    expect(buildFigure('catapult', { look: RED, wear: CLEAN }).real).toBe(false);
    expect(positions(cat({ stage: 4, blood: 2 }))).toEqual(positions(cat({ stage: 4, blood: 2 })));
    const seen = new Set<string>();
    for (const w of LOOKS) {
      const f = cat(w);
      expect(f.triangles, JSON.stringify(w)).toBeLessThanOrEqual(GRITTY_BUDGET);
      const sig = `${f.triangles}|${positions(f).reduce((a, v, i) => a + v * ((i % 7) + 1), 0).toFixed(3)}`;
      expect(seen.has(sig), JSON.stringify(w)).toBe(false);
      seen.add(sig);
    }
  });

  test('its arm and stone turn on one axle, as the throw needs; broken, the arm is snapped and fixed', async () => {
    const { ARM_COCKED, ARM_LONG } = await import('./figures');
    const { REAL_ARM_COCKED, REAL_ARM_LONG } = await import('./catapult3d');
    expect([REAL_ARM_COCKED, REAL_ARM_LONG]).toEqual([ARM_COCKED, ARM_LONG]);
    const p = cat(CLEAN).pieces;
    expect(Object.keys(p).sort()).toEqual(['arm', 'stone']);
    expect(p.arm!.pivot).toEqual(p.stone!.pivot);
    expect(Math.hypot(...p.arm!.axis)).toBeCloseTo(1, 5);
    expect(Object.keys(cat({ stage: 4, blood: 0 }).pieces)).toEqual([]);
  });
});

describe('the 3D layer in Gritty', () => {
  const unit = (id: number, p: Partial<GlUnit> = {}): GlUnit => ({ id, type: 'hoplite', look: RED, hero: false, x: id * 40, y: 0, spent: false, hunkered: false, ...p });
  const make = () => createUnits3d({} as HTMLCanvasElement, {})!;

  test('each wear look is its own figure in Gritty; Bright ignores wear', () => {
    const u = make();
    const worn = { stage: 3 as const, blood: 1 as const, scarred: false };
    u.setUnits([unit(1, { gritty: true, wear: worn }), unit(2, { gritty: true, wear: worn }), unit(3, { gritty: true, wear: { stage: 0, blood: 0, scarred: false } })]);
    expect(u.stats().looks).toBe(2);
    const b = make();
    b.setUnits([unit(1, { wear: worn }), unit(2)]);
    expect(b.stats().looks).toBe(1);
  });

  test('a unit whose wear changes is rebuilt; figures no unit shows any more are freed', () => {
    const u = make();
    for (let s = 0; s < 30; s++) {
      u.setUnits([unit(1, { gritty: true, wear: { stage: (s % 5) as Wear['stage'], blood: (s % 3) as Wear['blood'], scarred: s % 2 === 0 } })]);
    }
    expect(u.stats().units).toBe(1);
    expect(u.stats().looks).toBeLessThanOrEqual(12);
  });

  test('a fall keeps the Gritty look it stood in', () => {
    const u = make();
    u.setUnits([unit(1, { gritty: true, wear: { stage: 4, blood: 2, scarred: false } })], 0);
    u.setUnits([], 10);
    const looks = u.stats().looks;
    u.pose(new Map(), [{ key: 'a', type: 'hoplite', look: RED, x: 40, y: 0, angle: 0.3, alpha: 0.8 }]);
    expect(u.stats().falls).toBe(1);
    expect(u.stats().looks, 'the fall reuses the worn figure').toBe(looks);
  });
});

describe("Gritty's figure grade", () => {
  test('a little less saturated and a touch darker; sides still apart; other values untouched', () => {
    const sat = (hex: string): number => { const n = Number.parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; return Math.max(...c) - Math.min(...c); };
    const lum = (hex: string): number => { const n = Number.parseInt(hex.slice(1), 16); return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
    for (const c of ['#B3261E', '#2D6DB5', '#C8963E', '#E8B88A']) {
      expect(sat(mute(c))).toBeLessThan(sat(c));
      expect(lum(mute(c))).toBeLessThan(lum(c));
      expect(lum(mute(c))).toBeGreaterThan(lum(c) * 0.85);
    }
    // Red and blue stay far apart.
    const red = mute('#B3261E'), blue = mute('#2D6DB5');
    expect(Number.parseInt(red.slice(1, 3), 16)).toBeGreaterThan(Number.parseInt(blue.slice(1, 3), 16) + 80);
    expect(mute('none')).toBe('none');
    expect(mute('url(#g)')).toBe('url(#g)');
  });
});
