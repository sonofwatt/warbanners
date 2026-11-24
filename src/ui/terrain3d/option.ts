// The 3D terrain option: off unless this device has turned it on. Read and written only when the app asks, never
// at module load, and a blocked storage falls back to memory for the session (as the sound setting does).

const KEY = 'warbanners.terrain3d';
let memory = false;

export function terrain3dOn(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(KEY);
      if (v !== null) return v === '1';
    }
  } catch {
    // storage blocked: fall back to memory
  }
  return memory;
}

export function setTerrain3d(on: boolean): void {
  memory = on;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // storage blocked: the in-memory value still holds
  }
}

export const TERRAIN3D_KEY = KEY;

/**
 * Whether this device can draw the terrain (WebGL 2, which three.js needs), checked on a throwaway canvas before
 * three.js is downloaded. The test context is released at once.
 */
export function webgl2Available(): boolean {
  try {
    if (typeof document === 'undefined') return false;
    const gl = document.createElement('canvas').getContext('webgl2');
    if (gl === null) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
