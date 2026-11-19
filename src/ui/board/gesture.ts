import type { Pt } from './layout';

export const TAP_SLOP_PX = 10;
export const TAP_MAX_MS = 350;

export type PointerInput = { type: 'down' | 'move' | 'up' | 'cancel'; id: number; x: number; y: number; t: number };
export type GestureOut =
  | { kind: 'tap'; at: Pt }
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'zoom'; factor: number; at: Pt }
  | null;

interface Finger {
  id: number;
  x: number;
  y: number;
}

export type GestureState =
  | { mode: 'idle' }
  // One finger. (sx, sy, t0) is where and when it touched; (ox, oy) is the last position
  // reported as movement. Once panning is true it can never become a tap.
  | { mode: 'one'; id: number; sx: number; sy: number; t0: number; ox: number; oy: number; panning: boolean }
  | { mode: 'two'; a: Finger; b: Finger };

export const IDLE: GestureState = { mode: 'idle' };

const none = (state: GestureState): { state: GestureState; out: GestureOut } => ({ state, out: null });

export function gesture(s: GestureState, e: PointerInput): { state: GestureState; out: GestureOut } {
  if (e.type === 'cancel') return none(IDLE);

  if (s.mode === 'idle') {
    if (e.type !== 'down') return none(s);
    return none({ mode: 'one', id: e.id, sx: e.x, sy: e.y, t0: e.t, ox: e.x, oy: e.y, panning: false });
  }

  if (s.mode === 'one') {
    if (e.type === 'down') {
      if (e.id === s.id) return none(s);
      // A second finger starts a pinch from where the first one is now.
      return none({
        mode: 'two',
        a: { id: s.id, x: s.ox, y: s.oy },
        b: { id: e.id, x: e.x, y: e.y },
      });
    }
    if (e.id !== s.id) return none(s);
    if (e.type === 'move') {
      const panning = s.panning || Math.hypot(e.x - s.sx, e.y - s.sy) > TAP_SLOP_PX;
      if (!panning) return none(s);
      return {
        state: { ...s, panning: true, ox: e.x, oy: e.y },
        out: { kind: 'pan', dx: e.x - s.ox, dy: e.y - s.oy },
      };
    }
    // up
    const isTap = !s.panning && e.t - s.t0 <= TAP_MAX_MS && Math.hypot(e.x - s.sx, e.y - s.sy) <= TAP_SLOP_PX;
    return { state: IDLE, out: isTap ? { kind: 'tap', at: { x: e.x, y: e.y } } : null };
  }

  // two fingers
  if (e.type === 'down') return none(s); // a third pointer is ignored
  if (e.id !== s.a.id && e.id !== s.b.id) return none(s);
  if (e.type === 'move') {
    const a = e.id === s.a.id ? { ...s.a, x: e.x, y: e.y } : s.a;
    const b = e.id === s.b.id ? { ...s.b, x: e.x, y: e.y } : s.b;
    const before = Math.hypot(s.a.x - s.b.x, s.a.y - s.b.y);
    const after = Math.hypot(a.x - b.x, a.y - b.y);
    const state: GestureState = { mode: 'two', a, b };
    if (before === 0 || after === 0) return none(state);
    return {
      state,
      out: { kind: 'zoom', factor: after / before, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } },
    };
  }
  // up: the other finger carries on as a pan from where it is, and can never tap
  const rest = e.id === s.a.id ? s.b : s.a;
  return none({ mode: 'one', id: rest.id, sx: rest.x, sy: rest.y, t0: e.t, ox: rest.x, oy: rest.y, panning: true });
}
