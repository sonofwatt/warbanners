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

// Whether a board is drawing its units in 3D right now (the option on, WebGL 2 there, the 3D chunk loaded, no lost
// context). Set by the board as that changes; nothing is read or written at import.
let drawing = false;

export function setUnits3dDrawing(on: boolean): void {
  drawing = on;
}

/**
 * Whether a move is played as the 3D walk (board/motion.ts), so the AI waits for it: the 3D figures really drawn and
 * no request for less motion (which plays no slide at all).
 */
export function movesWalk3d(): boolean {
  if (!drawing) return false;
  try {
    return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return true;
  }
}

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
