import { ref, set } from 'firebase/database';
import { describe, expect, test } from 'vitest';
import { wait } from './waitScale';
import { EMU, ensureSignedIn, fb, usingEmulator } from './firebase';

const emu = describe.runIf(process.env.EMULATOR === '1');
emu('the emulator', { timeout: wait(30_000) }, () => {
  test('the app points at the namespace the rules are loaded into', () => {
    expect(EMU.databaseURL).toBe('http://127.0.0.1:9010?ns=demo-banners-default-rtdb');
    expect(usingEmulator()).toBe(true);
  });
  test('CANARY: rules are on in that namespace (a signed-in write to the root is refused)', async () => {
    const f = fb('canary'); await ensureSignedIn(f);
    await expect(set(ref(f.db, 'canary'), 1)).rejects.toThrow(/permission/i);
  });
  test('two names are two identities', async () => {
    expect(await ensureSignedIn(fb('a'))).not.toBe(await ensureSignedIn(fb('b')));
  });
});
