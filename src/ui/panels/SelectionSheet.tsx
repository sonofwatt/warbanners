import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, MutableRefObject, PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from 'react';
import type { Insets } from '../board/camera';
import { T } from '../text';

// The selection card lies over the board, so opening, changing or closing it never resizes the board's slot (which
// would move the board). In portrait it is a card pulled up from the bottom: it opens showing only its top (the
// `.card-peek` part of the panel: the title, the numbers, the actions, a city's row of units), and the player pulls
// it up by its handle or its top to see the rest, or taps the handle. Pulled down past its collapsed height, it
// slides down out of sight and closes, which ends the selection (`onClose`). A new selection opens it collapsed
// again. In landscape it is the side column, whole, as before.

/** The landscape layout with the side column (theme.css uses the same query). */
export const SIDE_QUERY = '(orientation: landscape) and (min-width: 560px)';
/** The most of the match screen a pulled-up card may take, so some board always shows above it. */
export const SHEET_MAX = 0.7;
/** How far a finger moves before a press on the card's top becomes a pull (and not a tap). */
const PULL_START_PX = 6;
/** A pull this far settles the card the way it went; a shorter one settles to the nearer end. */
const PULL_DECIDES_PX = 36;
/** A pull down this far below the collapsed card closes it; a shorter one slides it back up. */
export const CLOSE_PULL_PX = 56;

export interface SheetApi {
  /** What the card covers of the board's slot (`slot`, a client rect): its collapsed height in portrait, its width in landscape. */
  cover(slot: DOMRect): Insets;
}

function sideNow(): boolean {
  return typeof matchMedia === 'function' && matchMedia(SIDE_QUERY).matches;
}

function useSide(): boolean {
  const [side, setSide] = useState(sideNow);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const q = matchMedia(SIDE_QUERY);
    const on = (): void => setSide(q.matches);
    on();
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return side;
}

interface Sizes { collapsed: number; expanded: number }

/** The card's two heights, from its content as laid out now (whatever height it is drawn at). */
function measure(el: HTMLElement): Sizes {
  const cs = getComputedStyle(el);
  const borderTop = parseFloat(cs.borderTopWidth) || 0;
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  const full = el.scrollHeight + borderTop;
  const room = (el.parentElement?.clientHeight ?? window.innerHeight) * SHEET_MAX;
  const peek = el.querySelector<HTMLElement>('.card-peek');
  const more = el.querySelector<HTMLElement>('.card-more');
  // Collapsed, the card ends where the rest of it begins (so not a line of it peeks in), or under its top part.
  const top = peek === null ? full
    : more !== null ? borderTop + more.offsetTop
    : borderTop + peek.offsetTop + peek.offsetHeight + padBottom;
  const expanded = Math.round(Math.min(full, room));
  return { collapsed: Math.round(Math.min(top, expanded)), expanded };
}

