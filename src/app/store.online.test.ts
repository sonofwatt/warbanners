import { expect, test, vi } from 'vitest';
import { hashState, legalActions, RULES_VERSION } from '../engine';
import type { AiLevel } from '../ai/types';
import { fakeServer } from '../net/fakeNet';
import type { FakeServer } from '../net/fakeNet';
import { fakePause, manualTimers, settle, thinker, until } from '../net/sessionKit';
import type { ManualTimers } from '../net/sessionKit';
import type { AiClient } from './aiClient';
import { digestFor } from './digest';
import { listOnline } from './onlineList';
import { listSaves } from './saves';
import { readLines, recentNames } from './stats';
import type { KeyValue } from './saves';
import { createAppStore } from './store';
import type { AppState, Deps } from './store';

vi.mock('./digest', async (orig) => { const m = await orig<typeof import('./digest')>(); return { ...m, digestFor: vi.fn(m.digestFor) }; });

const timersOf = new WeakMap<FakeServer, ManualTimers>();
const timersFor = (server: FakeServer): ManualTimers => {
  let t = timersOf.get(server);
  if (!t) { t = manualTimers(server); timersOf.set(server, t); }
  return t;
};
const memoryKv = (): KeyValue => {
  const map = new Map<string, string>();
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: k => { map.delete(k); } };
};

interface Over extends Partial<Deps> { uid: string; server?: FakeServer }
// One phone: plan 3's deps plus the online ones, on a fake server shared by the phones of one test.
function online(over: Over) {
  const { uid, server: given, ...rest } = over;
  const server = given ?? fakeServer(1_000_000);
  const kv = rest.kv ?? memoryKv();
  let cleared = 0;
  const inUrl: string[] = [];
  let code: string | null = null;
  const deps: Deps = {
    kv, now: () => server.now(), newSeed: () => 7, newId: () => 'm1', ai: thinker(), sleep: async () => {},
    openNet: async () => server.as(uid), online: () => true, netReady: () => true,
    setTimer: timersFor(server).setTimerFor(uid), pause: fakePause, build: 't', inviteBase: () => 'https://sonofwatt.github.io/warbanners/',
    roomToUrl: (c) => { inUrl.push(c); },
    clearRoomFromUrl: () => { cleared += 1; },
    ...rest,
  };
  const store = createAppStore(deps);
  const seen = (s: AppState): void => { if (s.online !== null) code = s.online.code; };
  seen(store.getState());
  store.subscribe(seen);
  return {
    get: store.getState, subscribe: store.subscribe, server, kv, deps,
    get cleared() { return cleared; },
    inUrl,
    get code() { return code!; },
  };
}
type Phone = ReturnType<typeof online>;

function twoStores(opts: { ai?: AiClient } = {}): { host: Phone; guest: Phone; server: FakeServer } {
  const server = fakeServer(1_000_000);
  const host = online({ uid: 'u0', server, ...(opts.ai ? { ai: opts.ai } : {}) });
  const guest = online({ uid: 'u1', server });
  return { host, guest, server };
}

async function lobbyOnServer(code: string, opts: { rulesVersion?: number } = {}): Promise<{ server: FakeServer }> {
  const server = fakeServer(1_000_000);
  const r = await server.as('u0').create({ code, name: 'Ann', hostFaction: 'spartans', clock: 120, rulesVersion: opts.rulesVersion ?? RULES_VERSION, build: 't' });
  expect(r).toBe(true);
  return { server };
}

async function startedPair(opts: { second?: 'human' | AiLevel; ai?: AiClient } = {}): Promise<{ host: Phone; guest: Phone; server: FakeServer }> {
  const { second = 'human' } = opts;
  const { host, guest, server } = twoStores(opts.ai ? { ai: opts.ai } : {});
  await host.get().createRoom({ name: 'Ann', faction: 'spartans', clock: 120 });
  await settle(server);
  const code = host.get().online!.code;
  if (second === 'human') {
    guest.get().openRoom(code); await settle(server);
    await guest.get().joinAs('Ben');
  } else {
    expect(await server.as('u0').setAiSeat(code, 1, { uid: 'ai_1', name: 'Bot', kind: 'ai', level: second, salt: 7, adapt: { dial: 0.5, trend: 0 } })).toBe(true);
  }
  await settle(server);
  host.get().startOnline(); await settle(server);
  expect(host.get().screen).toBe('match');
  return { host, guest, server };
}

