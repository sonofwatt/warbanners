import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { gesture, IDLE } from './gesture';
import type { GestureOut, GestureState, PointerInput } from './gesture';

const WHEEL_STEP = 0.0015; // zoom factor per pixel of wheel travel, as an exponent
const LINE_PX = 16; // a wheel "line" in pixels

/**
 * Feeds the element's pointer events through the gesture reducer and calls `on` with each
 * tap, pan or pinch zoom, in pixels relative to the element. A mouse wheel zooms at the pointer.
 * Listeners are attached once; `on` may change on every render.
 */
export function useGestures(ref: RefObject<Element | null>, on: (out: NonNullable<GestureOut>) => void): void {
  const onRef = useRef(on);
  useEffect(() => {
    onRef.current = on;
  });

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    let state: GestureState = IDLE;

    const local = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const feed = (type: PointerInput['type'], e: PointerEvent): void => {
      const { x, y } = local(e);
      const next = gesture(state, { type, id: e.pointerId, x, y, t: e.timeStamp });
      state = next.state;
      if (next.out !== null) onRef.current(next.out);
    };

    const down = (e: Event): void => {
      const p = e as PointerEvent;
      if (p.pointerType === 'mouse' && p.button !== 0) return;
      el.setPointerCapture?.(p.pointerId);
      feed('down', p);
    };
    const move = (e: Event): void => feed('move', e as PointerEvent);
    const up = (e: Event): void => feed('up', e as PointerEvent);
    const cancel = (e: Event): void => feed('cancel', e as PointerEvent);
    const wheel = (e: Event): void => {
      const w = e as WheelEvent;
      w.preventDefault();
      const dy = w.deltaMode === 1 ? w.deltaY * LINE_PX : w.deltaY;
      onRef.current({ kind: 'zoom', factor: Math.exp(-dy * WHEEL_STEP), at: local(w) });
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('wheel', wheel);
    };
  }, [ref]);
}
