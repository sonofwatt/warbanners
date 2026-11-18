export type Hex = { q: number; r: number };
export type HexKey = string;

export const DIRS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function key(h: Hex): HexKey {
  return `${h.q},${h.r}`;
}

export function parseKey(k: HexKey): Hex {
  const [q, r] = k.split(',');
  return { q: Number(q), r: Number(r) };
}

export function add(a: Hex, b: Hex): Hex {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function distance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function neighbors(h: Hex): Hex[] {
  return DIRS.map((d) => add(h, d));
}

export function range(center: Hex, radius: number): Hex[] {
  const out: Hex[] = [];
  for (let dr = -radius; dr <= radius; dr++) {
    const qMin = Math.max(-radius, -dr - radius);
    const qMax = Math.min(radius, -dr + radius);
    for (let dq = qMin; dq <= qMax; dq++) {
      out.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return out;
}

// 0 - x rather than -x so that zero never becomes -0.
export function mirror(h: Hex): Hex {
  return { q: 0 - h.q, r: 0 - h.r };
}
