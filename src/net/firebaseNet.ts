import {
  get, onDisconnect, onValue, ref, remove, runTransaction, set, update, type Database,
} from 'firebase/database';
import type { PlayerId } from '../engine';
import { isRoomCode, NET_TIMEOUT_MS, normalizeRoom, readActions, type Room } from '../online/wire';
import { configMissing, ensureSignedIn, fb, reconnect, serverOffset, watchConnected, type Fb } from './firebase';
import type { Live, Net } from './net';
import { joinDecision, readStartNodes, ROOM_NODES } from './read';
import { aiSeatPatch, appendPatch, createPatch, joinPatch, lobbyPatch, presentPatch, startPatch, takeoverPatch, serverTimestamp, type Patch } from './patches';

const denied = (e: unknown): boolean => {
  const o = e as { code?: unknown; message?: unknown } | null;
  return /permission/i.test(`${String(o?.code ?? '')} ${String(o?.message ?? '')}`);
};

export function firebaseNet(name?: string, opts?: { schemaOverride?: number; timeoutMs?: number }): Net {
  const limit = opts?.timeoutMs ?? NET_TIMEOUT_MS;
  let offset = 0;
  let made: Fb | null = null;
  let offsetOff: (() => void) | null = null;
  const presented = new Set<string>();          // codes this Net has called present() for
  const open = new Map<string, number>();       // open watches per code
  // Created on the first call, never when firebaseNet() itself runs.
  const f = (): Fb => (made ??= fb(name));
  const db = (): Database => f().db;
  const at = (code: string, path = ''): ReturnType<typeof ref> => ref(db(), path ? `rooms/${code}/${path}` : `rooms/${code}`);
  const signIn = (): Promise<string> => ensureSignedIn(f());
  // Nothing here touches the database before this identity is signed in. The first listen or read opens the socket,
  // and the socket takes its token as it opens: the SDK asks auth for a token, and a sign-in that ends while it waits
  // for the answer is lost, because the SDK then writes the token it was given (none) over the one the sign-in just
  // handed it. That socket answers as signed out until the token next changes, about an hour later: every room
  // listener is refused and cancelled, and the phone waits on 'connecting'. Seen on CI, never on a quiet laptop.
  const afterSignIn = (fn: () => void): void => {
    if (f().auth.currentUser) fn(); else signIn().then(fn, () => { /* not signed in: nothing to listen to yet */ });
  };
  // The server offset is listened to from the first serverNow() or watch once signed in, and let go when the last
  // watch closes.
  let offsetAsked = false;
  const listenOffset = (): void => {
    if (offsetOff || offsetAsked) return;
    offsetAsked = true;
    afterSignIn(() => { offsetAsked = false; offsetOff ??= serverOffset(f(), (ms) => { offset = ms; }); });
  };
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
      if (!configMissing()) listenOffset();
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
        let mine: PlayerId | undefined;
        if (p.name !== undefined) {
          const m: unknown = await val(code, `members/${uid}`);
          if (m !== 0 && m !== 1) return 'refused' as const;
          mine = m;
        }
        const patch = lobbyPatch(p, mine);
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
      await signIn();
      // Only the rules' refusal is a lost race. Anything else (a malformed patch, a failed sign-in) is a bug or a
      // broken session, and is thrown rather than dressed up as 'refused'.
      return send(code, appendPatch(a));
    },
    readLive(code) {
      if (!isRoomCode(code)) return Promise.resolve('notFound');
      return timed(async (): Promise<Live | 'notFound'> => {
        const uid = await signIn();
        // get() answers from the cache for any path under an open listener, and after a reconnect that cache still
        // shows this phone present and the old head until the listens are answered again. A get on `match`, which
        // no listener covers, goes to the server on the same connection, behind the listens the SDK re-sent on
        // reconnecting, so once it is back the cache holds what the server holds.
        await get(at(code, 'match'));
        const [meta, head, presence] = await Promise.all([val(code, 'meta'), val(code, 'head'), val(code, `presence/${uid}`)]);
        const room = normalizeRoom(code, { meta, head, presence: { [uid]: presence } });
        return room ? { head: room.head, presence: room.presence[uid] ?? null } : 'notFound';
      });
    },
    present(code, pausedTo) {
      if (!isRoomCode(code)) return Promise.resolve('notFound');
      return timed(async () => {
        const uid = await signIn();
        presented.add(code);
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
    async clearDesync(code, other) {
      if (!isRoomCode(code)) return;
      await timed(async () => { await signIn(); await remove(at(code, `desync/${other}`)); });
    },
    watch(code, w) {
      let stopped = false;
      const offs: (() => void)[] = [];
      if (configMissing() || !isRoomCode(code)) {
        queueMicrotask(() => { if (!stopped) w.connected(false); });   // never set up: the caller hears it is offline
        return () => { stopped = true; };
      }
      const g = f();
      open.set(code, (open.get(code) ?? 0) + 1);
      let online = false;
      // Everything that touches the database waits for the sign-in (see afterSignIn): the connected watch and a
      // reconnect open the socket as surely as a listen does. The rules refuse a signed-out read, too, and a refused
      // listener is cancelled.
      signIn().then(() => {
        if (stopped) return;
        listenOffset();
        offs.push(watchConnected(g, (ok) => { online = ok; if (!stopped) w.connected(ok); }));
        const onVisible = (): void => {
          if (!stopped && !online && document.visibilityState === 'visible') reconnect(g);
        };
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', onVisible);
          offs.push(() => document.removeEventListener('visibilitychange', onVisible));
        }
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
      }).catch(() => { if (!stopped) w.connected(false); });   // not signed in (offline, say): the caller hears it is offline
      return () => {
        if (stopped) return;
        stopped = true;
        for (const off of offs) off();
        const left = (open.get(code) ?? 1) - 1;
        if (left > 0) open.set(code, left); else open.delete(code);
        if (open.size === 0 && offsetOff) { offsetOff(); offsetOff = null; }
        // Leaving the room: only a phone that said it was here says it has gone, and only when its last watch on
        // the room closes, so a short-lived watch never turns off the presence of a match still being played.
        // Offline, the server has already run the onDisconnect: a write held until the return would move the time
        // of the drop to the time of the return, and with it the pause and the credit.
        const uid = g.auth.currentUser?.uid;
        if (uid && left <= 0 && presented.delete(code)) {
          const p = at(code, `presence/${uid}`);
          onDisconnect(p).cancel().catch(() => {});
          if (online) set(p, { on: false, at: serverTimestamp() }).catch(() => {});   // best effort; refused when the room is gone
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
