import type { ReactElement, ReactNode } from 'react';
import type { Tile } from '../../engine';
import { edgeDirs, THICK, tileCorners } from '../board/layout';
import type { Pt } from '../board/layout';
import { GROUND } from './palette';
import type { Ground } from './palette';
import type { Mark } from '../board/mark';

export type { Mark } from '../board/mark';

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
  const i = cornerEdge(d);
  return [c[i]!, c[(i + 1) % 6]!];
}

/** Which top-face side (from corner i to corner i + 1) faces the neighbour in direction `d`. */
function cornerEdge(d: number): number {
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
  return best;
}

/** Where the line through a and b crosses the line through c and d. */
function cross(a: Pt, b: Pt, c: Pt, d: Pt): Pt {
  const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (den === 0) return b;
  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
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

/**
 * Dims an explored tile that no unit can see now, all of it: its ground and whatever stands on it.
 * Give it the same art the tile draws; it draws that art again on top as one dark silhouette
 * (theme.css paints every shape in it the veil colour) at a low group opacity. No filter, so it is
 * cheap on phones, and units, drawn after the tile, stay bright.
 */
export function Veil(p: { children: ReactNode }): ReactElement {
  return (
    <g className="veil" opacity={0.3} pointerEvents="none">
      {p.children}
    </g>
  );
}

const RING = { rx: 17, ry: 17 * 0.62 };

export function Highlight(p: { mark: Mark }): ReactElement {
  switch (p.mark) {
    case 'move':
      return (
        <g>
          <ellipse cx={0} cy={1.2} rx={8.6} ry={5.6} fill="#1E2833" fillOpacity={0.4} />
          <ellipse cx={0} cy={0} rx={7.6} ry={4.8} fill="#FFFFFF" fillOpacity={0.95} />
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
          <ellipse cx={0} cy={0} rx={RING.rx} ry={RING.ry} fill="#F2C230" fillOpacity={0.3} />
          <ellipse cx={0} cy={0} rx={RING.rx} ry={RING.ry} fill="none" stroke="#3D2C00" strokeOpacity={0.45} strokeWidth={4.4} />
          <ellipse cx={0} cy={0} rx={RING.rx} ry={RING.ry} fill="none" stroke="#FFC81A" strokeWidth={2.8} strokeDasharray="5 3" />
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
          <ellipse cx={0} cy={0} rx={RING.rx} ry={RING.ry} fill="none" stroke="#3D2C00" strokeOpacity={0.45} strokeWidth={4.4} />
          <ellipse cx={0} cy={0} rx={RING.rx} ry={RING.ry} fill="none" stroke="#FFC81A" strokeWidth={2.8} />
          <ellipse cx={-2} cy={2} rx={4} ry={1.8} fill="#000000" fillOpacity={0.16} />
          <line x1={-2} y1={2} x2={-2} y2={-19} stroke="#6B4A2B" strokeWidth={1.5} strokeLinecap="round" />
          <polygon points="-1.3,-19 11,-16 6.5,-13.5 11,-11 -1.3,-11" fill="#F2B705" />
        </g>
      );
  }
}

/**
 * Territory edge lines, drawn just inside the top face so two owners' borders sit side by side.
 * Where the outline carries on into the next tile of the same territory (the side next to this
 * edge is not a border here), the line runs on to that shared side, so it meets the next tile's
 * line there and the outline has no gap.
 */
export function Border(p: { edges: readonly number[]; colour: string }): ReactElement {
  const c = topCorners();
  const f = 0.9;
  const inner = shrink(c, f);
  const sides = new Set(p.edges.map(cornerEdge));
  return (
    <g>
      {p.edges.map((d) => {
        const i = cornerEdge(d);
        const j = (i + 1) % 6;
        let a = inner[i]!;
        let b = inner[j]!;
        const before = (i + 5) % 6; // the side ending at corner i
        if (!sides.has(before)) a = cross(inner[j]!, inner[i]!, c[before]!, c[i]!);
        if (!sides.has(j)) b = cross(inner[i]!, inner[j]!, c[j]!, c[(j + 1) % 6]!);
        return (
          <line
            key={d}
            x1={r1(a.x)}
            y1={r1(a.y)}
            x2={r1(b.x)}
            y2={r1(b.y)}
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
