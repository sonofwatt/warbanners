import { expect, test } from 'vitest';
import { applyAction, createMatch, hashState, RULES_VERSION } from '../engine';
import type { FactionId } from '../engine';
import { must } from '../engine/testkit';
import { CODE_ALPHABET } from '../online/wire';
import { append, newRecord } from './record';
import { listSaves, writeSave } from './saves';
import { dueForSweep, forgetOnline, listOnline, MAX_ONLINE, readOnlineCache, rememberOnline, setPendingRoom, takePendingRoom } from './onlineList';
import type { OnlineEntry } from './onlineList';

const memKv = () => { const map = new Map<string, string>(); return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } }; };
const entry = (code: string, over: Partial<OnlineEntry> = {}): OnlineEntry => ({ code, seat: 0, names: ['Ann', 'Ben'], factions: ['spartans', 'mongols'],
  round: 3, current: 0, over: false, rulesVersion: RULES_VERSION, createdHere: true, updatedAt: 1_000, ...over });

test('online entries are swept only when created here and finished or idle', () => {
  const kv = memKv();
  rememberOnline(kv, entry('ABC234', { over: true }), null);
  rememberOnline(kv, entry('DEF567'), null);
  rememberOnline(kv, entry('GHJ789', { over: true, createdHere: false }), null);
  expect(dueForSweep(listOnline(kv), 1_000 + 86_400_001)).toEqual(['ABC234']);
  expect(dueForSweep(listOnline(kv), 1_000 + 2_592_000_001).sort()).toEqual(['ABC234', 'DEF567']);
});
test('online entries never touch the saves', () => {
  const kv = memKv(); const rec = newRecord('s1', { seed: 1, factions: ['spartans', 'mongols'] }, ['Ann', 'Ben'], 5);
  writeSave(kv, rec, createMatch(rec.settings));
  for (let i = 0; i < 25; i++) rememberOnline(kv, entry(`ABCD${CODE_ALPHABET[i]}2`, { updatedAt: i }), null);
  expect(listSaves(kv).map(s => s.id)).toEqual(['s1']);
  expect(listOnline(kv).length).toBe(MAX_ONLINE);
  expect([...kv.map.keys()].filter(k => k.startsWith('warbanners.save')).sort()).toEqual(['warbanners.save.s1', 'warbanners.saves.v1']);
});
test('the cache gives the last known board, and garbage gives nothing', () => {
  const kv = memKv(); const settings = { seed: 42, factions: ['spartans', 'mongols'] as [FactionId, FactionId] };
  const state = must(applyAction(createMatch(settings), { type: 'endTurn' }));
  const rec = append(newRecord('online-ABC234', settings, ['Ann', 'Ben'], 1), { type: 'endTurn' }, state, 2);
  rememberOnline(kv, entry('ABC234'), rec);
  const back = readOnlineCache(kv, 'ABC234')!;
  expect(back.ok && hashState(back.state)).toBe(hashState(state));
  kv.setItem('warbanners.online.DEF567', '{');
  expect(readOnlineCache(kv, 'DEF567')).toBeNull();
  forgetOnline(kv, 'ABC234'); expect(readOnlineCache(kv, 'ABC234')).toBeNull(); expect(listOnline(kv)).toEqual([]);
});
test('a pending room is read once', () => {
  const kv = memKv(); setPendingRoom(kv, 'ABC234');
  expect(takePendingRoom(kv)).toBe('ABC234'); expect(takePendingRoom(kv)).toBeNull();
  kv.setItem('warbanners.online.pending', 'nonsense'); expect(takePendingRoom(kv)).toBeNull();
});
test('a corrupt list reads as empty', () => {
  const kv = memKv(); kv.setItem('warbanners.online.v1', '[{"code":7}]'); expect(listOnline(kv)).toEqual([]);
});
test('the oldest finished entries go first when the list is full, and their cache goes too', () => {
  const kv = memKv();
  const settings = { seed: 42, factions: ['spartans', 'mongols'] as [FactionId, FactionId] };
  const rec = newRecord('online-AAAAA2', settings, ['Ann', 'Ben'], 1);
  for (let i = 0; i < MAX_ONLINE; i++) rememberOnline(kv, entry(`${CODE_ALPHABET[i]}AAAA2`, { updatedAt: 100 + i, over: i === 5 }), i === 5 ? rec : null);
  expect(kv.map.has('warbanners.online.FAAAA2')).toBe(true);
  rememberOnline(kv, entry('ZZZZZ2', { updatedAt: 500 }), null);
  const codes = listOnline(kv).map(e => e.code);
  expect(codes).toHaveLength(MAX_ONLINE);
  expect(codes).not.toContain('FAAAA2');
  expect(codes).toContain('AAAAA2');
  expect(codes[0]).toBe('ZZZZZ2');
  expect(kv.map.has('warbanners.online.FAAAA2')).toBe(false);
});
test('a failing store never throws', () => {
  const bad = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, removeItem: () => { throw new Error('no'); } };
  expect(listOnline(bad)).toEqual([]);
  expect(() => { rememberOnline(bad, entry('ABC234'), null); forgetOnline(bad, 'ABC234'); setPendingRoom(bad, 'ABC234'); }).not.toThrow();
  expect(readOnlineCache(bad, 'ABC234')).toBeNull();
  expect(takePendingRoom(bad)).toBeNull();
});
