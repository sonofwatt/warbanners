import { expect, test, vi } from 'vitest';
import { applyAction, hashState, legalActions, RULES_VERSION } from '../engine';
import type { MatchState } from '../engine';
import { must } from '../engine/testkit';
import { planTurn } from '../ai/plan';
import type { AiClient } from '../app/aiClient';
import {
  bareServer, fakeKit, fakePause, hanging, headOf, meta, pair, playTurns, settle, sharedBodies, spyReadStart, until,
} from '../net/sessionKit';
import { openSession } from './session';
import { REPLAY_CHUNK } from './sync';
import { encodeAction, SCHEMA } from './wire';

vi.setConfig({ testTimeout: 30_000 });   // the AI tests run the real planner on a shared machine

test('both phones see the same match after a few turns', async () => { await sharedBodies['same match']!(fakeKit()); });
test('only the player whose turn it is can act', async () => {
  const { a, b } = await pair();
  expect(b!.view().myTurn).toBe(false); expect(b!.act({ type: 'endTurn' })).toBeNull();
  expect(a.view().myTurn).toBe(true);
});
test('a double tap on End turn ends one turn', async () => {
  const { a, server } = await pair();
  expect(a.act({ type: 'endTurn' })).not.toBeNull(); expect(a.act({ type: 'endTurn' })).toBeNull(); await settle(server);
  expect(a.view().followed!.actions).toEqual(['{"type":"endTurn"}']);
});
test('the clock ends a turn on the current phone, just after the deadline', async () => {
  const { a, b, server, timers } = await pair();
  timers.tick(120_000); await settle(server); expect(b!.view().followed!.state.current).toBe(0);
  timers.tick(1_000); await settle(server);
  expect(b!.view().followed!.state.current).toBe(1); expect(a.view().timedOut).toBe(0);
  expect(server.log().find(w => w.paths.includes('actions/0'))!.uid).toBe('u0');
});
test('a refused timeout is tried once more', async () => {
  const { b, server, timers } = await pair();
  server.failNext('u0'); timers.tick(121_000); await settle(server);
  expect(b!.view().followed!.state.current).toBe(0);
  timers.tick(1_000); await settle(server);
  expect(b!.view().followed!.state.current).toBe(1);
  expect(server.log().find(w => w.paths.includes('actions/0'))!.uid).toBe('u0');
});
test('the waiting phone ends the turn 3 s after the deadline when the current phone is asleep', async () => {
  const { a, b, server, timers } = await pair();
  timers.freeze('u0');                                   // Ann's phone stops ticking but stays connected
  timers.tick(122_000); await settle(server); expect(b!.view().followed!.state.current).toBe(0);
  timers.tick(1_000); await settle(server); expect(b!.view().followed!.state.current).toBe(1);
  expect(server.log().find(w => w.paths.includes('actions/0'))!.uid).toBe('u1');
  timers.thaw('u0'); await settle(server); expect(a.view().timedOut).toBe(0);
});
test('a drop pauses the clock, and the backup waits for the pause', async () => {
  const { a, b, server, timers } = await pair();
  timers.tick(30_000); server.drop('u0'); await settle(server);
  expect(b!.view().clock).toMatchObject({ kind: 'paused', leftMs: 90_000 });
  timers.tick(210_000); await settle(server);            // 240 s: the 180 s pause has run out at 210 s; the clock now ends at 300 s
  expect(b!.view().followed!.state.current).toBe(0);
  timers.tick(63_000); await settle(server);             // 303 s: the backup's 3 s are up
  expect(b!.view().followed!.state.current).toBe(1);
  await server.back('u0'); await settle(server);
  expect(a.view().followed!.state.current).toBe(1); expect(a.view().myTurn).toBe(false); expect(a.view().returning).toBe(false);
  // Not its turn: the return is presence alone, no credit. (Ben stood in as host while Ann was away, so Ann's last
  // write is her reclaim of the host role; her return is the last write that touches her presence.)
  expect(server.log().filter(w => w.uid === 'u0' && w.paths.includes('presence/u0')).at(-1)).toEqual({ uid: 'u0', paths: ['presence/u0'] });
  expect((server.tree() as any).rooms.ABC234.presence.u0.on).toBe(true); expect(headOf(server).paused).toBe(0);
});
test('back from a drop past the deadline but inside the allowance: nobody ends the turn', async () => {
  const { a, b, server, timers } = await pair();
  timers.tick(30_000); server.drop('u0'); await settle(server);
  timers.tick(120_000); await settle(server);            // 150 s: past the 120 s deadline, 120 s into a 180 s allowance
  await server.back('u0'); await settle(server);
  expect(headOf(server).paused).toBe(118_000);           // 120 s away, less the 2 s margin, written with presence
  for (const s of [a, b!]) {
    expect(s.view().followed!.actions).toEqual([]);
    expect(s.view().clock).toEqual({ kind: 'running', endsAt: 1_238_000 });
  }
  expect(a.view().myTurn).toBe(true);
  timers.tick(88_000); await settle(server);             // 238 s: deadline reached, not yet the 500 ms lead
  expect(a.view().followed!.actions).toEqual([]);
  timers.tick(1_000); await settle(server);              // 239 s: Ann's own phone ends the turn
  expect(b!.view().followed!.state.current).toBe(1);
  expect(server.log().find(w => w.paths.includes('actions/0'))!.uid).toBe('u0');
});
test('a phone waking from sleep with a dead socket it still believes in does not end its own turn', async () => {
  // The locked phone's tab froze: no tick, and the SDK has not yet noticed its socket is dead, so the session still
  // believes it is connected and its cache still shows it present. The server saw the socket close and wrote presence
  // off, so Ben's phone shows the clock paused. Ann wakes past her deadline, inside the allowance: her first tick
  // must start the return (fresh read, presence and the credit), not end her turn on the stale cache.
  const { a, b, server, timers } = await pair();
  timers.tick(30_000); await settle(server);
  timers.freeze('u0'); server.hold('u0');
  server.write('rooms/ABC234/presence/u0', { on: false, at: server.now() }); await settle(server);
  expect(b!.view().clock).toMatchObject({ kind: 'paused' });
  timers.tick(120_000); await settle(server);            // 150 s: past the 120 s deadline, 120 s into the allowance
  expect(a.view().connected).toBe(true); expect(a.view().returning).toBe(false);
  timers.thaw('u0'); timers.tick(1_000); await settle(server);
  server.release('u0'); await settle(server);
  expect(server.log().filter(w => w.paths.some(p => p.startsWith('actions/')))).toEqual([]);
  expect(headOf(server).paused).toBeGreaterThan(100_000);
  expect(a.view().returning).toBe(false); expect(a.view().myTurn).toBe(true);
  expect(b!.view().followed!.actions).toEqual([]);
});
test('a returning phone takes no clock decision from a cache that still shows it present', async () => {
  // On a real phone the SDK's cache keeps this phone present after a drop: it never saw its own presence go off.
  // Read alone, that cache says Ann's clock ran out at 120 s; the credit she is owed has not been written yet.
  const { a, server, timers, open } = await pair();
  a.close(); await settle(server);                                   // presence off at 1_000_000
  let gate!: () => void;
  const opened = new Promise<void>((r) => { gate = r; });
  let stale = true;
  const as = server.as;
  server.as = (uid) => {
    const net = as(uid);
    if (uid !== 'u0') return net;
    return {
      ...net,
      async readLive(code) { await opened; return net.readLive(code); },
      watch: (code, w) => net.watch(code, { ...w, room: (r) => w.room(r && stale ? { ...r, presence: { ...r.presence, u0: { on: true, at: 1_000_000 } } } : r) }),
    };
  };
  timers.tick(150_000); await settle(server);
  const again = await open('u0');
  expect(again.view().returning).toBe(true);
  timers.tick(1_000); await settle(server);                          // Ann's tick while her return is on its way
  expect(again.view().followed!.actions).toEqual([]);
  stale = false; gate(); await settle(server);
  expect(again.view().returning).toBe(false);
  expect(headOf(server).paused).toBe(149_000);                       // 151 s away, less the 2 s margin
  expect(again.view().followed!.actions).toEqual([]); expect(again.view().myTurn).toBe(true);
});
test('a timeout is never decided from half of an update', async () => {
  // The room is read node by node, so one write that moves the head and the presence can arrive as two readings a
  // moment apart. Read alone, the rewound head beside the old drop time says the clock ran out; with both, the clock
  // is paused. A tick that falls between the two must not end the turn.
  const { b, server, timers } = await pair();
  server.drop('u0'); await settle(server);
  timers.tick(900); await settle(server);
  server.write('rooms/ABC234/head/turnAt', 1_000_900 - 150_000); await settle(server);      // the first half
  timers.tick(100); await settle(server);                                                   // Ben's tick, 100 ms later
  server.write('rooms/ABC234/presence/u0/at', 1_000_900 - 120_000); await settle(server);   // the second half
  timers.tick(1_000); await settle(server);
  expect(b!.view().followed!.actions).toEqual([]);
  expect(b!.view().clock).toMatchObject({ kind: 'paused' });
});
test('the race: my last move against the timeout, before I have seen it; one lands, my phone rebuilds', async () => {
  const { a, b, server, timers } = await pair();
  timers.freeze('u0'); server.hold('u0');                // Ann's phone neither ticks nor hears the server
  timers.tick(123_000); await settle(server);            // Ben's backup ends the turn
  expect(b!.view().followed!.state.current).toBe(1);
  expect(a.view().followed!.actions).toEqual([]);        // Ann has not seen it
  const move = legalActions(a.view().followed!.state).find(x => x.type === 'move')!;
  expect(a.act(move)).not.toBeNull();                    // accepted locally: Ann still believes it is her turn
  await settle(server);
  server.release('u0'); timers.thaw('u0'); await settle(server);
  expect(a.view().followed!.actions).toEqual(['{"type":"endTurn"}']);
  expect(a.view().followed!.actions).toEqual(b!.view().followed!.actions);
  expect(a.view().followed!.state.current).toBe(1); expect(a.view().phase).toBe('playing');
  expect(server.log().filter(w => w.uid === 'u0' && w.paths.some(p => p.startsWith('actions/')))).toEqual([]);
  expect(a.view().timedOut).toBe(0);                     // the timeUp line, though the endTurn arrived through a rebuild
});
test('a rebuild after a lost race yields between chunks and blocks play while it runs', async () => {
  const { a, b, server, timers } = await pair();
  // A record of at least 3 * REPLAY_CHUNK actions, written straight to the room, that leaves Ann to move.
  let s: MatchState = a.view().followed!.state;
  const list: string[] = [];
  for (let i = 0; list.length < 3 * REPLAY_CHUNK || s.current !== 0; i++) {
    const legal = legalActions(s).filter(x => x.type !== 'resign');
    const x = legal[(i * 7) % legal.length]!; s = must(applyAction(s, x)); list.push(encodeAction(x));
  }
  const n = list.length;
  server.write('rooms/ABC234/actions', Object.fromEntries(list.map((x, i) => [i, x])));
  server.write('rooms/ABC234/head', { ...headOf(server), n, seat: s.current, hash: hashState(s), turnAt: server.now() });
  await settle(server);
  expect(b!.view().followed!.actions).toHaveLength(n);
  a.close(); await settle(server);
  let pauses = 0;
  let stall = false;
  const stalled: (() => void)[] = [];
  const pause = (): Promise<void> => { pauses++; return stall ? new Promise((r) => { stalled.push(r); }) : fakePause(); };
  let rebuiltAt: number | null = null;
  const again = openSession('ABC234', { net: server.as('u0'), ai: hanging(), build: 't', setTimer: timers.setTimerFor('u0'), pause }, (v) => {
    if (rebuiltAt === null && v.followed?.actions.length === n + 1 && v.followed.actions[n] === '{"type":"endTurn"}') rebuiltAt = pauses;
  });
  await settle(server);
  expect(again.view().myTurn).toBe(true);
  // Ben's backup takes index n with an endTurn that Ann has not heard of; her move at n then loses its index.
  server.hold('u0');
  const ended = must(applyAction(s, { type: 'endTurn' }));
  server.write('rooms/ABC234/actions/' + n, '{"type":"endTurn"}');
  server.write('rooms/ABC234/head', { ...headOf(server), n: n + 1, seat: 1, hash: hashState(ended), turnAt: server.now() });
  await settle(server);
  pauses = 0; stall = true;
  // Ann's own action at n: any but endTurn and resign (since rules 10 this playout leaves both her units hunkered, so
  // the first one is an unhunker, not a move)
  const move = legalActions(again.view().followed!.state).find(x => x.type !== 'endTurn' && x.type !== 'resign')!;
  expect(again.act(move)).not.toBeNull();
  await settle(server);
  server.release('u0'); await settle(server);
  for (let i = 0; i < 20 && stalled.length > 0; i++) {
    expect(again.view().verifying).toBe(true); expect(again.view().myTurn).toBe(false); expect(again.resign()).toBe(false);
    for (const r of stalled.splice(0)) r();
    await settle(server);
  }
  expect(stalled).toEqual([]);
  expect(rebuiltAt).not.toBeNull(); expect(rebuiltAt!).toBeGreaterThanOrEqual(3);
  expect(again.view().verifying).toBe(false);
  expect(again.view().followed!.actions).toEqual(b!.view().followed!.actions);
  expect(hashState(again.view().followed!.state)).toBe(hashState(ended));
  expect(again.view().phase).toBe('playing'); expect(again.view().myTurn).toBe(false);
  expect(again.view().timedOut).toBe(n);                 // the endTurn that ended Ann's turn arrived through the rebuild
  expect(server.log().filter(w => w.uid === 'u0' && w.paths.includes(`actions/${n}`))).toEqual([]);
  again.close();
});
test('wake() runs the return before any clock decision, like a long tick gap', async () => {
  // As in the sleeping phone above, but the page tells the session it is visible again before any tick has fired.
  const { a, b, server, timers } = await pair();
  timers.tick(30_000); await settle(server);
  timers.freeze('u0'); server.hold('u0');
  server.write('rooms/ABC234/presence/u0', { on: false, at: server.now() }); await settle(server);
  timers.tick(120_000); await settle(server);            // 150 s: past the 120 s deadline, 120 s into the allowance
  expect(a.view().returning).toBe(false);
  a.wake();
  expect(a.view().returning).toBe(true);                 // the return starts at once, not on the next tick
  timers.thaw('u0'); timers.tick(1_000);                 // a tick while the return is on its way decides nothing
  await settle(server);
  server.release('u0'); await settle(server);
  expect(server.log().filter(w => w.paths.some(p => p.startsWith('actions/')))).toEqual([]);
  expect(headOf(server).paused).toBeGreaterThan(100_000);
  expect(a.view().returning).toBe(false); expect(a.view().myTurn).toBe(true);
  expect(b!.view().followed!.actions).toEqual([]);
});
test('a move held while offline is refused on return when the clock ended the turn meanwhile', async () => {
  const { a, b, server, timers } = await pair();
  const move = legalActions(a.view().followed!.state).find(x => x.type === 'move')!;
  a.act(move); server.drop('u0'); await settle(server);  // the write was handed to the SDK, then the connection went
  expect(a.view().sending).toBe(true); expect(a.view().connected).toBe(false);
  timers.tick(303_000); await settle(server);            // pause allowance, then the clock, then the backup's 3 s
  expect(b!.view().followed!.actions).toEqual(['{"type":"endTurn"}']);
  await server.back('u0'); await settle(server);         // the held move lands late and is refused at index 0
  expect(a.view().followed!.actions).toEqual(['{"type":"endTurn"}']); expect(a.view().sending).toBe(false);
  expect(a.view().phase).toBe('playing'); expect(a.view().followed!.state.current).toBe(1);
  expect(a.view().timedOut).toBe(0);
});
test('a resign that loses its index leaves the match playing', async () => {
  await sharedBodies['a resign that loses its index leaves the match playing']!(fakeKit());
});
test('a resign that races the timeout is rolled back', async () => {
  await sharedBodies['a resign that races the timeout is rolled back']!(fakeKit());
});
test('a move held across a drop is refused, rolled back and rebuilt', async () => {
  await sharedBodies['a move held across a drop is refused, rolled back and rebuilt']!(fakeKit());
});
test('a return whose fresh read is refused still says this phone is here', async () => {
  const { a, server, open } = await pair();
  a.close(); await settle(server);
  const as = server.as;
  server.as = (uid) => ({ ...as(uid), readLive: async () => 'refused' as const });
  const again = await open('u0');
  expect(again.view().returning).toBe(false);
  expect((server.tree() as any).rooms.ABC234.presence.u0.on).toBe(true);
  expect(headOf(server).paused).toBe(0);                 // no credit without a fresh read
});
test('a reload mid-turn loses nothing that reached the database, and the clock resumes with the drop credited', async () => {
  const { a, server, timers, open } = await pair();
  const moves = legalActions(a.view().followed!.state).filter(x => x.type === 'move').slice(0, 2);
  a.act(moves[0]!); await settle(server);
  server.drop('u0'); await settle(server);
  expect(a.view().connected).toBe(false); expect(a.act(moves[1]!)).toBeNull();   // not connected: refused, nothing queued
  a.close(); timers.tick(10_000); await server.back('u0');
  const again = await open('u0'); await settle(server);
  expect(again.view().followed!.actions).toEqual([encodeAction(moves[0]!)]);
  expect(again.view().myTurn).toBe(true);
  expect(again.view().clock).toEqual({ kind: 'running', endsAt: 1_000_000 + 120_000 + 8_000 });
});
test('rejoin shows the snapshot at once, then the replay confirms it before the phone may act', async () => {
  const { a, b, server, timers } = await pair();
  await playTurns(a, b!, 7);                             // Ben's turn next
  b!.close(); await settle(server); const spy = spyReadStart(server);
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  const again = openSession('ABC234', { net: server.as('u1'), ai: hanging(), build: 't', setTimer: timers.setTimerFor('u1'), pause: () => held }, () => {});
  await settle(server);
  expect(spy.usedSnap).toBe(true);
  expect(again.view().verifying).toBe(true);
  expect(hashState(again.view().followed!.state)).toBe(hashState(a.view().followed!.state));
  expect(again.view().phase).toBe('playing');
  expect(again.view().myTurn).toBe(false); expect(again.resign()).toBe(false);
  release(); await settle(server);
  expect(again.view().verifying).toBe(false);
  expect(hashState(again.view().followed!.state)).toBe(hashState(a.view().followed!.state));
  expect(again.view().phase).toBe('playing'); expect(again.view().myTurn).toBe(true);
  again.close();
});
test('an append that throws is a broken session, not a crash', async () => {
  const { a, server, open } = await pair();
  a.close(); await settle(server);
  const as = server.as;
  server.as = (uid) => ({ ...as(uid), append: () => { throw new Error('socket gone'); } });
  const again = await open('u0');
  const move = legalActions(again.view().followed!.state).find(x => x.type === 'move')!;
  expect(() => again.act(move)).not.toThrow(); await settle(server);
  expect(again.view().phase).toBe('failed'); expect(again.view().myTurn).toBe(false); expect(again.view().sending).toBe(false);
});
test('a different rules version, or a newer wire schema, is refused and nothing is written', async () => {
  const { server, openAs } = await bareServer();
  await server.as('u0').create({ code: 'ABC234', name: 'Ann', hostFaction: 'spartans', clock: 120, rulesVersion: RULES_VERSION + 1, build: 't' });
  await server.as('u0').create({ code: 'DEF567', name: 'Ann', hostFaction: 'spartans', clock: 120, rulesVersion: RULES_VERSION, build: 't' });
  server.write('rooms/DEF567/meta/schema', SCHEMA + 1);
  const before = JSON.stringify(server.tree());
  const s = await openAs('u1', 'ABC234'); await settle(server);
  expect(s.view().phase).toBe('version'); expect(s.view().remoteVersion).toBe(RULES_VERSION + 1);
  const t = await openAs('u1', 'DEF567'); await settle(server);
  expect(t.view().phase).toBe('version'); expect(t.view().remoteSchema).toBe(SCHEMA + 1);
  expect(JSON.stringify(server.tree())).toBe(before);
});
test('a member reopening on another rules version is refused too, and writes nothing', async () => {
  const { a, server, timers } = await pair();
  a.close(); await settle(server);
  const before = JSON.stringify(server.tree());
  const s = openSession('ABC234', { net: server.as('u0'), ai: hanging(), build: 't', rulesVersion: RULES_VERSION + 1, setTimer: timers.setTimerFor('u0'), pause: fakePause }, () => {});
  await settle(server);
  expect(s.view().phase).toBe('version'); expect(s.view().remoteVersion).toBe(RULES_VERSION);
  expect(JSON.stringify(server.tree())).toBe(before);
});
test('a hash that disagrees pauses both phones', async () => {
  const { a, b, server } = await pair();
  const move = legalActions(a.view().followed!.state).find(x => x.type === 'move')!;
  server.write('rooms/ABC234/actions/0', encodeAction(move));
  server.write('rooms/ABC234/head', { ...headOf(server), n: 1, hash: '0000000000000000' });
  await settle(server);
  expect(b!.view().phase).toBe('desync'); expect(a.view().myTurn).toBe(false);
  expect(a.view().blocked).toBe(true); expect(b!.view().blocked).toBe(true);   // both phones show the desync card
  expect((server.tree() as any).rooms.ABC234.desync).toHaveProperty('u1');
});
test('a desync entry left by someone who is no longer in the match freezes nothing', async () => {
  const { a, b, server, openAs } = await pair();
  server.write('rooms/ABC234/desync/ghost', { n: 0, hash: '0'.repeat(16), build: 'x' }); await settle(server);
  expect(a.view().myTurn).toBe(true);
  server.write('rooms/ABC234/desync/u1', { n: 0, hash: '0'.repeat(16), build: 'x' }); await settle(server);
  expect(a.view().myTurn).toBe(false);                   // Ben is a member: the match waits for him
  b!.close(); await settle(server);
  const c = await openAs('u7', 'ABC234'); expect(await c.takeOver(1)).toBe(true); await settle(server);
  expect(a.view().myTurn).toBe(true);                    // Ben's seat has a new owner and his entry went with the takeover
  expect((server.tree() as any).rooms.ABC234.desync ?? {}).toEqual({});
});
test('a stale desync entry that nobody manages to clear still blocks nothing', async () => {
  const { a, server } = await pair();
  server.failNext('u0'); server.failNext('u1');          // both phones' attempts to clear it are refused
  server.write('rooms/ABC234/desync/ghost', { n: 0, hash: '0'.repeat(16), build: 'x' }); await settle(server);
  expect((server.tree() as any).rooms.ABC234.desync).toHaveProperty('ghost');
  expect(a.view().myTurn).toBe(true);
});
test('resign from the waiting phone ends the match on both', async () => { await sharedBodies['resign out of turn']!(fakeKit()); });
test('a forged snapshot never becomes the match', async () => { await sharedBodies['a forged snapshot never becomes the match']!(fakeKit()); });
test('an action list this phone cannot read is a worded failure on both phones, never a silent stop', async () => {
  const { a, b, server } = await pair();
  server.write('rooms/ABC234/actions', { 0: '{"type":"endTurn"}', 2: '{"type":"endTurn"}' });   // a gap: not a list
  await settle(server);
  for (const s of [a, b!]) {
    expect(s.view().phase).toBe('failed'); expect(s.view().failure).toBe('unreadable'); expect(s.view().myTurn).toBe(false);
  }
});
test('a newcomer can take an absent seat and play on', async () => {
  const { a, b, server, openAs } = await pair(); b!.close(); await settle(server);
  const c = await openAs('u7', 'ABC234'); await settle(server);
  expect(c.view().phase).toBe('join'); expect(c.view().absent).toEqual([1]);
  expect(await c.takeOver(1)).toBe(true); await settle(server);
  expect(c.view().mySeat).toBe(1); expect(hashState(c.view().followed!.state)).toBe(hashState(a.view().followed!.state));
});
test('an AI seat is played by the host', async () => {
  const { a } = await pair({ second: 'normal' });
  a.act({ type: 'endTurn' });
  await until(() => a.view().followed!.state.current === 0 && a.view().followed!.actions.length > 2);
  expect(a.view().followed!.actions.at(-1)).toBe('{"type":"endTurn"}');
});
test('an AI turn whose write is lost is picked up again, not left to stall', async () => {
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  const gated: AiClient = { think: async (input, opts) => { await gate; return planTurn(input, opts); }, dispose: () => {} };
  const { a, server } = await pair({ second: 'normal', ai: { u0: gated } });
  a.act({ type: 'endTurn' }); await settle(server);      // the AI turn is thinking; no timer ticks in this test
  server.failNext('u0'); open();                         // its first write is refused
  await until(() => a.view().followed!.state.current === 0 && a.view().followed!.actions.length > 2);
  expect(server.log().filter(w => w.paths.some(p => p.startsWith('actions/'))).every(w => w.uid === 'u0')).toBe(true);
});
test('the AI seat carries on from another device of the same person', async () => {
  // Ann's phone is stuck mid AI turn and closes; Ann opens the link on a second device (new uid u9). Takeover of seat 0
  // makes u9 a member. The stand-in rule (a present human member, the host away 30 s) elects u9; reclaim never fires
  // because u9 is not the creator. The AI turn is then played from u9's session, with its dial stepped once.
  const { a, server, openAs, timers } = await pair({ second: 'adaptive', ai: { u0: hanging() } });
  a.act({ type: 'endTurn' }); await settle(server);
  expect(a.view().followed!.actions).toEqual(['{"type":"endTurn"}']);       // the AI turn has not started writing
  a.close(); await settle(server);
  timers.tick(30_000);
  const other = await openAs('u9', 'ABC234'); expect(await other.takeOver(0)).toBe(true);
  timers.tick(1_000);
  await until(() => other.view().followed?.state.current === 0);
  expect(other.view().hostIsMe).toBe(true);
  const aiWrites = server.log().filter(w => w.paths.some(p => p.startsWith('actions/'))).slice(1);   // after Ann's endTurn
  expect(aiWrites.length).toBeGreaterThan(1);
  expect(aiWrites.every(w => w.uid === 'u9')).toBe(true);
  expect(aiWrites[0]!.paths).toContain('seats/1/adapt'); expect(aiWrites.slice(1).some(w => w.paths.includes('seats/1/adapt'))).toBe(false);
});
test('the guest stands in as host 30 s after the host leaves, and the creator takes it back', async () => {
  const { a, b, open, server, timers } = await pair();
  a.close(); await settle(server);
  timers.tick(29_000); await settle(server); expect(meta(server).hostId).toBe('u0');
  timers.tick(1_000); await settle(server); expect(meta(server).hostId).toBe('u1'); expect(b!.view().hostIsMe).toBe(true);
  await open('u0'); await settle(server); expect(meta(server).hostId).toBe('u0');
});
