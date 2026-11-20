import { isRoomCode, normalizeRoom, readActions, type Room } from '../online/wire';
import { joinDecision, readStartNodes, ROOM_NODES } from './read';
import type { Net, Refusal, Watcher } from './net';
import {
  aiSeatPatch, appendPatch, createPatch, joinPatch, lobbyPatch, presentPatch, serverTimestamp, startPatch, takeoverPatch, type Patch,
} from './patches';

// An in-memory server for the Net contract. Every write is built by patches.ts and judged by `allowed`, a port of
// database.rules.json for the paths the app writes, so a test on the fake fails where the deployed rules would.

export interface FakeServer {
  as(uid: string): Net; setNow(ms: number): void; now(): number;
  drop(uid: string): void;            // connected(false) to uid's watchers, then their data callbacks stop, appends are held, presence goes off
  back(uid: string): Promise<void>;   // connected(true), then held appends land in order, then the current tree is replayed to uid's watchers
  hold(uid: string): void;            // uid stays connected and its writes go through, but its watchers' data events are queued
  release(uid: string): void;         // the queued events are delivered in order
  tree(): unknown; write(path: string, value: unknown): void;   // write: rules-free, for tests that forge a bad record
  failNext(uid: string): void;        // the next write from uid is refused, to force races
  failCreatesWith(r: Refusal): void;  // every create answers r (Task 11's stale-rules test)
  log(): { uid: string; paths: string[] }[];   // every write that landed, in order, with its writer
  idle(): boolean;                    // no write in flight and no watcher delivery queued (for settle())
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)) as T);

// A value as the SDK hands it back: an object whose keys are all integers, dense enough, comes back as an array
// with holes (Firebase's own rule: the largest key is less than twice the number of keys).
function asRead(v: unknown): unknown {
  if (!isObj(v)) return v;
  const keys = Object.keys(v);
  const out: Obj = {};
  for (const k of keys) out[k] = asRead(v[k]);
  if (keys.length > 0 && keys.every((k) => /^(0|[1-9]\d*)$/.test(k))) {
    const max = Math.max(...keys.map(Number));
    if (max < 2 * keys.length) {
      const arr: unknown[] = [];   // filled by index, so missing keys stay holes, as the SDK leaves them
      for (const k of keys) arr[Number(k)] = out[k];
      return arr;
    }
  }
  return out;
}

function getAt(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const k of path.split('/').filter(Boolean)) {
    if (!isObj(cur) || !Object.hasOwn(cur, k)) return null;
    cur = cur[k];
  }
  return cur ?? null;
}

// Sets one path, deleting on null and pruning parents left empty, as Firebase stores no empty node.
function setAt(root: Obj, path: string, value: unknown): void {
  const keys = path.split('/').filter(Boolean);
  const chain: Obj[] = [root];
  let cur = root;
  for (const k of keys.slice(0, -1)) {
    if (!isObj(cur[k])) {
      if (value === null) return;
      cur[k] = {};
    }
    cur = cur[k] as Obj;
    chain.push(cur);
  }
  const last = keys[keys.length - 1]!;
  if (value === null || (isObj(value) && Object.keys(value).length === 0)) delete cur[last];
  else cur[last] = value;
  for (let i = keys.length - 1; i > 0; i--) {
    const parent = chain[i - 1]!;
    const k = keys[i - 1]!;
    if (isObj(parent[k]) && Object.keys(parent[k] as Obj).length === 0) delete parent[k];
  }
}

// serverTimestamp() placeholders become the server's now, as the real server does before it checks the rules.
function stamp(v: unknown, now: number): unknown {
  if (isObj(v)) {
    if (v['.sv'] === 'timestamp') return now;
    const out: Obj = {};
    for (const [k, x] of Object.entries(v)) out[k] = stamp(x, now);
    return out;
  }
  return v;
}

const HEX16 = /^[0-9a-f]{16}$/;
const str = (x: unknown): string => (x === null ? 'null' : String(x));
const num = (x: unknown): number => (typeof x === 'number' ? x : Number.NaN);   // rules arithmetic on null fails
const isNum = (x: unknown): x is number => typeof x === 'number';
const has = (v: unknown, keys: string[]): boolean => isObj(v) && keys.every((k) => v[k] !== undefined && v[k] !== null);

