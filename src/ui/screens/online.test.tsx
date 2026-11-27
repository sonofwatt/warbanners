import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { expect, test } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { createMatch, hashState, RULES_VERSION } from '../../engine';
import type { PlayerId } from '../../engine';
import { planTurn } from '../../ai/plan';
import type { AiClient } from '../../app/aiClient';
import { rememberOnline } from '../../app/onlineList';
import type { OnlineEntry } from '../../app/onlineList';
import { newRecord } from '../../app/record';
import type { KeyValue } from '../../app/saves';
import { createAppStore } from '../../app/store';
import type { AppState, Deps } from '../../app/store';
import { StoreContext } from '../../app/useApp';
import type { Refusal } from '../../net/net';
import type { SessionView } from '../../online/session';
import type { ClockSec, Room } from '../../online/wire';
import { App } from '../App';
import { T, fill } from '../text';
import { Match } from './Match';
import { guestAfterHostPick } from './OnlineSetup';
import { MIRROR_COLOUR, playerColour } from '../art/palette';

// Each screen gets a store in a given state: the online view is set on the store directly, as the session would.

interface Scene { store: StoreApi<AppState>; el: ReactElement }
const thinker = (): AiClient => ({ think: async (input, opts) => planTurn(input, opts), dispose: () => {} });
const memoryKv = (): KeyValue => {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } };
};
const storeWith = (over: Partial<Deps> = {}): StoreApi<AppState> => createAppStore({
  kv: memoryKv(), now: () => 1000, newSeed: () => 7, newId: () => 'm1', ai: thinker(), sleep: async () => {},
  openNet: () => Promise.reject(new Error('no network in a screen test')), online: () => true, netReady: () => true,
  ...over,
});
const render = (s: Scene | StoreApi<AppState>): string => {
  const scene = 'el' in s ? s : { store: s, el: <App /> };
  // Words come back as the player reads them: React escapes the apostrophe in "Ann's turn" and "I'm Ben".
  return renderToStaticMarkup(<StoreContext.Provider value={scene.store}>{scene.el}</StoreContext.Provider>)
    .replaceAll('&#x27;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');
};

const entry = (code: string, over: Partial<OnlineEntry> = {}): OnlineEntry => ({
  code, seat: 0, names: ['Ann', 'Ben'], factions: ['spartans', 'mongols'], round: 3, current: 0, over: false,
  rulesVersion: RULES_VERSION, createdHere: true, updatedAt: 5, ...over,
});

function homeWith(o: Partial<Deps> & { onlineEntries?: OnlineEntry[]; saves?: number } = {}): StoreApi<AppState> {
  const { onlineEntries = [], saves = 0, ...deps } = o;
  const kv = deps.kv ?? memoryKv();
  for (const e of onlineEntries) rememberOnline(kv, e, null);
  let n = 0;
  const store = storeWith({ ...deps, kv, newId: () => `m${++n}` });
  for (let i = 0; i < saves; i++) { store.getState().startMatch({ names: ['Cleo', 'Dan'], factions: ['spartans', 'mongols'] }); store.getState().goHome(); }
  return store;
}

function screen(name: AppState['screen']): StoreApi<AppState> {
  const store = storeWith();
  store.setState({ screen: name });
  return store;
}

