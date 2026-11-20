import { canonical, FACTIONS } from '../engine';
import type { Action, FactionId, MatchSettings, PlayerId } from '../engine';
import type { AdaptState } from '../ai/adapt';
import type { AiLevel } from '../ai/types';
import type { Seat } from '../app/record';

export const SCHEMA = 1; // mirrored as a literal in database.rules.json
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const CLOCK_CHOICES = [0, 60, 120, 180, 300] as const; // seconds; 0 is off
export type ClockSec = (typeof CLOCK_CHOICES)[number];
export const DEFAULT_CLOCK: ClockSec = 120;
export const DROP_PAUSE_MS = 180_000; // mirrored in the rules
export const TIMEOUT_LEAD_MS = 500; // the current phone ends its own turn this long after the deadline
export const TIMEOUT_GRACE_MS = 3_000; // the waiting phone, as a backup, this long after
export const TIMEOUT_RETRY_MS = 1_000; // a refused timeout is tried once more after this, if head.n has not moved
export const CREDIT_MARGIN_MS = 2_000; // a return credit claims this much less than the phone's estimate of the time away
export const NET_TIMEOUT_MS = 10_000; // every Net call but append answers 'offline' after this
export const HOST_AWAY_MS = 30_000;
export const ROOM_IDLE_TTL_MS = 30 * 86_400_000; // mirrored in the rules
export const FINISHED_SWEEP_MS = 86_400_000;
export const MAX_ACTION_CHARS = 512;
export const MAX_SNAP_CHARS = 200_000;
export const MAX_NAME = 16;
export const MAX_UID = 128; // Firebase uids are at most 128 characters
export const MAX_BUILD = 64; // mirrored in the rules
export const MAX_ACTIONS = 10_000; // a longer list is refused as corrupt
export const SEATS = 2;

export type Phase = 'lobby' | 'playing' | 'over';
export type RoomSeat =
  | { uid: string; name: string; kind: 'human'; rules: number }
  | { uid: string; name: string; kind: 'ai'; level: AiLevel; salt: number; adapt: AdaptState };
export interface RoomMeta {
  createdAt: number; creatorId: string; hostId: string; schema: number; rulesVersion: number;
  build: string; clock: ClockSec; hostFaction: FactionId; phase: Phase;
}
export interface Head { n: number; seat: PlayerId; hash: string; at: number; turnAt: number; paused: number }
export interface Presence { on: boolean; at: number }
export interface Desync { n: number; hash: string; build: string }
export interface Snap { n: number; hash: string; state: string }
export interface Room {
  code: string; meta: RoomMeta; seats: (RoomSeat | null)[]; members: Record<string, PlayerId>;
  presence: Record<string, Presence>; head: Head | null; desync: Record<string, Desync>;
}

const LEVELS: readonly AiLevel[] = ['easy', 'normal', 'hard', 'adaptive'];
const PHASES: readonly Phase[] = ['lobby', 'playing', 'over'];
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const num = (x: unknown): number => (finite(x) ? x : 0);
const isFaction = (x: unknown): x is FactionId => typeof x === 'string' && Object.hasOwn(FACTIONS, x);

// `rand` returns a number in [0, 1). The default draws from the platform's secure source.
export function makeRoomCode(rand?: () => number): string {
  const n = CODE_ALPHABET.length;
  let bytes: Uint8Array | null = null;
  if (!rand) bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const idx = bytes ? (bytes[i] ?? 0) % n : Math.floor(rand!() * n); // 256 is a multiple of 32, so no bias
    out += CODE_ALPHABET.charAt(Math.min(n - 1, Math.max(0, idx)));
  }
  return out;
}

export function isRoomCode(v: unknown): v is string {
  return typeof v === 'string' && CODE_RE.test(v);
}

// base = origin + import.meta.env.BASE_URL
export function inviteLink(base: string, code: string): string {
  return `${base.endsWith('/') ? base : `${base}/`}?room=${code}`;
}

export function codeFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get('room');
  if (raw === null) return null;
  const code = raw.trim().toUpperCase();
  return isRoomCode(code) ? code : null;
}

export function factionsFor(hostFaction: FactionId): [FactionId, FactionId] {
  const other = (Object.keys(FACTIONS) as FactionId[]).find((f) => f !== hostFaction) as FactionId;
  return [hostFaction, other];
}

export function encodeAction(a: Action): string {
  return canonical(a);
}

export function decodeAction(s: unknown): Action | null {
  if (typeof s !== 'string' || s.length > MAX_ACTION_CHARS) return null;
  try {
    const v: unknown = JSON.parse(s);
    // Only the canonical spelling is accepted, as the rules only match canonical strings.
    return isObject(v) && typeof v.type === 'string' && canonical(v) === s ? (v as unknown as Action) : null;
  } catch {
    return null;
  }
}

export function encodeSettings(s: MatchSettings): string {
  return canonical(s);
}

export function decodeSettings(v: unknown): MatchSettings | null {
  if (typeof v !== 'string') return null;
  try {
    const o: unknown = JSON.parse(v);
    if (!isObject(o) || !Number.isSafeInteger(o.seed) || (o.seed as number) < 0) return null;
    const f = o.factions;
    if (!Array.isArray(f) || f.length !== 2 || !isFaction(f[0]) || !isFaction(f[1]) || f[0] === f[1]) return null;
    return { seed: o.seed as number, factions: [f[0], f[1]] };
  } catch {
    return null;
  }
}

