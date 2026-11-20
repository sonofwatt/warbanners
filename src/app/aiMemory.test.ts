import { expect, test } from 'vitest';
import { MEMORY_KEY, readDial, writeDial } from './aiMemory';
import type { KeyValue } from './saves';

function fakeKv(): KeyValue {
  const map = new Map<string, string>();
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: k => { map.delete(k); } };
}
function throwingKv(): KeyValue {
  const fail = (): never => { throw new Error('SecurityError'); };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

test('remembered per name, safe when storage is damaged or refuses', () => {
  const kv = fakeKv();
  expect(readDial(kv, 'Ann')).toBe(0.5);
  writeDial(kv, ' ann ', 0.67); expect(readDial(kv, 'ANN')).toBe(0.67); expect(readDial(kv, 'Ben')).toBe(0.5);
  kv.setItem(MEMORY_KEY, '{not json'); expect(readDial(kv, 'Ann')).toBe(0.5);
  kv.setItem(MEMORY_KEY, JSON.stringify({ ann: 'high' })); expect(readDial(kv, 'Ann')).toBe(0.5);
  kv.setItem(MEMORY_KEY, JSON.stringify({ ann: 7 })); expect(readDial(kv, 'Ann')).toBe(0.95);
  expect(() => writeDial(throwingKv(), 'Ann', 0.4)).not.toThrow();
  expect(readDial(throwingKv(), 'Ann')).toBe(0.5);
});

test('writing keeps the other players and survives a damaged store', () => {
  const kv = fakeKv();
  writeDial(kv, 'Ann', 0.6); writeDial(kv, 'Ben', 0.3);
  expect(readDial(kv, 'Ann')).toBe(0.6); expect(readDial(kv, 'Ben')).toBe(0.3);
  kv.setItem(MEMORY_KEY, '[1,2]'); writeDial(kv, 'Cy', 0.4);
  expect(readDial(kv, 'Cy')).toBe(0.4);
});
