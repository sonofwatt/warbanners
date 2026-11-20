/// <reference types="node" />
import { readFileSync } from 'node:fs';
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setLogLevel } from 'firebase/app';
import { get, ref, remove, serverTimestamp, set, update, type Database } from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createMatch, hashState, type MatchSettings, type PlayerId } from '../engine';
import {
  aiSeatPatch, appendPatch, createPatch, joinPatch, lobbyPatch, presentPatch, startPatch, takeoverPatch,
} from './patches';

// The project id is deliberately not the app's namespace (demo-banners), so loading rules here can never mask a
// broken app namespace: src/net/firebase.emu.test.ts has its own canary for that one.

const emu = describe.runIf(process.env.EMULATOR === '1');

let env: RulesTestEnvironment;
const as = (uid: string): Database => env.authenticatedContext(uid).database() as unknown as Database;
const anon = (): Database => env.unauthenticatedContext().database() as unknown as Database;
const seed = (tree: Record<string, unknown>): Promise<void> =>
  env.withSecurityRulesDisabled((ctx) => update(ref(ctx.database() as unknown as Database), tree));
const clear = (): Promise<void> => env.clearDatabase();

const room = (db: Database) => ref(db, 'rooms/ABC234');
const move = '{"to":"1,0","type":"move","unit":0}';
const BOT = { uid: 'ai_1', name: 'Bot', kind: 'ai', level: 'normal', salt: 5, adapt: { dial: 0.5, trend: 0 } } as const;
const SETTINGS: MatchSettings = { seed: 42, factions: ['spartans', 'mongols'] };
const OPENING = hashState(createMatch(SETTINGS));
const HASH = '0123456789abcdef';

const human = (uid: string, name: string) => ({ uid, name, kind: 'human', rules: 2 });
const meta = (phase: string, clock: number) => ({
  createdAt: Date.now(), creatorId: 'u0', hostId: 'u0', schema: 1, rulesVersion: 2, build: 't',
  clock, hostFaction: 'spartans', phase,
});

async function seedLobby(opts: { withGuest?: boolean } = {}): Promise<void> {
  await clear();
  await seed({
    'rooms/ABC234': {
      meta: meta('lobby', 120),
      seats: opts.withGuest ? { 0: human('u0', 'Ann'), 1: human('u1', 'Ben') } : { 0: human('u0', 'Ann') },
      members: opts.withGuest ? { u0: 0, u1: 1 } : { u0: 0 },
    },
  });
}

// A started room: u0 (seat 0) and u1 (seat 1) on rules 2, a 60 s clock, two actions played, both present.
async function playing(): Promise<void> {
  await clear();
  const T = Date.now();
  await seed({
    'rooms/ABC234': {
      meta: meta('playing', 60),
      seats: { 0: human('u0', 'Ann'), 1: human('u1', 'Ben') },
      members: { u0: 0, u1: 1 },
      match: { settings: '{}', startedAt: T },
      head: { n: 2, seat: 0, hash: HASH, at: T, turnAt: T, paused: 0 },
      actions: { 0: move, 1: move },
      presence: { u0: { on: true, at: T }, u1: { on: true, at: T } },
    },
  });
}

const step = (n: number, action = move, extra: Partial<Parameters<typeof appendPatch>[0]> = {}) =>
  appendPatch({ n, action, hash: 'fedcba9876543210', seatAfter: 0, turnPassed: false, over: false, snap: null, adapt: null, ...extra });
const endTurnAt = (n: number, seatAfter: PlayerId) => step(n, '{"type":"endTurn"}', { seatAfter, turnPassed: true, snap: '{}' });
const resignAs = (n: number, seat: PlayerId) => step(n, `{"player":${seat},"type":"resign"}`, { over: true, snap: '{}' });
const create = (uid: string, over: Partial<{ clock: number; rulesVersion: number }> = {}) =>
  createPatch(uid, { name: 'Ann', hostFaction: 'spartans', clock: 120, rulesVersion: 2, build: 't', ...over } as never);
const awayFor = (uid: string, ms: number) => seed({ [`rooms/ABC234/presence/${uid}`]: { on: false, at: Date.now() - ms } });

