// One phone's side of an online match: it watches the room, follows the action list, sends this phone's own actions
// one write at a time, runs the turn clock, takes the host role when it falls to it and plays the AI seats it hosts.
// The decisions live in sync.ts, clock.ts, host.ts and aiSeat.ts; this file wires them to the Net. Every time is the
// server's (net.serverNow()), never this phone's own clock.
import { createMatch, hashState, RULES_VERSION } from '../engine';
import type { Action, FactionId, MatchState, PlayerId } from '../engine';
import type { AdaptState } from '../ai/adapt';
import type { AiClient } from '../app/aiClient';
import type { Append, Net, Refusal, Watcher } from '../net/net';
import { playAiSeat } from './aiSeat';
import { clockView, creditOnReturn, secondsLeft, timeoutDue } from './clock';
import type { ClockView } from './clock';
import { aiSeatToPlay, hostMove } from './host';
import { applyLocal, follow, fromSnapshot, rebuildFrom, replay } from './sync';
import type { Followed, Step } from './sync';
import { advancedPart } from '../app/advanced';
import type { Advanced } from '../app/advanced';
import { factionsFor, liveDesync, SCHEMA, TIMEOUT_RETRY_MS } from './wire';
import type { ClockSec, Head, Presence, Room } from './wire';

export type SessionPhase = 'connecting' | 'notFound' | 'version' | 'join' | 'lobby' | 'playing' | 'over' | 'desync' | 'failed';
export interface SessionView {
  phase: SessionPhase; code: string; me: string | null; mySeat: PlayerId | null; room: Room | null;
  followed: Followed | null;              // null before the match starts
  connected: boolean;
  returning: boolean;                     // connected again, but the return write (presence and credit) has not landed yet
  verifying: boolean;                     // the board shown is not confirmed yet: the replay of a load, or of a rebuild after a lost race, is still running
  blocked: boolean;                       // a member's desync entry is in the room: nobody moves or resigns until it goes
  clock: ClockView; secondsLeft: number | null;
  myTurn: boolean;                        // connected, not returning, not verifying, playing, my seat is current, no live desync, nothing being rebuilt, not sending an endTurn
  sending: boolean;                       // a write is on its way (it stays true while offline: the SDK holds it)
  hostIsMe: boolean;
  absent: PlayerId[];                     // human seats whose presence is off
  remoteVersion: number | null;           // meta.rulesVersion when it differs from this phone's
  remoteSchema: number | null;            // meta.schema when it is newer than this phone's SCHEMA
  lastSteps: { seq: number; steps: Step[]; mine: boolean } | null;   // what just arrived or was just played, for effects and the digest
  timedOut: number | null;                // index of the endTurn with which the clock ended this phone's own turn, for the timeUp line
  failure: SessionFailure | null;         // the last refused join, takeover or start, or why the match stopped
}
// A refusal from the Net, or 'unreadable': the action list is too long for this build or not a list at all.
export type SessionFailure = Refusal | 'unreadable';
export interface SessionDeps {
  net: Net; ai: AiClient; build: string; rulesVersion?: number;   // defaults to RULES_VERSION; tests vary it
  setTimer(fn: () => void, ms: number): () => void;
  pause?: () => Promise<void>;            // lets the main thread breathe between replay chunks; defaults to a 0 ms timer
}
export interface Session {
  view(): SessionView;
  act(a: Action): Step | null;            // null when not my turn or the engine refuses; never throws; the step is applied at once
  resign(): boolean;                      // { type: 'resign', player: mySeat }, on either player's turn; false when not possible now
  join(name: string): Promise<true | Refusal>;
  takeOver(seat: PlayerId): Promise<true | Refusal>;
  setLobby(patch: { clock?: ClockSec; hostFaction?: FactionId; name?: string }): Promise<true | Refusal>;
  start(seed: number, advanced?: Partial<Advanced>): Promise<true | Refusal>;   // host only, both seats filled
  wake(): void;                           // the page is visible again: the return runs, as after a long tick gap
  close(): void;
}

