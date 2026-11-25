import { describe, expect, test, vi } from 'vitest';
import { UNITS } from '../../../engine';
import type { UnitTypeId } from '../../../engine';
import type { Group } from 'three';
import { Vector3 } from 'three';
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
const { AIM_TURN_MS, frontsOf, moveYaw, TURN_MS } = await import('./facing');
const { SQUASH } = await import('../layout');

const RED = { main: '#B3261E', dark: '#8E1D17', accent: '#C8963E' };
const BLUE = { main: '#2D6DB5', dark: '#1F4F87', accent: '#D4A72C' };
const unit = (id: number, p: Partial<GlUnit> = {}): GlUnit => ({ id, type: 'warrior', look: RED, hero: false, x: id * 10, y: 0, alpha: 1, hunkered: false, ...p });
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

  test('the trebuchet arm and its stone are their own pieces on the axle; others have only their weapon and shield', () => {
    const t = buildFigure('catapult', { look: RED, wear: CLEAN });
    expect(Object.keys(t.pieces).sort()).toEqual(['arm', 'stone']);
    expect(t.pieces.arm!.fill.attributes.position!.count).toBeGreaterThan(0);
    expect(t.pieces.arm!.pivot).toEqual(t.pieces.stone!.pivot);
    expect(Math.hypot(...t.pieces.arm!.axis)).toBeCloseTo(1, 5);
    expect(Object.keys(buildFigure('knight', { look: RED, wear: CLEAN }).pieces)).toEqual(['weapon']);
    expect(Object.keys(buildFigure('hoplite', { look: RED, wear: CLEAN }).pieces).sort()).toEqual(['shield', 'weapon']);
    expect(Object.keys(buildFigure('piper', { look: RED, wear: CLEAN }).pieces)).toEqual([]);
  });

  test('idle life turns the body about the feet and never moves a figure off its tile', () => {
    const u = make();
    u.setUnits([unit(1, { x: 30, y: 40 }), unit(2, { type: 'knight', x: 60, y: 40 })]);
    const figs = figures(u);
    const before = figs.map((g) => g.position.clone());
    let most = 0;
    for (let t = 0; t < 8000; t += 97) {
      u.tick(t, 1);
      figs.forEach((g, i) => {
        expect(g.position.equals(before[i]!), 'the figure stays on its tile').toBe(true);
        const body = g.children[0] as Group;
        most = Math.max(most, Math.abs(body.position.x), Math.abs(body.position.y), 2 * Math.acos(Math.min(1, Math.abs(body.quaternion.w))));
      });
    }
    expect(most).toBeGreaterThan(0.005);
    expect(most, 'small: well under a world unit or a few hundredths of a radian').toBeLessThan(0.5);
    // Held still (reduced motion): every body at rest.
    u.tick(5000, 0);
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
    for (let t = 1000; t < 2000; t += 50) { u.tick(t, 1); expect(body.quaternion.w).toBeCloseTo(1, 9); }
    u.pose(new Map(), []);
    u.tick(2010, 1);
    expect(1 - Math.abs(body.quaternion.w), 'only a little right after').toBeLessThan(1e-5);
    let moved = false;
    for (let t = 2500; t < 6000; t += 100) { u.tick(t, 1); if (Math.abs(body.quaternion.w) < 1 - 1e-6) moved = true; }
    expect(moved).toBe(true);
  });

  test('a unit that starts to move eases out of its idle pose in about 0.15 s instead of snapping', () => {
    const u = make();
    u.setUnits([unit(1, { type: 'knight' })]);
    const body = figures(u)[0]!.children[0] as Group;
    for (let t = 0; t <= 10_000; t += 50) u.tick(t, 1);
    const off = (): number => Math.abs(body.position.x) + Math.abs(body.position.y);
    // Find a moment well into the sway, then start a move there.
    let t = 10_000;
    while (off() < 0.1) { t += 50; u.tick(t, 1); }
    const before = off();
    u.pose(new Map([[1, { x: 0, y: 0 }]]), []);
    u.tick(t + 50, 1);
    expect(off(), 'part way out after 50 ms').toBeGreaterThan(before * 0.2);
    expect(off()).toBeLessThan(before * 0.9 + 0.05);
    u.tick(t + 200, 1);
    expect(off(), 'still by 0.2 s').toBeCloseTo(0, 9);
  });

  test('the trebuchet swings its arm through in a lunge, throws the stone, and is cocked again after', () => {
    const u = make();
    u.setUnits([unit(1, { type: 'catapult' })]);
    const g = figures(u)[0]!;
    const body = g.children[0] as Group;
    const arm = body.children.at(-2) as Group, stone = body.children.at(-1) as Group;
    const angle = (): number => 2 * Math.acos(Math.min(1, Math.abs(arm.quaternion.w)));
    u.pose(new Map([[1, { x: 0, y: 0, lunge: 0 }]]), []);
    u.tick(100, 1);
    expect(angle()).toBeCloseTo(0, 6);
    u.pose(new Map([[1, { x: 0, y: 0, lunge: 0.28 }]]), []);
    u.tick(200, 1);
    expect(angle()).toBeGreaterThan(2.5);
    expect(stone.visible, 'the stone has gone at the top of the throw').toBe(false);
    u.pose(new Map(), []);
    u.tick(300, 1);
    expect(angle(), 'cocked, give or take its small idle aim').toBeLessThan(0.06);
    expect(stone.visible).toBe(true);
  });

  describe('motion: gaits, strikes and blocks', () => {
    const pieceGroups = (g: Group): Group[] => (g.children[0] as Group).children.filter((c): c is Group => (c as Group).isGroup === true);
    const turnOf = (g: Group): number => 2 * Math.acos(Math.min(1, Math.abs(g.quaternion.w)));
    const bodyOf = (g: Group): Group => g.children[0] as Group;

    test('a figure walks along its slide: it bobs and rolls while it travels, and stands still before and after', () => {
      const u = make();
      u.setUnits([unit(1, { x: 0, y: 0 })], 0);
      const g = figures(u)[0]!;
      u.setUnits([unit(1, { x: 104, y: 0 })], 0); // two hexes to the right
      const at = (x: number, travel?: number): void => { u.pose(new Map([[1, travel === undefined ? { x: 0, y: 0 } : { x, y: 0, travel }]]), []); };
      at(0);
      u.tick(100, 0);
      expect(bodyOf(g).position.y).toBeCloseTo(0, 6);
      const bobs: number[] = [];
      for (let i = 1; i < 20; i++) { at((104 * i) / 20, i / 20); u.tick(200 + i * 20, 0); bobs.push(bodyOf(g).position.y); }
      expect(Math.max(...bobs)).toBeGreaterThan(1.5);
      at(104, 1);
      u.tick(700, 0);
      expect(bodyOf(g).position.y).toBeCloseTo(0, 6);
      // Its feet stay on its line: the group moves only as the slide moves it.
      expect(g.position.x).toBeCloseTo(104, 6);
    });

    test('a rider gallops: its front rises and dips as it goes', () => {
      const u = make();
      u.setUnits([unit(1, { type: 'knight', x: 0, y: 0 })], 0);
      const g = figures(u)[0]!;
      u.setUnits([unit(1, { type: 'knight', x: 104, y: 0 })], 0);
      const tilts = new Set<number>();
      for (let i = 1; i < 20; i++) { u.pose(new Map([[1, { x: (104 * i) / 20, y: 0, travel: i / 20 }]]), []); u.tick(500 + i * 20, 0); tilts.add(Math.round(bodyOf(g).quaternion.x * 100)); }
      expect(tilts.size).toBeGreaterThan(4);
    });

    test('an advance turns only when its slide starts, after its blow', () => {
      const u = make();
      u.setUnits([unit(1, { x: 0, y: 0 }), unit(2, { x: 52, y: -90 })], 0);
      const g = figures(u)[0]!;
      const yawOf = (f: Group): number => { const q = bodyOf(f).quaternion; return 2 * Math.atan2(q.y, q.w); };
      u.setUnits([unit(1, { x: 0, y: -90 }), unit(2, { x: 52, y: -90 })], 1000, new Map([[1, 240]]));
      u.tick(1100, 0);
      expect(Math.abs(yawOf(g))).toBeLessThan(1e-9);
      expect(u.turning(1100)).toBe(true);
      u.tick(1240 + TURN_MS, 0);
      expect(Math.abs(yawOf(g))).toBeGreaterThan(0.1);
    });

    test('a sword swing strikes with the weapon; the shielded defender raises its shield as the blow lands', () => {
      const u = make();
      u.setUnits([unit(1, { x: 0, y: 0 }), unit(2, { type: 'hoplite', x: 52, y: 0, look: BLUE })], 0);
      const [a, d] = figures(u) as [Group, Group];
      const [sword] = pieceGroups(a);
      const [, shield] = pieceGroups(d);
      u.aim(1, 52, 0, 0, 0);
      u.strikes([{ unit: 1, target: 2, from: { x: 0, y: 0 }, to: { x: 52, y: 0 }, delay: 0, survives: true, counter: false }], 0);
      expect(u.turning(0)).toBe(true);
      u.tick(60, 0);
      expect(turnOf(sword!), 'wound up').toBeGreaterThan(0.2);
      const rest = d.children[0]!.children.filter((c) => (c as Group).isGroup)[1]!.position.y;
      u.tick(135, 0);
      expect(turnOf(sword!), 'through at the hit').toBeGreaterThan(1.2);
      u.tick(170, 0);
      expect(shield!.position.y - rest, 'the shield is up').toBeGreaterThan(0);
      u.tick(1000, 0);
      expect(turnOf(sword!)).toBeLessThan(1e-6);
      expect(u.turning(1000)).toBe(false);
    });

    test('a defender without a shield flinches away from the blow; one that dies does not react', () => {
      const u = make();
      u.setUnits([unit(1, { x: 0, y: 0 }), unit(2, { type: 'archer', x: 52, y: 0 }), unit(3, { type: 'archer', x: -52, y: 0 })], 0);
      const figs = figures(u);
      u.strikes([
        { unit: 1, target: 2, from: { x: 0, y: 0 }, to: { x: 52, y: 0 }, delay: 0, survives: true, counter: false },
      ], 0);
      u.tick(170, 0);
      expect(bodyOf(figs[1]!).position.x, 'knocked away from the attacker').toBeGreaterThan(0.5);
      const v = new Vector3(0, 40, 0).applyQuaternion(bodyOf(figs[1]!).quaternion);
      expect(v.x, 'leans away').toBeGreaterThan(0);
      const u2 = make();
      u2.setUnits([unit(1, { x: 0, y: 0 }), unit(2, { type: 'archer', x: 52, y: 0 })], 0);
      const f2 = figures(u2);
      u2.strikes([{ unit: 1, target: 2, from: { x: 0, y: 0 }, to: { x: 52, y: 0 }, delay: 0, survives: false, counter: false }], 0);
      u2.tick(170, 0);
      expect(bodyOf(f2[1]!).position.x).toBeCloseTo(0, 9);
    });

    test('a counter strike: the defender strikes back after its block, and the attacker takes the blow', () => {
      const u = make();
      u.setUnits([unit(1, { type: 'swordsman', x: 0, y: 0 }), unit(2, { type: 'spearman', x: 52, y: 0 })], 0);
      const [a, d] = figures(u) as [Group, Group];
      const [spear] = pieceGroups(d);
      u.strikes([{ unit: 1, target: 2, from: { x: 0, y: 0 }, to: { x: 52, y: 0 }, delay: 0, survives: true, counter: true }], 0);
      u.tick(135 + 110 + 100, 0);
      expect(turnOf(spear!), 'the spear comes down at the attacker').toBeGreaterThan(0.5);
      u.tick(400, 0);
      expect(bodyOf(a).position.x, 'the swordsman is knocked back').toBeLessThan(-0.3);
      expect(u.turning(400)).toBe(true);
      expect(u.turning(1000)).toBe(false);
    });

    test('an archer draws and looses: the arrow leaves the string and comes back', () => {
      const u = make();
      u.setUnits([unit(1, { type: 'archer', x: 0, y: 0 }), unit(2, { x: 104, y: 0 })], 0);
      const [a] = figures(u) as [Group];
      const [, arrow] = pieceGroups(a);
      u.strikes([{ unit: 1, target: 2, from: { x: 0, y: 0 }, to: { x: 104, y: 0 }, delay: 0, survives: true, counter: false }], 0);
      u.tick(100, 0);
      expect(arrow!.visible).toBe(true);
      u.tick(200, 0);
      expect(arrow!.visible).toBe(false);
      u.tick(600, 0);
      expect(arrow!.visible).toBe(true);
    });

    test('reduced motion: no strike and no block', () => {
      const real = globalThis.matchMedia;
      globalThis.matchMedia = ((q: string) => ({ matches: q.includes('reduce') })) as unknown as typeof matchMedia;
      try {
        const u = make();
        u.setUnits([unit(1, { x: 0, y: 0 }), unit(2, { type: 'hoplite', x: 52, y: 0 })], 0);
        u.strikes([{ unit: 1, target: 2, from: { x: 0, y: 0 }, to: { x: 52, y: 0 }, delay: 0, survives: true, counter: true }], 0);
        expect(u.turning(10)).toBe(false);
      } finally {
        globalThis.matchMedia = real;
      }
    });
  });

  test('on screen: only figures with idle life in the camera view count', () => {
    const u = make();
    u.setUnits([unit(1, { x: 1000, y: 0 }), unit(2, { type: 'camp', x: 0, y: 0 })]);
    expect(u.onScreen({ cx: 0, cy: 0, scale: 1 }, { w: 200, h: 200 })).toBe(false);
    expect(u.onScreen({ cx: 950, cy: 0, scale: 1 }, { w: 200, h: 200 })).toBe(true);
  });

  describe('facing', () => {
    /** The body's turn about the vertical (radians), at rest level 0 so idle life adds nothing. */
    const yawOf = (g: Group): number => { const q = (g.children[0] as Group).quaternion; return 2 * Math.atan2(q.y, q.w); };
    const near = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

    test('a unit first seen stands in its rest three-quarter view, and keeps it while nothing happens', () => {
      const u = make();
      u.setUnits([unit(1), unit(2, { type: 'knight' }), unit(3, { type: 'catapult', hero: true })], 0);
      const figs = figures(u);
      for (let t = 0; t < 2000; t += 100) {
        u.tick(t, 0);
        for (const g of figs) expect(near(yawOf(g), 0)).toBeLessThan(1e-9);
      }
      expect(u.turning(0)).toBe(false);
    });

    test('a move turns it to face the way it went, eased, and it keeps that facing after it stops', () => {
      const u = make();
      u.setUnits([unit(1, { x: 0, y: 0 })], 0);
      const g = figures(u)[0]!;
      u.setUnits([unit(1, { x: 30, y: 0 })], 1000);
      const want = moveYaw('warrior', 30, 0)!;
      expect(u.turning(1000)).toBe(true);
      u.tick(1000, 0);
      expect(near(yawOf(g), 0)).toBeLessThan(1e-9);
      u.tick(1000 + TURN_MS / 2, 0);
      const mid = yawOf(g);
      expect(near(mid, 0)).toBeGreaterThan(0.1);
      expect(near(mid, want)).toBeGreaterThan(0.1);
      u.tick(1000 + TURN_MS, 0);
      expect(near(yawOf(g), want)).toBeLessThan(1e-9);
      expect(u.turning(1000 + TURN_MS)).toBe(false);
      // Spent after its move, it is rebuilt dimmed: still facing the move, long after.
      u.setUnits([unit(1, { x: 30, y: 0, alpha: 0.55 })], 1500);
      const dim = figures(u)[0]!;
      expect(dim).not.toBe(g);
      u.tick(60_000, 0);
      expect(near(yawOf(dim), want)).toBeLessThan(1e-9);
    });

    test('moving straight down the screen faces the viewer, up faces away, sideways is a profile', () => {
      for (const [dx, dy, heading] of [[0, 40, 0], [0, -40, Math.PI], [40, 0, Math.PI / 2], [-40, 0, -Math.PI / 2]] as const) {
        for (const type of ['warrior', 'knight', 'catapult', 'kingsGuard'] as const) {
          const u = make();
          u.setUnits([unit(1, { type, x: 0, y: 0 })], 0);
          const g = figures(u)[0]!;
          u.setUnits([unit(1, { type, x: dx, y: dy })], 0);
          u.tick(1000, 0);
          expect(near(frontsOf(type).move + yawOf(g), heading), `${type} toward ${dx},${dy}`).toBeLessThan(1e-9);
        }
      }
    });

    test('the front of the drawn figure points along the move on screen (through the camera tilt)', () => {
      const u = make();
      u.setUnits([unit(1, { x: 0, y: 0 })], 0);
      const g = figures(u)[0]!;
      const d = [17, 25.5]; // a hex step down and to the right
      u.setUnits([unit(1, { x: d[0]!, y: d[1]! })], 0);
      u.tick(1000, 0);
      // The built figure's front has its rest heading; the body turns it on from there.
      const h = frontsOf('warrior').move + yawOf(g);
      const screen = [Math.sin(h), Math.cos(h) * SQUASH];
      expect(Math.abs(screen[0]! * d[1]! - screen[1]! * d[0]!)).toBeLessThan(1e-9);
      expect(screen[0]! * d[0]! + screen[1]! * d[1]!).toBeGreaterThan(0);
    });

    test('an attack turns the attacker to its target, round by the time its lunge starts; the target stays', () => {
      const u = make();
      u.setUnits([unit(1, { x: 0, y: 0 }), unit(2, { x: 0, y: -40 })], 0);
      const [a, b] = figures(u) as [Group, Group];
      u.aim(1, 0, -40, 1000, 1300);
      u.tick(1100, 0);
      expect(near(yawOf(a), 0), 'waits for its lunge').toBeLessThan(1e-9);
      expect(u.turning(1100)).toBe(true);
      u.tick(1300, 0);
      expect(near(frontsOf('warrior').aim + yawOf(a), Math.PI), 'faces away, toward the target up the screen').toBeLessThan(1e-9);
      expect(near(yawOf(b), 0), 'the one attacked is left as it was').toBeLessThan(1e-9);
      // A lunge that starts now: the turn is as quick as it can be, from now.
      u.aim(1, 40, -40, 2000, 2000);
      u.tick(2000 + AIM_TURN_MS, 0);
      expect(near(frontsOf('warrior').aim + yawOf(a), Math.atan2(40, -40 / SQUASH))).toBeLessThan(1e-9);
      // An archer aims its arrow, side on.
      const v = make();
      v.setUnits([unit(1, { type: 'archer', x: 0, y: 0 })], 0);
      const arch = figures(v)[0]!;
      v.aim(1, 0, 40, 0);
      v.tick(500, 0);
      expect(near(frontsOf('archer').aim + yawOf(arch), 0)).toBeLessThan(1e-9);
      expect(near(yawOf(arch), 0), 'not just its rest pose').toBeGreaterThan(0.5);
    });

    test('a unit that hunkers turns back to its rest facing; nothing else does', () => {
      const u = make();
      u.setUnits([unit(1, { x: 0, y: 0 })], 0);
      const g = figures(u)[0]!;
      u.setUnits([unit(1, { x: -30, y: 0 })], 0);
      u.tick(500, 0);
      const moved = yawOf(g);
      expect(near(moved, 0)).toBeGreaterThan(1);
      // Selection, spent, a new look of the same unit: no turn.
      u.setUnits([unit(1, { x: -30, y: 0, alpha: 0.55 })], 600);
      expect(u.turning(600)).toBe(false);
      u.setUnits([unit(1, { x: -30, y: 0, hunkered: true })], 1000);
      expect(u.turning(1000)).toBe(true);
      const g2 = figures(u)[0]!;
      u.tick(1000 + TURN_MS / 2, 0);
      expect(near(yawOf(g2), 0)).toBeGreaterThan(0.05);
      u.tick(1000 + TURN_MS, 0);
      expect(near(yawOf(g2), 0)).toBeLessThan(1e-9);
      // Staying hunkered is not a new hunker: an attack turns it, and it keeps that.
      u.aim(1, 30, 0, 2000);
      u.setUnits([unit(1, { x: -30, y: 0, hunkered: true })], 2050);
      u.tick(3000, 0);
      expect(near(frontsOf('warrior').aim + yawOf(g2), Math.PI / 2)).toBeLessThan(1e-9);
    });

    test('a unit that goes out of sight and is seen again faces as it did; one that died, or a fresh board, is at rest', () => {
      const u = make();
      u.setUnits([unit(1, { x: 0, y: 0 }), unit(2, { x: 40, y: 0 })], 0);
      u.setUnits([unit(1, { x: 0, y: -40 }), unit(2, { x: 40, y: -40 })], 0);
      u.tick(1000, 0);
      const was = yawOf(figures(u)[0]!);
      expect(near(was, 0)).toBeGreaterThan(1);
      u.setUnits([], 1100); // both out of sight
      u.forget([2]); // and unit 2 died there
      // Unit 1 is seen again somewhere else: it keeps the facing it was last seen with.
      u.setUnits([unit(1, { x: 80, y: 0 }), unit(2, { x: 40, y: -40 })], 5000);
      expect(u.turning(5000)).toBe(false);
      u.tick(6000, 0);
      const [a, b] = figures(u) as [Group, Group];
      expect(near(yawOf(a), was)).toBeLessThan(1e-9);
      expect(near(yawOf(b), 0), 'a forgotten id starts at rest').toBeLessThan(1e-9);
      // A new board (a reload, the option toggled) knows nothing of it.
      const v = make();
      v.setUnits([unit(1, { x: 80, y: 0 })], 0);
      v.tick(10, 0);
      expect(near(yawOf(figures(v)[0]!), 0)).toBeLessThan(1e-9);
    });

    test('a chain of attacks in one action faces each target in its turn, in order', () => {
      const u = make();
      u.setUnits([unit(1, { type: 'knight', x: 0, y: 0 })], 0);
      const g = figures(u)[0]!;
      const targets: [number, number][] = [[40, 0], [0, 40], [-40, 0]];
      // As the board sends them: all at once, with the lunges' delays.
      targets.forEach(([x, y], i) => u.aim(1, x, y, 1000, 1000 + 120 * i));
      const facesTarget = (i: number): number => near(frontsOf('knight').aim + yawOf(g), Math.atan2(targets[i]![0], targets[i]![1] / SQUASH));
      const seen = new Set<number>();
      let order: number[] = [];
      for (let t = 1000; t <= 1600; t += 10) {
        u.tick(t, 0);
        for (let i = 0; i < 3; i++) if (facesTarget(i) < 1e-6 && !seen.has(i)) { seen.add(i); order = [...order, i]; }
        if (t === 1000 + AIM_TURN_MS) expect(facesTarget(0), 'the first is faced as its lunge plays').toBeLessThan(1e-9);
      }
      expect(order).toEqual([0, 1, 2]);
      u.tick(3000, 0);
      expect(facesTarget(2), 'and the last one is kept').toBeLessThan(1e-9);
      expect(u.turning(3000)).toBe(false);
    });

    test('an attack that is followed by an advance aims from where it lunged, not from where it ends up', () => {
      const u = make();
      u.setUnits([unit(1, { type: 'knight', x: 0, y: 0 })], 0);
      const g = figures(u)[0]!;
      // The action: it attacks the tile below, the target dies and it advances into it. The board sees the move
      // first (its scene), then the attack from the old point.
      u.setUnits([unit(1, { type: 'knight', x: 0, y: 40 })], 1000);
      u.aim(1, 0, 40, 1000, 1000, { x: 0, y: 0 });
      u.tick(1080, 0);
      u.tick(2000, 0);
      expect(near(frontsOf('knight').aim + yawOf(g), 0), 'facing its target, down the screen').toBeLessThan(1e-9);
    });

    test('a move drops any aims still waiting', () => {
      const u = make();
      u.setUnits([unit(1, { x: 0, y: 0 })], 0);
      const g = figures(u)[0]!;
      u.aim(1, 40, 0, 0, 500);
      u.setUnits([unit(1, { x: 0, y: 40 })], 100);
      u.tick(2000, 0);
      expect(near(frontsOf('warrior').move + yawOf(g), 0)).toBeLessThan(1e-9);
    });

    test('with reduced motion a turn is made at once', () => {
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
      try {
        const u = make();
        u.setUnits([unit(1, { x: 0, y: 0 })], 0);
        const g = figures(u)[0]!;
        u.setUnits([unit(1, { x: 30, y: 0 })], 1000);
        expect(u.turning(1000)).toBe(false);
        u.tick(1000, 0);
        expect(near(yawOf(g), moveYaw('warrior', 30, 0)!)).toBeLessThan(1e-9);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    test('the trebuchet still swings its arm and aims at idle in a new facing', () => {
      const u = make();
      u.setUnits([unit(1, { type: 'catapult', x: 0, y: 0 })], 0);
      const g = figures(u)[0]!;
      u.aim(1, 0, -40, 0); // up the screen: it turns its back on the viewer
      u.tick(500, 0);
      const facing = yawOf(g);
      expect(near(frontsOf('catapult').aim + facing, Math.PI)).toBeLessThan(1e-9);
      const body = g.children[0] as Group;
      const arm = body.children.at(-2) as Group;
      const angle = (): number => 2 * Math.acos(Math.min(1, Math.abs(arm.quaternion.w)));
      u.pose(new Map([[1, { x: 0, y: 0, lunge: 0.28 }]]), []);
      u.tick(600, 1);
      expect(angle()).toBeGreaterThan(2.5);
      u.pose(new Map(), []);
      let most = 0;
      for (let t = 5000; t < 40_000; t += 250) { u.tick(t, 1); most = Math.max(most, near(yawOf(g), facing)); }
      expect(most, 'its idle aim plays about the new facing').toBeGreaterThan(0.005);
      expect(most).toBeLessThan(0.1);
    });

    test('the shadow turns its shape with the figure but stays under it', () => {
      const u = make();
      u.setUnits([unit(1, { type: 'knight', x: 0, y: 0 })], 0);
      const g = figures(u)[0]!;
      const sh = g.children[1]!;
      const rest = sh.position.clone();
      u.setUnits([unit(1, { type: 'knight', x: 0, y: 40 })], 0);
      u.tick(1000, 0);
      expect(Math.abs(sh.rotation.z - yawOf(g))).toBeLessThan(1e-9);
      expect(sh.position.distanceTo(rest)).toBeLessThan(1);
    });

    test('a fallen unit falls the way it was facing', () => {
      const u = make();
      u.setUnits([unit(1, { type: 'archer', x: 0, y: 0 })], 0);
      u.setUnits([unit(1, { type: 'archer', x: 30, y: 0 })], 0);
      u.tick(1000, 0);
      const was = yawOf(figures(u)[0]!);
      u.setUnits([], 1100);
      u.pose(new Map(), [{ key: '0@x', type: 'archer', look: RED, x: 30, y: 0, angle: 0.2, alpha: 0.9 }]);
      const fall = figures(u)[0]!;
      expect(near(yawOf(fall), was)).toBeLessThan(1e-9);
    });
  });
});