test('a link with a room code opens that room, once: the address keeps it until the player leaves', async () => {
  const { server } = await lobbyOnServer('ABC234');
  const g = online({ uid: 'u1', server, roomFromUrl: () => 'ABC234' }); await settle(server);
  expect(g.get().screen).toBe('join'); expect(g.cleared).toBe(0); expect(g.inUrl).toEqual(['ABC234']);
  g.get().goHome();
  expect(g.get().screen).toBe('home'); expect(g.cleared).toBe(1);
});
test('a room made here goes in the address too, so a reload comes back to the lobby', async () => {
  const { host } = twoStores();
  await host.get().createRoom({ name: 'Ann', faction: 'spartans', clock: 120 });
  expect(host.get().screen).toBe('lobby'); expect(host.inUrl).toEqual([host.get().online!.code]);
});
test('host: create, wait, start, and play with no curtain', async () => {
  const { host, guest, server } = twoStores();
  await host.get().createRoom({ name: 'Ann', faction: 'spartans', clock: 120 });
  expect(host.get().screen).toBe('lobby'); expect(host.get().inviteLink).toMatch(/\/warbanners\/\?room=[A-HJ-NP-Z2-9]{6}$/);
  guest.get().openRoom(host.get().online!.code); await settle(server); await guest.get().joinAs('Ben');
  host.get().startOnline(); await settle(server);
  expect(host.get()).toMatchObject({ screen: 'match', mode: 'online', viewer: 0 });
  host.get().run({ type: 'endTurn' }); await settle(server);
  expect(host.get().screen).toBe('match'); expect(host.get().viewer).toBe(0); expect(host.get().online!.myTurn).toBe(false);
  expect(guest.get()).toMatchObject({ screen: 'match', viewer: 1 }); expect(guest.get().online!.myTurn).toBe(true);
});
test('the waiting player can look but not act', async () => {
  const { guest } = await startedPair();
  const before = guest.get().state;
  const mine = guest.get().state!.units.find(u => u.owner === 1)!;
  guest.get().tap({ unit: mine.id, hex: mine.pos });
  expect(guest.get().selection).toMatchObject({ kind: 'unit', id: mine.id });
  guest.get().run({ type: 'endTurn' });
  expect(guest.get().state).toBe(before);
});
test('the waiting player can resign', async () => {
  const { host, guest, server } = await startedPair();
  expect(guest.get().online!.myTurn).toBe(false);
  guest.get().resignOnline(); await settle(server);
  expect(host.get().screen).toBe('result'); expect(guest.get().screen).toBe('result');
  expect(host.get().state!.winner).toBe(0);
});
test('each phone records only its own player once the end is on the server, and remembers the name typed', async () => {
  const { host, guest, server } = await startedPair();
  guest.get().resignOnline();
  // Still sending: the server does not hold the resign yet, so nothing is counted.
  if (guest.get().online?.sending === true) expect(readLines(guest.kv, 0)).toHaveLength(0);
  await settle(server);
  const h = readLines(host.kv, 0);
  const g = readLines(guest.kv, 0);
  expect(h.map(l => [l.name, l.kind, l.won, l.opponent?.name])).toEqual([['Ann', 'online', true, 'Ben']]);
  expect(g.map(l => [l.name, l.kind, l.won, l.opponent?.name])).toEqual([['Ben', 'online', false, 'Ann']]);
  // The view keeps firing on the result screen and on going home: still one line.
  host.get().goHome(); guest.get().goHome(); await settle(server);
  expect(readLines(host.kv, 0)).toHaveLength(1);
  expect(recentNames(host.kv)).toEqual(['Ann']);
  expect(recentNames(guest.kv)).toEqual(['Ben']);
});
test('online against an AI seat, the line carries its level', async () => {
  const { host, server } = await startedPair({ second: 'hard' });
  host.get().resignOnline(); await settle(server);
  expect(readLines(host.kv, 0)).toMatchObject([{ name: 'Ann', kind: 'online', ai: 'hard', won: false }]);
});
test('the other phone\'s moves arrive with effects', async () => {
  const { host, guest, server } = await startedPair();
  const seq = guest.get().last?.seq ?? 0;
  const move = legalActions(host.get().state!).find(a => a.type === 'move')!;
  host.get().run(move); await settle(server);
  expect(guest.get().last!.seq).toBeGreaterThan(seq);
  expect(hashState(guest.get().state!)).toBe(hashState(host.get().state!));
});
test('the digest is built for my seat from the opponent\'s steps when the turn comes back', async () => {
  const { host, guest, server } = await startedPair();
  const move = legalActions(host.get().state!).find(a => a.type === 'move')!;
  vi.mocked(digestFor).mockClear();
  host.get().run(move); host.get().run({ type: 'endTurn' }); await settle(server);
  const [viewer, steps] = vi.mocked(digestFor).mock.lastCall!;
  expect(viewer).toBe(1); expect(steps).toHaveLength(2);
  expect(hashState(steps.at(-1)!.after)).toBe(hashState(guest.get().state!));
  expect(guest.get().digest).toEqual(digestFor(1, steps));
});
test('online play never starts the solo AI loop, and solo play never opens the network', async () => {
  const think = vi.fn(thinker().think); const opened = vi.fn();
  const local = online({ uid: 'u0', ai: { think, dispose: () => {} }, openNet: async () => { opened(); return null as never; } });
  local.get().startMatch({ names: ['Ann', 'Bot'], factions: ['spartans', 'mongols'], second: 'easy' });
  local.get().run({ type: 'endTurn' }); await until(() => local.get().aiBusy === false && local.get().state!.current === 0);
  expect(think).toHaveBeenCalled(); expect(opened).not.toHaveBeenCalled();
  const onlineThink = vi.fn(thinker().think);
  const { host } = await startedPair({ second: 'easy', ai: { think: onlineThink, dispose: () => {} } });
  const busy: boolean[] = []; host.subscribe(s => { busy.push(s.aiBusy); });
  host.get().run({ type: 'endTurn' });
  await until(() => host.get().state!.current === 0);
  expect(onlineThink).toHaveBeenCalled();                     // the AI seat was played
  expect(busy.includes(true)).toBe(false);                    // and not by playAi, which is the only code that sets aiBusy
});
test('rooms on stale rules say so', async () => {
  const s = online({ uid: 'u0' }); s.server.failCreatesWith('schema');
  await s.get().createRoom({ name: 'Ann', faction: 'spartans', clock: 120 });
  expect(s.get().notice).toBe('serverOutOfDate'); expect(s.get().screen).toBe('onlineSetup');
});
test('no connection, or no config, says so before loading the network', async () => {
  const opened = vi.fn();
  const off = online({ uid: 'u0', online: () => false, openNet: async () => { opened(); return null as never; } });
  off.get().openOnline(); await off.get().createRoom({ name: 'Ann', faction: 'spartans', clock: 120 });
  expect(off.get().notice).toBe('needsConnection');
  const bare = online({ uid: 'u0', netReady: () => false, openNet: async () => { opened(); return null as never; } });
  await bare.get().createRoom({ name: 'Ann', faction: 'spartans', clock: 120 });
  expect(bare.get().notice).toBe('notSetUp'); expect(opened).not.toHaveBeenCalled();
});
test('an update asks first while an online match is unfinished, and only from Home', async () => {
  const { host } = await startedPair(); const apply = vi.fn(async () => {});
  host.deps.updater = { apply, check: () => {}, homeReached: () => {} };
  host.get().setUpdate({ offlineReady: true, updateReady: true });
  host.get().applyUpdate(true); expect(apply).not.toHaveBeenCalled();          // mid-match: never
  host.get().goHome();
  host.get().applyUpdate(); expect(host.get().notice).toBe('updateDuringOnline'); expect(apply).not.toHaveBeenCalled();
  host.get().applyUpdate(true); expect(apply).toHaveBeenCalledTimes(1);
});
test('a click event is not a confirmation', async () => {
  const { host } = await startedPair(); const apply = vi.fn(async () => {});
  host.deps.updater = { apply, check: () => {}, homeReached: () => {} };
  host.get().setUpdate({ offlineReady: true, updateReady: true });
  host.get().goHome();
  (host.get().applyUpdate as (x: unknown) => void)({ type: 'click' });
  expect(apply).not.toHaveBeenCalled(); expect(host.get().notice).toBe('updateDuringOnline');
});
test('a newer room sends the player Home to update, and the room comes back after the reload', async () => {
  const { server } = await lobbyOnServer('ABC234', { rulesVersion: RULES_VERSION + 1 });
  const g = online({ uid: 'u1', server, roomFromUrl: () => 'ABC234' }); await settle(server);
  expect(g.get().online!.phase).toBe('version');
  g.get().updateForRoom(); expect(g.get().screen).toBe('home');
  const after = online({ uid: 'u1', server, kv: g.kv }); await settle(server);
  expect(after.get().online!.code).toBe('ABC234');
});
test('reopening the game lists the online match and resumes it; the saves are untouched', async () => {
  const { host, server } = await startedPair();
  host.get().run({ type: 'endTurn' }); await settle(server);
  const hash = hashState(host.get().state!);                   // read before Home, which clears the board
  host.get().goHome();
  const savesBefore = host.get().saves;
  const again = online({ uid: 'u0', server, kv: host.kv }); await settle(server);
  expect(again.get().onlineList.map(e => e.code)).toEqual([host.code]);
  expect(again.get().saves).toEqual(savesBefore);
  again.get().openRoom(host.code); await settle(server);
  expect(again.get().screen).toBe('match'); expect(hashState(again.get().state!)).toBe(hash);
});

