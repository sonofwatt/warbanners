/// <reference types="node" />
// Test helpers for the online session, and the test bodies that run against both the in-memory server and the
// emulator. Nothing in the app imports this file.
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { setLogLevel } from 'firebase/app';
import { get, ref, update, type Database } from 'firebase/database';
import { expect } from 'vitest';
import { hashState, legalActions, RULES_VERSION, type PlayerId } from '../engine';
import type { AiLevel } from '../ai/types';
import { planTurn } from '../ai/plan';
import type { AiClient } from '../app/aiClient';
import { openSession, type Session, type SessionDeps, type SessionPhase, type SessionView } from '../online/session';
import { DROP_PAUSE_MS, encodeAction, makeRoomCode, type ClockSec, type Head, type RoomMeta } from '../online/wire';
import { fakeServer, type FakeServer } from './fakeNet';
import { EMU, fb, setOnline, watchConnected } from './firebase';
import { firebaseNet } from './firebaseNet';
import type { Net } from './net';

// ---- time and flushing on the fake ----

export interface ManualTimers {
  setTimerFor(uid: string): (fn: () => void, ms: number) => () => void;
  tick(ms: number): void;     // moves time forward to now + ms in steps: at each step the earliest due timer of a
                              // non-frozen uid fires (server.setNow to its time first). A one-shot timer fires once;
                              // one re-armed while firing fires again if its new time is still inside the tick, so a
                              // timer re-armed every second fires once per second of the tick. Ends with setNow(now + ms).
                              // tick is synchronous: no promise runs inside it, so tests call settle() after it.
  freeze(uid: string): void;  // that uid's timers stop firing (its phone is asleep but still connected)
  thaw(uid: string): void;    // they fire again from the next tick, at most once each for time already passed
}

export function manualTimers(server: FakeServer): ManualTimers {
  interface T { id: number; uid: string; at: number; fn: () => void }
  let timers: T[] = [];
  let next = 0;
  const frozen = new Set<string>();
  return {
    setTimerFor: (uid) => (fn, ms) => {
      const t: T = { id: next++, uid, at: server.now() + ms, fn };
      timers.push(t);
      return () => { timers = timers.filter((x) => x !== t); };
    },
    tick(ms) {
      const end = server.now() + ms;
      for (;;) {
        const due = timers.filter((t) => !frozen.has(t.uid) && t.at <= end).sort((x, y) => x.at - y.at || x.id - y.id)[0];
        if (!due) break;
        timers = timers.filter((t) => t !== due);
        server.setNow(Math.max(server.now(), due.at));   // a thawed timer that is overdue fires now, not back in time
        due.fn();
      }
      server.setNow(end);
    },
    freeze: (uid) => { frozen.add(uid); },
    thaw: (uid) => { frozen.delete(uid); },
  };
}

const turn = (): Promise<void> => new Promise((r) => setImmediate(r));

/** Awaits setImmediate until server.idle() twice in a row, at most 200 rounds. */
export async function settle(server: FakeServer): Promise<void> {
  let quiet = 0;
  for (let i = 0; i < 200 && quiet < 2; i++) {
    await turn();
    quiet = server.idle() ? quiet + 1 : 0;
  }
}

/** Polls with settle-like flushes until pred holds; fails after ms of real time. */
export async function until(pred: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error('until: the condition never held');
    await turn();
  }
}

// ---- AI clients ----

/** The planner on the main thread, standing in for the worker. */
export const thinker = (): AiClient => ({ think: async (input, opts) => planTurn(input, opts), dispose: () => {} });
/** A think that never answers: a host phone stuck mid AI turn. */
export const hanging = (): AiClient => ({ think: () => new Promise(() => {}), dispose: () => {} });

// ---- pairs of phones on the fake ----

const CODE = 'ABC234';
const START = 1_000_000;
const seen = new WeakMap<Session, SessionPhase[]>();
/** Every phase a session opened by these helpers has shown, in order (repeats collapsed). */
export function phasesSeen(s: Session): SessionPhase[] { return seen.get(s) ?? []; }
function recorded(open: (onChange: (v: SessionView) => void) => Session): Session {
  const phases: SessionPhase[] = [];
  const s = open((v) => { if (phases.at(-1) !== v.phase) phases.push(v.phase); });
  seen.set(s, phases);
  return s;
}

