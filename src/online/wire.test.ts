import { expect, test } from 'vitest';
import type { Action, MatchSettings } from '../engine';
import { MAX_ACTIONS, codeFromSearch, decodeAction, decodeSettings, encodeAction, encodeSettings, factionsFor, inviteLink,
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

// Fix round 1: hostile input.
const base = { meta, members: { u1: 0 } };
test('a head must name a seat and a count, else it is dropped', () => {
  const head = { n: 4, seat: 1, hash: 'h', at: 9, turnAt: 8, paused: 0 };
  expect(normalizeRoom('ABC234', { ...base, head })!.head).toEqual(head);
  for (const bad of [{ seat: 7 }, { seat: -1 }, { seat: 1.5 }, { seat: '1' }, { n: -1 }, { n: 1.5 }, { n: '4' }, { n: null }, { hash: 7 }]) {
    expect(normalizeRoom('ABC234', { ...base, head: { ...head, ...bad } })!.head).toBeNull();
  }
  expect(normalizeRoom('ABC234', { ...base, head: { ...head, at: 'x', turnAt: Infinity, paused: null } })!.head).toEqual({ ...head, at: 0, turnAt: 0, paused: 0 });
  expect(normalizeRoom('ABC234', { ...base, head: [1, 2] })!.head).toBeNull();
});
test('presence, members and desync survive hostile shapes', () => {
  const long = 'x'.repeat(129);
  const r = normalizeRoom('ABC234', {
    meta,
    members: { u1: 0, u2: 1, u3: 2, u4: '1', u5: null, [long]: 0 },
    presence: { u1: { on: true, at: 5 }, u2: { on: 'yes', at: 1 }, u3: 7, u4: { on: false, at: 'x' }, [long]: { on: true, at: 1 } },
    desync: { u1: { n: 1, hash: 'h', build: 'b'.repeat(100) }, u2: { n: 1, hash: 7 }, [long]: { n: 1, hash: 'h', build: 'b' } },
  })!;
  expect(r.members).toEqual({ u1: 0, u2: 1 });
  expect(r.presence).toEqual({ u1: { on: true, at: 5 }, u4: { on: false, at: 0 } });
  expect(Object.keys(r.desync)).toEqual(['u1']);
  expect(r.desync.u1!.build).toHaveLength(64);
});
test('members given as an array are ignored, not read by index', () => {
  expect(normalizeRoom('ABC234', { meta, members: [0, 1] })!.members).toEqual({});
  expect(normalizeRoom('ABC234', { meta, presence: [{ on: true, at: 1 }] })!.presence).toEqual({});
});
test('__proto__ keys never reach the result', () => {
  const raw = JSON.parse('{"meta":' + JSON.stringify(meta) + ',"members":{"__proto__":0,"u1":0},"presence":{"__proto__":{"on":true,"at":1}},"desync":{"__proto__":{"n":1,"hash":"h","build":"b"}}}');
  const r = normalizeRoom('ABC234', raw)!;
  expect(r.members).toEqual({ u1: 0 });
  expect(Object.keys(r.members)).toEqual(['u1']);
  expect(Object.getPrototypeOf(r.presence)).toBe(Object.prototype);
  expect(r.presence).toEqual({});
  expect(r.desync).toEqual({});
  expect(({} as Record<string, unknown>).on).toBeUndefined();
});
test('uids are bounded and names are not split mid-pair', () => {
  const ok = { uid: 'u'.repeat(128), name: 'Ann', kind: 'human', rules: 2 };
  expect(normalizeRoom('ABC234', { meta, seats: [ok] })!.seats[0]).toEqual(ok);
  for (const uid of ['', 'u'.repeat(129), 7]) expect(normalizeRoom('ABC234', { meta, seats: [{ ...ok, uid }] })!.seats[0]).toBeNull();
  expect(normalizeRoom('ABC234', { meta: { ...meta, creatorId: 'c'.repeat(129) } })).toBeNull();
  const name = 'a'.repeat(15) + '\u{1F600}'; // 17 units: the pair would be cut in half
  expect(normalizeRoom('ABC234', { meta, seats: [{ ...ok, name }] })!.seats[0]).toMatchObject({ name: 'a'.repeat(15) });
  expect(normalizeRoom('ABC234', { meta, seats: [{ ...ok, name: 'a'.repeat(14) + '\u{1F600}' }] })!.seats[0]).toMatchObject({ name: 'a'.repeat(14) + '\u{1F600}' });
  expect(normalizeRoom('ABC234', { meta: { ...meta, build: 'b'.repeat(100) } })!.meta.build).toHaveLength(64);
});
test('a non-canonical action string is refused, as the rules would refuse it', () => {
  for (const v of ['{ "type":"endTurn" }', '{"type":"endTurn","unit":undefined}', '{"unit":3,"type":"move","to":"1,0"}', '{"type":"end\\u0054urn"}']) {
    expect(decodeAction(v)).toBeNull();
  }
  const a = { to: '1,0', type: 'move', unit: 3 } as Action;
  expect(decodeAction(encodeAction(a))).toEqual(a);
});
test('settings refuse equal factions and seeds that are not safe non-negative integers', () => {
  for (const seed of [-1, 2 ** 53, 1e300]) expect(decodeSettings(`{"factions":["spartans","mongols"],"seed":${seed}}`)).toBeNull();
  expect(decodeSettings('{"factions":["spartans","spartans"],"seed":1}')).toBeNull();
  expect(decodeSettings('{"factions":["mongols","mongols"],"seed":1}')).toBeNull();
  expect(decodeSettings('{"factions":["mongols","spartans"],"seed":0}')).toEqual({ seed: 0, factions: ['mongols', 'spartans'] });
});
test('the action list is capped', () => {
  expect(MAX_ACTIONS).toBe(100_000);   // the rules have no turn limit: a long clock-off match must still be read
  expect(readActions(Array.from({ length: MAX_ACTIONS }, () => 'a'))).toHaveLength(MAX_ACTIONS);
  expect(readActions(Array.from({ length: MAX_ACTIONS + 1 }, () => 'a'))).toBeNull();
  const o: Record<string, string> = {};
  for (let i = 0; i <= MAX_ACTIONS; i++) o[i] = 'a';
  expect(readActions(o)).toBeNull();
});
test('an invite link works with or without a trailing slash', () => {
  expect(inviteLink('https://x.test/warbanners', 'ABC234')).toBe('https://x.test/warbanners/?room=ABC234');
  expect(inviteLink('https://x.test/warbanners/', 'ABC234')).toBe('https://x.test/warbanners/?room=ABC234');
  expect(inviteLink('http://localhost:5173/', 'ABC234')).toBe('http://localhost:5173/?room=ABC234');
});
