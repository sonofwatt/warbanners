import { describe, expect, test } from 'vitest';
import { buildFigure, GRITTY_TYPES } from './figures';
import type { UnitType } from './figures';
import { CLEAN } from './parts';
import type { Look, Wear } from './parts';

// Gritty's detailed toon foot soldiers (grittyFoot.ts): the Warrior, Spearman, Swordsman, Defender and Sellsword.

const FOOT: readonly UnitType[] = ['warrior', 'spearman', 'swordsman', 'defender', 'sellsword'];
const RED: Look = { main: '#B3261E', dark: '#8E1D17', accent: '#C8963E' };
const BLUE: Look = { main: '#2D6DB5', dark: '#1F4F87', accent: '#D4A72C' };
const positions = (f: { fill: { attributes: { position?: { array: ArrayLike<number> } } } }): number[] => Array.from(f.fill.attributes.position!.array);
const gritty = (t: UnitType, wear: Wear, look = RED) => buildFigure(t, { look, wear, gritty: true });

/** Every look the wear can take: the five stages, blood 1 and 2, scarred, and scarred and wounded again. */
const LOOKS: Wear[] = [
  { stage: 0, blood: 0 }, { stage: 1, blood: 0 }, { stage: 2, blood: 0 }, { stage: 3, blood: 0 }, { stage: 3, blood: 1 },
  { stage: 4, blood: 1 }, { stage: 4, blood: 2 }, { stage: 1, blood: 0, scarred: true }, { stage: 3, blood: 1, scarred: true },
];

/** A foot figure's budget at its most worn, as the brief sets it (the Hoplite's); about 15 percent under it clean. */
const FOOT_BUDGET = 3100;
const CLEAN_TARGET = 2640;

describe.each(FOOT)("Gritty's %s (the detailed toon)", (t) => {
  test('Gritty builds it; Bright keeps its toon figure', () => {
    expect(GRITTY_TYPES.has(t)).toBe(true);
    const bright = buildFigure(t, { look: RED, wear: CLEAN });
    expect(gritty(t, CLEAN).real).toBe(false);
    expect(positions(gritty(t, CLEAN))).not.toEqual(positions(bright));
    expect(positions(buildFigure(t, { look: RED, wear: CLEAN, gritty: false }))).toEqual(positions(bright));
  });

  test('it is built from numbers alone: the same twice', () => {
    for (const w of [CLEAN, { stage: 4, blood: 2 } as Wear, { stage: 3, blood: 1, scarred: true } as Wear]) {
      expect(positions(gritty(t, w))).toEqual(positions(gritty(t, w)));
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

  test('it stays inside its triangle budget at every wear look, and well under it clean', () => {
    for (const look of [RED, BLUE]) for (const w of LOOKS) expect(gritty(t, w, look).triangles, JSON.stringify(w)).toBeLessThanOrEqual(FOOT_BUDGET);
    expect(gritty(t, CLEAN).triangles).toBeLessThanOrEqual(CLEAN_TARGET);
  });

  test('it keeps the Bright figure\'s moving pieces, pivots, axes and nesting, so strike, block and crouch work', () => {
    for (const w of [CLEAN, { stage: 4, blood: 2 } as Wear]) {
      const b = buildFigure(t, { look: RED, wear: w }).pieces, g = gritty(t, w).pieces;
      expect(Object.keys(g).sort()).toEqual(Object.keys(b).sort());
      for (const [name, p] of Object.entries(b)) {
        const q = g[name]!;
        for (let i = 0; i < 3; i++) {
          expect(q.pivot[i], `${name} pivot`).toBeCloseTo(p.pivot[i]!, 4);
          expect(q.axis[i], `${name} axis`).toBeCloseTo(p.axis[i]!, 4);
          expect(q.fwd[i], `${name} fwd`).toBeCloseTo(p.fwd[i]!, 4);
        }
        expect(q.parent, `${name} parent`).toBe(p.parent);
      }
    }
  });

  test('its feet stand on the ground and it stands about as tall as the Hoplite', () => {
    const f = gritty(t, CLEAN);
    const p = [...positions(f), ...Object.values(f.pieces).flatMap((pc) => Array.from(pc.fill.attributes.position!.array))];
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < p.length; i += 3) { minY = Math.min(minY, p[i]!); maxY = Math.max(maxY, p[i]!); }
    expect(minY).toBeGreaterThanOrEqual(-0.1);
    expect(minY).toBeLessThan(0.6);
    expect(maxY).toBeLessThan(60);
  });

  test('either side builds it: the owner\'s colour changes it, nothing else does', () => {
    const r = gritty(t, CLEAN, RED), b = gritty(t, CLEAN, BLUE);
    expect(positions(r)).toEqual(positions(b));
    const cols = (f: typeof r): number[] => Array.from(f.fill.attributes.color!.array);
    expect(cols(r)).not.toEqual(cols(b));
  });
});

test('the foot soldiers are distinct figures', () => {
  const sigs = FOOT.map((t) => gritty(t, CLEAN).triangles);
  expect(new Set(sigs).size).toBe(FOOT.length);
});
