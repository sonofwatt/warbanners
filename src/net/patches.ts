import { serverTimestamp } from 'firebase/database';
import type { FactionId, MatchSettings, PlayerId } from '../engine';
import { encodeSettings, SCHEMA, type ClockSec, type RoomSeat } from '../online/wire';

// The exact multi-path writes the app sends. firebaseNet sends them, fakeNet applies them and the rules tests check
// them, so the three cannot drift. Paths are relative to rooms/<code>. Every path is a leaf the rules open on its
// own (database.rules.json has no cascading grant), so a patch never writes a whole `meta`, `seats/<s>` or `head`.

export type Patch = Record<string, unknown>;
type AiSeat = Extract<RoomSeat, { kind: 'ai' }>;
type AdaptState = AiSeat['adapt'];

export function createPatch(
  uid: string, input: { name: string; hostFaction: FactionId; clock: ClockSec; rulesVersion: number; build: string },
): Patch {
  return {
    'meta/createdAt': serverTimestamp(),
    'meta/creatorId': uid,
    'meta/hostId': uid,
    'meta/schema': SCHEMA,
    'meta/rulesVersion': input.rulesVersion,
    'meta/build': input.build,
    'meta/clock': input.clock,
    'meta/hostFaction': input.hostFaction,
    'meta/phase': 'lobby',
    ...humanSeat(0, uid, input.name, input.rulesVersion),
    [`members/${uid}`]: 0,
  };
}

export function joinPatch(uid: string, seat: PlayerId, name: string, rules: number): Patch {
  return { ...humanSeat(seat, uid, name, rules), [`members/${uid}`]: seat };
}

function humanSeat(seat: PlayerId, uid: string, name: string, rules: number): Patch {
  return {
    [`seats/${seat}/uid`]: uid,
    [`seats/${seat}/name`]: name,
    [`seats/${seat}/kind`]: 'human',
    [`seats/${seat}/rules`]: rules,
  };
}

export function aiSeatPatch(seat: PlayerId, s: AiSeat): Patch {
  return {
    [`seats/${seat}/uid`]: s.uid,
    [`seats/${seat}/name`]: s.name,
    [`seats/${seat}/kind`]: 'ai',
    [`seats/${seat}/level`]: s.level,
    [`seats/${seat}/salt`]: s.salt,
    [`seats/${seat}/adapt`]: { dial: s.adapt.dial, trend: s.adapt.trend },
    [`seats/${seat}/rules`]: null,
  };
}

export function lobbyPatch(p: { clock?: ClockSec; hostFaction?: FactionId }): Patch {
  const out: Patch = {};
  if (p.clock !== undefined) out['meta/clock'] = p.clock;
  if (p.hostFaction !== undefined) out['meta/hostFaction'] = p.hostFaction;
  return out;
}

export function startPatch(settings: MatchSettings, openingHash: string, firstSeat: PlayerId): Patch {
  return {
    match: { settings: encodeSettings(settings), startedAt: serverTimestamp() },
    'head/n': 0,
    'head/seat': firstSeat,
    'head/hash': openingHash,
    'head/at': serverTimestamp(),
    'head/turnAt': serverTimestamp(),
    'head/paused': 0,
    'meta/phase': 'playing',
  };
}

export function appendPatch(a: {
  n: number; action: string; hash: string; seatAfter: PlayerId; turnPassed: boolean;
  over: boolean; snap: string | null; adapt: { seat: PlayerId; value: AdaptState } | null;
}): Patch {
  const next = a.n + 1;
  const out: Patch = {
    [`actions/${a.n}`]: a.action,
    'head/n': next,
    'head/hash': a.hash,
    'head/at': serverTimestamp(),
  };
  if (a.turnPassed) {
    out['head/seat'] = a.seatAfter;
    out['head/turnAt'] = serverTimestamp();
    out['head/paused'] = 0;
    out[`checks/${next}`] = a.hash;
  }
  if (a.over) out['meta/phase'] = 'over';
  if (a.snap !== null && (a.turnPassed || a.over)) out.snap = { n: next, hash: a.hash, state: a.snap };
  if (a.adapt) out[`seats/${a.adapt.seat}/adapt`] = { dial: a.adapt.value.dial, trend: a.adapt.value.trend };
  return out;
}

export function takeoverPatch(newUid: string, seat: PlayerId, oldUid: string, rules: number): Patch {
  return {
    [`seats/${seat}/uid`]: newUid,
    [`seats/${seat}/rules`]: rules,
    [`members/${newUid}`]: seat,
    [`members/${oldUid}`]: null,
    [`desync/${oldUid}`]: null,
  };
}

// presence/<uid> { on: true, at: now }, plus head/paused when a return credit is due.
export function presentPatch(uid: string, pausedTo: number | null): Patch {
  const out: Patch = { [`presence/${uid}`]: { on: true, at: serverTimestamp() } };
  if (pausedTo !== null) out['head/paused'] = pausedTo;
  return out;
}