const human = (uid: string, name: string) => ({ uid, name, kind: 'human' as const, rules: RULES_VERSION });
function room(o: { phase?: 'lobby' | 'playing' | 'over'; guest?: boolean; absent?: PlayerId[]; current?: PlayerId; clock?: ClockSec; rules?: number; schema?: number } = {}): Room {
  const { phase = 'playing', guest = true, absent = [], current = 0, clock = 120, rules = RULES_VERSION, schema = 1 } = o;
  return {
    code: 'ABC234',
    meta: { createdAt: 0, creatorId: 'u0', hostId: 'u0', schema, rulesVersion: rules, build: 't', clock, hostFaction: 'spartans', phase },
    seats: [human('u0', 'Ann'), guest ? human('u1', 'Ben') : null],
    members: guest ? { u0: 0, u1: 1 } : { u0: 0 },
    presence: { u0: { on: !absent.includes(0), at: 0 }, ...(guest ? { u1: { on: !absent.includes(1), at: 0 } } : {}) },
    head: phase === 'lobby' ? null : { n: 0, seat: current, hash: '', at: 0, turnAt: 0, paused: 0 },
    desync: {},
  };
}
function view(r: Room | null, over: Partial<SessionView> = {}): SessionView {
  return {
    phase: 'playing', code: 'ABC234', me: 'u0', mySeat: 0, room: r, followed: null, connected: true, returning: false,
    verifying: false, blocked: false,
    clock: r !== null && r.meta.clock > 0 ? { kind: 'running', endsAt: 120_000 } : { kind: 'off' },
    secondsLeft: r !== null && r.meta.clock > 0 ? 120 : null,
    myTurn: false, sending: false, hostIsMe: true, absent: [], remoteVersion: null, remoteSchema: null,
    lastSteps: null, timedOut: null, failure: null, ...over,
  };
}

function lobby(o: { guest: boolean; asGuest?: boolean }): StoreApi<AppState> {
  const store = storeWith();
  const r = room({ phase: 'lobby', guest: o.guest });
  const v = o.asGuest === true ? view(r, { phase: 'lobby', me: 'u1', mySeat: 1, hostIsMe: false }) : view(r, { phase: 'lobby' });
  store.setState({ screen: 'lobby', mode: 'online', online: v, inviteLink: 'https://example.test/warbanners/?room=ABC234' });
  return store;
}

function joinInProgress(o: { absent: PlayerId[]; failure?: Refusal }): StoreApi<AppState> {
  const store = storeWith();
  const r = room({ absent: o.absent });
  store.setState({ screen: 'join', mode: 'online', online: view(r, { phase: 'join', me: 'u9', mySeat: null, hostIsMe: false, absent: o.absent, failure: o.failure ?? null }) });
  return store;
}

function lobbyJoin(failure: Refusal | null = null): StoreApi<AppState> {
  const store = storeWith();
  const r = room({ phase: 'lobby', guest: false });
  store.setState({ screen: 'join', mode: 'online', online: view(r, { phase: 'join', me: 'u9', mySeat: null, hostIsMe: false, failure }) });
  return store;
}

function versionRoom(o: { rules: number; schema?: number }): StoreApi<AppState> {
  const store = storeWith();
  const r = room({ rules: o.rules, schema: o.schema ?? 1 });
  const v = view(r, {
    phase: 'version', me: 'u9', mySeat: null, hostIsMe: false,
    remoteVersion: o.rules !== RULES_VERSION ? o.rules : null, remoteSchema: (o.schema ?? 1) > 1 ? o.schema! : null,
  });
  store.setState({ screen: 'join', mode: 'online', online: v });
  return store;
}

interface MatchOpts {
  absent?: PlayerId[]; current?: PlayerId; clock?: ClockSec; connected?: boolean; returning?: boolean; menuOpen?: boolean; phase?: SessionView['phase'];
  verifying?: boolean; desyncBy?: string;   // desyncBy: a member whose live desync entry is in the room
}
function matchFor(seat: PlayerId, o: MatchOpts = {}): Scene {
  const store = storeWith();
  const settings = { seed: 7, factions: ['spartans', 'mongols'] as ['spartans', 'mongols'] };
  const state = createMatch(settings);
  const base = newRecord('ABC234', settings, ['Ann', 'Ben'], 0);
  const record = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const r = room({ absent: o.absent ?? [], current: o.current ?? 0, clock: o.clock ?? 120 });
  if (o.desyncBy !== undefined) r.desync = { [o.desyncBy]: { n: 0, hash: '0'.repeat(16), build: 't' } };
  const connected = o.connected ?? true;
  const returning = o.returning ?? false;
  const verifying = o.verifying ?? false;
  const blocked = o.desyncBy !== undefined;
  const v = view(r, {
    phase: o.phase ?? 'playing', me: seat === 0 ? 'u0' : 'u1', mySeat: seat, hostIsMe: seat === 0, connected, returning, verifying, blocked,
    followed: { settings, actions: [], state }, absent: o.absent ?? [],
    myTurn: connected && !returning && !verifying && !blocked && state.current === seat && (o.phase ?? 'playing') === 'playing',
  });
  store.setState({ screen: 'match', mode: 'online', online: v, record, state, viewer: seat });
  return { store, el: o.menuOpen === true ? <Match openSheet="menu" /> : <App /> };
}
const guestMatch = (o: MatchOpts = {}): Scene => matchFor(1, o);
const hostMatch = (o: MatchOpts = {}): Scene => matchFor(0, o);

