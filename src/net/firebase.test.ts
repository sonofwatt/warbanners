import { afterEach, expect, test, vi } from 'vitest';
import { usingEmulator } from './firebase';

afterEach(() => { vi.unstubAllEnvs(); });
test('a Node process without EMULATOR=1 can never reach the live database', () => {
  vi.stubEnv('EMULATOR', '');
  expect(() => usingEmulator()).toThrow(/EMULATOR/);
  vi.stubEnv('EMULATOR', '1');
  expect(usingEmulator()).toBe(true);
});
