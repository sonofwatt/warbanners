import type { PlayerId } from '../engine';
import { decodeSettings, type Room, type Snap } from '../online/wire';
import type { Refusal, StartRead } from './net';

// Pure readings shared by firebaseNet and fakeNet. No Firebase here, so the fake loads without the SDK.

// The nodes of a room that `watch` listens to one by one and folds into normalizeRoom (never the whole room).
export const ROOM_NODES = ['meta', 'seats', 'members', 'presence', 'head', 'desync'] as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const HEX16 = /^[0-9a-f]{16}$/;

/** What `join` answers for a room read once, before any write: a seat to take, or the answer itself. */
export function joinDecision(room: Room | null, uid: string, rules: number): { take: PlayerId } | { seat: PlayerId } | Refusal {
  if (!room) return 'notFound';
  const mine = room.members[uid];
  if (mine !== undefined) return { seat: mine };
  if (room.meta.rulesVersion !== rules) return 'version';
  if (room.meta.phase !== 'lobby') return 'started';
  const free = room.seats.findIndex((s) => s === null);
  return free === 0 || free === 1 ? { take: free } : 'full';
}

/** Reads `match`, `snap` and `checks` as fetched once: missing match is 'notFound', unreadable settings 'schema'. */
export function readStartNodes(match: unknown, snap: unknown, checks: unknown): StartRead | Refusal {
  if (!isObject(match)) return 'notFound';
  const settings = decodeSettings(match.settings);
  if (!settings) return 'schema';
  let s: Snap | null = null;
  if (isObject(snap) && Number.isInteger(snap.n) && (snap.n as number) >= 0 && typeof snap.hash === 'string'
    && HEX16.test(snap.hash) && typeof snap.state === 'string') s = { n: snap.n as number, hash: snap.hash, state: snap.state };
  const out: Record<number, string> = {};
  // Firebase hands back integer keys as an array when they are dense enough, and as an object otherwise.
  const pairs: [string, unknown][] = Array.isArray(checks) ? Array.from(checks, (v: unknown, i) => [String(i), v])
    : isObject(checks) ? Object.entries(checks) : [];
  for (const [k, v] of pairs) if (/^(0|[1-9]\d{0,8})$/.test(k) && typeof v === 'string' && HEX16.test(v)) out[Number(k)] = v;
  return { settings, snap: s, checks: out };
}
