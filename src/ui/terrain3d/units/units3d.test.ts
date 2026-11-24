import { describe, expect, test, vi } from 'vitest';
import { UNITS } from '../../../engine';
import type { UnitTypeId } from '../../../engine';
import type { Group } from 'three';
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
const figuresIn = (u: ReturnType<typeof make>): unknown[] => drawn.at(-1)!.scene.children.filter((c) => c !== u.extras);
const figures = (u: ReturnType<typeof make>): Group[] => { u.draw({ cx: 0, cy: 0, scale: 1 }, { w: 100, h: 100 }, 1); return figuresIn(u) as Group[]; };
const groups = (u: ReturnType<typeof make>): number => { u.draw({ cx: 0, cy: 0, scale: 1 }, { w: 100, h: 100 }, 1); return figuresIn(u).length; };

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

  test('a fall keeps one figure and one set of materials while it fades, and frees them when it ends', () => {
    const u = make();
    const fall = (alpha: number) => [{ key: '0@1,1', type: 'archer' as const, look: BLUE, x: 0, y: 0, angle: alpha, alpha }];
    u.pose(new Map(), fall(1));
    u.draw({ cx: 0, cy: 0, scale: 1 }, { w: 100, h: 100 }, 1);
    const first = figuresIn(u)[0];
    for (let a = 0.95; a > 0.01; a -= 0.013) u.pose(new Map(), fall(a));
    u.draw({ cx: 0, cy: 0, scale: 1 }, { w: 100, h: 100 }, 1);
    expect(figuresIn(u)[0], 'the same group all through the fade').toBe(first);
    expect(u.stats().falls).toBe(1);
    expect(u.stats().dims, 'no cached dim materials pile up').toBe(0);
    u.pose(new Map(), []);
    expect(u.stats().falls).toBe(0);
    expect(groups(u)).toBe(0);
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

  test('the trebuchet arm and its stone are their own pieces on the axle; other figures have none', () => {
    const t = buildFigure('catapult', { look: RED, wear: CLEAN });
    expect(Object.keys(t.pieces).sort()).toEqual(['arm', 'stone']);
    expect(t.pieces.arm!.fill.attributes.position!.count).toBeGreaterThan(0);
    expect(t.pieces.arm!.pivot).toEqual(t.pieces.stone!.pivot);
    expect(Math.hypot(...t.pieces.arm!.axis)).toBeCloseTo(1, 5);
    expect(Object.keys(buildFigure('knight', { look: RED, wear: CLEAN }).pieces)).toEqual([]);
  });

  test('idle life turns the body about the feet and never moves a figure off its tile', () => {
    const u = make();
    u.setUnits([unit(1, { x: 30, y: 40 }), unit(2, { type: 'knight', x: 60, y: 40 })]);
    const figs = figures(u);
    const before = figs.map((g) => g.position.clone());
    let most = 0;
    for (let t = 0; t < 8000; t += 97) {
      u.tick(t, true);
      figs.forEach((g, i) => {
        expect(g.position.equals(before[i]!), 'the figure stays on its tile').toBe(true);
        const body = g.children[0] as Group;
        most = Math.max(most, Math.abs(body.position.x), Math.abs(body.position.y), 2 * Math.acos(Math.min(1, Math.abs(body.quaternion.w))));
      });
    }
    expect(most).toBeGreaterThan(0.005);
    expect(most, 'small: well under a world unit or a few hundredths of a radian').toBeLessThan(0.5);
    // Held still (reduced motion): every body at rest.
    u.tick(5000, false);
    for (const g of figs) {
      const body = g.children[0] as Group;
      expect(body.quaternion.w).toBeCloseTo(1, 9);
      expect(body.position.x).toBe(0);
      expect(body.scale.y).toBe(1);
    }
  });

  test('a unit that moves or lunges holds still, then eases back into its idle life', () => {
    const u = make();
    u.setUnits([unit(1)]);
    const body = figures(u)[0]!.children[0] as Group;
    u.pose(new Map([[1, { x: 3, y: 0 }]]), []);
    for (let t = 1000; t < 2000; t += 50) { u.tick(t, true); expect(body.quaternion.w).toBeCloseTo(1, 9); }
    u.pose(new Map(), []);
    u.tick(2010, true);
    expect(1 - Math.abs(body.quaternion.w), 'only a little right after').toBeLessThan(1e-5);
    let moved = false;
    for (let t = 2500; t < 6000; t += 100) { u.tick(t, true); if (Math.abs(body.quaternion.w) < 1 - 1e-6) moved = true; }
    expect(moved).toBe(true);
  });

  test('the trebuchet swings its arm through in a lunge, throws the stone, and is cocked again after', () => {
    const u = make();
    u.setUnits([unit(1, { type: 'catapult' })]);
    const g = figures(u)[0]!;
    const body = g.children[0] as Group;
    const arm = body.children.at(-2) as Group, stone = body.children.at(-1) as Group;
    const angle = (): number => 2 * Math.acos(Math.min(1, Math.abs(arm.quaternion.w)));
    u.pose(new Map([[1, { x: 0, y: 0, lunge: 0 }]]), []);
    u.tick(100, true);
    expect(angle()).toBeCloseTo(0, 6);
    u.pose(new Map([[1, { x: 0, y: 0, lunge: 0.28 }]]), []);
    u.tick(200, true);
    expect(angle()).toBeGreaterThan(2.5);
    expect(stone.visible, 'the stone has gone at the top of the throw').toBe(false);
    u.pose(new Map(), []);
    u.tick(300, true);
    expect(angle(), 'cocked, give or take its small idle aim').toBeLessThan(0.06);
    expect(stone.visible).toBe(true);
  });

  test('on screen: only figures with idle life in the camera view count', () => {
    const u = make();
    u.setUnits([unit(1, { x: 1000, y: 0 }), unit(2, { type: 'camp', x: 0, y: 0 })]);
    expect(u.onScreen({ cx: 0, cy: 0, scale: 1 }, { w: 200, h: 200 })).toBe(false);
    expect(u.onScreen({ cx: 950, cy: 0, scale: 1 }, { w: 200, h: 200 })).toBe(true);
  });
});
