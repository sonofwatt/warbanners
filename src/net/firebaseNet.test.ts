import { afterEach, beforeEach, expect, test, vi } from 'vitest';

// firebaseNet against a stand-in SDK. On CI a phone could sit on 'connecting' for ever: its database socket opened
// while its sign-in was on its way (serverNow() and the connected watch opened it), the SDK lost the token the
// sign-in handed it, and the socket answered as signed out, so every room listener was refused and cancelled. The
// fix: nothing touches the database before the sign-in has ended. These tests hold the sign-in open and watch for
// any database call.

const calls: string[] = [];
let finishSignIn: ((uid: string) => void) | null = null;
let pending: Promise<string> | null = null;        // one sign-in shared by every caller, as ensureSignedIn does
const auth: { currentUser: { uid: string } | null } = { currentUser: null };

vi.mock('firebase/database', () => ({
  ref: (_db: unknown, path: string) => { calls.push(`ref ${path}`); return { path }; },
  onValue: (r: { path: string }) => { calls.push(`listen ${r.path}`); return () => {}; },
  get: vi.fn(), onDisconnect: vi.fn(), remove: vi.fn(), runTransaction: vi.fn(), set: vi.fn(), update: vi.fn(),
}));
vi.mock('./firebase', () => ({
  configMissing: () => false,
  ensureSignedIn: () => (auth.currentUser
    ? Promise.resolve(auth.currentUser.uid)
    : (pending ??= new Promise<string>((res) => { finishSignIn = (uid) => { auth.currentUser = { uid }; res(uid); }; }))),
  fb: () => ({ app: {}, db: {}, auth }),
  reconnect: () => { calls.push('reconnect'); },
  serverOffset: () => { calls.push('offset'); return () => {}; },
  watchConnected: () => { calls.push('connected'); return () => {}; },
}));

beforeEach(() => { calls.length = 0; finishSignIn = null; pending = null; auth.currentUser = null; });
afterEach(() => { vi.resetModules(); });

test('a watch and serverNow() touch the database only once the sign-in has ended', async () => {
  const { firebaseNet } = await import('./firebaseNet');
  const net = firebaseNet();
  net.serverNow();
  const stop = net.watch('ABC234', { room: () => {}, actions: () => {}, connected: () => {} });
  net.serverNow();
  await Promise.resolve(); await Promise.resolve();
  expect(calls).toEqual([]);                                   // the socket stays shut while the sign-in is on its way
  finishSignIn!('u0');
  await vi.waitFor(() => expect(calls).toContain('listen rooms/ABC234/actions'));
  expect(calls.filter((c) => c === 'offset')).toEqual(['offset']);   // one offset listener, however often it was asked
  expect(calls).toContain('connected');
  for (const node of ['meta', 'seats', 'members', 'presence', 'head', 'desync']) expect(calls).toContain(`listen rooms/ABC234/${node}`);
  stop();
});

test('a watch whose sign-in fails says it is offline and touches nothing', async () => {
  vi.doMock('./firebase', () => ({
    configMissing: () => false, ensureSignedIn: () => Promise.reject(new Error('auth/network-request-failed')),
    fb: () => ({ app: {}, db: {}, auth }), reconnect: () => { calls.push('reconnect'); },
    serverOffset: () => { calls.push('offset'); return () => {}; }, watchConnected: () => { calls.push('connected'); return () => {}; },
  }));
  const { firebaseNet } = await import('./firebaseNet');
  const seen: boolean[] = [];
  firebaseNet().watch('ABC234', { room: () => {}, actions: () => {}, connected: (ok) => seen.push(ok) });
  await vi.waitFor(() => expect(seen).toEqual([false]));
  expect(calls).toEqual([]);
  vi.doUnmock('./firebase');
});