test('home offers online play, or says why not', () => {
  expect(render(homeWith({ online: () => true }))).toContain(T.ui.playOnline);
  const off = render(homeWith({ online: () => false }));
  expect(off).toMatch(/data-testid="play-online"[^>]*disabled/); expect(off).toContain(T.ui.needsConnection);
  expect(render(homeWith({ netReady: () => false }))).toContain(T.ui.notSetUp);
});
test('home lists online matches apart from the saves', () => {
  const html = render(homeWith({ onlineEntries: [entry('ABC234')], saves: 1 }));
  expect(html).toContain(T.ui.onlineMatches); expect(html).toContain(fill(T.ui.onlineWith, { name: 'Ben' }));
  expect(html.match(/data-testid="save"/g)).toHaveLength(1); expect(html.match(/data-testid="online-row"/g)).toHaveLength(1);
});
test('setup offers the five clock choices with 2 min chosen', () => {
  const html = render(screen('onlineSetup'));
  expect(html.match(/data-testid="clock-choice"/g)).toHaveLength(5);
  expect(html).toMatch(/aria-pressed="true"[^>]*>2 min</);
});
test('the lobby shows the code and waits', () => {
  const lone = render(lobby({ guest: false }));
  expect(lone).toContain('ABC234'); expect(lone).toContain(T.ui.shareInvite); expect(lone).toContain(T.ui.waitingForGuest);
  expect(lone).not.toContain('data-testid="start-online"');
  expect(render(lobby({ guest: true }))).toContain('data-testid="start-online"');
  expect(render(lobby({ guest: true, asGuest: true }))).toContain(fill(T.ui.waitingForHost, { name: 'Ann' }));
});
test('the join screen offers only absent seats', () => {
  const html = render(joinInProgress({ absent: [1] }));
  expect(html).toContain(fill(T.ui.imName, { name: 'Ben' })); expect(html).not.toContain(fill(T.ui.imName, { name: 'Ann' }));
});
test('the match while waiting: their turn, a clock, and nothing to press', () => {
  const html = render(guestMatch());
  expect(html).toContain(fill(T.ui.theirTurn, { name: 'Ann' })); expect(html).toContain('2:00');
  expect(html).toMatch(/data-testid="end-turn"[^>]*disabled/); expect(html).toMatch(/data-testid="next-unit"[^>]*disabled/);
  expect(html).not.toContain('data-testid="pass"');
});
test('the drop line says the clock is paused only when the absent player is the one on the clock', () => {
  expect(render(guestMatch({ absent: [0], current: 0 }))).toContain(fill(T.ui.dropped, { name: 'Ann' }));
  const waiting = render(hostMatch({ absent: [1], current: 0 }));
  expect(waiting).toContain(fill(T.ui.droppedWaiting, { name: 'Ben' })); expect(waiting).not.toContain('The clock is paused');
  expect(render(guestMatch({ absent: [0], current: 0, clock: 0 }))).toContain(fill(T.ui.droppedNoClock, { name: 'Ann' }));
});
test('version and connection messages name both versions', () => {
  const newer = render(versionRoom({ rules: RULES_VERSION + 1 }));
  expect(newer).toContain(fill(T.ui.newerVersion, { theirs: RULES_VERSION + 1, mine: RULES_VERSION })); expect(newer).toContain(T.ui.goUpdate);
  expect(render(versionRoom({ rules: RULES_VERSION - 1 }))).not.toContain(T.ui.goUpdate);
  const schema = render(versionRoom({ rules: RULES_VERSION, schema: 2 }));
  expect(schema).toContain(T.ui.newerBuild); expect(schema).toContain(T.ui.goUpdate);
  expect(render(guestMatch({ connected: false }))).toContain(T.ui.reconnecting);
  expect(render(guestMatch({ returning: true }))).toContain(T.ui.reconnecting);
});
test('the menu offers resign on the other player\'s turn and says the match waits', () => {
  const html = render(guestMatch({ menuOpen: true }));
  expect(html).toContain('data-testid="resign"'); expect(html).toContain(T.ui.homeWaits);
  expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="resign"|<button[^>]*data-testid="resign"[^>]*disabled=""/);
});

