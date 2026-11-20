import { applyAction, createMatch, hashState, legalActions, playerView } from '../engine';
import type { Action, GameEvent, MatchSettings, MatchState } from '../engine';
import { decodeAction, encodeAction } from './wire';
import type { Head, Snap } from './wire';

export interface Followed { settings: MatchSettings; actions: string[]; state: MatchState }
// One accepted action; the same shape as the digest's TurnStep plus the action itself.
export interface Step { action: Action; before: MatchState; after: MatchState; events: GameEvent[] }
export type Follow =
  | { kind: 'same' }
  | { kind: 'wait' }                                         // the list and head disagree on length: a write is mid-flight
  | { kind: 'advanced'; followed: Followed; steps: Step[] }
  | { kind: 'rebuilt'; followed: Followed }                  // the list no longer extends ours: started again from it
  | { kind: 'broken'; at: number; reason: 'refused' | 'hash' };
type Rebuilt = { ok: true; followed: Followed } | { ok: false; at: number; reason: 'refused' | 'hash' };

export function opening(settings: MatchSettings): Followed {
  return { settings, actions: [], state: createMatch(settings) };
}

// Apply `encoded[from..]` to `state`, in order. A string the engine or the decoder refuses stops at its index.
function applyFrom(state: MatchState, encoded: string[], from: number, checks: Record<number, string> = {}):
  { ok: true; state: MatchState; steps: Step[] } | { ok: false; at: number; reason: 'refused' | 'hash' } {
  const steps: Step[] = [];
  let s = state;
  for (let i = from; i < encoded.length; i++) {
    const action = decodeAction(encoded[i]);
    if (action === null) return { ok: false, at: i, reason: 'refused' };
    const r = applyAction(s, action);
    if (!r.ok) return { ok: false, at: i, reason: 'refused' };
    steps.push({ action, before: s, after: r.state, events: r.events });
    s = r.state;
    const check = checks[i + 1];
    if (check !== undefined && hashState(s) !== check) return { ok: false, at: i + 1, reason: 'hash' };
  }
  return { ok: true, state: s, steps };
}

// A hash proves a snapshot is the one written, not that this build can read it: it is used only if the
// views and the legal actions can be computed from it.
function readSnap(snap: Snap | null, length: number, checks: Record<number, string>): MatchState | null {
  if (snap === null || !Number.isInteger(snap.n) || snap.n < 0 || snap.n > length) return null;
  try {
    const state = JSON.parse(snap.state) as MatchState;
    if (hashState(state) !== snap.hash) return null;
    const check = checks[snap.n];
    if (check !== undefined && check !== snap.hash) return null;
    playerView(state, 0); playerView(state, 1); legalActions(state);
    return state;
  } catch {
    return null;
  }
}

// The quick look at a reopened match: the snapshot plus the actions after it. It is shown at once but never trusted:
// the snapshot, its check and the head hash are all written by the phone that ended the turn, so a doctored state can
// carry hashes that agree with it. `replay` is the word that counts. Null when the snapshot cannot be used.
export function fromSnapshot(settings: MatchSettings, remote: string[], snap: Snap | null, checks: Record<number, string>): Followed | null {
  const state = readSnap(snap, remote.length, checks);
  if (state === null || snap === null) return null;
  const r = applyFrom(state, remote, snap.n, checks);
  return r.ok ? { settings, actions: [...remote], state: r.state } : null;
}

// Actions replayed between two pauses. Measured over a 3,000-action match with its 641 checks in Chromium: the
// longest chunk took 14 to 23 ms, and 62 to 74 ms with the CPU slowed four times, so no task nears 100 ms.
export const REPLAY_CHUNK = 20;

export interface Replayed {
  followed: Followed;            // the record replayed from the opening: up to the refused action, when one is refused
  refusedAt: number | null;      // the first action the decoder or the engine refuses
  disagreesAt: number | null;    // the first index whose claimed hash (a check, the snapshot's) the replay disagrees with
}

// The record's truth: every action from the opening, REPLAY_CHUNK at a time with `pause()` between, so no task on
// the main thread runs long. `claimed` holds the hashes the record claims; a disagreement is reported, never believed.
// Null when `wanted()` turns false at a pause (the session closed).
export async function replay(settings: MatchSettings, remote: string[], claimed: Record<number, string>,
  pause: () => Promise<void>, wanted: () => boolean = () => true): Promise<Replayed | null> {
  let state = createMatch(settings);
  const differs = (k: number): boolean => claimed[k] !== undefined && hashState(state) !== claimed[k];
  let disagreesAt: number | null = differs(0) ? 0 : null;
  for (let i = 0; i < remote.length; i++) {
    if (i > 0 && i % REPLAY_CHUNK === 0) {
      await pause();
      if (!wanted()) return null;
    }
    const action = decodeAction(remote[i]!);
    const r = action === null ? null : applyAction(state, action);
    if (r === null || !r.ok) return { followed: { settings, actions: remote.slice(0, i), state }, refusedAt: i, disagreesAt };
    state = r.state;
    if (disagreesAt === null && differs(i + 1)) disagreesAt = i + 1;
  }
  return { followed: { settings, actions: [...remote], state }, refusedAt: null, disagreesAt };
}

// A synchronous replay from the opening, for a rebuild after a lost race (no snapshot is involved).
export function rebuild(settings: MatchSettings, remote: string[], checks: Record<number, string>): Rebuilt {
  const r = applyFrom(createMatch(settings), remote, 0, checks);
  return r.ok ? { ok: true, followed: { settings, actions: [...remote], state: r.state } } : r;
}

function fullRebuild(local: Followed, remote: string[], head: Head): Follow {
  const r = rebuild(local.settings, remote, {});
  if (!r.ok) return { kind: 'broken', at: r.at, reason: r.reason };
  return hashState(r.followed.state) === head.hash ? { kind: 'rebuilt', followed: r.followed } : { kind: 'broken', at: head.n, reason: 'hash' };
}

export function follow(local: Followed, remote: string[], head: Head): Follow {
  if (remote.length !== head.n) return { kind: 'wait' };
  const same = remote.length === local.actions.length && remote.every((a, i) => a === local.actions[i]);
  if (same) return hashState(local.state) === head.hash ? { kind: 'same' } : fullRebuild(local, remote, head);
  const extends_ = remote.length > local.actions.length && local.actions.every((a, i) => a === remote[i]);
  if (!extends_) return fullRebuild(local, remote, head);
  const r = applyFrom(local.state, remote, local.actions.length);
  if (!r.ok) return { kind: 'broken', at: r.at, reason: r.reason };
  if (hashState(r.state) !== head.hash) return fullRebuild(local, remote, head);
  return { kind: 'advanced', followed: { settings: local.settings, actions: [...remote], state: r.state }, steps: r.steps };
}

export function applyLocal(local: Followed, action: Action): { followed: Followed; step: Step; encoded: string } | null {
  const r = applyAction(local.state, action);
  if (!r.ok) return null;
  const encoded = encodeAction(action);
  return {
    followed: { settings: local.settings, actions: [...local.actions, encoded], state: r.state },
    step: { action, before: local.state, after: r.state, events: r.events },
    encoded,
  };
}
