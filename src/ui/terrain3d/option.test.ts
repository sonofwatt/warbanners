import { afterEach, expect, test, vi } from 'vitest';
import { setTerrain3d, terrain3dOn, TERRAIN3D_KEY } from './option';

function fakeStorage(): Map<string, string> {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  });
  return m;
}
afterEach(() => { vi.unstubAllGlobals(); });

test('the 3D terrain is off on a device that has never turned it on', () => {
  fakeStorage();
  expect(terrain3dOn()).toBe(false);
});

test('turning it on or off is remembered on the device', () => {
  const m = fakeStorage();
  setTerrain3d(true);
  expect(m.get(TERRAIN3D_KEY)).toBe('1');
  expect(terrain3dOn()).toBe(true);
  setTerrain3d(false);
  expect(m.get(TERRAIN3D_KEY)).toBe('0');
  expect(terrain3dOn()).toBe(false);
});

test('blocked storage falls back to memory for the session', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  });
  setTerrain3d(true);
  expect(terrain3dOn()).toBe(true);
  setTerrain3d(false);
  expect(terrain3dOn()).toBe(false);
});
