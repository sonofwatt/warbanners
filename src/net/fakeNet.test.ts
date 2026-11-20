/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test } from 'vitest';
import { RULES_VERSION, type MatchSettings } from '../engine';
import { makeRoomCode } from '../online/wire';
import { contract, type ContractKit } from './contract';
import { allowed, fakeServer, patched, RULES_SHA256, type FakeServer } from './fakeNet';
import type { Append, Net } from './net';
import { appendPatch } from './patches';

const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

contract('fakeNet', async () => {
  const server = fakeServer();
  const uids = new Map<Net, string>();
  const make = (uid: string): Net => { const n = server.as(uid); uids.set(n, uid); return n; };
  const kit: ContractKit = {
    a: make('uid-ann'), b: make('uid-ben'), c: make('uid-cy'),
    async ageTurn(code, ms) {
      const head = (server.tree() as { rooms: Record<string, { head: { turnAt: number } }> }).rooms[code]!.head;
      server.write(`rooms/${code}/head/turnAt`, head.turnAt - ms);
      await flush();
    },
    async stopPresence(net) { server.drop(uids.get(net)!); await server.back(uids.get(net)!); },
    drop: (net) => server.drop(uids.get(net)!),
    back: (net) => server.back(uids.get(net)!),
    async wait(ms) { server.setNow(server.now() + ms); await flush(); },
    async forge(code, path, value) { server.write(`rooms/${code}/${path}`, value); await flush(); },
  };
  return kit;
});

