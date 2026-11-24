// When the 3D terrain is shown and when the board falls back to SVG. No three.js here (the renderer is loaded
// through `load`, a dynamic import), and nothing touches the stored option: a fallback only changes what this
// board shows, so a lost context (a phone putting the tab away) never turns the player's setting off.
import type { Terrain3d } from './terrain3d';

export type FallbackReason = 'unavailable' | 'lost';

export interface TerrainLifecycle {
  canvas: EventTarget;
  load: () => Promise<{ createTerrain3d: (canvas: HTMLCanvasElement) => Terrain3d | null }>;
  hasWebgl2: () => boolean;
  /** The terrain can draw: on first load, and again when a lost context comes back. */
  ready: (t: Terrain3d) => void;
  /** Show the SVG board. 'unavailable' (no WebGL 2, the chunk did not load) is for this board's life; 'lost' lasts until the context is restored. */
  fallback: (why: FallbackReason) => void;
}

/** Start the terrain on the canvas; the returned function stops it and frees the GPU. */
export function startTerrain3d(o: TerrainLifecycle): () => void {
  let stopped = false;
  let terrain: Terrain3d | null = null;
  const lost = (e: Event): void => {
    e.preventDefault(); // so the browser may restore the context
    if (!stopped && terrain !== null) o.fallback('lost');
  };
  const restored = (): void => {
    if (!stopped && terrain !== null) o.ready(terrain);
  };
  if (!o.hasWebgl2()) {
    o.fallback('unavailable');
    return () => { stopped = true; };
  }
  o.canvas.addEventListener('webglcontextlost', lost);
  o.canvas.addEventListener('webglcontextrestored', restored);
  o.load().then((m) => {
    if (stopped) return;
    terrain = m.createTerrain3d(o.canvas as HTMLCanvasElement);
    if (terrain === null) o.fallback('unavailable');
    else o.ready(terrain);
  }, () => {
    if (!stopped) o.fallback('unavailable');
  });
  return () => {
    stopped = true;
    o.canvas.removeEventListener('webglcontextlost', lost);
    o.canvas.removeEventListener('webglcontextrestored', restored);
    terrain?.dispose();
    terrain = null;
  };
}
