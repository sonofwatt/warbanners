import { expect, test } from 'vitest';
import { createMatch, RULES_VERSION } from '../engine';
import type { MatchSettings } from '../engine';
import { newRecord, restore } from './record';
import { deleteSave, listSaves, readSave, writeSave } from './saves';
import type { KeyValue } from './saves';

const SETTINGS: MatchSettings = { seed: 42, factions: ['spartans', 'mongols'] };
function fake(): KeyValue & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: k => { map.delete(k); } };
}
const rec = (id: string, at: number) => ({ ...newRecord(id, SETTINGS, ['Ann', 'Ben'], at) });
const start = createMatch(SETTINGS);
test('a save is listed with what the home screen needs', () => {
  const kv = fake();
  expect(writeSave(kv, rec('a', 10), start)).toBe(true);
  expect(listSaves(kv)).toEqual([{ id: 'a', names: ['Ann', 'Ben'], factions: ['spartans', 'mongols'], round: 1, current: 0, over: false, resumable: true, updatedAt: 10 }]);
  expect(restore(readSave(kv, 'a')).ok).toBe(true);
});
test('newest first, and the oldest goes when there are more than five', () => {
  const kv = fake();
  for (const [id, at] of [['a', 10], ['b', 30], ['c', 20], ['d', 40], ['e', 50], ['f', 60]] as const) writeSave(kv, rec(id, at), start);
  expect(listSaves(kv).map(s => s.id)).toEqual(['f', 'e', 'd', 'b', 'c']);
  expect(kv.map.has('banners.save.a')).toBe(false);
});
test('writing the same match again replaces it', () => {
  const kv = fake(); writeSave(kv, rec('a', 10), start); writeSave(kv, rec('a', 99), start);
  expect(listSaves(kv).map(s => s.updatedAt)).toEqual([99]);
});
test('a phone that refuses to store does not break anything', () => {
  const full: KeyValue = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
  expect(writeSave(full, rec('a', 10), start)).toBe(false);
  const blocked: KeyValue = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); }, removeItem: () => { throw new Error('SecurityError'); } };
  expect(listSaves(blocked)).toEqual([]); expect(readSave(blocked, 'a')).toBeNull(); expect(() => deleteSave(blocked, 'a')).not.toThrow();
});
test('broken entries are dropped and old versions are marked', () => {
  const kv = fake(); writeSave(kv, rec('a', 10), start); writeSave(kv, rec('b', 20), start); writeSave(kv, rec('c', 30), start);
  kv.map.set('banners.save.a', '{not json'); kv.map.delete('banners.save.b');
  kv.map.set('banners.save.c', JSON.stringify({ ...rec('c', 30), rulesVersion: RULES_VERSION + 1 }));
  expect(listSaves(kv).map(s => [s.id, s.resumable])).toEqual([['c', false]]);
  kv.map.set('banners.saves.v1', 'rubbish'); expect(listSaves(kv)).toEqual([]);
});
test('delete removes the body and the entry', () => {
  const kv = fake(); writeSave(kv, rec('a', 10), start); deleteSave(kv, 'a');
  expect(listSaves(kv)).toEqual([]); expect(kv.map.has('banners.save.a')).toBe(false);
});
test('a damaged list entry is dropped, not passed on', () => {
  const kv = fake(); writeSave(kv, rec('a', 10), start); writeSave(kv, rec('b', 20), start);
  const list = JSON.parse(kv.map.get('banners.saves.v1')!);
  delete list.find((e: any) => e.id === 'a').names;
  list.find((e: any) => e.id === 'b').factions = 'x';
  kv.map.set('banners.saves.v1', JSON.stringify(list));
  expect(listSaves(kv)).toEqual([]);
});