// ---- beyond the brief: the ledger's notices, Home, and local mode left alone ----

test('reopening shows the last known board at once, before the server answers', async () => {
  const { host, server } = await startedPair();
  const hash = hashState(host.get().state!);
  host.get().goHome();
  const again = online({ uid: 'u0', server, kv: host.kv });
  again.get().openRoom(host.code);
  expect(again.get()).toMatchObject({ screen: 'match', mode: 'online', viewer: 0 });
  expect(hashState(again.get().state!)).toBe(hash);
  await settle(server);
});
test('online matches never touch the saves, and Home leaves the room on the server', async () => {
  const { host, server } = await startedPair();
  host.get().run({ type: 'endTurn' }); await settle(server);
  expect(listSaves(host.kv)).toEqual([]);
  host.get().goHome();
  expect(host.get()).toMatchObject({ screen: 'home', mode: 'local', online: null, state: null });
  expect(host.get().onlineList.map(e => e.code)).toEqual([host.code]);
  expect((server.tree() as { rooms: Record<string, unknown> }).rooms[host.code]).toBeDefined();
});
test('a local match after an online one is local again', async () => {
  const { host } = await startedPair();
  host.get().goHome();
  host.get().startMatch({ names: ['Ann', 'Ben'], factions: ['spartans', 'mongols'] });
  expect(host.get()).toMatchObject({ screen: 'pass', mode: 'local', online: null });
  expect(listSaves(host.kv).map(s => s.id)).toEqual(['m1']);
});
test('a resign that loses its race tells the player', async () => {
  const { host, guest, server } = await startedPair();
  server.failNext('u1');
  guest.get().resignOnline(); await settle(server);
  expect(guest.get().screen).toBe('match'); expect(guest.get().notice).toBe('resignLost');
  expect(host.get().state!.winner).toBeNull();
});
test('an unfinished online match dropped from the list for room is reported', async () => {
  const kv = memoryKv();
  // Twenty unfinished entries from long ago fill the list; the next match pushes the oldest out.
  const entries = Array.from({ length: 20 }, (_, i) => ({
    code: `ABCD${'23456789'[Math.floor(i / 8)]}${'23456789'[i % 8]}`, seat: 0, names: ['Ann', 'Ben'], factions: ['spartans', 'mongols'],
    round: 1, current: 0, over: false, rulesVersion: RULES_VERSION, createdHere: false, updatedAt: i,
  }));
  kv.setItem('warbanners.online.v1', JSON.stringify(entries));
  const server = fakeServer(1_000_000);
  const host = online({ uid: 'u0', server, kv });
  const guest = online({ uid: 'u1', server });
  await host.get().createRoom({ name: 'Ann', faction: 'spartans', clock: 120 }); await settle(server);
  guest.get().openRoom(host.code); await settle(server); await guest.get().joinAs('Ben'); await settle(server);
  expect(host.get().notice).toBe('onlineListDropped');
  expect(listOnline(kv).map(e => e.code)).toContain(host.code);
});
test('a failed write of the online list is reported', async () => {
  const server = fakeServer(1_000_000);
  const kv = memoryKv();
  const broken: KeyValue = { ...kv, setItem: (k, v) => { if (k === 'warbanners.online.v1') throw new Error('quota'); kv.setItem(k, v); } };
  const host = online({ uid: 'u0', server, kv: broken });
  await host.get().createRoom({ name: 'Ann', faction: 'spartans', clock: 120 }); await settle(server);
  expect(host.get().notice).toBe('onlineListFailed');
});
test('a room that is gone says so and goes Home', async () => {
  const server = fakeServer(1_000_000);
  const g = online({ uid: 'u1', server, roomFromUrl: () => 'ZZZ234' }); await settle(server);
  expect(g.get()).toMatchObject({ screen: 'home', notice: 'roomGone', mode: 'local', online: null });
});
test('forgetting a finished room made here deletes it on the server', async () => {
  const { host, guest, server } = await startedPair();
  guest.get().resignOnline(); await settle(server);
  const code = host.code;
  host.get().goHome();
  host.get().forgetRoom(code); await settle(server);
  expect(host.get().onlineList).toEqual([]);
  expect((server.tree() as { rooms?: Record<string, unknown> }).rooms?.[code]).toBeUndefined();
});
test('Home sweeps a finished room made here once the network is open', async () => {
  const { host, guest, server } = await startedPair();
  guest.get().resignOnline(); await settle(server);
  const code = host.code;
  host.get().goHome();
  server.setNow(server.now() + 2 * 86_400_000);
  host.get().openOnline(); host.get().goHome(); await settle(server);
  expect(host.get().onlineList).toEqual([]);
  expect((server.tree() as { rooms?: Record<string, unknown> }).rooms?.[code]).toBeUndefined();
});