const TICK_MS = 1_000;
const RETURN_TRIES = 3;      // the last one claims no credit
const TIMEOUT_TRIES = 2;     // a refused timeout is tried once more
// A room is read node by node, and the nodes one write changed can arrive a few messages apart. A timeout is decided
// only on a tick at least this long after the last reading, never from a reading that may be half of an update.
// Why a time and not "due on two ticks in a row": that would move every timeout a whole tick later than the
// brief's 500 ms lead. Why it is safe: the rules gate every write by its index, so a wrong decision from a split
// reading lands nothing but a refused endTurn (and then the retry, from the whole reading); two halves more than
// 250 ms apart could still mislead one tick, which costs at most about one tick of delay. In play the only
// multi-node write a backup sees with presence in it is a return (presence on plus head/paused), and in either
// order the server already holds what the backup misread, so the rules refuse it.
const SETTLE_MS = 250;
// A tick this much later than the one before means the tab slept (a locked phone, a hidden page whose timers were
// held back). Its socket may be dead though the SDK has not noticed, and its cache still shows it present: the return
// runs first, so no clock decision is taken from that cache.
const SLEPT_MS = 5_000;

// One action on its way to the database: applied locally already, written in order, one at a time.
interface Out {
  n: number; action: Action; encoded: string; after: MatchState; seatBefore: PlayerId;
  adapt: Append['adapt']; timeout: boolean; done: ((landed: boolean) => void) | null;
}

const isPrefix = (short: string[], long: string[]): boolean => short.length <= long.length && short.every((a, i) => a === long[i]);

