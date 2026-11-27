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
const UNDER = '#1E2833'; // a dark band under every ring, so it reads on grass, sand, water and snow alike

/** A ring on the tile's top face: a tint, a dark band, then the colour on top. */
function ring(colour: string, fill: number): ReactElement {
  return (
    <>
      <ellipse cx={0} cy={0} rx={RING.rx} ry={RING.ry} fill={colour} fillOpacity={fill} />
      <ellipse cx={0} cy={0} rx={RING.rx} ry={RING.ry} fill="none" stroke={UNDER} strokeOpacity={0.45} strokeWidth={5} />
      <ellipse cx={0} cy={0} rx={RING.rx} ry={RING.ry} fill="none" stroke={colour} strokeWidth={3.2} />
    </>
  );
}

export function Highlight(p: { mark: Mark }): ReactElement {
  switch (p.mark) {
    case 'move':
      return (
        // A small white ring on a dark band, open in the middle, so a building or a resource on the
        // tile still shows through it; small and white, it never reads as an attack or ability ring.
        <g>
          <ellipse cx={0} cy={1.2} rx={7.6} ry={4.7} fill="none" stroke={UNDER} strokeOpacity={0.5} strokeWidth={3.2} />
          <ellipse cx={0} cy={0} rx={7.6} ry={4.7} fill="none" stroke="#FFFFFF" strokeWidth={3.2} />
        </g>
      );
    case 'moveEnds':
      // rules 8: the move ring, dashed, with a dot in the middle: the unit can go there, and its turn ends there.
      return (
        <g>
          <ellipse cx={0} cy={1.2} rx={7.6} ry={4.7} fill="none" stroke={UNDER} strokeOpacity={0.5} strokeWidth={3.2} />
          <ellipse cx={0} cy={0} rx={7.6} ry={4.7} fill="none" stroke="#FFFFFF" strokeWidth={3.2} strokeDasharray="3.4 2.6" />
          <ellipse cx={0} cy={0} rx={1.8} ry={1.1} fill="#FFFFFF" stroke={UNDER} strokeOpacity={0.5} strokeWidth={0.8} />
        </g>
      );
    case 'attack':
      return <g>{ring('#F0402F', 0.22)}</g>;
    case 'ability':
      // Violet, so it never reads as the ready glow's gold or an attack's red; dashed white over it.
      return (
        <g>
          {ring('#9B5CF6', 0.22)}
          <ellipse cx={0} cy={0} rx={RING.rx} ry={RING.ry} fill="none" stroke="#FFFFFF" strokeWidth={1.4} strokeDasharray="4 4" />
        </g>
      );
    case 'selected':
      // White on a dark band, so the outline also reads on a city's pale sand and on snow.
      return (
        <g>
          <polygon
            points={pts(shrink(topCorners(), 0.9))}
            fill="#FFFFFF"
            fillOpacity={0.18}
            stroke={UNDER}
            strokeOpacity={0.45}
            strokeWidth={4.4}
            strokeLinejoin="round"
          />
          <polygon points={pts(shrink(topCorners(), 0.9))} fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinejoin="round" />
        </g>
      );
  }
}

/**
 * The gold glow on a tile where one of my units can capture or claim a treasure: a translucent gold fill of the whole
 * top face with a deeper gold rim, so it reads on grass, on a city's pale sand and on a snowy mountain. It pulses
 * slowly (theme.css, off under prefers-reduced-motion) and lies under the selection, move and attack marks.
 */
export function ReadyGlow(): ReactElement {
  const face = pts(shrink(topCorners(), 0.94));
  return (
    <g className="ready-glow">
      <polygon points={face} fill="#FFC81A" fillOpacity={0.3} stroke="#D98E04" strokeOpacity={0.85} strokeWidth={1.6} strokeLinejoin="round" />
    </g>
  );
}

/**
 * Territory edge lines, drawn just inside the top face so two owners' borders sit side by side.
 * Where the outline carries on into the next tile of the same territory (the side next to this
 * edge is not a border here), the line runs on to that shared side, so it meets the next tile's
 * line there and the outline has no gap.
 */
