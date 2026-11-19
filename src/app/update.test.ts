import { expect, test } from 'vitest';
import { reloadGate } from './update';

test('a window on Home takes a new version at once', () => {
  let reloads = 0; const gate = reloadGate(() => { reloads++; });
  gate.needed(true); expect(reloads).toBe(1);
});
test('a window in a match waits for Home before taking a new version', () => {
  let reloads = 0; const gate = reloadGate(() => { reloads++; });
  gate.needed(false); expect(reloads).toBe(0);
  gate.homeReached(); expect(reloads).toBe(1);
  gate.homeReached(); expect(reloads).toBe(1);
});
test('reaching Home with no new version waiting does nothing', () => {
  let reloads = 0; const gate = reloadGate(() => { reloads++; });
  gate.homeReached(); expect(reloads).toBe(0);
});
