/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { startTerrain3d } from './lifecycle';
import type { FallbackReason } from './lifecycle';
import { setTerrain3d, terrain3dOn, TERRAIN3D_KEY } from './option';
import type { Terrain3d } from './terrain3d';

let stored: Map<string, string>;
beforeEach(() => {
  stored = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => { stored.set(k, v); },
    removeItem: (k: string) => { stored.delete(k); },
  });
  setTerrain3d(true);
});
afterEach(() => { vi.unstubAllGlobals(); });

function fakeTerrain(): Terrain3d & { disposed: number } {
  const t = { disposed: 0, setMap: () => {}, setVeil: () => {}, draw: () => {}, drawUnits: () => {}, units: null, stats: () => ({ triangles: 0, calls: 0, tiles: 0 }), dispose: () => { t.disposed++; } };
  return t;
}
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function run(opts: { webgl2?: boolean; load?: 'ok' | 'fails' | 'null'; units?: boolean } = {}) {
  const canvas = new EventTarget();
  const unitsCanvas = opts.units === true ? new EventTarget() : null;
  const made: unknown[] = [];
  const terrain = fakeTerrain();
  const log: (FallbackReason | 'ready')[] = [];
  const stop = startTerrain3d({
    canvas,
    unitsCanvas,
    hasWebgl2: () => opts.webgl2 ?? true,
    load: () => (opts.load === 'fails' ? Promise.reject(new Error('offline')) : Promise.resolve({ createTerrain3d: (_c: HTMLCanvasElement, o?: { units?: HTMLCanvasElement | null }) => { made.push(o?.units ?? null); return opts.load === 'null' ? null : terrain; } })),
    ready: () => { log.push('ready'); },
    fallback: (why) => { log.push(why); },
  });
  return { canvas, unitsCanvas, made, terrain, log, stop };
}

test('a lost context shows SVG until it is restored, and leaves the stored option on', async () => {
  const { canvas, log, terrain, stop } = run();
  await settle();
  expect(log).toEqual(['ready']);
  const lost = new Event('webglcontextlost', { cancelable: true });
  canvas.dispatchEvent(lost);
  expect(lost.defaultPrevented, 'the loss is prevented, so the browser may restore the context').toBe(true);
  expect(log).toEqual(['ready', 'lost']);
  expect(terrain3dOn()).toBe(true);
  expect(stored.get(TERRAIN3D_KEY)).toBe('1');
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  expect(log, 'the 3D layer is rebuilt on restore').toEqual(['ready', 'lost', 'ready']);
  expect(stored.get(TERRAIN3D_KEY)).toBe('1');
  stop();
  expect(terrain.disposed).toBe(1);
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  expect(log, 'nothing is heard after the board stops it').toHaveLength(3);
});

test('the unit figures canvas is handed to the renderer, and either context lost shows SVG until both are back', async () => {
  const { canvas, unitsCanvas, made, log, stop } = run({ units: true });
  await settle();
  expect(made).toEqual([unitsCanvas]);
  unitsCanvas!.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  expect(log).toEqual(['ready', 'lost', 'lost']);
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  expect(log, 'still waiting for the units context').toEqual(['ready', 'lost', 'lost']);
  unitsCanvas!.dispatchEvent(new Event('webglcontextrestored'));
  expect(log).toEqual(['ready', 'lost', 'lost', 'ready']);
  stop();
  unitsCanvas!.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  expect(log).toHaveLength(4);
});

test('no WebGL 2, or a chunk that cannot load, shows SVG and keeps the stored option', async () => {
  for (const opts of [{ webgl2: false }, { load: 'fails' as const }, { load: 'null' as const }]) {
    const { log } = run(opts);
    await settle();
    expect(log, JSON.stringify(opts)).toEqual(['unavailable']);
    expect(stored.get(TERRAIN3D_KEY)).toBe('1');
  }
});

test('the match writes the option only when the player toggles it', () => {
  const match = readFileSync(resolve(__dirname, '../screens/Match.tsx'), 'utf8');
  expect(match.match(/setTerrain3d\(/g)).toHaveLength(1);
  expect(match).toMatch(/const toggleTerrain3d = \(\): void => \{ setTerrain3d\(!terrain3d\);/);
});