// ---- the final review's fix wave ----

test('a resign whose write has not landed is not marked over on Home, and neither Remove nor the sweep deletes the room', async () => {
  const server = fakeServer(1_000_000);
  let stall = false;
  const host = online({ uid: 'u0', server, openNet: async () => {
    const n = server.as('u0');
    return { ...n, append: (code, a) => (stall ? new Promise(() => {}) : n.append(code, a)) };   // the socket died unnoticed
  } });
  const guest = online({ uid: 'u1', server });
  await host.get().createRoom({ name: 'Ann', faction: 'spartans', clock: 120 }); await settle(server);
  const code = host.code;
  guest.get().openRoom(code); await settle(server); await guest.get().joinAs('Ben'); await settle(server);
  host.get().startOnline(); await settle(server);
  stall = true;
  host.get().resignOnline(); await settle(server);
  expect(host.get().screen).toBe('result'); expect(host.get().online!.sending).toBe(true);
  expect(listOnline(host.kv).find(e => e.code === code)!.over).toBe(false);
  host.get().goHome();
  server.setNow(server.now() + 2 * 86_400_000);
  host.get().openOnline(); host.get().goHome(); await settle(server);            // the sweep runs
  expect(host.get().onlineList.map(e => e.code)).toEqual([code]);
  expect((server.tree() as { rooms?: Record<string, unknown> }).rooms?.[code]).toBeDefined();
  host.get().forgetRoom(code); await settle(server);                            // Remove
  expect((server.tree() as { rooms?: Record<string, unknown> }).rooms?.[code]).toBeDefined();
  expect(guest.get().state!.winner).toBeNull();
});
test('the Home entry is marked over once the last write has landed', async () => {
  const { host, server } = await startedPair();
  host.get().resignOnline();
  expect(host.get().online!.sending).toBe(true);
  expect(listOnline(host.kv).find(e => e.code === host.code)!.over).toBe(false);
  await settle(server);
  expect(host.get().online!.sending).toBe(false);
  expect(listOnline(host.kv).find(e => e.code === host.code)!.over).toBe(true);
});
test('a failed write of the online list is told once a session, and never over a lost resign', async () => {
  const server = fakeServer(1_000_000);
  const brokenKv = (): KeyValue => {
    const kv = memoryKv();
    return { ...kv, setItem: (k, v) => { if (k === 'warbanners.online.v1') throw new Error('quota'); kv.setItem(k, v); } };
  };
  const host = online({ uid: 'u0', server, kv: brokenKv() });
  const guest = online({ uid: 'u1', server, kv: brokenKv() });
  await host.get().createRoom({ name: 'Ann', faction: 'spartans', clock: 120 }); await settle(server);
  expect(host.get().notice).toBe('onlineListFailed');
  host.get().dismissNotice();
  guest.get().openRoom(host.code); await settle(server); await guest.get().joinAs('Ben'); await settle(server);
  host.get().startOnline(); await settle(server);
  const move = legalActions(host.get().state!).find(a => a.type === 'move')!;
  host.get().run(move); await settle(server);
  host.get().run({ type: 'endTurn' }); await settle(server);
  expect(host.get().notice).toBeNull();                    // not back on every move once dismissed
  guest.get().dismissNotice();
  server.failNext('u1');
  guest.get().resignOnline(); await settle(server);
  expect(guest.get().notice).toBe('resignLost');
});

