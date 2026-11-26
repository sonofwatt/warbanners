import { afterAll, afterEach, describe, test } from 'vitest';
import { wait } from './waitScale';
import { cleanupAdmin, firebaseKit, sharedBodies, type SessionKit } from './sessionKit';

// The shared session bodies on the emulator: real Firebase, real timers, drops through setOnline, and one timeout
// judged by the real rules. Each test has its own identities (a<k>, b<k>) and its own room code.

describe.runIf(process.env.EMULATOR === '1')('the online session on the emulator', () => {
  let k = 0;
  let kit: SessionKit | null = null;
  afterEach(() => { kit?.closeAll(); kit = null; });
  afterAll(async () => { await cleanupAdmin(); });
  for (const [name, body] of Object.entries(sharedBodies)) {
    test(name, async () => {
      kit = firebaseKit(++k);
      await body(kit);
    }, wait(30_000));
  }
});
