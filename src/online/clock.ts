import { CREDIT_MARGIN_MS, DROP_PAUSE_MS, TIMEOUT_GRACE_MS, TIMEOUT_LEAD_MS } from './wire';
import type { Head, Presence } from './wire';

// Pure turn-clock arithmetic. Every time is a server time (phone clock plus
// .info/serverTimeOffset), passed in; nothing here reads a clock.

export type ClockView =
  | { kind: 'off' }
  | { kind: 'running'; endsAt: number }
  | { kind: 'paused'; leftMs: number; resumesAt: number };

export function clockView(clockSec: number, head: Head, current: Presence | null, serverNow: number): ClockView {
  if (clockSec <= 0) return { kind: 'off' };
  const base = head.turnAt + clockSec * 1000 + head.paused;
  if (current === null || current.on) return { kind: 'running', endsAt: base };
  const offAt = Math.max(current.at, head.turnAt);
  if (offAt >= base) return { kind: 'running', endsAt: base };
  const allowance = DROP_PAUSE_MS - head.paused;
  if (serverNow - offAt < allowance) return { kind: 'paused', leftMs: base - offAt, resumesAt: offAt + allowance };
  return { kind: 'running', endsAt: base + allowance };
}

export function timeoutDue(view: ClockView, serverNow: number, mine: boolean): boolean {
  if (view.kind !== 'running') return false;
  return serverNow >= view.endsAt + (mine ? TIMEOUT_LEAD_MS : TIMEOUT_GRACE_MS);
}

export function pauseCredit(head: Head, offAt: number, serverNow: number): number {
  const away = Math.max(0, serverNow - CREDIT_MARGIN_MS - Math.max(offAt, head.turnAt));
  return Math.min(DROP_PAUSE_MS, head.paused + away);
}

export function creditOnReturn(head: Head | null, holdsCurrent: boolean, own: Presence | null, serverNow: number): number | null {
  if (head === null || !holdsCurrent || own === null || own.on) return null;
  const credit = pauseCredit(head, own.at, serverNow);
  return credit > head.paused ? credit : null;
}

export function secondsLeft(view: ClockView, serverNow: number): number | null {
  if (view.kind === 'off') return null;
  const ms = view.kind === 'paused' ? view.leftMs : view.endsAt - serverNow;
  return Math.max(0, Math.floor(ms / 1000));
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