export function Border(p: { edges: readonly number[]; colour: string }): ReactElement {
  return (
    <g>
      {borderLines(p.edges).map(({ d, a, b }) => (
        <line
          key={d}
          x1={r1(a.x)}
          y1={r1(a.y)}
          x2={r1(b.x)}
          y2={r1(b.y)}
          stroke={p.colour}
          strokeWidth={BORDER_WIDTH}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

/** The border line's width in board units. */
export const BORDER_WIDTH = 2.4;

/** The border's lines round the tile centre, in board units, one per edge in `edges` (as Border draws them). */
export function borderLines(edges: readonly number[]): { d: number; a: Pt; b: Pt }[] {
  const c = topCorners();
  const f = 0.9;
  const inner = shrink(c, f);
  const sides = new Set(edges.map(cornerEdge));
  return edges.map((d) => {
    const i = cornerEdge(d);
    const j = (i + 1) % 6;
    let a = inner[i]!;
    let b = inner[j]!;
    const before = (i + 5) % 6; // the side ending at corner i
    if (!sides.has(before)) a = cross(inner[j]!, inner[i]!, c[before]!, c[i]!);
    if (!sides.has(j)) b = cross(inner[i]!, inner[j]!, c[j]!, c[(j + 1) % 6]!);
    return { d, a, b };
  });
}

/** The strongest the selected city's glow gets, right at its outer edge. */
export const CITY_GLOW_MAX = 0.5;
/** How far across the tile (opposite sides' middles, one tile width) the glow's fade runs before it reaches nothing. */
export const CITY_GLOW_FADE = 0.6;

/**
 * The land of the selected city: an inner glow of the faction colour, CITY_GLOW_MAX strong right at each outer edge of
 * the city's land (`edges`, the directions where the neighbour is not this city's) and fading to nothing CITY_GLOW_FADE (60%) of a tile
 * width in (the width is the gap between opposite sides), so a ring a tile deep glows and the middle of a large city stays clear.
 * Each edge's fade is a white-to-black gradient in a mask, and the fades combine by taking the stronger
 * (mix-blend-mode lighten), so where two edges meet the glow never passes CITY_GLOW_MAX. One colour fill through the
 * mask; no line. `id` names the mask and its gradients and is unique on the board.
 */
export function CityGlow(p: { id: string; edges: readonly number[]; colour: string }): ReactElement | null {
  if (p.edges.length === 0) return null;
  const c = topCorners();
  const face = pts(c);
  const mid = (i: number): Pt => {
    const a = c[i % 6]!, b = c[(i + 1) % 6]!;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const fades = p.edges.map((d) => {
    const i = cornerEdge(d);
    return { d, from: mid(i), to: mid(i + 3) };
  });
  return (
    <g pointerEvents="none" data-city-glow={p.edges.join(',')}>
      <defs>
        {fades.map((f) => (
          <linearGradient key={f.d} id={`${p.id}-${f.d}`} gradientUnits="userSpaceOnUse" x1={r1(f.from.x)} y1={r1(f.from.y)} x2={r1(f.to.x)} y2={r1(f.to.y)}>
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset={CITY_GLOW_FADE} stopColor="#000000" />
          </linearGradient>
        ))}
        <mask id={p.id} maskUnits="userSpaceOnUse" x={-60} y={-60} width={120} height={120}>
          <g style={{ isolation: 'isolate' }}>
            <polygon points={face} fill="#000000" />
            {fades.map((f) => <polygon key={f.d} points={face} fill={`url(#${p.id}-${f.d})`} style={{ mixBlendMode: 'lighten' }} />)}
          </g>
        </mask>
      </defs>
      <polygon points={face} fill={p.colour} fillOpacity={CITY_GLOW_MAX} mask={`url(#${p.id})`} />
    </g>
  );
}

export function groundFor(tile: Tile, hasCity: boolean): 'grass' | 'water' | 'rock' | 'sand' {
  if (hasCity) return 'sand';
  if (tile.terrain === 'water') return 'water';
  if (tile.terrain === 'mountain') return 'rock';
  return 'grass';
}
