// Where the units' svg has each animating unit this frame, read from the svg itself, so the 3D figures (Board.tsx,
// terrain3d/units) follow a slide, a lunge or a fall exactly. No three.js here; the DOM is touched only when called.
import type { FactionId } from '../../engine';
import { ACCENT, playerColour } from '../art/palette';
import type { UnitFall, UnitPose } from '../terrain3d/units/units3d';
import { hexToBoard } from './layout';

/** An element's live (animated) CSS transform: its translation and its turn in radians; null when it cannot be read. */
export function liveTransform(el: Element): { x: number; y: number; angle: number } | null {
  let t: string;
  try {
    t = getComputedStyle(el).transform;
  } catch {
    return null;
  }
  if (typeof t !== 'string' || t === '' || t === 'none' || typeof DOMMatrixReadOnly !== 'function') return null;
  try {
    const m = new DOMMatrixReadOnly(t);
    if (![m.a, m.b, m.e, m.f].every(Number.isFinite)) return null;
    return { x: m.e, y: m.f, angle: Math.atan2(m.b, m.a) };
  } catch {
    return null;
  }
}

/**
 * Where a unit's group is drawn now: its live transform (a slide), or else its own tile (`data-at`), so a browser
 * that does not report the transform still draws it in place, never at the board's origin. Plus a lunge on its body
 * when one can be read.
 */
export function unitPoseOf(unit: Element): UnitPose | null {
  const place = liveTransform(unit);
  const at = unit.getAttribute('data-at');
  const base = place ?? (at === null ? null : hexToBoard(at));
  if (base === null) return null;
  const body = unit.querySelector('.unit-body');
  const nudge = body === null ? null : liveTransform(body);
  return { x: base.x + (nudge?.x ?? 0), y: base.y + (nudge?.y ?? 0) };
}

/**
 * The poses of the units with a running animation, the falls playing (from the svg fall's own turn and opacity,
 * keyed by `data-fall-key`, stable for the fall's life), and whether anything in `g` still animates.
 */
export function livePose(g: Element, factions: readonly FactionId[]): { at: Map<number, UnitPose>; falls: UnitFall[]; moving: boolean } {
  const at = new Map<number, UnitPose>();
  const falls: UnitFall[] = [];
  if (typeof g.getAnimations !== 'function') return { at, falls, moving: false };
  const running = g.getAnimations({ subtree: true }).filter((a) => a.playState === 'running');
  for (const a of running) {
    const effect = a.effect as { target?: Element | null } | null;
    const unit = effect?.target?.closest('[data-unit]');
    if (unit == null) continue;
    const id = Number(unit.getAttribute('data-unit'));
    if (at.has(id)) continue;
    const pose = unitPoseOf(unit);
    if (pose !== null) at.set(id, pose);
  }
  g.querySelectorAll('[data-fall]').forEach((el) => {
    const faction = factions[Number(el.getAttribute('data-fall-owner'))];
    const k = el.getAttribute('data-fall-at');
    if (faction === undefined || k === null) return;
    let alpha = 0;
    try { alpha = Number(getComputedStyle(el).opacity); } catch { alpha = 0; }
    if (!(alpha > 0)) return;
    const p = hexToBoard(k);
    falls.push({
      key: `${el.getAttribute('data-fall-key') ?? ''}@${k}`, type: el.getAttribute('data-fall') as UnitFall['type'],
      look: { ...playerColour(faction), accent: ACCENT[faction] },
      x: p.x, y: p.y, angle: liveTransform(el)?.angle ?? 0, alpha: Math.min(1, alpha),
    });
  });
  return { at, falls, moving: running.length > 0 };
}
