import { useLayoutEffect, useRef, useState } from 'react';
import type { AnimationEvent, ReactElement } from 'react';
import type { FactionId, HexKey } from '../../engine';
import { FIGURES } from '../art/factionUnits';
import { seatAccent, seatColour } from '../art/palette';
import { DASH_MS, EFFECT_MS, effectMs } from './effects';
import type { Effect } from './effects';
import { FIGURE_H, hexToBoard } from './layout';

/** True when the phone asks for less motion. False in Node, where there is no matchMedia. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const LUNGE = 11; // how far, in board units, an attacker leans toward its target
const BURST_R = 12;

const r2 = (n: number): number => Math.round(n * 100) / 100;
const place = (k: HexKey): string => {
  const p = hexToBoard(k);
  return `translate(${r2(p.x)} ${r2(p.y)})`;
};

/** What is drawn as its own shape: numbers always, falls and bursts only with motion. A lunge moves the unit itself, and a move is the board's slide. */
const drawn = (f: Effect, still: boolean): boolean => f.kind === 'number' || (!still && f.kind !== 'lunge' && f.kind !== 'move');

/**
 * Plays one action's effects inside the board's camera group, each removed when its
 * animation ends. Mount it with the action's seq as its key, so each action plays once.
 * It never takes a tap: the state is already final, these only decorate it.
 */
export function Effects(p: { effects: readonly Effect[]; factions: readonly FactionId[] }): ReactElement {
  const [still] = useState(prefersReducedMotion);
  const [live, setLive] = useState<ReadonlySet<number>>(
    () => new Set(p.effects.flatMap((f, i) => (drawn(f, still) ? [i] : []))),
  );
  const ref = useRef<SVGGElement>(null);

  // A lunge nudges the attacker's figure toward its target and back. It animates the unit's
  // body, inside the group that places the unit, so it composes with a slide.
  useLayoutEffect(() => {
    // The units may be in another svg than the effects (with the 3D terrain on the effects sit in the svg above the
    // figures), so they are looked for in the board's container.
    const cam = ref.current?.ownerSVGElement?.parentElement ?? ref.current?.parentElement;
    if (still || cam == null) return undefined;
    const running: Animation[] = [];
    for (const f of p.effects) {
      if (f.kind !== 'lunge') continue;
      const unit = cam.querySelector(`[data-unit="${f.unit}"]`);
      const body = unit?.querySelector('.unit-body');
      if (body == null || typeof body.animate !== 'function') continue;
      // From the tile it struck from, not the one it stands on now: a killer that then advances into its target's
      // tile already stands there, and would otherwise lean nowhere.
      const a = hexToBoard(f.from);
      const b = hexToBoard(f.toward);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len === 0) continue;
      const dx = r2(((b.x - a.x) / len) * LUNGE);
      const dy = r2(((b.y - a.y) / len) * LUNGE);
      if (f.via !== undefined) {
        // rules 11, a Dash-strike's charge: run to the charge tile, strike toward the target, run home. The board
        // always ends on the engine's positions: the figure only ever leaves its tile inside this animation.
        const v = hexToBoard(f.via);
        const vx = r2(v.x - a.x), vy = r2(v.y - a.y);
        const hit = hexToBoard(f.toward);
        const hl = Math.hypot(hit.x - v.x, hit.y - v.y) || 1;
        const hx = r2(vx + ((hit.x - v.x) / hl) * LUNGE), hy = r2(vy + ((hit.y - v.y) / hl) * LUNGE);
        running.push(
          body.animate(
            [
              { transform: 'translate(0px, 0px)' },
              { transform: `translate(${vx}px, ${vy}px)`, offset: 0.35 },
              { transform: `translate(${hx}px, ${hy}px)`, offset: 0.5 },
              { transform: `translate(${vx}px, ${vy}px)`, offset: 0.62 },
              { transform: 'translate(0px, 0px)' },
            ],
            { duration: DASH_MS, delay: f.delay, easing: 'ease-in-out' },
          ),
        );
        continue;
      }
      running.push(
        body.animate(
          [
            { transform: 'translate(0px, 0px)' },
            { transform: `translate(${dx}px, ${dy}px)`, offset: 0.3 },
            { transform: 'translate(0px, 0px)' },
          ],
          { duration: EFFECT_MS, delay: f.delay, easing: 'ease-out' },
        ),
      );
    }
    return () => running.forEach((a) => a.cancel());
    // Each mount plays one action; the list does not change while it plays.
  }, []);

  const end = (i: number) => (e: AnimationEvent<SVGGElement>): void => {
    if (e.target !== e.currentTarget) return;
    setLive((s) => {
      const next = new Set(s);
      next.delete(i);
      return next;
    });
  };

  return (
    <g className="fx" pointerEvents="none" aria-hidden="true" ref={ref}>
      {p.effects.map((f, i) => {
        if (!live.has(i) || f.kind === 'lunge' || f.kind === 'move') return null;
        const style = { animationDelay: `${f.delay}ms`, animationDuration: `${effectMs(f)}ms` };
        let body: ReactElement | null = null;
        if (f.kind === 'number') {
          body = (
            <g className={`fx-number fx-${f.tone}${still ? ' fx-still' : ''}`} style={style} onAnimationEnd={end(i)}>
              <text y={-FIGURE_H - 4} textAnchor="middle">{f.text}</text>
            </g>
          );
        } else if (f.kind === 'fall') {
          const faction = p.factions[f.owner];
          if (faction === undefined) return null;
          body = (
            <g className="fx-fall" style={style} onAnimationEnd={end(i)} data-fall={f.unitType} data-fall-owner={f.owner} data-fall-at={f.at} data-fall-key={i}>
              {FIGURES[f.unitType]({ colour: seatColour(p.factions, f.owner), accent: seatAccent(p.factions, f.owner) })}
            </g>
          );
        } else {
          body = (
            <g className={`fx-burst fx-${f.tone}`} style={style} onAnimationEnd={end(i)}>
              <ellipse rx={BURST_R} ry={BURST_R * 0.62} />
            </g>
          );
        }
        return <g key={i} transform={place(f.at)}>{body}</g>;
      })}
    </g>
  );
}
