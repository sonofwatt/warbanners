// The AI's remembered skill level for each player name, kept on the phone.
import { ADAPT } from '../ai/adapt';
import type { KeyValue } from './saves';

export const MEMORY_KEY = 'banners.ai.adaptive.v1';

const nameKey = (name: string): string => name.trim().toLowerCase();

function readAll(kv: KeyValue): Record<string, unknown> {
  try {
    const raw = kv.getItem(MEMORY_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function readDial(kv: KeyValue, name: string): number {
  const k = nameKey(name);
  const all = readAll(kv);
  const v = Object.hasOwn(all, k) ? all[k] : undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) return ADAPT.start;
  return Math.min(ADAPT.max, Math.max(ADAPT.min, v));
}

export function writeDial(kv: KeyValue, name: string, dial: number): void {
  try {
    const all = readAll(kv);
    all[nameKey(name)] = dial;
    kv.setItem(MEMORY_KEY, JSON.stringify(all));
  } catch {
    // storage refused: the level is simply not remembered
  }
}
