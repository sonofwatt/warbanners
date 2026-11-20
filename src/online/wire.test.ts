import { expect, test } from 'vitest';
import type { Action, MatchSettings } from '../engine';
import { codeFromSearch, decodeAction, decodeSettings, encodeAction, encodeSettings, factionsFor, inviteLink,
  isRoomCode, liveDesync, makeRoomCode, normalizeRoom, readActions, toRecordSeat } from './wire';

test('room codes', () => {
  expect(makeRoomCode(() => 0)).toBe('AAAAAA');
  expect(makeRoomCode(() => 0.9999)).toBe('999999');
  expect(makeRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  expect(isRoomCode('ABC234')).toBe(true);
  for (const v of ['abc234', 'ABC23', 'ABC2340', 'ABCO34', 'ABC1I4', 7, null]) expect(isRoomCode(v)).toBe(false);
});
test('invite links', () => {
  expect(inviteLink('https://sonofwatt.github.io/warbanners/', 'ABC234')).toBe('https://sonofwatt.github.io/warbanners/?room=ABC234');
  expect(codeFromSearch('?room=abc234')).toBe('ABC234');
  expect(codeFromSearch('?seed=7&room=%20ABC234%20')).toBe('ABC234');
  expect(codeFromSearch('?room=ABC')).toBeNull(); expect(codeFromSearch('')).toBeNull();
});
test('factions follow the host', () => {
  expect(factionsFor('mongols')).toEqual(['mongols', 'spartans']);
  expect(factionsFor('spartans')).toEqual(['spartans', 'mongols']);
});
test('actions are canonical strings the rules can match', () => {
  expect(encodeAction({ type: 'endTurn' })).toBe('{"type":"endTurn"}');
  expect(encodeAction({ type: 'resign', player: 1 })).toBe('{"player":1,"type":"resign"}');
  expect(encodeAction({ to: '1,0', unit: 3, type: 'move' } as Action)).toBe('{"to":"1,0","type":"move","unit":3}');
  expect(decodeAction('{"type":"endTurn"}')).toEqual({ type: 'endTurn' });
  for (const v of ['{', '[]', '"x"', '{"type":7}', 'x'.repeat(513), 7, null]) expect(decodeAction(v)).toBeNull();
});
test('settings survive the database', () => {
  const s: MatchSettings = { seed: 4294967295, factions: ['spartans', 'mongols'] };
  expect(decodeSettings(encodeSettings(s))).toEqual(s);
  for (const v of ['{"seed":1}', '{"seed":1.5,"factions":["spartans","mongols"]}', '{"seed":1,"factions":["spartans","elves"]}', 7]) {
    expect(decodeSettings(v)).toBeNull();
  }
});
test('the action list comes back as an array or an object', () => {
  expect(readActions(['a', 'b'])).toEqual(['a', 'b']);
  expect(readActions({ 0: 'a', 1: 'b', 2: 'c' })).toEqual(['a', 'b', 'c']);
  expect(readActions(null)).toEqual([]);
  expect(readActions({ 0: 'a', 2: 'c' })).toBeNull();
  expect(readActions(['a', null, 'c'])).toBeNull();
  expect(readActions(['a', 7])).toBeNull();
});
const meta = { createdAt: 5, creatorId: 'u1', hostId: 'u1', schema: 1, rulesVersion: 2, build: 'abc1234', clock: 120, hostFaction: 'spartans', phase: 'lobby' };
test('a room is read defensively', () => {
  const r = normalizeRoom('ABC234', { meta, seats: [{ uid: 'u1', name: 'A very long name indeed', kind: 'human', rules: 2 }], members: { u1: 0 } })!;
  expect(r.seats).toEqual([{ uid: 'u1', name: 'A very long name', kind: 'human', rules: 2 }, null]);
  expect(r.head).toBeNull(); expect(r.presence).toEqual({});
  expect(normalizeRoom('ABC234', { meta, seats: { 1: { uid: 'u2', name: 'Ben', kind: 'robot' } } })!.seats).toEqual([null, null]);
  for (const bad of [{ phase: 'nope' }, { clock: 45 }, { hostFaction: 'elves' }, { creatorId: 7 }, { schema: 0 }, { schema: 'x' }]) {
    expect(normalizeRoom('ABC234', { meta: { ...meta, ...bad } })).toBeNull();
  }
  for (const v of [null, 7, 'x', [], {}]) expect(normalizeRoom('ABC234', v)).toBeNull();
});
test('a room from a newer wire schema keeps its schema, so the session can refuse it', () => {
  expect(normalizeRoom('ABC234', { meta: { ...meta, schema: 2 } })!.meta.schema).toBe(2);
});
test('an AI seat keeps its salt and dial, and maps onto the record seat', () => {
  const ai = { uid: 'ai_1', name: 'Bot', kind: 'ai', level: 'adaptive', salt: 99, adapt: { dial: 0.4, trend: 0.01 } };
  const r = normalizeRoom('ABC234', { meta, seats: [null, ai] })!;
  expect(r.seats[1]).toEqual(ai);
  expect(toRecordSeat(r.seats[1]!)).toEqual({ name: 'Bot', kind: 'ai', level: 'adaptive', salt: 99, adapt: { dial: 0.4, trend: 0.01 } });
  expect(normalizeRoom('ABC234', { meta, seats: [null, { ...ai, salt: 'x' }] })!.seats[1]).toBeNull();
});
test('only a member\'s desync entry counts', () => {
  const d = { n: 3, hash: '0123456789abcdef', build: 'x' };
  const r = normalizeRoom('ABC234', { meta, members: { u1: 0 }, desync: { u1: d, gone: d } })!;
  expect(liveDesync(r)).toEqual([d]);
});
