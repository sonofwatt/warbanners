// mulberry32: the state is a uint32 and each step returns a uint32.
export function rngNext(state: number): [value: number, next: number] {
  let t = (state + 0x6d2b79f5) >>> 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [(t ^ (t >>> 14)) >>> 0, next];
}

export function rngInt(state: number, n: number): [value: number, next: number] {
  const [v, next] = rngNext(state);
  return [v % n, next];
}
