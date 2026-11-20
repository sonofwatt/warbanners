import { expect, test } from 'vitest';
import { clockView, creditOnReturn, formatClock, pauseCredit, secondsLeft, timeoutDue } from './clock';
import type { ClockView } from './clock';
import type { Head, Presence } from './wire';

const H: Head = { n: 10, seat: 0, hash: '0123456789abcdef', at: 1_000_000, turnAt: 1_000_000, paused: 0 };
const on: Presence = { on: true, at: 900_000 };
test('off is off', () => { expect(clockView(0, H, on, 5_000_000)).toEqual({ kind: 'off' }); expect(timeoutDue({ kind: 'off' }, 9e12, true)).toBe(false); });
test('a running clock', () => {
  expect(clockView(120, H, on, 1_050_000)).toEqual({ kind: 'running', endsAt: 1_120_000 });
  expect(clockView(120, { ...H, paused: 30_000 }, on, 1_050_000)).toEqual({ kind: 'running', endsAt: 1_150_000 });
  expect(secondsLeft({ kind: 'running', endsAt: 1_120_000 }, 1_050_400)).toBe(69);
  expect(secondsLeft({ kind: 'running', endsAt: 1_120_000 }, 1_200_000)).toBe(0);
  expect(secondsLeft({ kind: 'off' }, 1)).toBeNull();
  expect(secondsLeft({ kind: 'paused', leftMs: 90_500, resumesAt: 2 }, 1)).toBe(90);
  expect(formatClock(69)).toBe('1:09'); expect(formatClock(120)).toBe('2:00'); expect(formatClock(0)).toBe('0:00'); expect(formatClock(125)).toBe('2:05');
});
test('a drop pauses it, for at most three minutes', () => {
  const off: Presence = { on: false, at: 1_030_000 };
  expect(clockView(120, H, off, 1_100_000)).toEqual({ kind: 'paused', leftMs: 90_000, resumesAt: 1_210_000 });
  expect(clockView(120, H, off, 1_250_000)).toEqual({ kind: 'running', endsAt: 1_300_000 });
  expect(clockView(120, { ...H, paused: 150_000 }, off, 1_050_000)).toEqual({ kind: 'paused', leftMs: 240_000, resumesAt: 1_060_000 });
});
test('a drop that began before this turn counts from the turn start', () => {
  expect(clockView(120, H, { on: false, at: 900_000 }, 1_100_000)).toEqual({ kind: 'paused', leftMs: 120_000, resumesAt: 1_180_000 });
});
test('a drop after the deadline pauses nothing', () => {
  expect(clockView(60, H, { on: false, at: 1_070_000 }, 1_080_000)).toEqual({ kind: 'running', endsAt: 1_060_000 });
});
test('an AI seat has no presence and its clock runs', () => {
  expect(clockView(60, H, null, 1_010_000)).toEqual({ kind: 'running', endsAt: 1_060_000 });
});
test('who ends the turn, and when: the current phone half a second late, the other three seconds late', () => {
  const v: ClockView = { kind: 'running', endsAt: 1_120_000 };
  expect(timeoutDue(v, 1_120_499, true)).toBe(false); expect(timeoutDue(v, 1_120_500, true)).toBe(true);
  expect(timeoutDue(v, 1_122_999, false)).toBe(false); expect(timeoutDue(v, 1_123_000, false)).toBe(true);
  expect(timeoutDue({ kind: 'paused', leftMs: 1, resumesAt: 2 }, 9e12, false)).toBe(false);
});
test('the pause credited on return claims two seconds less than the time away', () => {
  expect(pauseCredit(H, 1_030_000, 1_090_000)).toBe(58_000);
  expect(pauseCredit({ ...H, paused: 150_000 }, 1_030_000, 1_090_000)).toBe(180_000);
  expect(pauseCredit(H, 1_030_000, 1_000_000)).toBe(0);
  expect(pauseCredit(H, 900_000, 1_050_000)).toBe(48_000);                    // from the turn start, not the drop
});
test('a credit is written only by the current player coming back, and only when it adds something', () => {
  const off: Presence = { on: false, at: 1_030_000 };
  expect(creditOnReturn(H, true, off, 1_150_000)).toBe(118_000);
  expect(creditOnReturn(H, false, off, 1_150_000)).toBeNull();
  expect(creditOnReturn(H, true, on, 1_150_000)).toBeNull();
  expect(creditOnReturn(H, true, null, 1_150_000)).toBeNull();
  expect(creditOnReturn(null, true, off, 1_150_000)).toBeNull();
  expect(creditOnReturn({ ...H, paused: 180_000 }, true, off, 1_150_000)).toBeNull();
  expect(creditOnReturn(H, true, { on: false, at: 1_149_000 }, 1_150_000)).toBeNull();
});
test('after the credit lands, the returning player sees the time they were promised', () => {
  // dropped 30 s into a 2 min turn, back at 150 s: past the original deadline but inside the allowance
  const credit = creditOnReturn(H, true, { on: false, at: 1_030_000 }, 1_150_000)!;
  const view = clockView(120, { ...H, paused: credit }, { on: true, at: 1_150_000 }, 1_150_000);
  expect(view).toEqual({ kind: 'running', endsAt: 1_238_000 });
  expect(timeoutDue(view, 1_150_000, true)).toBe(false); expect(secondsLeft(view, 1_150_000)).toBe(88);
});