// The rules beyond the contract that the fake must mirror (database.rules.json and rules.emu.test.ts prove the real
// side). Each test here goes red when its clause is taken out of `allowed`.
describe('fakeNet mirrors the deployed rules', () => {
  const SETTINGS: MatchSettings = { seed: 42, factions: ['spartans', 'mongols'] };
  const H = '0123456789abcdef';
  let server: FakeServer; let a: Net; let b: Net; let c: Net; let code: string;
  const room = (): Record<string, unknown> | undefined =>
    (server.tree() as { rooms?: Record<string, Record<string, unknown>> }).rooms?.[code];
  const step = (action: string, extra: Partial<Append> = {}): Append =>
    ({ n: 0, action, seatAfter: 0, hash: H, turnPassed: false, over: false, snap: null, adapt: null, ...extra });
  beforeEach(async () => {
    server = fakeServer(); a = server.as('uid-ann'); b = server.as('uid-ben'); c = server.as('uid-cy');
    code = makeRoomCode();
    expect(await a.create({ code, name: 'Ann', hostFaction: 'spartans', clock: 120, rulesVersion: RULES_VERSION, build: 't' })).toBe(true);
  });
  const start = async (): Promise<void> => {
    expect(await a.start(code, SETTINGS, H)).toBe(true);
  };

  test('the current player cannot resign for the other seat, in any spelling, nor send a backslash', async () => {
    await b.join(code, 'Ben', RULES_VERSION); await start();
    for (const s of ['{"player":1,"type":"resign"}', '{"type":"resign","player":1}', '{"player": 1,"type":"resign"}', '{"player":0,"type":"move"}', '{"type":"mo\\u0076e"}']) {
      expect(await a.append(code, step(s, { over: true, snap: '{}' })), s).toBe('refused');
    }
    expect(await a.append(code, step('{"player":0,"type":"resign"}', { over: true, snap: '{}' }))).toBe(true);
  });
  test('an endTurn must hand the turn to the other seat, start its clock now and clear the pause', async () => {
    await b.join(code, 'Ben', RULES_VERSION); await start();
    expect(await a.append(code, step('{"type":"endTurn"}', { seatAfter: 0, turnPassed: true }))).toBe('refused');
    expect(await a.append(code, step('{"type":"endTurn"}', { seatAfter: 1, turnPassed: false }))).toBe('refused');
    const p = appendPatch(step('{"type":"endTurn"}', { seatAfter: 1, turnPassed: true }));
    const now = server.now();
    expect(allowed('uid-ann', room(), patched(room(), p, now), Object.keys(p), now)).toBe(true);
    expect(allowed('uid-ann', room(), patched(room(), { ...p, 'head/paused': 5 }, now), Object.keys(p), now)).toBe(false);
    const stale = { ...p, 'head/turnAt': now - 1 };
    expect(allowed('uid-ann', room(), patched(room(), stale, now), Object.keys(stale), now)).toBe(false);
    expect(await a.append(code, step('{"type":"endTurn"}', { seatAfter: 1, turnPassed: true }))).toBe(true);
  });
  test('a resign moves the turn only when it ends the match', async () => {
    await b.join(code, 'Ben', RULES_VERSION); await start();
    expect(await a.append(code, step('{"player":0,"type":"resign"}', { seatAfter: 1, turnPassed: true }))).toBe('refused');
    expect(await a.append(code, step('{"player":0,"type":"resign"}', { seatAfter: 1, turnPassed: true, over: true, snap: '{}' }))).toBe(true);
  });
  test("an AI seat's dial moves only on that seat's own append, by the host", async () => {
    const bot = { uid: 'ai_1', name: 'Bot', kind: 'ai', level: 'adaptive', salt: 5, adapt: { dial: 0.5, trend: 0 } } as const;
    expect(await b.setAiSeat(code, 1, bot)).toBe('refused');
    expect(await a.setAiSeat(code, 1, bot)).toBe(true);
    await start();
    const dial = { seat: 1 as const, value: { dial: 0.6, trend: 1 } };
    expect(await a.append(code, step('{"type":"endTurn"}', { seatAfter: 1, turnPassed: true, adapt: dial }))).toBe('refused');
    expect(await a.append(code, step('{"type":"endTurn"}', { seatAfter: 1, turnPassed: true }))).toBe(true);
    expect(await a.setAiSeat(code, 1, bot)).toBe('refused');                                    // lobby only
    expect(await a.append(code, step('{"type":"endTurn"}', { n: 1, seatAfter: 0, turnPassed: true, adapt: dial }))).toBe(true);
    expect((room()!.seats as Record<string, { adapt: unknown }>)['1']!.adapt).toEqual({ dial: 0.6, trend: 1 });
  });
  test('a desync needs the room and a member; a non-member\'s entry is cleared by any member', async () => {
    await b.join(code, 'Ben', RULES_VERSION);
    await c.reportDesync(code, { n: 0, hash: H, build: 'x' });
    await c.reportDesync('ZZZZZZ', { n: 0, hash: H, build: 'x' });
    expect(room()!.desync).toBeUndefined();
    expect((server.tree() as { rooms: Record<string, unknown> }).rooms.ZZZZZZ).toBeUndefined();
    server.write(`rooms/${code}/desync/gone`, { n: 0, hash: H, build: 'x' });
    const clear = { 'desync/gone': null };
    expect(allowed('uid-cy', room(), patched(room(), clear, server.now()), Object.keys(clear), server.now())).toBe(false);
    expect(allowed('uid-ben', room(), patched(room(), clear, server.now()), Object.keys(clear), server.now())).toBe(true);
  });
  test('a room with no meta may be removed by anyone, and created over', async () => {
    const debris = makeRoomCode();
    server.write(`rooms/${debris}/desync/u9`, { n: 1, hash: H, build: 'x' });
    expect(await c.remove(debris)).toBe(true);
    server.write(`rooms/${debris}/presence/u9`, { on: false, at: 1 });
    expect(await b.create({ code: debris, name: 'Ben', hostFaction: 'mongols', clock: 60, rulesVersion: RULES_VERSION, build: 't' })).toBe(true);
    expect(await c.remove(debris)).toBe(false);
    expect(await b.remove(debris)).toBe(true);
  });
  test('a return credit is bounded by the time away, even on a long turn', async () => {
    await b.join(code, 'Ben', RULES_VERSION); await start();
    expect(await a.present(code, null)).toBe(true);
    server.setNow(server.now() + 100_000);                     // the turn is 100 s old
    server.drop('uid-ann');
    server.setNow(server.now() + 1_500);                       // away for 1.5 s
    await server.back('uid-ann');
    expect(await a.present(code, 5_000)).toBe('refused');
    expect(await a.present(code, 1_000)).toBe(true);
  });
  test('drop and back tell the watcher in the SDK order; hold queues data events until release', async () => {
    await b.join(code, 'Ben', RULES_VERSION);
    const seen: string[] = [];
    const settle = async (): Promise<void> => { for (let i = 0; i < 50 && !server.idle(); i++) await Promise.resolve(); };
    const off = b.watch(code, {
      room: (r) => seen.push(`room ${r?.meta.clock}`), actions: () => {}, connected: (ok) => seen.push(`connected ${ok}`),
    });
    await settle();
    expect(seen).toEqual(['connected true', 'room 120']);
    server.drop('uid-ben');
    expect(await a.setLobby(code, { clock: 60 })).toBe(true);
    await settle();
    expect(seen.slice(2)).toEqual(['connected false']);                    // a dropped phone's callbacks stop
    await server.back('uid-ben');
    await settle();
    expect(seen.slice(3)).toEqual(['connected true', 'room 60']);          // connected first, then the fresh tree
    server.hold('uid-ben');
    expect(await a.setLobby(code, { clock: 180 })).toBe(true);
    await settle();
    expect(seen).toHaveLength(5);
    server.release('uid-ben');
    await settle();
    expect(seen.slice(5)).toEqual(['room 180']);
    expect(server.idle()).toBe(true);
    off();
  });
  test('a held write lands in order on back, and a create can be made to answer a refusal', async () => {
    await b.join(code, 'Ben', RULES_VERSION); await start();
    server.drop('uid-ann');
    const first = a.append(code, step('{"to":"1,0","type":"move","unit":0}'));
    const second = a.append(code, step('{"type":"endTurn"}', { n: 1, seatAfter: 1, turnPassed: true }));
    await server.back('uid-ann');
    expect([await first, await second]).toEqual([true, true]);
    expect(server.log().filter((w) => w.uid === 'uid-ann').map((w) => w.paths[0]).slice(-2))
      .toEqual([`rooms/${code}/actions/0`, `rooms/${code}/actions/1`]);
    server.failCreatesWith('schema');
    expect(await c.create({ code: makeRoomCode(), name: 'Cy', hostFaction: 'spartans', clock: 0, rulesVersion: RULES_VERSION, build: 't' })).toBe('schema');
  });
});


describe('the fake stays tied to the deployed rules', () => {
  test('database.rules.json is the file allowed() was checked against', () => {
    const now = createHash('sha256').update(readFileSync('database.rules.json')).digest('hex');
    expect(now, 'database.rules.json changed: re-check allowed() in src/net/fakeNet.ts against every changed clause, '
      + 'add a fakeNet test for it, then set RULES_SHA256 to the new hash').toBe(RULES_SHA256);
  });
  test('the fake and its readings load without the Firebase SDK', () => {
    for (const f of ['fakeNet.ts', 'read.ts', 'patches.ts', 'contract.ts', 'net.ts']) {
      expect(readFileSync(`src/net/${f}`, 'utf8'), f).not.toMatch(/from\s+['"](?:firebase|@firebase)\/|from\s+['"]\.\/(?:firebase|firebaseNet)['"]/);
    }
  });
});
