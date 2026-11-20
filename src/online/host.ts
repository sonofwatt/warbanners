// Who holds the host role, and which AI seat the host plays. Pure: every time is a server time.
import type { MatchState, PlayerId } from '../engine';
import { HOST_AWAY_MS } from './wire';
import type { Room } from './wire';

// A member who sits in a human seat of their own and whose presence is on.
function presentHuman(room: Room, uid: string): boolean {
  const s = room.members[uid];
  if (s === undefined) return false;
  const seat = room.seats[s];
  return seat?.kind === 'human' && seat.uid === uid && room.presence[uid]?.on === true;
}

// 'reclaim': the creator is back and takes the role. 'standIn': the host has been away HOST_AWAY_MS and `me` is the
// present human who has been here longest (ties by uid), so exactly one phone moves. A host with no presence entry
// counts as away since long ago.
export function hostMove(room: Room, me: string, serverNow: number): 'reclaim' | 'standIn' | null {
  const { creatorId, hostId } = room.meta;
  if (me === creatorId && room.presence[me]?.on === true && hostId !== me) return 'reclaim';
  if (me === hostId || !presentHuman(room, me)) return null;
  const host = room.presence[hostId];
  if (host?.on === true || (host !== undefined && serverNow - host.at < HOST_AWAY_MS)) return null;
  const at = (uid: string): number => room.presence[uid]!.at;
  const first = Object.keys(room.members)
    .filter(uid => uid !== hostId && presentHuman(room, uid))
    .sort((a, b) => at(a) - at(b) || (a < b ? -1 : a > b ? 1 : 0))[0];
  return first === me ? 'standIn' : null;
}

// The seat this phone plays for the AI right now, or null: only the host, only an AI seat on its turn in a live match.
export function aiSeatToPlay(room: Room, state: MatchState, me: string): PlayerId | null {
  if (me !== room.meta.hostId || room.meta.phase !== 'playing' || state.winner !== null) return null;
  return room.seats[state.current]?.kind === 'ai' ? state.current : null;
}