// The fake logs full paths; the session tests read them relative to the room, as the patches spell them.
function roomLog(raw: FakeServer): FakeServer {
  return { ...raw, log: () => raw.log().map((w) => ({ uid: w.uid, paths: w.paths.map((p) => p.replace(/^rooms\/[^/]+\/?/, '')) })) };
}

function opener(server: FakeServer, timers: ManualTimers, ai?: Partial<Record<string, AiClient>>) {
  return async (uid: string, code: string): Promise<Session> => {
    const deps: SessionDeps = { net: server.as(uid), ai: ai?.[uid] ?? thinker(), build: 't', setTimer: timers.setTimerFor(uid) };
    const s = recorded((onChange) => openSession(code, deps, onChange));
    await settle(server);
    return s;
  };
}

export interface Pair {
  a: Session; b: Session | null; server: FakeServer; timers: ManualTimers;
  open(uid: 'u0' | 'u1'): Promise<Session>; openAs(uid: string, code: string): Promise<Session>;
}

/** Room ABC234 made by u0 (Ann, spartans), joined by u1 (Ben) or given an AI seat, started with seed 42. */
export async function pair(opts: { clock?: ClockSec; second?: 'human' | AiLevel; ai?: Partial<Record<string, AiClient>> } = {}): Promise<Pair> {
  const { clock = 120, second = 'human', ai } = opts;
  const raw = fakeServer(START);
  const server = roomLog(raw);
  const timers = manualTimers(raw);
  const openAs = opener(server, timers, ai);
  expect(await raw.as('u0').create({ code: CODE, name: 'Ann', hostFaction: 'spartans', clock, rulesVersion: RULES_VERSION, build: 't' })).toBe(true);
  const a = await openAs('u0', CODE);
  let b: Session | null = null;
  if (second === 'human') {
    b = await openAs('u1', CODE);
    expect(await b.join('Ben')).toBe(true);
  } else {
    expect(await raw.as('u0').setAiSeat(CODE, 1, { uid: 'ai_1', name: 'Bot', kind: 'ai', level: second, salt: 7, adapt: { dial: 0.5, trend: 0 } })).toBe(true);
  }
  await settle(server);
  expect(await a.start(42)).toBe(true);
  await settle(server);
  return { a, b, server, timers, open: (uid) => openAs(uid, CODE), openAs };
}

export async function bareServer(): Promise<{ server: FakeServer; timers: ManualTimers; openAs(uid: string, code: string): Promise<Session> }> {
  const server = roomLog(fakeServer(START));
  const timers = manualTimers(server);
  return { server, timers, openAs: opener(server, timers) };
}

/** Each side makes its first legal move (if any) and ends its turn. */
export async function playTurns(a: Session, b: Session, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const stamp = a.view().followed!.state.stamp;
    const s = a.view().followed!.state.current === a.view().mySeat ? a : b;
    await until(() => s.view().myTurn);
    const legal = legalActions(s.view().followed!.state).filter((x) => x.type !== 'resign' && x.type !== 'endTurn');
    if (legal.length) expect(s.act(legal[0]!)).not.toBeNull();
    expect(s.act({ type: 'endTurn' })).not.toBeNull();
    await until(() => a.view().followed!.state.stamp === stamp + 1 && b.view().followed!.state.stamp === stamp + 1 && !s.view().sending);
  }
}

/**
 * Watches every readStart from Nets made after the call. When it offers a snapshot, `usedSnap` turns true and the
 * settings are swapped for another seed: a replay from the start then builds a different map and never agrees with
 * the record, so a session can only reach the other phone's hash by starting from the snapshot.
 */
export function spyReadStart(server: FakeServer): { usedSnap: boolean } {
  const spy = { usedSnap: false };
  const as = server.as;
  server.as = (uid: string): Net => {
    const net = as(uid);
    return {
      ...net,
      async readStart(code) {
        const r = await net.readStart(code);
        if (typeof r !== 'object' || r.snap === null || r.snap.n < 2) return r;
        spy.usedSnap = true;
        return { ...r, settings: { ...r.settings, seed: r.settings.seed + 1 } };
      },
    };
  };
  return spy;
}

