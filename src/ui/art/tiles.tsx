import type { ReactElement } from 'react';
import type { Tile } from '../../engine';
import { edgeDirs, THICK, tileCorners } from '../board/layout';
import type { Pt } from '../board/layout';
import { GROUND } from './palette';
import type { Ground } from './palette';

export type Mark = 'move' | 'attack' | 'ability' | 'selected' | 'capture';

/** "x,y x,y ..." with one decimal, for a polygon's points. */
export function pts(p: readonly Pt[]): string {
  return p.map((q) => `${r1(q.x)},${r1(q.y)}`).join(' ');
}
export function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Top-face corners around the origin, clockwise from lower right. */
export function topCorners(): Pt[] {
  return tileCorners('0,0');
}

/** Scale points toward the origin. */
export function shrink(p: readonly Pt[], f: number): Pt[] {
  return p.map((q) => ({ x: q.x * f, y: q.y * f }));
}

/**
 * The two top-face corners of the edge shared with the neighbour in
 * direction `d` (the engine's direction order, as edgeDirs returns it).
 */
export function edgeCorners(d: number): [Pt, Pt] {
  const c = topCorners();
  const dir = edgeDirs()[d] ?? { x: 0, y: 0 };
  let best = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < 6; i++) {
    const a = c[i]!;
    const b = c[(i + 1) % 6]!;
    const dot = ((a.x + b.x) / 2) * dir.x + ((a.y + b.y) / 2) * dir.y;
    if (dot > bestDot) {
      bestDot = dot;
      best = i;
    }
  }
  return [c[best]!, c[(best + 1) % 6]!];
}

export function TileBase(p: { ground: Ground }): ReactElement {
  const [top, left, right] = GROUND[p.ground];
  const c = topCorners();
  const dn = (q: Pt): Pt => ({ x: q.x, y: q.y + THICK });
  const lowRight = c[0]!;
  const bottom = c[1]!;
  const lowLeft = c[2]!;
  return (
    <g>
      <polygon points={pts([lowRight, bottom, dn(bottom), dn(lowRight)])} fill={right} />
      <polygon points={pts([bottom, lowLeft, dn(lowLeft), dn(bottom)])} fill={left} />
      <polygon points={pts(c)} fill={top} stroke={left} strokeWidth={0.6} strokeLinejoin="round" />
    </g>
  );
}

/** Dims the top face of an explored tile that no unit can see now. */
export function Veil(): ReactElement {
  return <polygon points={pts(topCorners())} fill="#1E2833" fillOpacity={0.22} />;
}

const RING = { rx: 17, ry: 17 * 0.62 };

export function Highlight(p: { mark: Mark }): ReactElement {
  switch (p.mark) {
    case 'move':
      return (
        <g>
          <ellipse cx={0} cy={1} rx={6} ry={3.8} fill="#000000" fillOpacity={0.12} />
          <ellipse cx={0} cy={0} rx={5.6} ry={3.6} fill="#FFFFFF" fillOpacity={0.92} />
        </g>
      );
    case 'attack':
      return (
        <g>
          <ellipse cx={0} cy={0} rx={RING.rx} ry={RING.ry} fill="#E0382B" fillOpacity={0.18} />
          <ellipse cx={0} cy={0} rx={RING.rx} ry={RING.ry} fill="none" stroke="#E0382B" strokeWidth={2.6} />
        </g>
      );
    case 'ability':
      return (
        <g>
          <ellipse cx={0} cy={0} rx={RING.rx} ry={RING.ry} fill="#F2C230" fillOpacity={0.2} />
          <ellipse cx={0} cy={0} rx={RING.rx} ry={RING.ry} fill="none" stroke="#F2B705" strokeWidth={2.6} strokeDasharray="5 3" />
        </g>
      );
    case 'selected':
      return (
        <polygon
          points={pts(shrink(topCorners(), 0.9))}
          fill="#FFFFFF"
          fillOpacity={0.18}
          stroke="#FFFFFF"
          strokeWidth={2.4}
          strokeLinejoin="round"
        />
      );
    case 'capture':
      return (
        <g>
          <ellipse cx={0} cy={0} rx={RING.rx} ry={RING.ry} fill="none" stroke="#F2B705" strokeWidth={1.6} />
          <ellipse cx={-2} cy={2} rx={4} ry={1.8} fill="#000000" fillOpacity={0.16} />
          <line x1={-2} y1={2} x2={-2} y2={-19} stroke="#6B4A2B" strokeWidth={1.5} strokeLinecap="round" />
          <polygon points="-1.3,-19 11,-16 6.5,-13.5 11,-11 -1.3,-11" fill="#F2B705" />
        </g>
      );
  }
}

/** Territory edge lines, drawn just inside the top face so two owners' borders sit side by side. */
export function Border(p: { edges: readonly number[]; colour: string }): ReactElement {
  return (
    <g>
      {p.edges.map((d) => {
        const [a, b] = edgeCorners(d);
        const f = 0.9;
        return (
          <line
            key={d}
            x1={r1(a.x * f)}
            y1={r1(a.y * f)}
            x2={r1(b.x * f)}
            y2={r1(b.y * f)}
            stroke={p.colour}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

export function groundFor(tile: Tile, hasCity: boolean): 'grass' | 'water' | 'rock' | 'sand' {
  if (hasCity) return 'sand';
  if (tile.terrain === 'water') return 'water';
  if (tile.terrain === 'mountain') return 'rock';
  return 'grass';
}