// ---- beyond the brief's list ----

test('the Hud names whose turn it is in hud-status, and the host on its own turn sees Your turn', () => {
  expect(render(guestMatch())).toMatch(/data-testid="hud-status"[^>]*><span class="status-name">Ann</);
  const mine = render(hostMatch());
  expect(mine).toMatch(new RegExp(`data-testid="hud-status"[^>]*>${T.ui.yourTurn}<`));
  expect(mine).toContain('data-testid="clock"');
  expect(render(hostMatch({ clock: 0 }))).not.toContain('data-testid="clock"');
});
test('the join screen tells why a join or a takeover failed', () => {
  const cases: [Refusal, string][] = [
    ['notFound', T.ui.noSuchRoom], ['full', T.ui.roomFull], ['offline', T.ui.needsConnection], ['notSetUp', T.ui.notSetUp],
    ['started', T.ui.roomStarted], ['refused', T.ui.joinRefused], ['schema', T.ui.newerBuild], ['version', T.ui.rulesDiffer],
  ];
  for (const [f, words] of cases) expect(render(lobbyJoin(f)), f).toContain(words);
  expect(render(joinInProgress({ absent: [], failure: 'full' }))).toContain(T.ui.roomFull);
  const lobbyHtml = render(lobbyJoin());
  expect(lobbyHtml).toContain('data-testid="join-name"'); expect(lobbyHtml).toContain('data-testid="join"');
});
test('the join screen opened from Home asks for a code', () => {
  const store = storeWith();
  store.getState().openJoin();
  const html = render(store);
  expect(html).toContain(T.ui.codeLabel); expect(html).toContain('data-testid="join-code"');
});
test('a desync covers the board with a way home', () => {
  const html = render(guestMatch({ phase: 'desync' }));
  expect(html).toContain(T.ui.desync); expect(html).toContain('data-testid="desync-home"');
});
test('the update notice names the online opponent', () => {
  const store = homeWith({ onlineEntries: [entry('ABC234')] });
  store.setState({ notice: 'updateDuringOnline', update: { offlineReady: false, updateReady: true } });
  const html = render(store);
  expect(html).toContain(fill(T.ui.updateDuringOnline, { name: 'Ben' })); expect(html).not.toContain('{name}');
  expect(html).toContain('data-testid="update-anyway"');
});
test('the result has its test id', () => {
  const store = storeWith();
  store.getState().startMatch({ names: ['Ann', 'Ben'], factions: ['spartans', 'mongols'] });
  store.getState().ready();
  store.getState().run({ type: 'resign' });
  expect(render(store)).toContain('data-testid="result"');
});

// ---- fix round 1 ----