// The SHA-256 of the database.rules.json that `allowed` was checked against, clause by clause. fakeNet.test.ts fails
// when the file changes: re-check `allowed` against every changed clause, then update this hash.
export const RULES_SHA256 = 'a7b61d476a0b8c7620fff1df365577d7f2fd4327626733b8cd921d51f3eabed8';

/**
 * database.rules.json, ported for one update of rooms/<code>. R is the room before, N after (null when absent),
 * `paths` are the update's keys relative to the room ('' is the room itself). Change both or they disagree.
 */
export function allowed(uid: string, R: unknown, N: unknown, paths: string[], now: number): boolean {
  const r = (p: string): unknown => getAt(R, p);
  const n = (p: string): unknown => getAt(N, p);
  const rx = (p: string): boolean => r(p) !== null;
  const nx = (p: string): boolean => n(p) !== null;
  const creating = !rx('meta') && nx('meta/createdAt');
  const lobby = r('meta/phase') === 'lobby';
  const playing = r('meta/phase') === 'playing';
  const member = rx(`members/${uid}`);
  const startW = lobby && !rx('match') && nx('match');
  const advances = playing && n('head/n') === num(r('head/n')) + 1;
  const s01 = (s: string): boolean => s === '0' || s === '1';
  const aiHost = (s: string): boolean => s01(s) && lobby && r('meta/hostId') === uid
    && (!rx(`seats/${s}`) || r(`seats/${s}/kind`) === 'ai') && n(`seats/${s}/kind`) === 'ai' && n(`seats/${s}/uid`) === `ai_${s}`
    && has(n(`seats/${s}`), ['name', 'level', 'salt', 'adapt']) && !nx(`seats/${s}/rules`);
  const joinOwn = (s: string): boolean => lobby && !rx(`seats/${s}`) && n(`seats/${s}/uid`) === uid;
  const createSeat0 = (s: string): boolean => s === '0' && creating;
  const actAt = n(`actions/${str(r('head/n'))}`);
  const turnMoves = actAt === '{"type":"endTurn"}' || (typeof actAt === 'string' && actAt.startsWith('{"player":') && n('meta/phase') === 'over');

  // One leaf (or the room itself): the .write that governs it, judged at its own location.
  function write(path: string): boolean {
    const k = path.split('/');
    const loc = (depth: number): string => k.slice(0, depth).join('/');
    if (path === '') {   // the delete-only grant on the room
      const idle = num(rx('head') ? r('head/at') : r('meta/createdAt')) + 2592000000 < now;
      return N === null && (!rx('meta') || r('meta/creatorId') === uid || idle);
    }
    const [top, a, b] = k;
    if (top === 'meta' && a !== undefined) {
      const q = loc(2); const nv = n(q); if (nv === null) return false;
      switch (a) {
        case 'createdAt':
          return creating && nv === now && has(n('meta'), ['creatorId', 'hostId', 'schema', 'rulesVersion', 'build', 'clock', 'hostFaction', 'phase'])
            && n('meta/creatorId') === uid && n('meta/hostId') === uid && n('meta/schema') === 1 && n('meta/phase') === 'lobby'
            && has(n('seats/0'), ['uid', 'name', 'kind', 'rules']) && n('seats/0/uid') === uid && n('seats/0/kind') === 'human'
            && n('seats/0/rules') === n('meta/rulesVersion') && n(`members/${uid}`) === 0;
        case 'creatorId': case 'schema': case 'rulesVersion': case 'build': return creating;
        case 'hostId':
          return creating || (member && ((r('seats/0/kind') === 'human' && r('seats/0/uid') === nv) || (r('seats/1/kind') === 'human' && r('seats/1/uid') === nv)));
        case 'clock': case 'hostFaction': return creating || (lobby && r('meta/hostId') === uid);
        case 'phase':
          return creating || (lobby && nv === 'playing' && !rx('match') && nx('match')) || (playing && member && nv === 'over');
        default: return false;
      }
    }
    if (top === 'seats' && a !== undefined && b !== undefined) {
      const s = a; const q = loc(3); const nv = n(q); const exists = nv !== null;
      const old = r(`seats/${s}/uid`);
      switch (b) {
        case 'uid':
          return exists && (createSeat0(s)
            || (s01(s) && lobby && !rx(`seats/${s}`) && nv === uid && !member && has(n(`seats/${s}`), ['name', 'kind', 'rules'])
              && n(`seats/${s}/kind`) === 'human' && n(`seats/${s}/rules`) === r('meta/rulesVersion') && str(n(`members/${uid}`)) === s)
            || (s01(s) && playing && r(`seats/${s}/kind`) === 'human' && nv === uid && !member && typeof old === 'string'
              && r(`presence/${old}/on`) !== true && str(n(`members/${uid}`)) === s && !nx(`members/${old}`) && !nx(`desync/${old}`)
              && n(`seats/${s}/rules`) === r('meta/rulesVersion'))
            || aiHost(s));
        case 'name':
          return exists && (createSeat0(s) || joinOwn(s) || aiHost(s) || (old === uid && n(`seats/${s}/uid`) === uid));
        case 'kind': return exists && (createSeat0(s) || joinOwn(s) || aiHost(s));
        case 'rules':
          return exists
            ? createSeat0(s) || joinOwn(s) || (playing && r(`seats/${s}/kind`) === 'human' && old !== uid && n(`seats/${s}/uid`) === uid)
            : aiHost(s);
        case 'level': case 'salt': return exists && aiHost(s);
        case 'adapt':
          return exists && (aiHost(s) || (playing && r('meta/hostId') === uid && r(`seats/${s}/kind`) === 'ai'
            && str(r('head/seat')) === s && n('head/n') === num(r('head/n')) + 1));
        default: return false;
      }
    }
    if (top === 'members' && a !== undefined) {
      const nv = n(loc(2)); const dv = r(loc(2));
      return (a === uid && nv === 0 && creating)
        || (a === uid && nv !== null && n(`seats/${str(nv)}/uid`) === uid && r(`seats/${str(nv)}/uid`) !== uid)
        || (a !== uid && nv === null && dv !== null && r(`seats/${str(dv)}/uid`) === a && n(`seats/${str(dv)}/uid`) === uid);
    }
    if (top === 'presence' && a !== undefined) return a === uid && nx(loc(2)) && rx('meta');
    if (top === 'match') {
      return !rx('match') && r('meta/hostId') === uid && lobby && rx('seats/0/uid') && rx('seats/1/uid') && n('meta/phase') === 'playing'
        && n('head/n') === 0 && n('head/seat') === 0 && n('head/at') === now && n('head/turnAt') === now && n('head/paused') === 0 && nx('head/hash');
    }
    if (top === 'head' && a !== undefined) {
      const q = loc(2); const nv = n(q); const dv = r(q);
      if (nv === null) return false;
      if (startW) return ['n', 'hash', 'at', 'seat', 'turnAt', 'paused'].includes(a);
      if (!rx('head')) return false;
      const same = nv === dv;
      switch (a) {
        case 'n': return playing && nv === num(dv) + 1 && nx(`actions/${str(dv)}`) && !rx(`actions/${str(dv)}`);
        case 'hash': return same || advances;
        case 'at': return same || (advances && nv === now);
        case 'seat': return same || (advances && turnMoves);
        case 'turnAt': return same || (advances && turnMoves && nv === now);
        case 'paused': {
          if (same || (nv === 0 && n('head/turnAt') !== r('head/turnAt'))) return true;
          const step = num(nv) - num(dv);
          return playing && r(`seats/${str(r('head/seat'))}/uid`) === uid && r(`presence/${uid}/on`) === false
            && n(`presence/${uid}/on`) === true && n('head/turnAt') === r('head/turnAt') && num(nv) > num(dv) && num(nv) <= 180000
            && step <= now - num(r(`presence/${uid}/at`)) && step <= now - num(r('head/turnAt'));
        }
        default: return false;
      }
    }
    if (top === 'actions' && a !== undefined) {
      const nv = n(loc(2));
      if (rx(loc(2)) || typeof nv !== 'string' || nv.length > 512 || !playing) return false;
      if (a !== str(r('head/n')) || n('head/n') !== num(r('head/n')) + 1) return false;
      const end = '{"type":"endTurn"}';
      if (nv === end && !(n('head/seat') === 1 - num(r('head/seat')) && n('head/turnAt') === now && n('head/paused') === 0)) return false;
      const clean = (!nv.includes('player') && !nv.includes('\\')) || nv === `{"player":${str(r('head/seat'))},"type":"resign"}`;
      const seatUid = r(`seats/${str(r('head/seat'))}/uid`);
      const clock = num(r('meta/clock'));
      return (seatUid === uid && clean)
        || (r(`seats/${str(r('head/seat'))}/kind`) === 'ai' && r('meta/hostId') === uid && clean)
        || (member && nv === end && clock > 0 && now >= num(r('head/turnAt')) + clock * 1000 + num(r('head/paused')))
        || (member && nv === `{"player":${str(r(`members/${uid}`))},"type":"resign"}`);
    }
    if (top === 'checks' && a !== undefined) {
      return !rx(loc(2)) && playing && n('head/n') === num(r('head/n')) + 1 && a === str(n('head/n'));
    }
    if (top === 'snap' && a === undefined) return nx('snap') && member;
    if (top === 'desync' && a !== undefined) {
      const nv = n(loc(2));
      return rx('meta') && ((a === uid && (nv === null || member)) || (nv === null && nx(`members/${uid}`) && !nx(`members/${a}`)));
    }
    return false;
  }

  // The .validate rules for every node of N at or under `path` (only where data exists).
  function validate(path: string): boolean {
    const v = n(path);
    if (v === null) return true;
    if (!node(path, v)) return false;
    if (isObj(v)) return Object.keys(v).every((c) => validate(path ? `${path}/${c}` : c));
    return true;
  }
  function node(path: string, v: unknown): boolean {
    const [top, a, b, c] = path.split('/');
    switch (top) {
      case '': return true;
      case 'meta':
        switch (a) {
          case undefined: return true;
          case 'createdAt': case 'schema': case 'rulesVersion': return isNum(v);
          case 'creatorId': case 'hostId': return typeof v === 'string';
          case 'build': return typeof v === 'string' && v.length <= 64;
          case 'clock': return v === 0 || v === 60 || v === 120 || v === 180 || v === 300;
          case 'hostFaction': return v === 'spartans' || v === 'mongols';
          case 'phase': return v === 'lobby' || v === 'playing' || v === 'over';
          default: return false;
        }
      case 'seats':
        if (b === undefined) return true;
        switch (b) {
          case 'uid': return typeof v === 'string';
          case 'name': return typeof v === 'string' && v.length >= 1 && v.length <= 16;
          case 'kind': return v === 'human' || v === 'ai';
          case 'rules': case 'salt': return isNum(v);
          case 'level': return v === 'easy' || v === 'normal' || v === 'hard' || v === 'adaptive';
          case 'adapt': return c === undefined ? has(v, ['dial', 'trend']) : (c === 'dial' || c === 'trend') && isNum(v);
          default: return false;
        }
      case 'members': return a === undefined || v === 0 || v === 1;
      case 'presence':
        if (a === undefined) return true;
        if (b === undefined) return has(v, ['on', 'at']);
        return b === 'on' ? typeof v === 'boolean' : b === 'at' && v === now;
      case 'match':
        if (a === undefined) return has(v, ['settings', 'startedAt']);
        return a === 'settings' ? typeof v === 'string' && v.length <= 512 : a === 'startedAt' && v === now;
      case 'head':
        switch (a) {
          case undefined: return true;
          case 'n': case 'at': case 'turnAt': case 'paused': return isNum(v);
          case 'hash': return typeof v === 'string' && HEX16.test(v);
          case 'seat': return v === 0 || v === 1;
          default: return false;
        }
      case 'actions': return true;
      case 'checks': return a === undefined || (typeof v === 'string' && HEX16.test(v));
      case 'snap':
        if (a === undefined) return has(v, ['n', 'hash', 'state']);
        if (a === 'n') return isNum(v) && v <= num(n('head/n'));
        if (a === 'hash') return typeof v === 'string' && HEX16.test(v);
        return a === 'state' && typeof v === 'string' && v.length <= 200000;
      case 'desync':
        if (a === undefined) return true;
        if (b === undefined) return has(v, ['n', 'hash', 'build']);
        if (b === 'n') return isNum(v);
        if (b === 'hash') return typeof v === 'string' && HEX16.test(v);
        return b === 'build' && typeof v === 'string' && v.length <= 64;
      default: return false;
    }
  }

  // A path is allowed by the .write at its own node or the nearest one above it: the deepest node the rules
  // file opens is two levels down for meta, members, presence, head, actions, checks and desync, three for seats.
  const governing = (p: string): string => {
    const k = p.split('/');
    const depth = k[0] === 'seats' ? 3 : k[0] === 'match' || k[0] === 'snap' ? 1 : 2;
    return k.length >= depth ? k.slice(0, depth).join('/') : p;
  };
  if (N === null && paths.includes('') && write('')) return true;
  return paths.every((p) => write(governing(p)) && validate(p));
}

