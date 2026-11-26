import { afterEach, expect, test, vi } from 'vitest';
import { ensureSignedIn, usingEmulator, type Fb } from './firebase';

const signInAnonymously = vi.hoisted(() => vi.fn());
vi.mock('firebase/auth', async (orig) => ({ ...(await orig<typeof import('firebase/auth')>()), signInAnonymously }));

afterEach(() => { vi.unstubAllEnvs(); signInAnonymously.mockReset(); });
test('a Node process without EMULATOR=1 can never reach the live database', () => {
  vi.stubEnv('EMULATOR', '');
  expect(() => usingEmulator()).toThrow(/EMULATOR/);
  vi.stubEnv('EMULATOR', '1');
  expect(usingEmulator()).toBe(true);
});

// Two sign-ins that overlap could each make an anonymous user; the phone would hold the first uid and be the second.
test('sign-ins made while one is on its way share it, and a failed one is tried again', async () => {
  const auth = { currentUser: null as { uid: string } | null };
  const f = { app: {}, db: {}, auth } as unknown as Fb;
  let n = 0;
  signInAnonymously.mockImplementation(() => new Promise((res) => setTimeout(() => {
    auth.currentUser = { uid: `u${++n}` };
    res({ user: auth.currentUser });
  }, 1)));
  expect(await Promise.all([ensureSignedIn(f), ensureSignedIn(f), ensureSignedIn(f)])).toEqual(['u1', 'u1', 'u1']);
  expect(signInAnonymously).toHaveBeenCalledTimes(1);
  expect(await ensureSignedIn(f)).toBe('u1');                 // signed in: no new sign-in
  expect(signInAnonymously).toHaveBeenCalledTimes(1);
  auth.currentUser = null;
  signInAnonymously.mockReset();
  signInAnonymously.mockRejectedValueOnce(new Error('auth/network-request-failed')).mockResolvedValueOnce({ user: { uid: 'u9' } });
  await expect(ensureSignedIn(f)).rejects.toThrow(/network/);
  expect(await ensureSignedIn(f)).toBe('u9');
});