type Tree = { rooms: Record<string, { head: Head; meta: RoomMeta; presence?: Record<string, { on: boolean; at: number }> }> };
export function headOf(server: FakeServer): Head { return (server.tree() as Tree).rooms[CODE]!.head; }
export function meta(server: FakeServer): RoomMeta { return (server.tree() as Tree).rooms[CODE]!.meta; }

// ---- the bodies that run against both the fake and the emulator ----

export interface SessionKit {
  start(opts?: { clock?: ClockSec }): Promise<{ a: Session; b: Session }>;   // fresh code; Ann creates, Ben joins, Ann starts with seed 42
  reopen(who: 'a' | 'b'): Promise<Session>;                    // a new session on the same identity
  drop(who: 'a' | 'b'): void; back(who: 'a' | 'b'): Promise<void>;
  rewind(turnMs: number, away?: { who: 'a' | 'b'; ms: number }): Promise<void>;   // head/turnAt (and that phone's presence/at)
                                                               // moved back, in ONE rules-free update, so no phone ever sees half of it
  head(): Promise<Head | null>;
  until(pred: () => boolean, ms?: number): Promise<void>;
  closeAll(): void;                                            // closes every session the kit opened
}

export function fakeKit(): SessionKit {
  let p: Pair | null = null;
  const opened: Session[] = [];
  const uid = (who: 'a' | 'b'): 'u0' | 'u1' => (who === 'a' ? 'u0' : 'u1');
  const P = (): Pair => { if (!p) throw new Error('start first'); return p; };
  return {
    async start(opts) {
      p = await pair({ clock: opts?.clock });
      opened.push(p.a, p.b!);
      return { a: p.a, b: p.b! };
    },
    async reopen(who) { const s = await P().open(uid(who)); opened.push(s); return s; },
    drop: (who) => P().server.drop(uid(who)),
    async back(who) { await P().server.back(uid(who)); await settle(P().server); },
    async rewind(turnMs, away) {
      const { server } = P();
      const room = (server.tree() as Tree).rooms[CODE]!;
      room.head.turnAt = server.now() - turnMs;
      if (away) room.presence![uid(away.who)]!.at = server.now() - away.ms;
      server.write(`rooms/${CODE}`, room);
      await settle(server);
    },
    head: async () => headOf(P().server),
    // Fake time moves only here: a quarter second per round once the fake has settled, so a body that waits for a
    // clock (a backup timeout) sees the phones' tickers fire.
    async until(pred, ms = 10_000) {
      const end = Date.now() + ms;
      for (;;) {
        if (p) await settle(p.server); else await turn();
        if (pred()) return;
        if (Date.now() > end) throw new Error('until: the condition never held');
        p?.timers.tick(250);
      }
    },
    closeAll: () => { for (const s of opened.splice(0)) s.close(); },
  };
}

let env: RulesTestEnvironment | null = null;
async function adminDo(fn: (db: Database) => Promise<void>): Promise<void> {
  env ??= await initializeTestEnvironment({ projectId: EMU.projectId, database: { host: EMU.host, port: EMU.dbPort } });
  await env.withSecurityRulesDisabled((ctx) => fn(ctx.database(EMU.databaseURL) as unknown as Database));
}
/** Lets the admin connection go, once every emulator test has finished. */
export async function cleanupAdmin(): Promise<void> { await env?.cleanup(); env = null; }

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const realTimer = (fn: () => void, ms: number): (() => void) => { const h = setTimeout(fn, ms); return () => clearTimeout(h); };
const connectedNow = (name: string): Promise<void> => new Promise((res) => {
  let off: (() => void) | null = null; let done = false;
  off = watchConnected(fb(name), (ok) => { if (ok && !done) { done = true; queueMicrotask(() => off?.()); res(); } });
});

async function poll(pred: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error('until: the condition never held');
    await sleep(25);
  }
}

