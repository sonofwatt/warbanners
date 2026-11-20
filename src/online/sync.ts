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
type Rebuilt = { ok: true; followed: Followed; fromSnap: boolean } | { ok: false; at: number; reason: 'refused' | 'hash' };

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

export function rebuild(settings: MatchSettings, remote: string[], snap: Snap | null, checks: Record<number, string>): Rebuilt {
  const fromSnapState = readSnap(snap, remote.length, checks);
  if (fromSnapState !== null && snap !== null) {
    const r = applyFrom(fromSnapState, remote, snap.n, checks);
    if (r.ok) return { ok: true, followed: { settings, actions: [...remote], state: r.state }, fromSnap: true };
    // A snapshot that leads to a refusal may be the cause: fall through to the full replay, which decides.
  }
  const r = applyFrom(createMatch(settings), remote, 0, checks);
  return r.ok ? { ok: true, followed: { settings, actions: [...remote], state: r.state }, fromSnap: false } : r;
}

function fullRebuild(local: Followed, remote: string[], head: Head): Follow {
  const r = rebuild(local.settings, remote, null, {});
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
