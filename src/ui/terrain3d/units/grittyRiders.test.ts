import { describe, expect, test } from 'vitest';
import { ALL_TYPES, buildFigure, MOUNT_YAW, RIDER, RIDER_YAW, WEAPON, ARROW } from './figures';
import type { UnitType } from './figures';
import { CLEAN } from './parts';
import type { Look, Wear } from './parts';
import * as R from './grittyRider';
import { grittyMedievalKnight } from './grittyRiders';
import { Kit } from './kit';

// Gritty's mounted units (grittyRiders.ts): the shared Gritty horse and rider, dressed as each unit.

const RED = { main: '#B3261E', dark: '#8E1D17', accent: '#C8963E' };
const BLUE = { main: '#2D6DB5', dark: '#1F4F86', accent: '#D4A72C' };
const RIDERS: readonly UnitType[] = ['horseman', 'knight', 'horseArcher', 'khansGuard', 'skyCaller'];
/** A horse and rider together, at their most worn. */
const BUDGET = 4200;
/** About 15% under the budget when clean (a little slack over the 3,570 target). */
const CLEAN_BUDGET = 3700;

const LOOKS: Wear[] = [
  { stage: 0, blood: 0 }, { stage: 1, blood: 0 }, { stage: 2, blood: 0 }, { stage: 3, blood: 0 }, { stage: 3, blood: 1 },
  { stage: 4, blood: 1 }, { stage: 4, blood: 2 }, { stage: 1, blood: 0, scarred: true }, { stage: 3, blood: 1, scarred: true },
];

const positions = (f: { fill: { attributes: { position?: { array: ArrayLike<number> } } } }): number[] => Array.from(f.fill.attributes.position!.array);
const all = (f: ReturnType<typeof buildFigure>): number[] => [...positions(f), ...Object.values(f.pieces).flatMap((pc) => Array.from(pc.fill.attributes.position!.array))];
const gritty = (t: UnitType, wear: Wear, look: Look = RED) => buildFigure(t, { look, wear, gritty: true });
const sig = (f: ReturnType<typeof buildFigure>): string => `${f.triangles}|${all(f).reduce((a, v, i) => a + v * ((i % 7) + 1), 0).toFixed(3)}`;

describe("Gritty's riders", () => {
  test('they turn and move as the Bright riders: the same turns and piece names', () => {
    expect([R.MOUNT_YAW, R.RIDER_YAW]).toEqual([MOUNT_YAW, RIDER_YAW]);
    expect([R.RIDER, R.WEAPON, R.ARROW]).toEqual([RIDER, WEAPON, ARROW]);
  });

  test.each(RIDERS)('%s: built in Gritty only, a toon figure, different from the Bright one', (t) => {
    const bright = buildFigure(t, { look: RED, wear: CLEAN });
    expect(gritty(t, CLEAN).real).toBe(false);
    expect(positions(gritty(t, CLEAN))).not.toEqual(positions(bright));
    expect(positions(buildFigure(t, { look: RED, wear: CLEAN, gritty: false }))).toEqual(positions(bright));
  });

  test.each(RIDERS)('%s: the same moving pieces, pivots, axes and parents as the Bright figure', (t) => {
    const bright = buildFigure(t, { look: RED, wear: CLEAN }).pieces;
    for (const w of [CLEAN, { stage: 4, blood: 2 } as Wear]) {
      const p = gritty(t, w).pieces;
      const brightW = buildFigure(t, { look: RED, wear: w }).pieces;
      expect(Object.keys(p).sort(), JSON.stringify(w)).toEqual(Object.keys(brightW).sort());
      for (const [name, pc] of Object.entries(p)) {
        const b = bright[name]!;
        for (let i = 0; i < 3; i++) {
          expect(pc.pivot[i]).toBeCloseTo(b.pivot[i]!, 4);
          expect(pc.axis[i]).toBeCloseTo(b.axis[i]!, 4);
          expect(pc.fwd[i]).toBeCloseTo(b.fwd[i]!, 4);
        }
        expect(pc.parent).toBe(b.parent);
      }
    }
  });

  test.each(RIDERS)('%s: the same twice, from numbers alone', (t) => {
    for (const w of [CLEAN, { stage: 4, blood: 2 } as Wear, { stage: 3, blood: 1, scarred: true } as Wear]) expect(all(gritty(t, w))).toEqual(all(gritty(t, w)));
  });

  test.each(RIDERS)('%s: every wear look is a different model', (t) => {
    const seen = new Set<string>();
    for (const w of LOOKS) {
      const s = sig(gritty(t, w));
      expect(seen.has(s), JSON.stringify(w)).toBe(false);
      seen.add(s);
    }
  });

  test.each(RIDERS)('%s: inside the triangle budget at every wear look, and lighter when clean', (t) => {
    for (const w of LOOKS) expect(gritty(t, w).triangles, JSON.stringify(w)).toBeLessThanOrEqual(BUDGET);
    expect(gritty(t, CLEAN).triangles).toBeLessThanOrEqual(CLEAN_BUDGET);
  });

  test.each(RIDERS)("%s: the owner's colour shows", (t) => {
    const colours = (f: ReturnType<typeof buildFigure>): number[] => Array.from(f.fill.attributes.color!.array);
    expect(colours(gritty(t, CLEAN, RED))).not.toEqual(colours(gritty(t, CLEAN, BLUE)));
  });

  test.each(RIDERS)('%s: hooves on the ground, no taller than the board allows', (t) => {
    const p = all(gritty(t, CLEAN));
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < p.length; i += 3) { minY = Math.min(minY, p[i]!); maxY = Math.max(maxY, p[i]!); }
    expect(minY).toBeGreaterThanOrEqual(-0.1);
    expect(minY).toBeLessThan(0.6);
    expect(maxY).toBeLessThan(64);
  });

  test('a broken rider loses a piece of headgear or armour for good: healed, it is still gone', () => {
    // Broken and scarred share the missing piece, so a scarred clean-ish rider differs from the same stage unscarred.
    for (const t of RIDERS) expect(sig(gritty(t, { stage: 1, blood: 0, scarred: true }))).not.toBe(sig(gritty(t, { stage: 1, blood: 0 })));
  });

  test('every unit type has its own Gritty figure, and Bright keeps its toon figure', () => {
    for (const t of ALL_TYPES) {
      expect(positions(gritty(t, CLEAN))).not.toEqual(positions(buildFigure(t, { look: RED, wear: CLEAN })));
      expect(positions(buildFigure(t, { look: RED, wear: CLEAN, gritty: false }))).toEqual(positions(buildFigure(t, { look: RED, wear: CLEAN })));
    }
  });
});