test('the update notice for a lobby with nobody in it yet names no one', () => {
  const store = homeWith({ onlineEntries: [entry('ABC234', { names: ['Ann', ''] })] });
  store.setState({ notice: 'updateDuringOnline', update: { offlineReady: false, updateReady: true } });
  const html = render(store);
  expect(html).toContain(T.ui.updateDuringLobby); expect(html).not.toContain('with  is');
});
test('a version refusal with no rules number says so without a made-up number', () => {
  const store = storeWith();
  store.setState({ screen: 'join', mode: 'online', online: view(room(), { phase: 'version', me: 'u9', mySeat: null, hostIsMe: false }) });
  const html = render(store);
  expect(html).toContain(T.ui.rulesDiffer); expect(html).not.toContain('rules 0');
});
test('the turn line keeps the name apart from the sentence, and the own turn waits for the connection', () => {
  expect(render(guestMatch())).toMatch(/data-testid="hud-status"[^>]*><span class="status-name">Ann<\/span><span class="status-rest">'s turn<\/span>/);
  expect(render(hostMatch({ connected: false }))).toMatch(new RegExp(`data-testid="hud-status"[^>]*><span class="status-long">${T.ui.yourTurnWaits}<`));
});

// ---- the final review's fix wave ----

const resignOff = /<button[^>]*disabled=""[^>]*data-testid="resign"|<button[^>]*data-testid="resign"[^>]*disabled=""/;
test('a board shown from the snapshot says it is being checked, and End turn waits', () => {
  const html = render(hostMatch({ verifying: true }));
  expect(html).toContain(T.ui.checking); expect(html).toContain('data-testid="online-checking"');
  expect(html).toMatch(new RegExp(`data-testid="hud-status"[^>]*>${T.ui.yourTurn}<`));
  expect(html).toMatch(/data-testid="end-turn"[^>]*disabled/);
  expect(render(hostMatch({ verifying: true, menuOpen: true }))).toMatch(resignOff);
});
test('a desync reported by the other phone puts the same card on this phone, and says why nobody can resign', () => {
  for (const scene of [hostMatch({ desyncBy: 'u1' }), guestMatch({ desyncBy: 'u1' }), guestMatch({ phase: 'desync', desyncBy: 'u1' })]) {
    const html = render(scene);
    expect(html).toContain(T.ui.desync); expect(html).toContain(T.ui.desyncWaits); expect(html).toContain('data-testid="desync-home"');
  }
  const menu = render(hostMatch({ desyncBy: 'u1', menuOpen: true }));
  expect(menu).toMatch(resignOff); expect(menu).toContain(T.ui.desyncWaits);
});
test('the result says the last move is still being sent, until it lands', () => {
  const store = storeWith();
  const settings = { seed: 7, factions: ['spartans', 'mongols'] as ['spartans', 'mongols'] };
  const before = createMatch(settings);
  const state = { ...before, winner: 0 as PlayerId };
  const record = { ...newRecord('ABC234', settings, ['Ann', 'Ben'], 0), snapshot: { count: 0, hash: hashState(state), state } };
  const followed = { settings, actions: [], state };
  store.setState({ screen: 'result', mode: 'online', record, state, viewer: 0, online: view(room({ phase: 'over' }), { phase: 'over', followed, sending: true }) });
  const html = render(store);
  expect(html).toContain(T.ui.sending); expect(html).toContain('data-testid="result-sending"');
  store.setState({ online: view(room({ phase: 'over' }), { phase: 'over', followed, sending: false }) });
  expect(render(store)).not.toContain('data-testid="result-sending"');
});
test('an action list this phone cannot read says so in words', () => {
  const scene = hostMatch({ phase: 'failed' });
  scene.store.setState({ online: { ...scene.store.getState().online!, failure: 'unreadable' } });
  const html = render(scene);
  expect(html).toContain(T.ui.recordUnreadable); expect(html).toContain('data-testid="online-failed"');
});
test('rules 11: a mirror lobby shows the two seats in two colours', () => {
  const store = lobby({ guest: true });
  const v = store.getState().online!;
  store.setState({ online: { ...v, room: { ...v.room!, meta: { ...v.room!.meta, hostFaction: 'woodland', guestFaction: 'woodland' } } } });
  const html = render(store);
  // the seat's style (its colour) comes just before its test id
  const seat = (n: number) => /<li[^>]*data-testid="lobby-seat-(\d)"/g.exec(html.slice(html.lastIndexOf('<li', html.indexOf(`data-testid="lobby-seat-${n}"`))))?.[0] ?? '';
  expect(seat(0)).toContain(playerColour('woodland').main);
  expect(seat(1)).toContain(MIRROR_COLOUR.main);
});
test('rules 11: the guest side never picked moves off the host side; one picked stays, even a mirror', () => {
  expect(guestAfterHostPick('mongols', 'mongols', false)).toBe('spartans');
  expect(guestAfterHostPick('woodland', 'mongols', false)).toBe('mongols');
  expect(guestAfterHostPick('mongols', 'mongols', true)).toBe('mongols');
});