export function openSession(code: string, deps: SessionDeps, onChange: (v: SessionView) => void): Session {
  const { net } = deps;
  const rulesVersion = deps.rulesVersion ?? RULES_VERSION;

  let closed = false;
  let me: string | null = null;
  let phase: SessionPhase = 'connecting';
  let room: Room | null = null;
  let roomSeen = false;
  let decided = false;            // the first look at the room has been taken
  let remote: string[] | null = null;
  let connected = false;
  let dropped = false;            // connected(false) came after a connected(true): the next connected(true) is a return
  let returning = false;
  let returnGen = 0;
  let returnRunning = false;
  let followed: Followed | null = null;
  let loading = false;
  let verifying = false;          // the snapshot's board is shown; the replay that decides is still running
  let rebuildingOn: string | null = null;   // the reading a rebuild after a lost race is replaying, while it runs
  let rebuildGen = 0;
  let recordForged = false;       // the replay disagreed with the record's own hashes: a desync this phone never withdraws
  let brokenOn: string | null = null;   // the reading a desync was last judged on: the same reading is not replayed again
  let checkOwnEntry = false;      // after a load: a desync entry of mine that the fresh state agrees with is removed
  let desyncReported = false;
  let remoteVersion: number | null = null;
  let remoteSchema: number | null = null;
  let failure: SessionFailure | null = null;
  let lastSteps: SessionView['lastSteps'] = null;
  let seq = 0;
  let timedOut: number | null = null;

  const queue: Out[] = [];
  let inFlight: Out | null = null;
  let inAppend = false;           // inside net.append: Firebase raises local events from inside a write
  let skipped = false;            // a reading arrived inside it and is run once the call returns
  const tapped = new Set<number>();                                  // indexes of End turn taps of mine
  const timeoutTries = new Map<number, { count: number; at: number }>();
  const staleTried = new Set<string>();

  let aiRunning = false;
  let aiN = -1;                   // head.n the AI turn expects: where it started, plus its own writes that landed
  let lastAiStop = -1;
  let claiming = false;

  let stopWatch: (() => void) | null = null;
  let stopTick: (() => void) | null = null;

  // ---- readings ----

  const mySeat = (): PlayerId | null => (room && me !== null ? room.members[me] ?? null : null);
  const member = (): boolean => mySeat() !== null;
  const blocked = (): boolean => room !== null && liveDesync(room).length > 0;
  const sending = (): boolean => inFlight !== null || queue.length > 0;
  const endTurnPending = (): boolean => [inFlight, ...queue].some((o) => o !== null && o.action.type === 'endTurn');
  const absent = (): PlayerId[] => {
    if (!room) return [];
    const out: PlayerId[] = [];
    room.seats.forEach((s, i) => { if (s?.kind === 'human' && room!.presence[s.uid]?.on !== true) out.push(i as PlayerId); });
    return out;
  };
  // The presence that pauses the clock: the human in the current seat. An AI seat's clock never pauses.
  const currentPresence = (r: Room): Presence | null => {
    const s = r.head ? r.seats[r.head.seat] : null;
    return s?.kind === 'human' ? r.presence[s.uid] ?? null : null;
  };
  const clockNow = (now: number): ClockView => {
    if (!room?.head || (phase !== 'playing' && phase !== 'desync') || (followed !== null && followed.state.winner !== null)) return { kind: 'off' };
    return clockView(room.meta.clock, room.head, currentPresence(room), now);
  };
  // Either replay holds play: act, resign, the clock and the AI seats wait for its word.
  const checking = (): boolean => verifying || rebuildingOn !== null;
  const myTurn = (): boolean => {
    const seat = mySeat();
    return connected && !returning && !checking() && phase === 'playing' && followed !== null && seat !== null
      && followed.state.current === seat && followed.state.winner === null && !blocked() && !endTurnPending();
  };

  function view(): SessionView {
    const now = net.serverNow();
    const clock = clockNow(now);
    return {
      phase, code, me, mySeat: mySeat(), room, followed, connected, returning, verifying: checking(), blocked: blocked(), clock, secondsLeft: secondsLeft(clock, now),
      myTurn: myTurn(), sending: sending(), hostIsMe: room !== null && me !== null && room.meta.hostId === me,
      absent: absent(), remoteVersion, remoteSchema, lastSteps, timedOut, failure,
    };
  }
  const emit = (): void => { if (!closed) onChange(view()); };

  // ---- the watcher ----

  const watcher: Watcher = {
    room(r) { room = r; roomSeen = true; reading(); },
    actions(list) {
      if (list === null) { unreadable(); return; }
      remote = list; reading();
    },
    connected(ok) { onConnected(ok); },
  };

  let lastReadingAt = Number.NEGATIVE_INFINITY;   // server time of the last room or actions event
  function reading(): void {
    if (closed) return;
    lastReadingAt = net.serverNow();
    if (inAppend) { skipped = true; return; }
    if (!decided) { decide(); return; }
    update();
  }

  // The first look at the room: whether this phone may play it, and how it enters.
  function decide(): void {
    if (!roomSeen) return;
    decided = true;
    if (room === null) { phase = 'notFound'; detach(); emit(); return; }
    if (room.meta.schema > SCHEMA) { phase = 'version'; remoteSchema = room.meta.schema; detach(); emit(); return; }
    if (room.meta.rulesVersion !== rulesVersion) { phase = 'version'; remoteVersion = room.meta.rulesVersion; detach(); emit(); return; }
    if (member()) { enter(); return; }
    phase = 'join';
    failure = room.meta.phase !== 'lobby' && absent().length === 0 ? 'full' : null;
    emit();
  }

  // This phone is a member: the return, then the lobby or the match.
  function enter(): void {
    startReturn();
    if (room?.meta.phase === 'lobby') phase = 'lobby';
    else { phase = 'connecting'; void load(); }
    emit();
  }

  const pause = deps.pause ?? ((): Promise<void> => new Promise((res) => { deps.setTimer(res, 0); }));

  // Reads the start once. A usable snapshot gives the board at once, but it is never trusted: the snapshot, its check
  // and the head hash are all written by the phone that ended the turn. The actions are replayed from the opening, a
  // chunk at a time, and the replay decides: if it disagrees with any hash the record claims, the replay's state is
  // the match and the record is reported as a desync.
  async function load(): Promise<void> {
    if (loading || followed || closed) return;
    loading = true;
    emit();
    const r = await net.readStart(code);
    if (closed || followed) { loading = false; return; }
    if (typeof r !== 'object') {
      loading = false;
      if (r !== 'offline') { phase = 'failed'; failure = r; }   // offline: the next connected(true) or tick tries again
      emit();
      return;
    }
    const list = remote ?? [];
    const claimed = { ...r.checks };
    const quick = fromSnapshot(r.settings, list, r.snap, r.checks);
    if (quick !== null && r.snap !== null) {
      claimed[r.snap.n] = r.snap.hash;
      followed = quick;
      phase = quick.state.winner !== null ? 'over' : 'playing';
      verifying = true;
      update();
    }
    await pause();
    const done = closed ? null : await replay(r.settings, list, claimed, pause, () => !closed);
    loading = false;
    verifying = false;
    if (done === null) return;
    if (done.refusedAt !== null || done.disagreesAt !== null) {
      recordForged = true;
      followed = done.followed;
      broken();
    } else {
      if (followed === null) {
        followed = done.followed;
        phase = followed.state.winner !== null ? 'over' : 'playing';
      }
      checkOwnEntry = true;
    }
    update();
  }

  function update(): void {
    if (closed) return;
    if (phase === 'lobby' && room && room.meta.phase !== 'lobby') void load();
    if (followed && room?.head && remote && (phase === 'playing' || phase === 'over' || phase === 'desync')) followStep();
    clearStale();
    kick();
    emit();
  }

  function followStep(): void {
    const head = room!.head!;
    const local = followed!;
    const list = remote!;
    // Our own writes not yet in the list: the list is behind us, not against us.
    if (sending() && list.length < local.actions.length && isPrefix(list, local.actions)) return;
    const on = `${local.actions.length}:${list.length}:${head.n}:${head.hash}`;
    if (phase === 'desync' && on === brokenOn) return;     // judged already: a long replay is not run on every reading
    if (on === rebuildingOn) return;                       // being rebuilt already
    const f = follow(local, list, head);
    if (f.kind === 'wait') return;
    // While a write of ours is pending, the SDK's cache mixes it with what the server sent (our head beside their
    // list, say): a disagreement then is the write losing its race, not a broken match. Its answer decides.
    if ((f.kind === 'broken' || f.kind === 'diverged') && sending()) return;
    if (f.kind === 'diverged') { void rebuildOn(local, list, head, on); return; }
    rebuildGen++;                                          // a newer reading settled it: a rebuild still running is moot
    rebuildingOn = null;
    if (f.kind === 'broken') { broken(); brokenOn = on; return; }
    if (f.kind === 'advanced') {
      endedMine(f.steps, local.actions.length);
      followed = f.followed;
      lastSteps = { seq: ++seq, steps: f.steps, mine: false };
    }
    settledOn();
  }

  // The record's endTurns that ended my turn without a tap of mine owe the timeUp line. `from`: the first step's index.
  function endedMine(steps: Step[], from: number): void {
    const seat = mySeat();
    steps.forEach((s, i) => {
      if (s.action.type === 'endTurn' && s.before.current === seat && !tapped.has(from + i)) timedOut = from + i;
    });
  }

  function settledOn(): void {
    agreed();
    if (followed!.state.winner !== null && phase === 'playing') phase = 'over';
  }

  // The list no longer extends ours (a write of ours lost its race, say): the record is replayed from the opening in
  // chunks, as a load is, with `checking()` true meanwhile. A newer reading that settles things first discards it.
  async function rebuildOn(local: Followed, list: string[], head: Head, on: string): Promise<void> {
    const gen = ++rebuildGen;
    const mine = (): boolean => !closed && gen === rebuildGen;
    rebuildingOn = on;
    emit();
    await pause();
    const r = mine() ? await rebuildFrom(local, list, head, pause, mine) : null;
    if (!mine()) return;
    rebuildingOn = null;
    if (r === null || followed !== local || sending()) { update(); return; }
    if (r.kind === 'broken') { broken(); brokenOn = on; update(); return; }
    // A rebuild has no steps for the effects, but an endTurn of the record's that ended my turn where I lost my own
    // write (a backup timeout that beat my last move) still owes the timeUp line.
    endedMine(r.parted, list.length - r.parted.length);
    followed = r.followed;
    lastSteps = { seq: ++seq, steps: [], mine: false };
    dropQueue();
    for (const n of tapped) if (n >= list.length) tapped.delete(n);
    // What this phone played and lost may have ended the match here: the record decides.
    if (phase === 'over' || phase === 'playing') phase = followed.state.winner !== null ? 'over' : 'playing';
    settledOn();
    update();
  }

  // The action list cannot be read (longer than MAX_ACTIONS, or not a list): the match stops, in words, never silently.
  function unreadable(): void {
    if (closed) return;
    phase = 'failed';
    failure = 'unreadable';
    dropQueue();
    emit();
  }

  // This phone's state disagrees with the record: say so, and stop acting.
  function broken(): void {
    if (phase !== 'desync') phase = 'desync';
    dropQueue();
    if (desyncReported || !followed) return;
    desyncReported = true;
    void net.reportDesync(code, { n: followed.actions.length, hash: hashState(followed.state), build: deps.build });
  }

  // This phone agrees with the record: a desync it reported, or one left from before a reload, is withdrawn. Never
  // after the replay disagreed with the record's own hashes: those are written once, and a head that agrees with a
  // forged state proves nothing.
  function agreed(): void {
    if (recordForged) return;
    const mine = me !== null && room !== null && Object.hasOwn(room.desync, me);
    if (phase === 'desync') {
      phase = followed!.state.winner !== null ? 'over' : 'playing';
      desyncReported = false;
      void net.reportDesync(code, null);
    } else if (checkOwnEntry && mine) {
      void net.reportDesync(code, null);
    }
    checkOwnEntry = false;
  }

  // An entry left by someone who is no longer a member blocks nothing; any member may remove it.
  function clearStale(): void {
    if (!room || !member()) return;
    for (const uid of staleTried) if (!Object.hasOwn(room.desync, uid)) staleTried.delete(uid);   // gone: forget it
    for (const uid of Object.keys(room.desync)) {
      if (Object.hasOwn(room.members, uid) || staleTried.has(uid)) continue;
      staleTried.add(uid);
      void net.clearDesync(code, uid);
    }
  }

  function onConnected(ok: boolean): void {
    if (closed) return;
    if (!ok) {
      if (connected) dropped = true;
      connected = false;
      emit();
      return;
    }
    connected = true;
    if (member() && phase !== 'join') {
      if (dropped || (returning && !returnRunning)) startReturn();
      if (phase === 'connecting' && !followed && room?.meta.phase !== 'lobby') void load();
    }
    dropped = false;
    kick();
    emit();
  }

  // ---- the return ----

  // Presence, and the drop credit when this phone holds the turn, in one write from a fresh read. Until it lands this
  // phone takes no clock decision, so its first one is made from a head that already holds the credit.
  function startReturn(): void {
    const gen = ++returnGen;
    returning = true;
    returnRunning = true;
    emit();
    const stillMine = (): boolean => gen === returnGen && !closed;
    const pause = (): void => { if (stillMine()) { returnRunning = false; emit(); } };   // offline: wait for connected(true)
    const done = (): void => {
      if (!stillMine()) return;
      returning = false;
      returnRunning = false;
      update();
    };
    void (async () => {
      try {
        for (let i = 0; i < RETURN_TRIES; i++) {
          const live = await net.readLive(code);
          if (!stillMine()) return;
          if (live === 'offline') { pause(); return; }
          // No fresh read (refused, say): still say this phone is here, but claim no credit from a guess.
          const fresh = typeof live === 'object' ? live : null;
          const seat = mySeat();
          const clockOn = (room?.meta.clock ?? 0) > 0;
          const credit = fresh && i < RETURN_TRIES - 1 && clockOn && seat !== null
            ? creditOnReturn(fresh.head, seat === fresh.head?.seat, fresh.presence, net.serverNow()) : null;
          const r = await net.present(code, credit);
          if (!stillMine()) return;
          if (r === true) { done(); return; }
          if (r === 'offline') { pause(); return; }
          // 'refused': the head moved between the read and the write (a timeout landed, say): read again.
        }
        done();
      } catch {
        pause();
      }
    })();
  }

  // ---- writing ----

  // Applies an action at once and queues its write. Internal: the callers check whose turn it is.
  function enqueue(action: Action, opts: { timeout?: boolean; adapt?: Append['adapt']; tap?: boolean; done?: (landed: boolean) => void } = {}): Step | null {
    if (!followed) return null;
    const r = applyLocal(followed, action);
    if (!r) return null;
    const n = followed.actions.length;
    followed = r.followed;
    queue.push({
      n, action, encoded: r.encoded, after: r.step.after, seatBefore: r.step.before.current,
      adapt: opts.adapt ?? null, timeout: opts.timeout ?? false, done: opts.done ?? null,
    });
    if (opts.tap && action.type === 'endTurn') tapped.add(n);
    lastSteps = { seq: ++seq, steps: [r.step], mine: true };
    if (r.step.after.winner !== null && phase === 'playing') phase = 'over';
    pump();
    emit();
    return r.step;
  }

  // Hands the next queued write to the Net, when nothing is in flight. A write handed over stays pending while
  // offline: the SDK holds it and sends it on the return, and the rules judge it then.
  function pump(): void {
    if (inFlight || closed || queue.length === 0) return;
    const out = queue.shift()!;
    inFlight = out;
    const { action, after } = out;
    const turnPassed = action.type === 'endTurn'
      || (action.type === 'resign' && action.player === out.seatBefore && after.winner === null);
    const over = after.winner !== null;
    const a: Append = {
      n: out.n, action: out.encoded, seatAfter: after.current, hash: hashState(after), turnPassed, over,
      snap: turnPassed || over ? JSON.stringify(after) : null, adapt: out.adapt,
    };
    let p: Promise<true | 'refused' | 'notSetUp'>;
    inAppend = true;
    try { p = net.append(code, a); } catch { inAppend = false; failed(out); return; }
    inAppend = false;
    if (skipped) { skipped = false; update(); }
    p.then((r) => settled(out, r), () => failed(out));
  }

  function settled(out: Out, r: true | 'refused' | 'notSetUp'): void {
    if (inFlight === out) inFlight = null;
    if (r === 'notSetUp') { failed(out); return; }
    if (closed) { out.done?.(r === true); return; }
    if (r === true) {
      if (out.timeout && out.seatBefore === mySeat()) timedOut = out.n;
      out.done?.(true);
      pump();
    } else {
      // Lost to another write at this index: drop what was built on it and follow the record, which rebuilds.
      out.done?.(false);
      dropQueue();
    }
    update();
  }

  // A thrown append (not a refusal by the rules) is a broken session, not a crash.
  function failed(out: Out): void {
    if (inFlight === out) inFlight = null;
    out.done?.(false);
    dropQueue();
    if (!closed) { phase = 'failed'; emit(); }
  }

  function dropQueue(): void {
    for (const o of queue.splice(0)) o.done?.(false);
  }

  // ---- the clock, the host role and the AI seats ----

  // `ticked`: called from the once-a-second timer, the only place a timeout is decided.
  function kick(ticked = false): void {
    if (closed || !room || me === null) return;
    host();
    if (ticked) clock();
    ai();
  }

  function host(): void {
    if (claiming || !connected || returning || !member() || (phase !== 'lobby' && phase !== 'playing')) return;
    if (room!.meta.phase === 'over') return;
    // A host that never wrote presence is measured from the room's creation, not taken as away since long ago.
    const r = room!;
    const seen = Object.hasOwn(r.presence, r.meta.hostId) ? r : { ...r, presence: { ...r.presence, [r.meta.hostId]: { on: false, at: r.meta.createdAt } } };
    if (hostMove(seen, me!, net.serverNow()) === null) return;
    claiming = true;
    net.claimHost(code).catch(() => {}).finally(() => { claiming = false; if (!closed) update(); });
  }

  function clock(): void {
    if (phase !== 'playing' || !connected || returning || checking() || sending() || blocked() || !followed || followed.state.winner !== null) return;
    const head = room!.head;
    const seat = mySeat();
    if (!head || seat === null || room!.meta.clock <= 0 || followed.actions.length !== head.n) return;
    const now = net.serverNow();
    if (now - lastReadingAt < SETTLE_MS) return;
    const current = room!.seats[head.seat];
    const mine = head.seat === seat || (current?.kind === 'ai' && room!.meta.hostId === me);
    if (!timeoutDue(clockView(room!.meta.clock, head, currentPresence(room!), now), now, mine)) return;
    for (const n of timeoutTries.keys()) if (n < head.n) timeoutTries.delete(n);   // indexes long passed
    const tries = timeoutTries.get(head.n);
    if (tries && (tries.count >= TIMEOUT_TRIES || now - tries.at < TIMEOUT_RETRY_MS)) return;
    timeoutTries.set(head.n, { count: (tries?.count ?? 0) + 1, at: now });
    enqueue({ type: 'endTurn' }, { timeout: true });
  }

  const aiLive = (seat: PlayerId): boolean => !closed && !returning && !checking() && phase === 'playing' && room !== null && followed !== null
    && me !== null && aiSeatToPlay(room, followed.state, me) === seat && (room.head?.n ?? 0) <= aiN;

  function ai(): void {
    if (aiRunning || phase !== 'playing' || !connected || returning || checking() || sending() || blocked() || !followed) return;
    const head = room!.head;
    if (!head || followed.actions.length !== head.n) return;
    const seat = aiSeatToPlay(room!, followed.state, me!);
    if (seat === null) return;
    aiRunning = true;
    // Started after the current batch of events, so the seats node has caught up with the head: a turn picked up
    // midway reads the dial written with its first action.
    queueMicrotask(() => {
      const info = room?.seats[seat];
      if (!followed || info?.kind !== 'ai') { aiRunning = false; return; }
      aiN = followed.actions.length;
      if (!aiLive(seat)) { aiRunning = false; return; }
      const last = followed.actions.at(-1);
      const turnFresh = last === undefined || last === '{"type":"endTurn"}';
      const append = (action: Action, adapt: AdaptState | null): Promise<boolean> => new Promise((res) => {
        const step = enqueue(action, {
          adapt: adapt ? { seat, value: adapt } : null,
          done: (landed) => { if (landed) aiN++; res(landed); },
        });
        if (!step) res(false);
      });
      playAiSeat(seat, info, turnFresh, { ai: deps.ai, state: () => followed?.state ?? null, live: () => aiLive(seat), append })
        .then((end) => end, () => 'stopped' as const)
        .then((end) => {
          aiRunning = false;
          if (closed) return;
          // A stopped turn is picked up again, so an AI turn never stalls; once per head, then on the next tick.
          const n = room?.head?.n ?? -1;
          if (end === 'stopped' && n !== lastAiStop) { lastAiStop = n; queueMicrotask(() => { if (!closed) kick(); }); }
        });
    });
  }

  let lastTickAt = Number.NEGATIVE_INFINITY;
  function tick(): void {
    if (closed) return;
    stopTick = deps.setTimer(tick, TICK_MS);
    const now = net.serverNow();
    const slept = now - lastTickAt > SLEPT_MS;
    lastTickAt = now;
    resume(slept);
    kick(true);
    emit();
  }

  // `slept`: the tab may have slept (a long tick gap, or the page made visible), so the return runs first.
  // False when there is nothing to return to yet (not connected, not a member): a later connected(true) covers it.
  function resume(slept: boolean): boolean {
    if (!connected || !member() || phase === 'join') return false;
    if ((returning && !returnRunning) || (slept && !returning)) startReturn();
    if (phase === 'connecting' && !followed && !loading && room && room.meta.phase !== 'lobby') void load();
    return true;
  }

  function detach(): void {
    stopWatch?.();
    stopWatch = null;
    stopTick?.();
    stopTick = null;
  }

  // ---- opening ----

  void (async () => {
    try {
      me = await net.uid();
    } catch {
      phase = 'failed'; emit(); return;
    }
    if (closed) return;
    stopWatch = net.watch(code, watcher);
    lastTickAt = net.serverNow();
    stopTick = deps.setTimer(tick, TICK_MS);
  })();

  const joined = (): void => { failure = null; if (!closed && phase === 'join') enter(); };

  return {
    view,
    act(a) {
      try {
        if (!myTurn() || a.type === 'resign') return null;
        return enqueue(a, { tap: true });
      } catch {
        return null;
      }
    },
    resign() {
      const seat = mySeat();
      if (!connected || returning || checking() || phase !== 'playing' || blocked() || seat === null || !followed) return false;
      return enqueue({ type: 'resign', player: seat }) !== null;
    },
    async join(name) {
      if (me === null) me = await net.uid();
      const r = await net.join(code, name, rulesVersion);
      if (typeof r === 'object') { joined(); return true; }
      failure = r; emit();
      return r;
    },
    async takeOver(seat) {
      if (me === null) me = await net.uid();
      const r = await net.takeOver(code, seat, rulesVersion);
      if (r === true) { joined(); return true; }
      failure = r; emit();
      return r;
    },
    setLobby: (patch) => net.setLobby(code, patch),
    async start(seed, advanced) {
      if (!room || room.meta.hostId !== me || !room.seats[0] || !room.seats[1]) return 'refused';
      const settings = { seed, factions: factionsFor(room.meta.hostFaction), ...advancedPart(advanced) };
      const r = await net.start(code, settings, hashState(createMatch(settings)));
      if (r !== true) { failure = r; emit(); }
      return r;
    },
    wake() {
      if (closed) return;
      // The tick that follows need not count the same sleep again: this return already covers it.
      if (resume(true)) lastTickAt = net.serverNow();
      kick();
      emit();
    },
    close() {
      if (closed) return;
      closed = true;
      dropQueue();
      detach();
    },
  };
}
