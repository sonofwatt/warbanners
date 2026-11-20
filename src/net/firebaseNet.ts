import {
  get, onDisconnect, onValue, ref, remove, runTransaction, serverTimestamp, set, update, type Database,
} from 'firebase/database';
import type { PlayerId } from '../engine';
import {
  decodeSettings, isRoomCode, NET_TIMEOUT_MS, normalizeRoom, readActions, type Room, type Snap,
} from '../online/wire';
import { configMissing, ensureSignedIn, fb, reconnect, serverOffset, watchConnected, type Fb } from './firebase';
import type { Live, Net, Refusal, StartRead } from './net';
import { aiSeatPatch, appendPatch, createPatch, joinPatch, lobbyPatch, presentPatch, startPatch, takeoverPatch, type Patch } from './patches';

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

const denied = (e: unknown): boolean => {
  const o = e as { code?: unknown; message?: unknown } | null;
  return /permission/i.test(`${String(o?.code ?? '')} ${String(o?.message ?? '')}`);
};

export function firebaseNet(name?: string, opts?: { schemaOverride?: number; timeoutMs?: number }): Net {
  const limit = opts?.timeoutMs ?? NET_TIMEOUT_MS;
  let offset = 0;
  let made: Fb | null = null;
  // Created on the first call, never when firebaseNet() itself runs.
  const f = (): Fb => {
    if (made) return made;
    made = fb(name);
    serverOffset(made, (ms) => { offset = ms; });
    return made;
  };
  const db = (): Database => f().db;
  const at = (code: string, path = ''): ReturnType<typeof ref> => ref(db(), path ? `rooms/${code}/${path}` : `rooms/${code}`);
  const signIn = (): Promise<string> => ensureSignedIn(f());
  const val = async (code: string, path: string): Promise<unknown> => (await get(at(code, path))).val();

  // Races the work against the time limit. The work never rejects: a refusal by the rules is 'refused', anything
  // else (the SDK's "client is offline", a dropped socket) is 'offline'. A write the SDK holds may still land later.
  function timed<T>(work: () => Promise<T>): Promise<T | 'refused' | 'offline' | 'notSetUp'> {
    if (configMissing()) return Promise.resolve('notSetUp');
    const run = work().catch((e: unknown) => (denied(e) ? 'refused' as const : 'offline' as const));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<'offline'>((res) => { timer = setTimeout(() => res('offline'), limit); });
    return Promise.race([run, late]).finally(() => clearTimeout(timer));
  }
  const send = async (code: string, patch: Patch): Promise<true | 'refused'> => {
    try { await update(at(code), patch); return true; } catch (e) { if (denied(e)) return 'refused'; throw e; }
  };
  const readRoom = async (code: string): Promise<Room | null> => {
    const [meta, seats, members] = await Promise.all(['meta', 'seats', 'members'].map((p) => val(code, p)));
    return normalizeRoom(code, { meta, seats, members });
  };

  return {
    uid: signIn,
    serverNow() {
      if (!configMissing()) f();
      return Date.now() + offset;
    },
    create(input) {
      if (!isRoomCode(input.code)) return Promise.resolve('refused');
      return timed(async () => {
        const uid = await signIn();
        if ((await get(at(input.code, 'meta'))).exists()) return 'refused' as const;
        const patch = createPatch(uid, input);
        if (opts?.schemaOverride !== undefined) patch['meta/schema'] = opts.schemaOverride;
        // Every other clause of a create is met by the client's own values, so a refusal here means other rules.
        return (await send(input.code, patch)) === true ? true : 'schema' as const;
      });
    },
    join(code, name, rules) {
      if (!isRoomCode(code)) return Promise.resolve('notFound');
      return timed(async () => {
        const uid = await signIn();
        const d = joinDecision(await readRoom(code), uid, rules);
        if (typeof d !== 'object' || 'seat' in d) return d;
        const r = await send(code, joinPatch(uid, d.take, name, rules));
        return r === true ? { seat: d.take } : r;
      });
    },
    takeOver(code, seat, rules) {
      if (!isRoomCode(code)) return Promise.resolve('notFound');
      return timed(async () => {
        const uid = await signIn();
        const room = await readRoom(code);
        if (!room) return 'notFound' as const;
        if (room.meta.rulesVersion !== rules) return 'version' as const;
        const old = room.seats[seat];
        if (!old || old.kind !== 'human') return 'refused' as const;
        if (old.uid === uid) return true as const;
        return send(code, takeoverPatch(uid, seat, old.uid, rules));
      });
    },
    setLobby(code, p) {
      if (!isRoomCode(code)) return Promise.resolve('notFound');
      return timed(async () => {
        const uid = await signIn();
        const patch = lobbyPatch(p);
        if (p.name !== undefined) {
          const mine: unknown = await val(code, `members/${uid}`);
          if (mine !== 0 && mine !== 1) return 'refused' as const;
          patch[`seats/${mine}/name`] = p.name;
        }
        return Object.keys(patch).length === 0 ? true as const : send(code, patch);
      });
    },
    setAiSeat(code, seat, s) {
      if (!isRoomCode(code)) return Promise.resolve('notFound');
      return timed(async () => { await signIn(); return send(code, aiSeatPatch(seat, s)); });
    },
    start(code, settings, openingHash) {
      if (!isRoomCode(code)) return Promise.resolve('notFound');
      return timed(async () => { await signIn(); return send(code, startPatch(settings, openingHash, 0)); });
    },
    // No time limit, no queue, no retry: while offline the SDK holds the write and this stays pending.
    async append(code, a) {
      if (configMissing()) return 'notSetUp';
      if (!isRoomCode(code)) return 'refused';
      try {
        await signIn();
        await update(at(code), appendPatch(a));
        return true;
      } catch {
        return 'refused';
      }
    },
    readLive(code) {
      if (!isRoomCode(code)) return Promise.resolve('notFound');
      return timed(async (): Promise<Live | 'notFound'> => {
        const uid = await signIn();
        const [meta, head, presence] = await Promise.all([val(code, 'meta'), val(code, 'head'), val(code, `presence/${uid}`)]);
        const room = normalizeRoom(code, { meta, head, presence: { [uid]: presence } });
        return room ? { head: room.head, presence: room.presence[uid] ?? null } : 'notFound';
      });
    },
    present(code, pausedTo) {
      if (!isRoomCode(code)) return Promise.resolve('notFound');
      return timed(async () => {
        const uid = await signIn();
        // An onDisconnect fires once: it is armed again on every return, before the presence it will undo.
        await onDisconnect(at(code, `presence/${uid}`)).set({ on: false, at: serverTimestamp() });
        return send(code, presentPatch(uid, pausedTo));
      });
    },
    async claimHost(code) {
      if (!isRoomCode(code)) return;
      await timed(async () => {
        const uid = await signIn();
        await runTransaction(at(code, 'meta/hostId'), (cur: unknown) => (cur === uid ? undefined : uid));
      });
    },
    readStart(code) {
      if (!isRoomCode(code)) return Promise.resolve('notFound');
      return timed(async () => {
        await signIn();
        const [match, snap, checks] = await Promise.all([val(code, 'match'), val(code, 'snap'), val(code, 'checks')]);
        return readStartNodes(match, snap, checks);
      });
    },
    async reportDesync(code, d) {
      if (!isRoomCode(code)) return;
      await timed(async () => {
        const uid = await signIn();
        const r = at(code, `desync/${uid}`);
        await (d ? set(r, { n: d.n, hash: d.hash, build: d.build }) : remove(r));
      });
    },
    watch(code, w) {
      let stopped = false;
      const offs: (() => void)[] = [];
      if (configMissing() || !isRoomCode(code)) return () => { stopped = true; };
      const g = f();
      let online = false;
      const onVisible = (): void => {
        if (!stopped && !online && document.visibilityState === 'visible') reconnect(g);
      };
      offs.push(watchConnected(g, (ok) => { online = ok; if (!stopped) w.connected(ok); }));
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisible);
        offs.push(() => document.removeEventListener('visibilitychange', onVisible));
      }
      // Listeners attach once signed in: the rules refuse a signed-out read, and a refused listener is cancelled.
      signIn().then(() => {
        if (stopped) return;
        const parts: Record<string, unknown> = {};
        const seen = new Set<string>();
        for (const node of ROOM_NODES) {
          offs.push(onValue(at(code, node), (snap) => {
            parts[node] = snap.val();
            seen.add(node);
            if (!stopped && seen.size === ROOM_NODES.length) w.room(normalizeRoom(code, parts));
          }, () => { /* cancelled by the rules: the room reads as it last did */ }));
        }
        offs.push(onValue(at(code, 'actions'), (snap) => { if (!stopped) w.actions(readActions(snap.val())); }, () => {}));
      }).catch(() => { /* not signed in: connected(false) already tells the caller */ });
      return () => {
        if (stopped) return;
        stopped = true;
        for (const off of offs) off();
        const uid = g.auth.currentUser?.uid;
        if (uid) {
          const p = at(code, `presence/${uid}`);
          onDisconnect(p).cancel().catch(() => {});
          set(p, { on: false, at: serverTimestamp() }).catch(() => {});   // best effort; refused when the room is gone
        }
      };
    },
    async remove(code) {
      if (!isRoomCode(code)) return false;
      const r = await timed(async () => { await signIn(); await remove(at(code)); return true as const; });
      return r === true;
    },
  };
}