emu('database rules', () => {
  beforeAll(async () => {
    setLogLevel('error');   // a refused write is the point of most tests here; the SDK would warn on each
    env = await initializeTestEnvironment({
      projectId: 'demo-banners-rules',
      database: { host: '127.0.0.1', port: 9010, rules: readFileSync('database.rules.json', 'utf8') },
    });
  });
  afterAll(async () => { await env.cleanup(); });
  beforeEach(async () => { await clear(); });

  test('CANARY: the rules are loaded (an unauthenticated read is refused)', async () => {
    await assertFails(get(ref(anon(), 'rooms/ABC234')));
  });
  test('reads: a signed-in user reads a room by its code, but cannot list rooms or read the root', async () => {
    await playing();
    await assertSucceeds(get(ref(as('u9'), 'rooms/ABC234')));
    await assertFails(get(ref(as('u9'), 'rooms')));
    await assertFails(get(ref(as('u9'), '/')));
    await assertFails(set(ref(as('u9'), 'other'), 1));
  });
  test('create: the creator writes meta, seat 0 and membership in one update', async () => {
    await assertSucceeds(update(room(as('u0')), create('u0')));
    await assertFails(update(ref(as('u9'), 'rooms/XYZ789'), { ...create('u9'), 'meta/schema': 0 }));      // stale code
    await assertFails(update(ref(as('u9'), 'rooms/XYZ789'), create('u9', { clock: 45 })));
    await assertFails(update(ref(as('u9'), 'rooms/XYZ789'), { ...create('u9'), 'seats/0/rules': 1 }));   // seat on other rules
    await assertFails(update(room(as('u9')), create('u9')));                                              // code taken
  });
  test('create: every clause is checked, and nothing comes in beside it', async () => {
    const other = (db: Database) => ref(db, 'rooms/XYZ789');
    await assertFails(update(other(anon()), create('u9')));                                               // signed out
    await assertFails(update(other(as('u9')), { ...create('u9'), 'meta/creatorId': 'u8' }));
    await assertFails(update(other(as('u9')), { ...create('u9'), 'meta/hostId': 'u8' }));
    await assertFails(update(other(as('u9')), { ...create('u9'), 'meta/createdAt': 1 }));
    await assertFails(update(other(as('u9')), { ...create('u9'), 'meta/phase': 'playing' }));
    await assertFails(update(other(as('u9')), { ...create('u9'), 'meta/hostFaction': 'romans' }));
    await assertFails(update(other(as('u9')), { ...create('u9'), 'seats/0/uid': 'u8' }));
    await assertFails(update(other(as('u9')), { ...create('u9'), 'seats/0/name': '' }));
    await assertFails(update(other(as('u9')), { ...create('u9'), 'seats/0/name': 'x'.repeat(17) }));
    await assertFails(update(other(as('u9')), { ...create('u9'), 'members/u9': 1 }));
    await assertFails(update(other(as('u9')), { ...create('u9'), 'meta/extra': 1 }));
    await assertFails(update(other(as('u9')), { ...create('u9'), ...joinPatch('u8', 1, 'Cy', 2) }));      // a second seat
    await assertFails(update(other(as('u9')), { ...create('u9'), 'head/n': 0 }));
    const { 'members/u9': _, ...noMember } = create('u9');
    await assertFails(update(other(as('u9')), noMember));
    const { 'meta/createdAt': __, ...noCreatedAt } = create('u9');
    await assertFails(update(other(as('u9')), noCreatedAt));
    await assertSucceeds(update(other(as('u9')), create('u9', { clock: 0 })));
    await assertFails(update(other(as('u9')), { 'meta/build': 'x' }));                                     // write once
  });
  test('join: an empty seat in the lobby, once, on the same rules', async () => {
    await seedLobby();
    await assertFails(update(room(as('u1')), joinPatch('u1', 1, 'Ben', 3)));
    await assertSucceeds(update(room(as('u1')), joinPatch('u1', 1, 'Ben', 2)));
    await assertFails(update(room(as('u2')), joinPatch('u2', 1, 'Cy', 2)));
    await assertFails(update(room(as('u1')), { 'seats/1/name': '' }));
    await assertSucceeds(update(room(as('u1')), { 'seats/1/name': 'Benny' }));
  });
  test('join: only for oneself, with a matching membership, never a seat that does not exist', async () => {
    await seedLobby();
    await assertFails(update(room(as('u2')), joinPatch('u1', 1, 'Ben', 2)));                               // for someone else
    await assertFails(update(room(as('u1')), { ...joinPatch('u1', 1, 'Ben', 2), 'members/u1': 0 }));
    await assertFails(update(room(as('u1')), { ...joinPatch('u1', 1, 'Ben', 2), 'members/u1': null }));
    await assertFails(update(room(as('u1')), joinPatch('u1', 2 as PlayerId, 'Ben', 2)));
    await assertFails(update(room(as('u0')), joinPatch('u0', 1, 'Ann', 2)));                               // already a member
    await assertFails(update(room(as('u1')), { ...joinPatch('u1', 1, 'Ben', 2), 'seats/1/kind': 'ai' }));
    await assertFails(update(room(as('u1')), { ...joinPatch('u1', 1, 'Ben', 2), 'seats/1/level': 'easy' }));
    await assertFails(update(room(as('u0')), { 'seats/1/name': 'Ben' }));                                  // a name alone
    await playing();
    await assertFails(update(room(as('u0')), { 'seats/1/name': 'Ben' }));                                  // not the owner
    await clear();
    await seed({ 'rooms/ABC234': { meta: meta('playing', 60), seats: { 0: human('u0', 'Ann') }, members: { u0: 0 } } });
    await assertFails(update(room(as('u1')), joinPatch('u1', 1, 'Ben', 2)));                               // match started
  });
  test('members: nobody writes another uid\'s membership', async () => {
    await seedLobby({ withGuest: true });
    await assertFails(update(room(as('u1')), { 'members/u5': 1 }));
    await assertFails(update(room(as('u1')), { 'members/u0': null }));
    await assertFails(update(room(as('u1')), { 'members/u1': 0 }));
    await assertFails(update(room(as('u5')), { 'members/u5': 1 }));
    await playing();
    await assertFails(update(room(as('u1')), { 'members/u5': 1 }));
  });
  test('lobby: only the host changes the clock and factions', async () => {
    await seedLobby({ withGuest: true });
    await assertFails(update(room(as('u1')), lobbyPatch({ clock: 300 })));
    await assertSucceeds(update(room(as('u0')), lobbyPatch({ clock: 300, hostFaction: 'mongols' })));
    await assertFails(update(room(as('u0')), lobbyPatch({ clock: 45 as never })));
    await assertFails(update(room(as('u0')), lobbyPatch({ hostFaction: 'romans' as never })));
    await assertFails(update(room(as('u0')), { 'meta/clock': null }));
    await assertFails(update(room(as('u0')), { 'meta/rulesVersion': 3 }));
    await assertFails(update(room(as('u0')), { 'meta/creatorId': 'u1' }));
    await playing();
    await assertFails(update(room(as('u0')), lobbyPatch({ clock: 300 })));
  });
  test('AI seats: the host, in the lobby only', async () => {
    await seedLobby();
    await assertFails(update(room(as('u1')), aiSeatPatch(1, BOT)));                                      // not the host
    await assertSucceeds(update(room(as('u0')), aiSeatPatch(1, BOT)));
    await playing();
    await assertFails(update(room(as('u0')), aiSeatPatch(1, BOT)));                                      // the guest's seat, mid-match
    await assertFails(update(room(as('u0')), { 'seats/1/kind': 'ai' }));
  });
  test('AI seats: a whole and well-formed AI seat, never over a human', async () => {
    await seedLobby();
    await assertFails(update(room(as('u0')), aiSeatPatch(1, { ...BOT, uid: 'u5' })));
    await assertFails(update(room(as('u0')), aiSeatPatch(1, { ...BOT, level: 'godlike' as never })));
    await assertFails(update(room(as('u0')), aiSeatPatch(1, { ...BOT, salt: 'x' as never })));
    await assertFails(update(room(as('u0')), aiSeatPatch(1, { ...BOT, adapt: { dial: 'x', trend: 0 } as never })));
    await assertFails(update(room(as('u0')), { ...aiSeatPatch(1, BOT), 'seats/1/rules': 2 }));
    const { 'seats/1/salt': _, ...noSalt } = aiSeatPatch(1, BOT);
    await assertFails(update(room(as('u0')), noSalt));
    await assertFails(update(room(as('u0')), aiSeatPatch(0, { ...BOT, uid: 'ai_0' })));                   // the host's own seat
    await assertSucceeds(update(room(as('u0')), aiSeatPatch(1, BOT)));
    await assertSucceeds(update(room(as('u0')), aiSeatPatch(1, { ...BOT, level: 'hard', salt: 9 })));     // replace a bot
    await seedLobby({ withGuest: true });
    await assertFails(update(room(as('u0')), aiSeatPatch(1, BOT)));                                      // a guest sits there
  });
  test('start: the host only, with both seats filled', async () => {
    await seedLobby();
    await assertFails(update(room(as('u0')), startPatch(SETTINGS, OPENING, 0)));                        // one seat
    await seedLobby({ withGuest: true });
    await assertFails(update(room(as('u1')), startPatch(SETTINGS, OPENING, 0)));
    await assertSucceeds(update(room(as('u0')), startPatch(SETTINGS, OPENING, 0)));
    await assertFails(update(room(as('u0')), startPatch(SETTINGS, OPENING, 0)));                        // match is write once
  });
  test('start: the head it writes is exactly the opening one', async () => {
    await seedLobby({ withGuest: true });
    const bad: Record<string, unknown>[] = [
      { 'head/n': 1 }, { 'head/seat': 1 }, { 'head/paused': 5 }, { 'head/at': 1 }, { 'head/turnAt': 1 },
      { 'head/hash': 'nothex' }, { 'meta/phase': 'over' },
      { match: { settings: '{}', startedAt: 1 } }, { match: { settings: '{}', startedAt: serverTimestamp(), extra: 1 } },
    ];
    for (const b of bad) await assertFails(update(room(as('u0')), { ...startPatch(SETTINGS, OPENING, 0), ...b }));
    const { match: _, ...noMatch } = startPatch(SETTINGS, OPENING, 0);
    await assertFails(update(room(as('u0')), noMatch));
    const { 'meta/phase': __, ...noPhase } = startPatch(SETTINGS, OPENING, 0);
    await assertFails(update(room(as('u0')), noPhase));
    await assertSucceeds(update(room(as('u0')), startPatch(SETTINGS, OPENING, 0)));
  });
  test('append: the current player, the next index, nothing rewritten', async () => {
    await playing();
    await assertFails(update(room(as('u1')), step(2)));                                                  // not their turn
    await assertFails(update(room(as('u0')), { ...step(2), 'actions/3': move, 'head/n': 4 }));           // skips
    await assertSucceeds(update(room(as('u0')), step(2)));
    await assertFails(set(ref(as('u0'), 'rooms/ABC234/actions/1'), '{"type":"endTurn"}'));               // rewrite
    await assertFails(remove(ref(as('u0'), 'rooms/ABC234/actions/0')));                                   // delete
    await assertFails(update(room(as('u0')), { 'head/n': 1 }));                                           // counter back
    await assertFails(update(room(as('u0')), step(3, 'x'.repeat(513))));
  });
  test('append: one string at the counter, the counter with it, only while playing', async () => {
    await playing();
    await assertFails(update(room(as('u0')), { 'actions/2': move }));                                     // no counter
    await assertFails(update(room(as('u0')), { ...step(2), 'head/n': 4 }));
    await assertFails(update(room(as('u0')), { ...step(2), 'actions/2': 7 }));
    await assertFails(update(room(as('u0')), { ...step(2), 'head/hash': 'FEDCBA9876543210' }));
    await assertFails(update(room(as('u0')), { ...step(2), 'head/hash': null }));
    await assertFails(update(room(as('u0')), { ...step(2), 'head/at': 1 }));
    await assertFails(update(room(as('u9')), step(2)));
    await assertSucceeds(update(room(as('u0')), step(2, 'x'.repeat(512))));
    await seed({ 'rooms/ABC234/meta/phase': 'over' });
    await assertFails(update(room(as('u0')), step(3)));
    await seed({ 'rooms/ABC234/meta/phase': 'playing', 'rooms/ABC234/actions/3': move });              // a forged tree
    await assertFails(update(room(as('u0')), step(3, '{"tech":"bronze","type":"research"}')));             // never over a value
  });
  test('append: the current player cannot resign for the other seat, in any spelling', async () => {
    await playing();
    for (const forged of ['{"player":1,"type":"resign"}', '{"type":"resign","player":1}',
      '{"type":"resign", "player" :1}', '{"type":"resign","\\u0070layer":1}']) {
      await assertFails(update(room(as('u0')), step(2, forged, { over: true, snap: '{}' })));
    }
    await assertSucceeds(update(room(as('u0')), resignAs(2, 0)));
  });
  test('head fields never move without an append', async () => {
    await playing();
    for (const [path, value] of [['head/turnAt', Date.now() + 600_000], ['head/hash', 'ffffffffffffffff'], ['head/seat', 1],
      ['head/at', Date.now()], ['head/paused', 5_000], ['head/n', 3]] as const) {
      await assertFails(update(room(as('u0')), { [path]: value }));
    }
    for (const path of ['head/turnAt', 'head/hash', 'head/seat', 'head/at', 'head/paused', 'head/n', 'head']) {
      await assertFails(update(room(as('u0')), { [path]: null }));
    }
    await assertFails(update(room(as('u0')), { 'head/extra': 1 }));
    await assertFails(update(room(as('u0')), { ...step(2), 'head/turnAt': Date.now() + 600_000 }));      // an append that is not a turn pass
    await assertFails(update(room(as('u0')), { ...step(2), 'head/seat': 1 }));
    await assertFails(update(room(as('u0')), { ...step(2), 'head/paused': 0, 'head/turnAt': Date.now() + 600_000 }));
  });
  test('the turn passes only with endTurn or a resign', async () => {
    await playing();
    await assertFails(update(room(as('u0')), step(2, '{"tech":"bronze","type":"research"}', { seatAfter: 1, turnPassed: true, snap: '{}' })));
    await assertFails(update(room(as('u0')), endTurnAt(2, 0)));                                         // keeps the turn
    await assertFails(update(room(as('u0')), { ...endTurnAt(2, 1), 'head/turnAt': Date.now() + 600_000 }));
    await assertFails(update(room(as('u0')), { ...endTurnAt(2, 1), 'head/paused': 5_000 }));
    const { 'head/turnAt': _, 'head/paused': __, ...staleClock } = endTurnAt(2, 1);
    await assertFails(update(room(as('u0')), staleClock));                                             // hands over a spent clock
    await assertFails(update(room(as('u0')), { ...endTurnAt(2, 1), 'head/turnAt': Date.now() - 600_000 }));
    await assertSucceeds(update(room(as('u0')), endTurnAt(2, 1)));
  });
  test('timeout: the waiting player may end the turn only once the clock has run out', async () => {
    await playing();
    await assertFails(update(room(as('u1')), endTurnAt(2, 1)));                                         // 60 s not yet up
    await seed({ 'rooms/ABC234/head/turnAt': Date.now() - 61_000 });
    await assertFails(update(room(as('u1')), step(2)));                                                   // only endTurn
    await assertFails(update(room(as('u9')), endTurnAt(2, 1)));                                         // not a member
    await assertSucceeds(update(room(as('u1')), endTurnAt(2, 1)));
  });
  test('no timeout when the clock is off', async () => {
    await playing(); await seed({ 'rooms/ABC234/meta/clock': 0, 'rooms/ABC234/head/turnAt': 1 });
    await assertFails(update(room(as('u1')), endTurnAt(2, 1)));
  });
  test('a credited pause pushes the timeout back', async () => {
    await playing(); await seed({ 'rooms/ABC234/head/turnAt': Date.now() - 61_000, 'rooms/ABC234/head/paused': 30_000 });
    await assertFails(update(room(as('u1')), endTurnAt(2, 1)));
    await seed({ 'rooms/ABC234/head/turnAt': Date.now() - 91_000 });
    await assertSucceeds(update(room(as('u1')), endTurnAt(2, 1)));
  });
  test('return credit: only the current player, only coming back, never more than the time away', async () => {
    await playing(); await seed({ 'rooms/ABC234/head/turnAt': Date.now() - 100_000 }); await awayFor('u0', 60_000);
    await assertFails(update(room(as('u0')), { 'head/paused': 20_000 }));                                // no presence with it
    await assertFails(update(room(as('u0')), presentPatch('u0', 70_000)));                               // more than 60 s away
    await assertFails(update(room(as('u0')), { ...presentPatch('u0', 20_000), 'head/turnAt': Date.now() })); // moves the turn start
    await assertFails(update(room(as('u1')), presentPatch('u1', 20_000)));                               // not the current player
    await assertSucceeds(update(room(as('u0')), presentPatch('u0', 50_000)));
    await assertFails(update(room(as('u0')), presentPatch('u0', 55_000)));                               // already back: no more credit
    await assertSucceeds(update(room(as('u0')), presentPatch('u0', null)));                              // presence alone is always fine
  });
  test('return credit: never lowered, and the waiting player\'s return credits nothing', async () => {
    await playing(); await seed({ 'rooms/ABC234/head/turnAt': Date.now() - 100_000, 'rooms/ABC234/head/paused': 10_000 });
    await awayFor('u0', 60_000);
    await assertFails(update(room(as('u0')), presentPatch('u0', 5_000)));
    await assertFails(update(room(as('u0')), presentPatch('u0', 10_000 + 61_000)));                    // the step, not the total, is bounded
    await assertSucceeds(update(room(as('u0')), presentPatch('u0', 10_000 + 55_000)));
    await playing(); await seed({ 'rooms/ABC234/head/turnAt': Date.now() - 100_000 }); await awayFor('u1', 60_000);
    await assertFails(update(room(as('u1')), presentPatch('u1', 20_000)));
    await assertSucceeds(update(room(as('u1')), presentPatch('u1', null)));
  });
  test('return credit is capped at three minutes and at the time since the turn began', async () => {
    await playing(); await seed({ 'rooms/ABC234/head/turnAt': Date.now() - 400_000 }); await awayFor('u0', 300_000);
    await assertFails(update(room(as('u0')), presentPatch('u0', 180_001)));
    await assertSucceeds(update(room(as('u0')), presentPatch('u0', 180_000)));
    await playing(); await seed({ 'rooms/ABC234/head/turnAt': Date.now() - 20_000 }); await awayFor('u0', 100_000);
    await assertFails(update(room(as('u0')), presentPatch('u0', 30_000)));                               // away since before this turn
    await assertSucceeds(update(room(as('u0')), presentPatch('u0', 15_000)));
  });
  test('either player may resign, but only themselves', async () => {
    await playing();
    await assertFails(update(room(as('u1')), resignAs(2, 0)));
    await assertSucceeds(update(room(as('u1')), resignAs(2, 1)));
  });
  test('an AI seat is played by the host alone, and only the host moves its dial', async () => {
    await playing();
    await seed({ 'rooms/ABC234/seats/1': { ...BOT, level: 'adaptive' }, 'rooms/ABC234/head/seat': 1 });
    // u1 is still in members: a member who is not the host
    const aiMove = step(2, move, { adapt: { seat: 1, value: { dial: 0.55, trend: 0.05 } } });
    await assertFails(update(room(as('u1')), aiMove));
    await assertFails(update(room(as('u0')), { 'seats/1/adapt': { dial: 0.9, trend: 0 } }));            // only with an append
    await assertFails(update(room(as('u0')), step(2, move, { adapt: { seat: 0, value: { dial: 0.55, trend: 0.05 } } })));
    await assertSucceeds(update(room(as('u0')), aiMove));
    await assertSucceeds(update(room(as('u0')), endTurnAt(3, 0)));
  });
  test('an absent player\'s seat can be taken over, a present one cannot', async () => {
    await playing();
    await assertFails(update(room(as('u7')), takeoverPatch('u7', 1, 'u1', 2)));
    await seed({ 'rooms/ABC234/presence/u1': { on: false, at: 1 }, 'rooms/ABC234/desync/u1': { n: 2, hash: '0123456789abcdef', build: 'x' } });
    await assertFails(update(room(as('u7')), takeoverPatch('u7', 1, 'u1', 3)));                          // other rules
    await assertSucceeds(update(room(as('u7')), takeoverPatch('u7', 1, 'u1', 2)));
    await assertFails(update(room(as('u1')), step(2)));                                                   // the old uid is out
    expect((await get(ref(as('u0'), 'rooms/ABC234/desync/u1'))).exists()).toBe(false);                 // its desync went with it
  });
  test('takeover: the whole patch, only by a non-member, only while playing, only a human seat', async () => {
    await playing(); await seed({ 'rooms/ABC234/presence/u1': { on: false, at: 1 } });
    const t = takeoverPatch('u7', 1, 'u1', 2);
    await assertFails(update(room(as('u7')), { ...t, 'members/u1': 1 }));                               // old membership kept
    await assertFails(update(room(as('u7')), { ...t, 'members/u7': 0 }));
    await assertFails(update(room(as('u7')), { ...t, 'seats/1/name': 'Mallory' }));
    await assertFails(update(room(as('u0')), takeoverPatch('u0', 1, 'u1', 2)));                          // already a member
    await assertFails(update(room(as('u8')), takeoverPatch('u7', 1, 'u1', 2)));                          // for someone else
    await seed({ 'rooms/ABC234/presence/u0': { on: false, at: 1 }, 'rooms/ABC234/seats/1': BOT, 'rooms/ABC234/members/u1': null });
    await assertFails(update(room(as('u7')), takeoverPatch('u7', 1, 'ai_1', 2)));                        // a bot seat
    await seedLobby({ withGuest: true });
    await assertFails(update(room(as('u7')), takeoverPatch('u7', 1, 'u1', 2)));                          // the lobby
  });
  test('the host role moves only to a human seat', async () => {
    await playing();
    await assertSucceeds(update(room(as('u1')), { 'meta/hostId': 'u1' }));
    await assertFails(update(room(as('u1')), { 'meta/hostId': 'u9' }));
    await assertFails(update(room(as('u9')), { 'meta/hostId': 'u0' }));                                  // not a member
    await seed({ 'rooms/ABC234/seats/1': BOT });
    await assertFails(update(room(as('u0')), { 'meta/hostId': 'ai_1' }));
  });
  test('phase: any member may end a playing match, nothing else moves it', async () => {
    await playing();
    await assertFails(update(room(as('u9')), { 'meta/phase': 'over' }));
    await assertFails(update(room(as('u0')), { 'meta/phase': 'lobby' }));
    await assertSucceeds(update(room(as('u1')), { 'meta/phase': 'over' }));
    await assertFails(update(room(as('u1')), { 'meta/phase': 'playing' }));
    await seedLobby({ withGuest: true });
    await assertFails(update(room(as('u0')), { 'meta/phase': 'over' }));
    await assertFails(update(room(as('u0')), { 'meta/phase': 'playing' }));
  });
  test('checks and the snapshot: checks only with an append and once, the snapshot by members', async () => {
    await playing();
    await assertFails(update(room(as('u0')), { 'checks/2': HASH }));
    await assertFails(update(room(as('u0')), { ...endTurnAt(2, 1), 'checks/3': 'nothex' }));
    await assertFails(update(room(as('u0')), { ...step(2), 'checks/9': HASH }));
    await assertSucceeds(update(room(as('u0')), endTurnAt(2, 1)));
    await assertFails(set(ref(as('u1'), 'rooms/ABC234/checks/3'), HASH));
    await assertSucceeds(set(ref(as('u1'), 'rooms/ABC234/snap'), { n: 3, hash: HASH, state: '{}' }));
    await assertFails(set(ref(as('u1'), 'rooms/ABC234/snap'), { n: 4, hash: HASH, state: '{}' }));      // beyond head/n
    await assertFails(set(ref(as('u1'), 'rooms/ABC234/snap'), { n: 3, hash: HASH, state: 'x'.repeat(200_001) }));
    await assertFails(set(ref(as('u1'), 'rooms/ABC234/snap'), { n: 3, hash: HASH, state: '{}', extra: 1 }));
    await assertFails(set(ref(as('u1'), 'rooms/ABC234/snap'), null));
    await assertFails(set(ref(as('u9'), 'rooms/ABC234/snap'), { n: 3, hash: HASH, state: '{}' }));
  });
  test('presence and desync belong to their owner; a non-member\'s desync may be cleared by anyone', async () => {
    await playing();
    await assertFails(set(ref(as('u1'), 'rooms/ABC234/presence/u0'), { on: false, at: serverTimestamp() }));
    await assertSucceeds(set(ref(as('u1'), 'rooms/ABC234/presence/u1'), { on: true, at: serverTimestamp() }));
    await assertFails(set(ref(as('u1'), 'rooms/ABC234/presence/u1'), { on: true, at: 1 }));
    await assertFails(set(ref(as('u1'), 'rooms/ABC234/presence/u1'), { on: 'yes', at: serverTimestamp() }));
    await assertFails(set(ref(as('u1'), 'rooms/ABC234/desync/u0'), { n: 2, hash: '0123456789abcdef', build: 'x' }));
    await assertSucceeds(set(ref(as('u1'), 'rooms/ABC234/desync/u1'), { n: 2, hash: '0123456789abcdef', build: 'x' }));
    await assertFails(set(ref(as('u1'), 'rooms/ABC234/desync/u1'), { n: 2, hash: 'x', build: 'x' }));
    await assertFails(remove(ref(as('u0'), 'rooms/ABC234/desync/u1')));                                  // u1 is still a member
    await assertSucceeds(remove(ref(as('u1'), 'rooms/ABC234/desync/u1')));                                // its owner may
    await seed({ 'rooms/ABC234/desync/gone': { n: 1, hash: '0123456789abcdef', build: 'x' } });
    await assertFails(remove(ref(as('u9'), 'rooms/ABC234/desync/gone')));                                 // not a member
    await assertSucceeds(remove(ref(as('u0'), 'rooms/ABC234/desync/gone')));
  });
  test('delete: the creator, or anyone once the room is idle for 30 days; never a child write', async () => {
    await playing();
    await assertFails(remove(ref(as('u1'), 'rooms/ABC234')));
    await assertFails(set(ref(as('u1'), 'rooms/ABC234'), { meta: null, actions: { 0: 'x' } }));
    await assertSucceeds(remove(ref(as('u0'), 'rooms/ABC234')));
    await playing(); await seed({ 'rooms/ABC234/head/at': Date.now() - 2_592_000_001 });
    await assertSucceeds(remove(ref(as('u9'), 'rooms/ABC234')));
  });
  test('delete: a lobby goes idle from its creation, and a recent append keeps an old room alive', async () => {
    await seedLobby(); await seed({ 'rooms/ABC234/meta/createdAt': Date.now() - 2_592_000_001 });
    await assertFails(remove(ref(anon(), 'rooms/ABC234')));
    await assertSucceeds(remove(ref(as('u9'), 'rooms/ABC234')));
    await playing(); await seed({ 'rooms/ABC234/meta/createdAt': Date.now() - 2_592_000_001 });
    await assertFails(remove(ref(as('u9'), 'rooms/ABC234')));
    await seed({ 'rooms/ABC234/head/at': Date.now() - 2_591_000_000 });
    await assertFails(remove(ref(as('u9'), 'rooms/ABC234')));
  });
  test('CANARY: the delete grant does not open the children', async () => {
    await playing();
    for (const path of ['actions/2', 'head/n', 'seats/1/uid', 'match/settings', 'checks/9', 'meta/phase']) {
      await assertFails(set(ref(as('u9'), `rooms/ABC234/${path}`), 'x'));
    }
    for (const path of ['actions/1', 'seats/1', 'members/u1', 'match', 'meta', 'head', 'presence/u1']) {
      await assertFails(remove(ref(as('u0'), `rooms/ABC234/${path}`)));                                  // even the creator
    }
  });
});
