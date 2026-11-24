import { describe, expect, test, vi } from 'vitest';
import { UNITS } from '../../../engine';
import type { UnitTypeId } from '../../../engine';
import type { GlUnit } from '../unitsInput';

// The units renderer without a GPU: three.js runs for real except the WebGLRenderer, which is a stand-in that
// counts what it is asked to draw.
const drawn: { scene: { children: unknown[] } }[] = [];
vi.mock('three', async (orig) => {
  const three = await orig<typeof import('three')>();
  class FakeRenderer {
    info = { render: { triangles: 0, calls: 0 } };
    outputColorSpace = '';
    disposed = false;
    setClearColor(): void {}
    setPixelRatio(): void {}
    setSize(): void {}
    render(scene: { children: unknown[] }): void { drawn.push({ scene }); }
    dispose(): void { this.disposed = true; }
    forceContextLoss(): void {}
  }
  return { ...three, WebGLRenderer: FakeRenderer };
});

const { createUnits3d } = await import('./units3d');
const { ALL_TYPES, buildFigure } = await import('./figures');
const { CLEAN } = await import('./parts');

const RED = { main: '#B3261E', dark: '#8E1D17', accent: '#C8963E' };
const BLUE = { main: '#2D6DB5', dark: '#1F4F87', accent: '#D4A72C' };
const unit = (id: number, p: Partial<GlUnit> = {}): GlUnit => ({ id, type: 'warrior', look: RED, hero: false, x: id * 10, y: 0, alpha: 1, ...p });
const make = () => createUnits3d({} as HTMLCanvasElement, {})!;
const groups = (u: ReturnType<typeof make>): number => { u.draw({ cx: 0, cy: 0, scale: 1 }, { w: 100, h: 100 }, 1); return drawn.at(-1)!.scene.children.length; };

describe('the 3D unit figures', () => {
  test('every unit type the engine has has a figure, and nothing more', () => {
    expect([...ALL_TYPES].sort()).toEqual((Object.keys(UNITS) as UnitTypeId[]).sort());
  });

  test('a figure is built from numbers alone: the same twice, clean on main', () => {
    const a = buildFigure('hoplite', { look: RED, wear: CLEAN, hero: true });
    const b = buildFigure('hoplite', { look: RED, wear: CLEAN, hero: true });
    expect(Array.from(a.fill.attributes.position!.array)).toEqual(Array.from(b.fill.attributes.position!.array));
    expect(a.triangles).toBeGreaterThan(buildFigure('hoplite', { look: RED, wear: CLEAN }).triangles); // the pennant
  });

  test('units that look the same share one figure; a new look builds one more', () => {
    const u = make();
    u.setUnits([unit(1), unit(2), unit(3, { look: BLUE }), unit(4, { hero: true })]);
    expect(u.stats().units).toBe(4);
    expect(u.stats().looks).toBe(3);
    expect(groups(u)).toBe(4);
  });

  test('a unit that is gone leaves the scene; one that moved keeps its meshes and only moves', () => {
    const u = make();
    u.setUnits([unit(1), unit(2)]);
    u.setUnits([unit(2, { x: 99 })]);
    expect(u.stats().units).toBe(1);
    expect(groups(u)).toBe(1);
    u.setUnits([]);
    expect(groups(u)).toBe(0);
  });

  test('a pose moves units only for that frame, and a fall stands in only while it plays', () => {
    const u = make();
    u.setUnits([unit(1)]);
    u.pose(new Map([[1, { x: 5, y: 5 }]]), [{ key: 'a', type: 'archer', look: BLUE, x: 0, y: 0, angle: 0.5, alpha: 0.6 }]);
    expect(groups(u)).toBe(2);
    u.pose(new Map(), []);
    expect(groups(u)).toBe(1);
  });

  test('dispose frees the shared geometry', () => {
    const u = make();
    u.setUnits([unit(1)]);
    const f = buildFigure('warrior', { look: RED, wear: CLEAN });
    expect(f.triangles).toBeGreaterThan(0);
    const spy = vi.spyOn(Object.getPrototypeOf(f.fill) as { dispose(): void }, 'dispose');
    u.dispose();
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2); // the figure's fill and hull
    spy.mockRestore();
  });
});
