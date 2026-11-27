import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  applyAction, createMatch, hashState, legalActions, RULES_VERSION,
  type Action, type MatchSettings, type MatchState, type PlayerId, type Result,
} from '../engine';
import { encodeAction, makeRoomCode, type Room } from '../online/wire';
import type { Net } from './net';
import { wait as scaled } from './waitScale';

// One set of tests for every Net: fakeNet.test.ts runs it on the in-memory server, firebaseNet.emu.test.ts on the
// emulator. What passes here on both is what the app may rely on.

export interface ContractKit {
  a: Net; b: Net; c: Net;
  ageTurn(code: string, ms: number): Promise<void>;        // moves head/turnAt back by ms, past the rules
  stopPresence(net: Net, code: string): Promise<void>;     // the owner's presence goes off, and the phone comes back
  drop(net: Net): void; back(net: Net): Promise<void>; wait(ms: number): Promise<void>;
  forge(code: string, path: string, value: unknown): Promise<void>;   // a rules-free write under rooms/<code>
}

const SETTINGS: MatchSettings = { seed: 42, factions: ['spartans', 'mongols'] };

function must(r: Result): MatchState {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

export function contract(name: string, make: () => Promise<ContractKit>): void {
  describe(name, { timeout: scaled(20_000) }, () => {
    let kit: ContractKit;
    let a: Net; let b: Net; let c: Net;
    let code: string;
    beforeAll(async () => { kit = await make(); ({ a, b, c } = kit); }, scaled(30_000));
    beforeEach(() => { code = makeRoomCode(); });
    const ageTurn = (cd: string, ms: number): Promise<void> => kit.ageTurn(cd, ms);
    const stopPresence = (net: Net, cd: string): Promise<void> => kit.stopPresence(net, cd);
    const drop = (net: Net): void => kit.drop(net);
    const back = (net: Net): Promise<void> => kit.back(net);
    const wait = (ms: number): Promise<void> => kit.wait(ms);
    const quiet = { room: () => {}, actions: () => {}, connected: () => {} };

    const ann = (cd: string) => a.create({ code: cd, name: 'Ann', hostFaction: 'spartans', clock: 120, rulesVersion: RULES_VERSION, build: 't' });

    // Watches until a room and an action list have both arrived and the predicate holds on the latest of each.
    function latest(net: Net, cd: string, pred: (r: Room | null, l: string[] | null) => boolean):
      Promise<{ room: Room | null; actions: string[] | null }> {
      return new Promise((resolve, reject) => {
        let room: Room | null | undefined;
        let actions: string[] | null | undefined;
        let done = false;
        let stop: (() => void) | null = null;
        const finish = (err: Error | null): void => {
          done = true;
          clearTimeout(timer);
          if (stop) stop();
          if (err) reject(err); else resolve({ room: room ?? null, actions: actions ?? null });
        };
        const check = (): void => {
          if (!done && room !== undefined && actions !== undefined && pred(room, actions)) finish(null);
        };
        const timer = setTimeout(() => finish(new Error('latest: the predicate never held')), scaled(5_000));
        const off = net.watch(cd, {
          room: (r) => { room = r; check(); },
          actions: (l) => { actions = l; check(); },
          connected: () => {},
        });
        if (done) off(); else stop = off;
      });
    }

    async function started(cd: string): Promise<void> {
      expect(await ann(cd)).toBe(true);
      expect(await b.join(cd, 'Ben', RULES_VERSION)).toEqual({ seat: 1 });
      expect(await a.start(cd, SETTINGS, hashState(createMatch(SETTINGS)))).toBe(true);
      expect(await a.present(cd, null)).toBe(true);
      expect(await b.present(cd, null)).toBe(true);
    }

    test('create, join, rejoin, and a third phone is turned away', async () => {
      expect(await ann(code)).toBe(true);
      expect(await b.join(code, 'Ben', RULES_VERSION)).toEqual({ seat: 1 });
      expect(await b.join(code, 'Ben', RULES_VERSION)).toEqual({ seat: 1 });
      expect(await c.join(code, 'Cy', RULES_VERSION)).toBe('full');
      expect(await c.join('ZZZZZZ', 'Cy', RULES_VERSION)).toBe('notFound');
      expect(await ann(code)).toBe('refused');
    });
    test('rules 11: a Woodland room against Spartans, chosen by the host, plays a move; a mirror is allowed', async () => {
      const wood = { seed: 5, factions: ['woodland', 'spartans'] } as const;
      expect(await a.create({ code, name: 'Ann', hostFaction: 'woodland', guestFaction: 'spartans', clock: 120, rulesVersion: RULES_VERSION, build: 't' })).toBe(true);
      expect(await b.join(code, 'Ben', RULES_VERSION)).toEqual({ seat: 1 });
      expect(await b.setLobby(code, { guestFaction: 'woodland' })).toBe('refused');          // only the host picks the sides
      expect(await a.setLobby(code, { guestFaction: 'woodland' })).toBe(true);
      expect(await a.setLobby(code, { guestFaction: 'spartans' })).toBe(true);
      const { room } = await latest(b, code, r => r?.meta.guestFaction === 'spartans' && r.seats[1] !== null);
      expect([room!.meta.hostFaction, room!.meta.guestFaction]).toEqual(['woodland', 'spartans']);
      const s0 = createMatch({ ...wood, factions: [...wood.factions] });
      expect(await a.start(code, { ...wood, factions: [...wood.factions] }, hashState(s0))).toBe(true);
      const m = legalActions(s0).find(x => x.type === 'move')!; const s1 = must(applyAction(s0, m));
      expect(await a.append(code, { n: 0, action: encodeAction(m), seatAfter: s1.current, hash: hashState(s1), turnPassed: false, over: false, snap: null, adapt: null })).toBe(true);
      const { actions } = await latest(b, code, (_r, l) => l?.length === 1);
      expect(actions).toEqual([encodeAction(m)]);
    });
    test('a side that is not one of the three peoples is refused', async () => {
      expect(await ann(code)).toBe(true);
      expect(await a.setLobby(code, { guestFaction: 'elves' as never })).toBe('refused');
      expect(await a.setLobby(code, { hostFaction: 'elves' as never })).toBe('refused');
    });
    test('a phone on other rules cannot join', async () => {
      await ann(code);
      expect(await b.join(code, 'Ben', RULES_VERSION + 1)).toBe('version');
    });
    test('the watcher sees the room and the actions; presence comes from present()', async () => {
      await ann(code); await b.join(code, 'Ben', RULES_VERSION);
      expect(await a.present(code, null)).toBe(true);
      const { room, actions } = await latest(a, code, r => r?.seats[1] !== null && r?.presence !== undefined);
      expect(room!.seats.map(s => s?.name)).toEqual(['Ann', 'Ben']);
      expect(room!.presence[await a.uid()]?.on).toBe(true);
      expect(actions).toEqual([]);
    });
    test('appends go in order and only from the player whose turn it is', async () => {
      await started(code);
      const s0 = createMatch(SETTINGS);
      const m = legalActions(s0).find(x => x.type === 'move')!; const s1 = must(applyAction(s0, m));
      const s2 = must(applyAction(s1, { type: 'endTurn' })); const s3 = must(applyAction(s2, { type: 'endTurn' }));
      const add = (net: Net, n: number, action: Action, after: MatchState, passed: boolean) =>
        net.append(code, { n, action: encodeAction(action), seatAfter: after.current, hash: hashState(after), turnPassed: passed,
          over: false, snap: passed ? JSON.stringify(after) : null, adapt: null });
      expect(await add(b, 0, m, s1, false)).toBe('refused');
      expect(await add(a, 0, m, s1, false)).toBe(true);
      expect(await add(a, 0, m, s1, false)).toBe('refused');
      expect(await add(a, 2, { type: 'endTurn' }, s2, true)).toBe('refused');
      expect(await add(a, 1, { type: 'endTurn' }, s2, true)).toBe(true);
      expect(await add(b, 2, { type: 'endTurn' }, s3, true)).toBe(true);
      const { actions } = await latest(b, code, (_r, l) => l?.length === 3);
      expect(actions).toEqual([encodeAction(m), '{"type":"endTurn"}', '{"type":"endTurn"}']);
      const start = await a.readStart(code);
      expect(typeof start === 'object' && start.settings).toEqual(SETTINGS);
      expect(typeof start === 'object' && start.snap!.n).toBe(3);
      expect(typeof start === 'object' && start.checks).toEqual({ 2: hashState(s2), 3: hashState(s3) });
    });
    test('two phones racing for the same index: exactly one wins', async () => {
      await started(code);
      await ageTurn(code, 125_000);
      const s0 = createMatch(SETTINGS); const m = legalActions(s0).find(x => x.type === 'move')!;
      const s1 = must(applyAction(s0, m)); const e = must(applyAction(s0, { type: 'endTurn' }));
      const results = await Promise.all([
        a.append(code, { n: 0, action: encodeAction(m), seatAfter: 0, hash: hashState(s1), turnPassed: false, over: false, snap: null, adapt: null }),
        b.append(code, { n: 0, action: '{"type":"endTurn"}', seatAfter: 1, hash: hashState(e), turnPassed: true, over: false, snap: JSON.stringify(e), adapt: null }),
      ]);
      expect(results.filter(r => r === true)).toHaveLength(1);
      const { actions } = await latest(a, code, (_r, l) => l?.length === 1);
      expect(actions).toHaveLength(1);
    });
    test('a write made offline waits, and on reconnect lands or is refused by the rules', async () => {
      await started(code);
      await ageTurn(code, 125_000);
      const s0 = createMatch(SETTINGS); const m = legalActions(s0).find(x => x.type === 'move')!;
      const s1 = must(applyAction(s0, m)); const e = must(applyAction(s0, { type: 'endTurn' }));
      drop(a);
      const held = a.append(code, { n: 0, action: encodeAction(m), seatAfter: 0, hash: hashState(s1), turnPassed: false, over: false, snap: null, adapt: null });
      expect(await Promise.race([held, wait(500).then(() => 'pending')])).toBe('pending');          // not 'offline': the SDK holds it
      expect(await b.append(code, { n: 0, action: '{"type":"endTurn"}', seatAfter: 1, hash: hashState(e), turnPassed: true, over: false,
        snap: JSON.stringify(e), adapt: null })).toBe(true);                                          // the backup timeout takes index 0
      await back(a);
      expect(await held).toBe('refused');
      const { actions } = await latest(a, code, (_r, l) => l?.length === 1 && l[0] === '{"type":"endTurn"}');
      expect(actions).toEqual(['{"type":"endTurn"}']);                                                 // the rollback left the server's list
    });
    test('every call but append gives up when offline', async () => {
      await ann(code);
      drop(c);
      expect(await c.join(code, 'Cy', RULES_VERSION)).toBe('offline');
      expect(await c.readLive(code)).toBe('offline');
      await back(c);
    });
    test('a return credit lands with presence, and only for the time away', async () => {
      await started(code);
      drop(a); await wait(1_500); await back(a);
      const live = await a.readLive(code);
      expect(typeof live === 'object' && live.presence?.on).toBe(false);
      expect(await a.present(code, 60_000)).toBe('refused');                                          // more than the time away
      expect(await b.present(code, 500)).toBe('refused');                                             // not b's turn, and b never left
      expect(await a.present(code, 500)).toBe(true);
      const { room } = await latest(b, code, r => r?.head?.paused === 500);
      expect(room!.presence[await a.uid()]?.on).toBe(true);
    });
    test('a resign out of turn is accepted for yourself only', async () => {
      await started(code);
      const resign = (seat: PlayerId) => ({ n: 0, action: `{"player":${seat},"type":"resign"}`, seatAfter: 0 as PlayerId, hash: '0'.repeat(16),
        turnPassed: false, over: true, snap: '{}', adapt: null });
      expect(await b.append(code, resign(0))).toBe('refused');
      expect(await b.append(code, resign(1))).toBe(true);
    });
    test('a seat can be taken over only while its owner is away, and the old desync goes with it', async () => {
      await started(code);
      const bu = await b.uid();
      await b.reportDesync(code, { n: 0, hash: '0'.repeat(16), build: 'x' });
      await latest(a, code, r => r?.presence[bu]?.on === true);
      expect(await c.takeOver(code, 1, RULES_VERSION)).toBe('refused');
      await stopPresence(b, code);
      expect(await c.takeOver(code, 1, RULES_VERSION)).toBe(true);
      expect(await c.join(code, 'x', RULES_VERSION)).toEqual({ seat: 1 });
      const { room } = await latest(a, code, r => r?.members[bu] === undefined);
      expect(room!.desync).toEqual({});
    });
    test('closing a watch says the phone has gone only after present(), and only when its last watch closes', async () => {
      await started(code);
      const au = await a.uid(); const cu = await c.uid();
      const one = a.watch(code, quiet); const two = a.watch(code, quiet);
      await latest(b, code, r => r?.presence[au]?.on === true);
      one();
      const still = await a.readLive(code);
      expect(typeof still === 'object' && still.presence?.on).toBe(true);                         // another watch is open
      two();
      await latest(b, code, r => r?.presence[au]?.on === false);                                    // the last one closed
      const peek = c.watch(code, quiet);
      await latest(c, code, r => r !== null);
      peek();
      const none = await c.readLive(code);
      expect(typeof none === 'object' && none.presence).toBe(null);                                  // never present: writes nothing
      const { room } = await latest(a, code, r => r !== null);
      expect(room!.presence[cu]).toBeUndefined();
    });
    test('a watch closed while offline leaves the presence the drop wrote, so the time away still counts from the drop', async () => {
      await started(code);
      const au = await a.uid();
      const w = a.watch(code, quiet);
      drop(a);
      const { room } = await latest(b, code, r => r?.presence[au]?.on === false);
      const off = room!.presence[au]!;
      w();
      await wait(1_200);
      await back(a);
      await wait(500);
      const live = await a.readLive(code);
      expect(typeof live === 'object' && live.presence).toEqual(off);
    });
    test('readLive is fresh after a drop even while a watch is open', async () => {
      await started(code);
      const au = await a.uid();
      const w = a.watch(code, quiet);
      await latest(a, code, r => r?.head !== null && r?.presence[au]?.on === true);   // the cache holds this phone present
      drop(a);
      await latest(b, code, r => r?.presence[au]?.on === false);
      await back(a);
      const live = await a.readLive(code);
      expect(typeof live === 'object' && live.presence?.on).toBe(false);   // not the cached presence from before the drop
      w();
    });
    test("a member may clear a desync entry left by someone who is no longer a member, never a member's", async () => {
      await started(code);
      const bu = await b.uid();
      await kit.forge(code, 'desync/ghost', { n: 0, hash: '0'.repeat(16), build: 'x' });
      await b.reportDesync(code, { n: 0, hash: '0'.repeat(16), build: 'x' });
      await c.clearDesync(code, 'ghost');                                                            // not a member: refused
      await a.clearDesync(code, bu);                                                                 // Ben is a member: refused
      expect(Object.keys((await latest(a, code, r => r !== null && Object.keys(r.desync).length === 2)).room!.desync).sort())
        .toEqual([bu, 'ghost'].sort());
      await a.clearDesync(code, 'ghost');
      const { room } = await latest(b, code, r => r !== null && !('ghost' in r.desync));
      expect(Object.keys(room!.desync)).toEqual([bu]);
    });
    test('the creator can remove a room; a stranger cannot', async () => {
      await ann(code);
      expect(await b.remove(code)).toBe(false);
      expect(await a.remove(code)).toBe(true);
      expect(await c.join(code, 'Cy', RULES_VERSION)).toBe('notFound');
    });
  });
}