/** Identities a<k> and b<k> on the emulator, a fresh code per start, real timers, drops through setOnline. */
export function firebaseKit(k: number): SessionKit {
  setLogLevel('error');   // refused writes are part of the game; the SDK would warn on each
  const names = { a: `a${k}`, b: `b${k}` };
  let code = '';
  const opened: Session[] = [];
  const open = (who: 'a' | 'b'): Session => {
    const s = recorded((onChange) => openSession(code, { net: firebaseNet(names[who]), ai: thinker(), build: 't', setTimer: realTimer }, onChange));
    opened.push(s);
    return s;
  };
  const uidOf = async (who: 'a' | 'b'): Promise<string> => firebaseNet(names[who]).uid();
  return {
    async start(opts) {
      code = makeRoomCode();
      expect(await firebaseNet(names.a).create({ code, name: 'Ann', hostFaction: 'spartans', clock: opts?.clock ?? 120, rulesVersion: RULES_VERSION, build: 't' })).toBe(true);
      const a = open('a');
      await poll(() => a.view().phase === 'lobby');
      const b = open('b');
      await poll(() => b.view().phase === 'join');
      expect(await b.join('Ben')).toBe(true);
      await poll(() => b.view().phase === 'lobby' && a.view().room?.seats[1] !== null && !a.view().returning && !b.view().returning);
      expect(await a.start(42)).toBe(true);
      await poll(() => a.view().phase === 'playing' && b.view().phase === 'playing');
      return { a, b };
    },
    async reopen(who) { return open(who); },
    drop: (who) => setOnline(fb(names[who]), false),
    async back(who) { setOnline(fb(names[who]), true); await connectedNow(names[who]); },
    async rewind(turnMs, away) {
      const now = Date.now();
      const patch: Record<string, number> = { 'head/turnAt': now - turnMs };
      if (away) patch[`presence/${await uidOf(away.who)}/at`] = now - away.ms;
      await adminDo(async (db) => { await update(ref(db, `rooms/${code}`), patch); });
    },
    async head() {
      let out: Head | null = null;
      await adminDo(async (db) => { out = (await get(ref(db, `rooms/${code}/head`))).val() as Head | null; });
      return out;
    },
    until: poll,
    closeAll: () => { for (const s of opened.splice(0)) s.close(); },
  };
}

// Ann's session stays open with its watcher, she acts, and the connection goes before the write lands (the SDK holds
// it and shows it in the cache at once). Her turn and the pause both run out on the server, Ben's backup takes
// index 0, and Ann comes back: her held write is refused, the cache rolls back, and her board is the database's.
async function heldAgainstTimeout(kit: SessionKit, play: (s: Session) => void): Promise<void> {
  const { a, b } = await kit.start();
  await kit.until(() => a.view().myTurn && !b.view().returning);
  play(a); kit.drop('a');
  expect(a.view().sending).toBe(true);
  await kit.until(() => b.view().absent.includes(0), 10_000);
  await kit.rewind(310_000, { who: 'a', ms: 300_000 });           // the 120 s turn and the 180 s pause have run out
  await kit.until(() => b.view().followed!.actions.length === 1 && b.view().followed!.state.current === 1, 10_000);
  expect(b.view().followed!.actions).toEqual(['{"type":"endTurn"}']);
  await kit.back('a');
  await kit.until(() => !a.view().sending && !a.view().returning && a.view().followed!.actions.length === 1, 10_000);
  expect(a.view().followed!.actions).toEqual(b.view().followed!.actions);
  expect(hashState(a.view().followed!.state)).toBe(hashState(b.view().followed!.state));
  expect(a.view().phase).toBe('playing'); expect(a.view().followed!.state.winner).toBeNull();
  expect(a.view().timedOut).toBe(0);                              // the clock ended her turn: the timeUp line
  expect(phasesSeen(a)).not.toContain('desync');                  // losing a race is not a broken match
  expect(a.view().myTurn).toBe(false);
}

