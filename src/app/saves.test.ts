import { expect, test } from 'vitest';
import { createMatch, RULES_VERSION } from '../engine';
import type { MatchSettings } from '../engine';
import { newRecord, restore } from './record';
import { deleteSave, listSaves, MAX_SAVES, readSave, writeSave } from './saves';
import type { KeyValue } from './saves';

const SETTINGS: MatchSettings = { seed: 42, factions: ['spartans', 'mongols'] };
function fake(): KeyValue & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: k => { map.delete(k); } };
}
const rec = (id: string, at: number) => ({ ...newRecord(id, SETTINGS, ['Ann', 'Ben'], at) });
const start = createMatch(SETTINGS);
const over = { ...start, winner: 0 as const };
const SAVED = { saved: true, droppedUnfinished: false };
test('a save is listed with what the home screen needs', () => {
  const kv = fake();
  expect(writeSave(kv, rec('a', 10), start)).toEqual(SAVED);
  expect(listSaves(kv)).toEqual([{ id: 'a', names: ['Ann', 'Ben'], factions: ['spartans', 'mongols'], round: 1, current: 0, over: false, resumable: true, updatedAt: 10 }]);
  expect(restore(readSave(kv, 'a')).ok).toBe(true);
});
test('newest first', () => {
  const kv = fake();
  for (const [id, at] of [['a', 10], ['b', 30], ['c', 20]] as const) writeSave(kv, rec(id, at), start);
  expect(listSaves(kv).map(s => s.id)).toEqual(['b', 'c', 'a']);
});
test('twenty saves are kept', () => {
  expect(MAX_SAVES).toBe(20);
  const kv = fake();
  for (let i = 0; i < 20; i++) expect(writeSave(kv, rec(`m${i}`, 100 + i), start)).toEqual(SAVED);
  expect(listSaves(kv)).toHaveLength(20);
});
test('the match being written is never dropped, even when the clock has gone back', () => {
  const kv = fake();
  for (let i = 0; i < 20; i++) writeSave(kv, rec(`m${i}`, 100 + i), i % 2 === 0 ? over : start);
  // The phone's clock went back: the match now being played has the oldest time of all.
  expect(writeSave(kv, rec('now', 5), start)).toEqual(SAVED);
  expect(listSaves(kv).map(s => s.id)).toContain('now');
  expect(kv.map.has('banners.save.now')).toBe(true);
  expect(writeSave(kv, rec('now', 6), start)).toEqual(SAVED);
  expect(listSaves(kv).map(s => s.id)).toContain('now');
});
test('finished matches go first, oldest first', () => {
  const kv = fake();
  // m0 is the oldest of all and unfinished; m3 and m7 are finished, m7 the older of the two by time.
  for (let i = 0; i < 20; i++) writeSave(kv, rec(`m${i}`, i === 7 ? 1 : 100 + i), i === 3 || i === 7 ? over : start);
  expect(writeSave(kv, rec('n1', 500), start)).toEqual(SAVED);
  let ids = listSaves(kv).map(s => s.id);
  expect(ids).toHaveLength(20); expect(ids).not.toContain('m7'); expect(ids).toContain('m0'); expect(ids).toContain('m3');
  expect(kv.map.has('banners.save.m7')).toBe(false);
  expect(writeSave(kv, rec('n2', 501), start)).toEqual(SAVED);
  ids = listSaves(kv).map(s => s.id);
  expect(ids).not.toContain('m3'); expect(ids).toContain('m0');
});
test('only when twenty unfinished matches are kept does the oldest other one go, and it says so', () => {
  const kv = fake();
  for (let i = 0; i < 20; i++) writeSave(kv, rec(`m${i}`, 100 + i), start);
  // The new match has the oldest time (clock gone back), yet m0, the oldest other one, is the one dropped.
  expect(writeSave(kv, rec('new', 1), start)).toEqual({ saved: true, droppedUnfinished: true });
  const ids = listSaves(kv).map(s => s.id);
  expect(ids).toHaveLength(20); expect(ids).toContain('new'); expect(ids).not.toContain('m0');
  expect(kv.map.has('banners.save.m0')).toBe(false);
});
test('writing the same match again replaces it', () => {
  const kv = fake(); writeSave(kv, rec('a', 10), start); writeSave(kv, rec('a', 99), start);
  expect(listSaves(kv).map(s => s.updatedAt)).toEqual([99]);
});
test('a phone that refuses to store does not break anything', () => {
  const full: KeyValue = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
  expect(writeSave(full, rec('a', 10), start)).toEqual({ saved: false, droppedUnfinished: false });
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