/** The room after one update at time `now` (null when nothing is left), without asking the rules. */
export function patched(room: unknown, patch: Patch, now: number): Obj | null {
  const next: Obj = isObj(room) ? clone(room) : {};
  for (const [p, v] of Object.entries(patch)) {
    if (p === '') { for (const k of Object.keys(next)) delete next[k]; } else setAt(next, p, clone(stamp(v, now)));
  }
  return Object.keys(next).length ? next : null;
}

interface Held { code: string; patch: Patch; done: ((ok: boolean) => void) | null }
interface Watch { code: string; w: Watcher; live: boolean }
interface Client {
  online: boolean; holding: boolean; queued: (() => void)[]; held: Held[]; failNext: boolean;
  watches: Set<Watch>; armed: Set<string>;   // codes with an onDisconnect presence-off armed
}

export function fakeServer(start = 1_700_000_000_000): FakeServer {
  let root: Obj = {};
  let t = start;
  let inFlight = 0;
  let queuedDeliveries = 0;
  let createAnswer: Refusal | null = null;
  const writes: { uid: string; paths: string[] }[] = [];
  const clients = new Map<string, Client>();
  const client = (uid: string): Client => {
    let c = clients.get(uid);
    if (!c) {
      c = { online: true, holding: false, queued: [], held: [], failNext: false, watches: new Set(), armed: new Set() };
      clients.set(uid, c);
    }
    return c;
  };

  const roomOf = (code: string): unknown => getAt(root, `rooms/${code}`);
  const later = (fn: () => void): void => {
    queuedDeliveries++;
    queueMicrotask(() => { queuedDeliveries--; fn(); });
  };
  // A data event for one of c's watchers: queued while c is held, dropped while c is offline (back replays the tree).
  const deliver = (c: Client, fn: () => void): void => {
    if (!c.online) return;
    if (c.holding) c.queued.push(fn);
    else later(fn);
  };
  const reading = (code: string): { room: Room | null; actions: string[] | null } => {
    const raw = roomOf(code);
    const parts: Obj = {};
    for (const k of ROOM_NODES) parts[k] = asRead(clone(getAt(raw, k)));
    return { room: normalizeRoom(code, parts), actions: readActions(asRead(clone(getAt(raw, 'actions')))) };
  };
  const send = (c: Client, wt: Watch): void => {
    const { room, actions } = reading(wt.code);
    deliver(c, () => { if (wt.live) { wt.w.room(room); wt.w.actions(actions); } });
  };
  const notify = (code: string): void => {
    for (const c of clients.values()) for (const wt of c.watches) if (wt.code === code) send(c, wt);
  };

  // Applies one update of rooms/<code> from uid now, if the rules allow it.
  function apply(uid: string, code: string, patch: Patch): boolean {
    const c = client(uid);
    if (c.failNext) { c.failNext = false; return false; }
    const R = clone(roomOf(code));
    const N = patched(R, patch, t);
    if (!allowed(uid, R, N, Object.keys(patch), t)) return false;
    if (!isObj(root.rooms)) root.rooms = {};
    if (N) (root.rooms as Obj)[code] = N; else delete (root.rooms as Obj)[code];
    writes.push({ uid, paths: Object.keys(patch).map((p) => (p ? `rooms/${code}/${p}` : `rooms/${code}`)) });
    notify(code);
    return true;
  }

  // A write leaves in a microtask, so a drop in the same tick holds it. A held append keeps its caller waiting until
  // back(); any other held write answers 'offline' at once and still lands on back(), as the SDK sends it late.
  function submit(uid: string, code: string, patch: Patch, waits: boolean): Promise<boolean | 'offline'> {
    inFlight++;
    return new Promise((res) => queueMicrotask(() => {
      inFlight--;
      const c = client(uid);
      if (!c.online) {
        c.held.push({ code, patch, done: waits ? res : null });
        if (!waits) res('offline');
        return;
      }
      res(apply(uid, code, patch));
    }));
  }

  function as(uid: string): Net {
    const c = client(uid);
    const tick = (): Promise<void> => new Promise((res) => queueMicrotask(res));
    const room = (code: string): Room | null => reading(code).room;
    const offline = (): boolean => !c.online;
    const presented = new Set<string>();          // codes this Net has called present() for
    const open = new Map<string, number>();       // open watches per code
    // The shape every call but append shares: offline at once when dropped, refused when the rules say no.
    const write = async (code: string, patch: Patch): Promise<true | 'refused' | 'offline'> => {
      const r = await submit(uid, code, patch, false);
      return r === 'offline' ? 'offline' : r ? true : 'refused';
    };
    return {
      uid: () => Promise.resolve(uid),
      serverNow: () => t,
      async create(input) {
        await tick();
        if (offline()) return 'offline';
        if (createAnswer) return createAnswer;
        if (!isRoomCode(input.code) || getAt(roomOf(input.code), 'meta') !== null) return 'refused';
        const r = await write(input.code, createPatch(uid, input));
        return r === 'refused' ? 'schema' : r;
      },
      async join(code, name, rules) {
        await tick();
        if (offline()) return 'offline';
        if (!isRoomCode(code)) return 'notFound';
        const d = joinDecision(room(code), uid, rules);
        if (typeof d !== 'object' || 'seat' in d) return d;
        const r = await write(code, joinPatch(uid, d.take, name, rules));
        return r === true ? { seat: d.take } : r;
      },
      async takeOver(code, seat, rules) {
        await tick();
        if (offline()) return 'offline';
        const rm = isRoomCode(code) ? room(code) : null;
        if (!rm) return 'notFound';
        if (rm.meta.rulesVersion !== rules) return 'version';
        const old = rm.seats[seat];
        if (!old || old.kind !== 'human') return 'refused';
        if (old.uid === uid) return true;
        return write(code, takeoverPatch(uid, seat, old.uid, rules));
      },
      async setLobby(code, p) {
        await tick();
        if (offline()) return 'offline';
        let mine: 0 | 1 | undefined;
        if (p.name !== undefined) {
          const m = getAt(roomOf(code), `members/${uid}`);
          if (m !== 0 && m !== 1) return 'refused';
          mine = m;
        }
        const patch = lobbyPatch(p, mine);
        return Object.keys(patch).length === 0 ? true : write(code, patch);
      },
      async setAiSeat(code, seat, s) {
        await tick();
        return offline() ? 'offline' : write(code, aiSeatPatch(seat, s));
      },
      async start(code, settings, openingHash) {
        await tick();
        return offline() ? 'offline' : write(code, startPatch(settings, openingHash, 0));
      },
      async append(code, a) {
        const r = await submit(uid, code, appendPatch(a), true);
        return r === true ? true : 'refused';
      },
      async readLive(code) {
        await tick();
        if (offline()) return 'offline';
        const raw = roomOf(code);
        const rm = normalizeRoom(code, { meta: clone(getAt(raw, 'meta')), head: clone(getAt(raw, 'head')), presence: { [uid]: clone(getAt(raw, `presence/${uid}`)) } });
        return rm ? { head: rm.head, presence: rm.presence[uid] ?? null } : 'notFound';
      },
      async present(code, pausedTo) {
        await tick();
        if (offline()) return 'offline';
        presented.add(code);
        if (getAt(roomOf(code), 'meta') === null) return 'refused';   // the rules refuse to arm presence in no room
        c.armed.add(code);
        return write(code, presentPatch(uid, pausedTo));
      },
      async claimHost(code) {
        await tick();
        if (offline() || getAt(roomOf(code), 'meta/hostId') === uid) return;
        await submit(uid, code, { 'meta/hostId': uid }, false);
      },
      async readStart(code) {
        await tick();
        if (offline()) return 'offline';
        const raw = roomOf(code);
        return readStartNodes(asRead(clone(getAt(raw, 'match'))), asRead(clone(getAt(raw, 'snap'))), asRead(clone(getAt(raw, 'checks'))));
      },
      async reportDesync(code, d) {
        await tick();
        if (offline()) return;
        await submit(uid, code, { [`desync/${uid}`]: d ? { n: d.n, hash: d.hash, build: d.build } : null }, false);
      },
      async clearDesync(code, other) {
        await tick();
        if (offline()) return;
        await submit(uid, code, { [`desync/${other}`]: null }, false);
      },
      watch(code, w) {
        const wt: Watch = { code, w, live: true };
        c.watches.add(wt);
        open.set(code, (open.get(code) ?? 0) + 1);
        const online = c.online;
        later(() => { if (wt.live) w.connected(online); });
        if (online) send(c, wt);
        return () => {
          if (!wt.live) return;
          wt.live = false;
          c.watches.delete(wt);
          const left = (open.get(code) ?? 1) - 1;
          if (left > 0) open.set(code, left); else open.delete(code);
          // As firebaseNet: only after present(), only when the last watch on the room closes, and only while
          // connected: offline, the drop has already written presence off, and its time must stand.
          if (left <= 0 && presented.delete(code)) {
            c.armed.delete(code);
            if (c.online) void submit(uid, code, { [`presence/${uid}`]: { on: false, at: serverTimestamp() } }, false);
          }
        };
      },
      async remove(code) {
        await tick();
        if (offline()) return false;
        return (await submit(uid, code, { '': null }, false)) === true;
      },
    };
  }

  return {
    as,
    setNow(ms) { t = ms; },
    now: () => t,
    drop(uid) {
      const c = client(uid);
      if (!c.online) return;
      for (const wt of c.watches) later(() => { if (wt.live) wt.w.connected(false); });
      c.online = false;   // the dropped phone's own data callbacks stop here, so its cache still shows it present
      for (const code of c.armed) apply(uid, code, { [`presence/${uid}`]: { on: false, at: serverTimestamp() } });
      c.armed.clear();    // an onDisconnect fires once
    },
    async back(uid) {
      const c = client(uid);
      if (c.online) return;
      c.online = true;
      for (const wt of c.watches) deliver(c, () => { if (wt.live) wt.w.connected(true); });
      const held = c.held.splice(0);
      for (const h of held) {
        const ok = apply(uid, h.code, h.patch);
        h.done?.(ok);
      }
      for (const wt of c.watches) send(c, wt);
      await new Promise<void>((res) => later(res));
    },
    hold(uid) { client(uid).holding = true; },
    release(uid) {
      const c = client(uid);
      c.holding = false;
      for (const fn of c.queued.splice(0)) later(fn);
    },
    tree: () => clone(root),
    write(path, value) {
      setAt(root, path, clone(value));
      const m = /^rooms\/([^/]+)/.exec(path);
      if (m) notify(m[1]!);
    },
    failNext(uid) { client(uid).failNext = true; },
    failCreatesWith(r) { createAnswer = r; },
    log: () => writes.map((w) => ({ uid: w.uid, paths: [...w.paths] })),
    idle: () => inFlight === 0 && queuedDeliveries === 0,
  };
}