export const sharedBodies: Record<string, (kit: SessionKit) => Promise<void>> = {
  'same match': async (kit) => {
    const { a, b } = await kit.start();
    for (let turn = 0; turn < 6; turn++) {
      const s = turn % 2 === 0 ? a : b;
      await kit.until(() => s.view().myTurn);
      const legal = legalActions(s.view().followed!.state).filter(x => x.type !== 'resign' && x.type !== 'endTurn');
      if (legal.length) expect(s.act(legal[0]!)).not.toBeNull();
      expect(s.act({ type: 'endTurn' })).not.toBeNull();
      await kit.until(() => a.view().followed!.state.stamp === turn + 1 && b.view().followed!.state.stamp === turn + 1);
    }
    expect(hashState(a.view().followed!.state)).toBe(hashState(b.view().followed!.state));
  },
  'reload mid-turn': async (kit) => {
    const { a } = await kit.start();
    await kit.until(() => a.view().myTurn);
    const move = legalActions(a.view().followed!.state).find(x => x.type === 'move')!;
    a.act(move); await kit.until(() => !a.view().sending);
    kit.drop('a'); await kit.until(() => !a.view().connected);
    expect(a.act({ type: 'endTurn' })).toBeNull();
    a.close(); await kit.back('a');
    const again = await kit.reopen('a');
    await kit.until(() => again.view().myTurn);
    expect(again.view().followed!.actions).toEqual([encodeAction(move)]);
  },
  'resign out of turn': async (kit) => {
    const { a, b } = await kit.start();
    await kit.until(() => a.view().myTurn && b.view().phase === 'playing');
    expect(b.resign()).toBe(true);
    await kit.until(() => a.view().phase === 'over' && b.view().phase === 'over');
    expect(a.view().followed!.state.winner).toBe(0 as PlayerId);
  },
  'clock through the server': async (kit) => {
    const { a, b } = await kit.start({ clock: 60 });
    await kit.until(() => a.view().myTurn);
    await kit.rewind(61_000);
    await kit.until(() => b.view().followed?.state.current === 1, 10_000);
    expect(a.view().timedOut).toBe(0);
  },
  'a resign that loses its index leaves the match playing': async (kit) => {
    const { a, b } = await kit.start();
    await kit.until(() => a.view().myTurn && b.view().phase === 'playing' && !b.view().returning);
    const move = legalActions(a.view().followed!.state).find(x => x.type === 'move')!;
    expect(b.resign()).toBe(true); kit.drop('b');                  // handed to the SDK, which holds it
    expect(b.view().phase).toBe('over');                           // it wins locally at once
    expect(a.act(move)).not.toBeNull(); await kit.until(() => !a.view().sending);   // Ann's move takes index 0
    await kit.back('b');
    await kit.until(() => !b.view().sending && !b.view().returning && b.view().followed!.actions.length === 1);
    expect(b.view().followed!.actions).toEqual([encodeAction(move)]);
    expect(b.view().phase).toBe('playing'); expect(b.view().followed!.state.winner).toBeNull();
    expect(phasesSeen(b)).not.toContain('desync');                 // losing a race is not a broken match
    expect(a.act({ type: 'endTurn' })).not.toBeNull();
    await kit.until(() => b.view().myTurn);                        // Ben plays on
  },
  'a resign that races the timeout is rolled back': (kit) => heldAgainstTimeout(kit, (s) => {
    expect(s.resign()).toBe(true);
    expect(s.view().phase).toBe('over');
  }),
  'a move held across a drop is refused, rolled back and rebuilt': (kit) => heldAgainstTimeout(kit, (s) => {
    expect(s.act(legalActions(s.view().followed!.state).find(x => x.type === 'move')!)).not.toBeNull();
  }),
  'back from a drop keeps the turn': async (kit) => {
    const { a, b } = await kit.start();
    await kit.until(() => a.view().myTurn);
    kit.drop('a'); await kit.until(() => b.view().absent.includes(0), 10_000);
    await kit.rewind(150_000, { who: 'a', ms: 120_000 });       // dropped 30 s into the turn, now 150 s in
    await kit.back('a');
    await kit.until(() => a.view().myTurn, 10_000);
    const head = (await kit.head())!;
    expect(head.n).toBe(0);
    expect(head.paused).toBeGreaterThan(115_000); expect(head.paused).toBeLessThan(DROP_PAUSE_MS);   // about 118 s plus the reconnect time
    await new Promise(r => setTimeout(r, 4_000));                 // past both phones' lead and grace
    expect((await kit.head())!.n).toBe(0);
  },
};