// ---- plan 5: an offline Continue, and a page made visible ----

// A match cached on this phone (Ann's, after her first turn), and the board it holds.
async function cachedMatch(): Promise<{ host: Phone; server: FakeServer; hash: string }> {
  const { host, server } = await startedPair();
  host.get().run({ type: 'endTurn' }); await settle(server);
  const hash = hashState(host.get().state!);
  host.get().goHome();
  return { host, server, hash };
}
test('Continue with no connection shows the cached board, not needsConnection', async () => {
  const { host, server, hash } = await cachedMatch();
  const off = online({ uid: 'u0', server, kv: host.kv, online: () => false });
  off.get().openRoom(host.code);
  expect(off.get()).toMatchObject({ screen: 'match', mode: 'online', viewer: 0 });
  expect(off.get().notice).not.toBe('needsConnection');
  expect(hashState(off.get().state!)).toBe(hash);
  await settle(server);
  expect(off.get().online).not.toBeNull();               // the session is open as usual, and takes over once it answers
  expect(off.get().online!.code).toBe(host.code); expect(off.get().screen).toBe('match');
  expect(hashState(off.get().state!)).toBe(hash);
});
test('Continue with no connection and no cache still says needsConnection', async () => {
  const { host, server } = await cachedMatch();
  host.kv.removeItem(`warbanners.online.${host.code}`);
  const off = online({ uid: 'u0', server, kv: host.kv, online: () => false });
  off.get().openRoom(host.code);
  expect(off.get()).toMatchObject({ screen: 'home', notice: 'needsConnection', mode: 'local', online: null, state: null });
  await settle(server);
  expect(off.get().online).toBeNull();
});
test('an offline Continue on a rules 3 cache still says needsConnection', async () => {
  const { host, server } = await cachedMatch();
  const key = `warbanners.online.${host.code}`;
  host.kv.setItem(key, JSON.stringify({ ...JSON.parse(host.kv.getItem(key)!), rulesVersion: RULES_VERSION - 1 }));
  const off = online({ uid: 'u0', server, kv: host.kv, online: () => false });
  off.get().openRoom(host.code);
  expect(off.get()).toMatchObject({ screen: 'home', notice: 'needsConnection', mode: 'local', online: null, state: null });
  await settle(server);
  expect(off.get().online).toBeNull();
});
test('a visibilitychange to visible calls the open session wake once', async () => {
  const listeners = new Set<() => void>();
  const onVisible = (fn: () => void): (() => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
  const server = fakeServer(1_000_000);
  const host = online({ uid: 'u0', server, onVisible });
  const guest = online({ uid: 'u1', server });
  expect(listeners.size).toBe(0);                        // nothing listens before a session is open
  await host.get().createRoom({ name: 'Ann', faction: 'spartans', clock: 120 }); await settle(server);
  guest.get().openRoom(host.code); await settle(server); await guest.get().joinAs('Ben'); await settle(server);
  host.get().startOnline(); await settle(server);
  expect(listeners.size).toBe(1);
  const returns = (): number => server.log().filter(w => w.uid === 'u0' && w.paths.length === 1 && w.paths[0] === `rooms/${host.code}/presence/u0`).length;
  const before = returns();
  for (const fn of listeners) fn();
  expect(host.get().online!.returning).toBe(true);
  await settle(server);
  expect(returns()).toBe(before + 1);
  expect(host.get().online!.returning).toBe(false);
  host.get().goHome();
  expect(listeners.size).toBe(0);                        // let go with the session
});
