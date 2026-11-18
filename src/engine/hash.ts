import type { MatchState } from './types';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const k of Object.keys(o).sort()) {
      if (o[k] === undefined) continue;
      parts.push(`${JSON.stringify(k)}:${canonical(o[k])}`);
    }
    return `{${parts.join(',')}}`;
  }
  const j = JSON.stringify(value);
  return j === undefined ? 'null' : j;
}

const PRIME = 0x01000193;
const BASE_A = 0x811c9dc5;
const BASE_B = PRIME ^ BASE_A;

function fnv1a(text: string, base: number): string {
  let h = base >>> 0;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), PRIME) >>> 0;
  }
  let out = h.toString(16);
  while (out.length < 8) out = `0${out}`;
  return out;
}

export function hashState(s: MatchState): string {
  const text = canonical(s);
  return fnv1a(text, BASE_A) + fnv1a(text, BASE_B);
}