// Firebase returns a list whose keys are 0..n as an array and anything else as an object: both are accepted.
export function readActions(raw: unknown): string[] | null {
  if (raw === null || raw === undefined) return [];
  let list: unknown[];
  if (Array.isArray(raw)) {
    if (raw.length > MAX_ACTIONS) return null;
    list = Array.from({ length: raw.length }, (_, i) => raw[i]);
  } else if (isObject(raw)) {
    const keys = Object.keys(raw);
    if (keys.length > MAX_ACTIONS) return null;
    list = [];
    for (let i = 0; i < keys.length; i++) {
      if (!Object.hasOwn(raw, String(i))) return null;
      list.push(raw[String(i)]);
    }
  } else return null;
  return list.every((x) => typeof x === 'string') ? (list as string[]) : null;
}

const isUid = (x: unknown): x is string => typeof x === 'string' && x.length >= 1 && x.length <= MAX_UID;

// Cut to at most `max` UTF-16 units without leaving half of a surrogate pair.
function cut(s: string, max: number): string {
  const t = s.slice(0, max);
  const last = t.charCodeAt(t.length - 1);
  return s.length > max && last >= 0xd800 && last <= 0xdbff ? t.slice(0, -1) : t;
}

function readSeat(v: unknown): RoomSeat | null {
  if (!isObject(v) || !isUid(v.uid) || typeof v.name !== 'string') return null;
  const name = cut(v.name, MAX_NAME);
  if (v.kind === 'human') return { uid: v.uid, name, kind: 'human', rules: num(v.rules) };
  if (v.kind !== 'ai' || !LEVELS.includes(v.level as AiLevel) || !finite(v.salt)) return null;
  const a = v.adapt;
  if (!isObject(a) || !finite(a.dial) || !finite(a.trend)) return null;
  return { uid: v.uid, name, kind: 'ai', level: v.level as AiLevel, salt: v.salt, adapt: { dial: a.dial, trend: a.trend } };
}

function readSeats(raw: unknown): (RoomSeat | null)[] {
  const out: (RoomSeat | null)[] = [];
  for (let i = 0; i < SEATS; i++) {
    let v: unknown = null;
    if (Array.isArray(raw)) v = raw[i];
    else if (isObject(raw) && Object.hasOwn(raw, String(i))) v = raw[String(i)];
    out.push(readSeat(v));
  }
  return out;
}

function readMeta(v: unknown): RoomMeta | null {
  if (!isObject(v)) return null;
  const { creatorId, createdAt, phase, hostFaction, clock, schema } = v;
  if (!isUid(creatorId) || typeof createdAt !== 'number') return null;
  if (!PHASES.includes(phase as Phase) || !isFaction(hostFaction)) return null;
  if (!CLOCK_CHOICES.includes(clock as ClockSec)) return null;
  if (typeof schema !== 'number' || !Number.isInteger(schema) || schema < 1) return null;
  return {
    createdAt: num(createdAt), creatorId, hostId: isUid(v.hostId) ? v.hostId : creatorId, schema,
    rulesVersion: num(v.rulesVersion), build: typeof v.build === 'string' ? cut(v.build, MAX_BUILD) : '',
    clock: clock as ClockSec, hostFaction, phase: phase as Phase,
  };
}

function readHead(v: unknown): Head | null {
  if (!isObject(v) || typeof v.hash !== 'string') return null;
  if (!(typeof v.n === 'number' && Number.isInteger(v.n) && v.n >= 0) || (v.seat !== 0 && v.seat !== 1)) return null;
  return { n: v.n, seat: v.seat, hash: v.hash, at: num(v.at), turnAt: num(v.turnAt), paused: num(v.paused) };
}

// Own keys only, and never `__proto__`.
function entries(v: unknown): [string, unknown][] {
  return isObject(v) ? Object.entries(v).filter(([k]) => k !== '__proto__') : [];
}

// Reads the separately fetched nodes, put together as { meta, seats, members, presence, head, desync }. Never throws.
export function normalizeRoom(code: string, raw: unknown): Room | null {
  try {
    if (!isObject(raw)) return null;
    const meta = readMeta(raw.meta);
    if (!meta) return null;
    const members: Record<string, PlayerId> = {};
    for (const [uid, p] of entries(raw.members)) if (isUid(uid) && (p === 0 || p === 1)) members[uid] = p;
    const presence: Record<string, Presence> = {};
    for (const [uid, p] of entries(raw.presence)) if (isUid(uid) && isObject(p) && typeof p.on === 'boolean') presence[uid] = { on: p.on, at: num(p.at) };
    const desync: Record<string, Desync> = {};
    for (const [uid, d] of entries(raw.desync)) {
      if (isUid(uid) && isObject(d) && typeof d.hash === 'string') desync[uid] = { n: num(d.n), hash: d.hash, build: typeof d.build === 'string' ? cut(d.build, MAX_BUILD) : '' };
    }
    return { code, meta, seats: readSeats(raw.seats), members, presence, head: readHead(raw.head), desync };
  } catch {
    return null;
  }
}

// Entries left by someone who is no longer a member are stale.
export function liveDesync(room: Room): Desync[] {
  return Object.entries(room.desync).filter(([uid]) => Object.hasOwn(room.members, uid)).map(([, d]) => d);
}

export function toRecordSeat(s: RoomSeat): Seat {
  return s.kind === 'human'
    ? { name: s.name, kind: 'human' }
    : { name: s.name, kind: 'ai', level: s.level, salt: s.salt, adapt: { dial: s.adapt.dial, trend: s.adapt.trend } };
}