export function SelectionSheet({ resetKey, apiRef, onCover, onClose, children }: {
  resetKey: string;
  apiRef: MutableRefObject<SheetApi | null>;
  onCover: () => void;
  /** Called when the card is pulled down and away (portrait only). */
  onClose?: () => void;
  children: ReactNode;
}): ReactElement {
  const side = useSide();
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  // Each new selection opens collapsed.
  const [shownKey, setShownKey] = useState(resetKey);
  if (shownKey !== resetKey) {
    setShownKey(resetKey);
    setOpen(false);
  }
  const [sizes, setSizes] = useState<Sizes | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  // Transitions start only once the card has its first height, so it never grows in from nothing.
  const [ready, setReady] = useState(false);

  const remeasure = useCallback((): void => {
    const el = ref.current;
    if (el === null) return;
    const next = measure(el);
    setSizes((was) => (was !== null && was.collapsed === next.collapsed && was.expanded === next.expanded ? was : next));
  }, []);
  useLayoutEffect(() => {
    remeasure();
    const el = ref.current;
    if (el === null || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => remeasure());
    const body = el.querySelector('.sheet-body');
    if (body !== null) ro.observe(body);
    const peek = el.querySelector('.card-peek');
    if (peek !== null) ro.observe(peek);
    if (el.parentElement !== null) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [remeasure, resetKey, side]);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // The board reads what the card covers when it decides where to look: measured then, never from a stale render.
  useLayoutEffect(() => {
    apiRef.current = {
      cover(slot: DOMRect): Insets {
        const el = ref.current;
        if (el === null) return { top: 0, right: 0, bottom: 0, left: 0 };
        if (sideNow()) {
          const r = el.getBoundingClientRect();
          return { top: 0, right: Math.max(0, Math.min(slot.width, slot.right - r.left)), bottom: 0, left: 0 };
        }
        return { top: 0, right: 0, bottom: Math.min(slot.height, measure(el).collapsed), left: 0 };
      },
    };
    return () => { apiRef.current = null; };
  }, [apiRef]);
  // Only the collapsed height counts as covered, so pulling the card up or down never moves the board.
  const collapsed = sizes?.collapsed ?? 0;
  const firstCover = useRef(true);
  useEffect(() => {
    if (firstCover.current) { firstCover.current = false; return; }
    onCover();
  }, [collapsed, side, onCover]);

  const canPull = !side && sizes !== null && sizes.expanded > sizes.collapsed + 1;
  const canClose = !side && sizes !== null && onClose !== undefined;
  const canDrag = canPull || canClose;
  // While dragged, how tall the card would be; below its collapsed height (a pull to close) it keeps that height
  // and slides down by the difference instead, so its top part stays whole as it goes.
  const lowest = canClose ? 0 : sizes?.collapsed ?? 0;
  const highest = sizes === null ? 0 : canPull ? sizes.expanded : sizes.collapsed;
  const dragged = (h: number): number => Math.min(highest, Math.max(lowest, h));
  const height = sizes === null ? undefined : drag !== null ? Math.max(drag, sizes.collapsed) : open && canPull ? sizes.expanded : sizes.collapsed;
  const slide = sizes !== null && drag !== null && drag < sizes.collapsed ? sizes.collapsed - drag : 0;

  // The pull: a press on the handle or the card's top that moves up or down follows the finger, then settles.
  const press = useRef<{ id: number; y: number; x: number; h: number; pulling: boolean } | null>(null);
  const swallowClick = useRef(false);
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>): void => {
    if (!canDrag || sizes === null || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const t = e.target as Element;
    if (t.closest('.sheet-handle') === null && t.closest('.card-peek') === null) return;
    press.current = { id: e.pointerId, y: e.clientY, x: e.clientX, h: ref.current?.getBoundingClientRect().height ?? sizes.collapsed, pulling: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>): void => {
    const p = press.current;
    if (p === null || p.id !== e.pointerId || sizes === null) return;
    const dy = p.y - e.clientY;
    if (!p.pulling) {
      if (Math.abs(dy) < PULL_START_PX || Math.abs(dy) < Math.abs(e.clientX - p.x)) return;
      p.pulling = true;
      ref.current?.setPointerCapture?.(e.pointerId);
    }
    setDrag(dragged(p.h + dy));
  };
  const settle = (e: ReactPointerEvent<HTMLElement>): void => {
    const p = press.current;
    if (p === null || p.id !== e.pointerId) return;
    press.current = null;
    if (!p.pulling || sizes === null) return;
    swallowClick.current = true;
    setTimeout(() => { swallowClick.current = false; }, 0);
    const moved = p.y - e.clientY;
    const now = dragged(p.h + moved);
    if (canClose && now <= sizes.collapsed - CLOSE_PULL_PX) {
      setDrag(null);
      onClose?.();
      return;
    }
    const up = canPull && (moved > PULL_DECIDES_PX ? true : moved < -PULL_DECIDES_PX ? false : now - sizes.collapsed > sizes.expanded - now);
    setOpen(up);
    setDrag(null);
    if (!up) ref.current?.scrollTo?.({ top: 0 });
  };
  const toggle = (): void => {
    if (!canPull) return;
    if (open) ref.current?.scrollTo?.({ top: 0 });
    setOpen(!open);
  };

  const cls = ['selection', side ? '' : 'pull', open && canPull ? 'open' : '', drag !== null ? 'dragging' : ''].filter(Boolean).join(' ');
  return (
    <aside
      ref={ref} className={cls} data-testid="selection" data-selection={resetKey} data-sheet={side ? 'side' : open && canPull ? 'expanded' : 'collapsed'} data-ready={ready ? 'true' : undefined}
      style={height === undefined || side ? undefined : ({ '--sheet-h': `${height}px`, ...(slide > 0 ? { transform: `translateY(${slide}px)` } : {}) } as CSSProperties)}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={settle} onPointerCancel={settle}
      onClickCapture={(e) => { if (swallowClick.current) { e.stopPropagation(); e.preventDefault(); swallowClick.current = false; } }}
    >
      {side ? null : (
        <button
          type="button" className="sheet-handle" data-testid="sheet-handle" aria-expanded={open && canPull} disabled={!canDrag} data-pull={canPull ? undefined : 'close'}
          aria-label={open && canPull ? T.ui.sheetLess : T.ui.sheetMore} onClick={toggle}
        >
          <span aria-hidden="true" />
        </button>
      )}
      <div className="sheet-body">{children}</div>
    </aside>
  );
}
