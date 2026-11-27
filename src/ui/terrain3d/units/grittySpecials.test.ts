import { Color } from 'three';
import { describe, expect, test } from 'vitest';
import { buildFigure, GRITTY_TYPES } from './figures';
import type { UnitType } from './figures';
import { BLOOD, BLOOD_LIGHT, CLEAN } from './parts';
import type { Wear } from './parts';

// Gritty's detailed toon archer, King's Guard, piper and scout (grittySpecials.ts) and camp (grittyCamp.ts).

const RED = { main: '#B3261E', dark: '#8E1D17', accent: '#C8963E' };
const BLUE = { main: '#2D6DB5', dark: '#1F4F87', accent: '#D4A72C' };
const TYPES: readonly UnitType[] = ['archer', 'kingsGuard', 'piper', 'scout', 'camp'];
/** Foot figures at most 3,100 triangles at their most worn; the camp (like a horse and rider) 4,200. */
const BUDGET: Record<string, number> = { archer: 3100, kingsGuard: 3100, piper: 3100, scout: 3100, camp: 4200 };

/** Every look the wear can take: the five stages, blood 1 and 2, scarred, and scarred and wounded again. */
const LOOKS: Wear[] = [
  { stage: 0, blood: 0 }, { stage: 1, blood: 0 }, { stage: 2, blood: 0 }, { stage: 3, blood: 0 }, { stage: 3, blood: 1 },
  { stage: 4, blood: 1 }, { stage: 4, blood: 2 }, { stage: 1, blood: 0, scarred: true }, { stage: 3, blood: 1, scarred: true },
];

const positions = (f: { fill: { attributes: { position?: { array: ArrayLike<number> } } } }): number[] => Array.from(f.fill.attributes.position!.array);
const gritty = (t: UnitType, wear: Wear, look = RED) => buildFigure(t, { look, wear, gritty: true });
const bright = (t: UnitType, wear: Wear = CLEAN) => buildFigure(t, { look: RED, wear });

describe.each(TYPES)("Gritty's %s (the detailed toon)", (t) => {
  test('Gritty builds its own toon figure; Bright keeps the toon one', () => {
    expect(GRITTY_TYPES.has(t)).toBe(true);
    const g = gritty(t, CLEAN);
    expect(g.real, 'a toon figure, drawn in the toon light').toBe(false);
    expect(positions(g)).not.toEqual(positions(bright(t)));
    expect(positions(buildFigure(t, { look: RED, wear: CLEAN, gritty: false }))).toEqual(positions(bright(t)));
  });

  test('it is built from numbers alone: the same twice, in either colour', () => {
    for (const w of [CLEAN, { stage: 4, blood: 2 } as Wear, { stage: 3, blood: 1, scarred: true } as Wear]) {
      expect(positions(gritty(t, w))).toEqual(positions(gritty(t, w)));
      expect(positions(gritty(t, w, BLUE))).toEqual(positions(gritty(t, w)));
    }
  });

  test('every wear look is a different model', () => {
    const seen = new Set<string>();
    for (const w of LOOKS) {
      const f = gritty(t, w);
      const sig = `${f.triangles}|${positions(f).reduce((a, v, i) => a + v * ((i % 7) + 1), 0).toFixed(3)}`;
      expect(seen.has(sig), JSON.stringify(w)).toBe(false);
      seen.add(sig);
    }
  });

  test('it stays inside its triangle budget at every wear look, and about 15% under it clean', () => {
    for (const w of LOOKS) expect(gritty(t, w).triangles, JSON.stringify(w)).toBeLessThanOrEqual(BUDGET[t]!);
    expect(gritty(t, CLEAN).triangles).toBeLessThanOrEqual(BUDGET[t]! * 0.87);
  });

  test("it keeps the Bright figure's moving pieces, pivots and axes, so strike, block, crouch and idle work unchanged", () => {
    for (const w of [CLEAN, { stage: 4, blood: 2 } as Wear, { stage: 1, blood: 0, scarred: true } as Wear]) {
      const g = gritty(t, w).pieces, b = bright(t, w).pieces;
      expect(Object.keys(g).sort(), JSON.stringify(w)).toEqual(Object.keys(b).sort());
      for (const [name, pb] of Object.entries(b)) {
        const pg = g[name]!;
        for (const key of ['pivot', 'axis', 'fwd', 'up'] as const) for (let i = 0; i < 3; i++) expect(pg[key][i], `${name}.${key}`).toBeCloseTo(pb[key][i]!, 4);
        expect(pg.parent, `${name}.parent`).toBe(pb.parent);
      }
    }
  });

  test('it stands on the ground and fits the tile in height', () => {
    for (const w of [CLEAN, { stage: 4, blood: 2 } as Wear]) {
      const f = gritty(t, w);
      const p = [...positions(f), ...Object.values(f.pieces).flatMap((pc) => Array.from(pc.fill.attributes.position!.array))];
      let minY = Infinity, maxY = -Infinity;
      for (let i = 1; i < p.length; i += 3) { minY = Math.min(minY, p[i]!); maxY = Math.max(maxY, p[i]!); }
      expect(minY).toBeGreaterThanOrEqual(-0.1);
      expect(minY).toBeLessThan(0.6);
      expect(maxY).toBeLessThan(60);
    }
  });
});

describe("Gritty's camp", () => {
  test('a tent never bleeds: no blood colour on it at any wear look (it burns instead)', () => {
    const blood = [new Color(BLOOD), new Color(BLOOD_LIGHT)];
    for (const w of LOOKS) {
      const col = gritty('camp', w).fill.attributes.color!.array;
      for (let i = 0; i < col.length; i += 3) {
        for (const b of blood) expect(Math.abs(col[i]! - b.r) + Math.abs(col[i + 1]! - b.g) + Math.abs(col[i + 2]! - b.b) < 1e-4, JSON.stringify(w)).toBe(false);
      }
    }
  });
});