// The steel knight, saved for a later faction (the Spartan knight in bronze is the knight now): kept buildable,
// inside the budget and the same twice, so it is ready when a faction takes it.
describe('the saved medieval knight', () => {
  const build = (w: Wear) => { const k = new Kit(); grittyMedievalKnight(k, { look: RED, wear: w }); return k.build(); };
  test('inside the triangle budget at every wear look, and the same twice', () => {
    for (const w of LOOKS) expect(build(w).triangles, JSON.stringify(w)).toBeLessThanOrEqual(BUDGET);
    for (const w of LOOKS) expect(Array.from(build(w).fill.attributes.position!.array)).toEqual(Array.from(build(w).fill.attributes.position!.array));
  });
});

// The Knight dresses by its faction: a Spartan in bronze, or a Mongol lancer when the Mongols build it.
describe("the Knight by faction", () => {
  const SPARTAN = { ...RED, faction: 'spartans' as const }, MONGOL = { ...BLUE, faction: 'mongols' as const };
  test('the Mongols get their own Knight; no faction, or the Spartans, the bronze one', () => {
    const spartanInBlue = positions(gritty('knight', CLEAN, { ...BLUE, faction: 'spartans' }));
    expect(positions(gritty('knight', CLEAN, { ...BLUE }))).toEqual(spartanInBlue);
    expect(positions(gritty('knight', CLEAN, MONGOL))).not.toEqual(spartanInBlue);
    expect(positions(gritty('knight', CLEAN, SPARTAN))).toEqual(positions(gritty('knight', CLEAN, RED)));
  });
  test('Bright never reads the faction', () => {
    expect(positions(buildFigure('knight', { look: MONGOL, wear: CLEAN }))).toEqual(positions(buildFigure('knight', { look: BLUE, wear: CLEAN })));
  });
  test.each([['spartans', SPARTAN], ['mongols', MONGOL]] as const)('%s: inside the budget at every wear look, and the same twice', (_n, look) => {
    for (const w of LOOKS) expect(gritty('knight', w, look).triangles, JSON.stringify(w)).toBeLessThanOrEqual(BUDGET);
    expect(gritty('knight', CLEAN, look).triangles).toBeLessThanOrEqual(CLEAN_BUDGET);
    for (const w of LOOKS) expect(all(gritty('knight', w, look))).toEqual(all(gritty('knight', w, look)));
  });
});
