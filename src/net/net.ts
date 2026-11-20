import type { MatchSettings, PlayerId, FactionId } from '../engine';
import type { ClockSec, Desync, Head, Presence, Room, RoomSeat, Snap } from '../online/wire';

// The Net layer's contract, types only, so the app may import it with `import type`. firebaseNet.ts runs it on
// Firebase, fakeNet.ts in memory; contract.ts holds both to the same tests.

type AiSeat = Extract<RoomSeat, { kind: 'ai' }>;
type AdaptState = AiSeat['adapt'];

export type Refusal = 'offline' | 'schema' | 'notFound' | 'full' | 'started' | 'version' | 'refused' | 'notSetUp';

export interface Append {
  n: number; action: string; seatAfter: PlayerId; hash: string; turnPassed: boolean; over: boolean;
  snap: string | null;                                   // JSON of the state after this action, sent when turnPassed or over
  adapt: { seat: PlayerId; value: AdaptState } | null;   // an AI seat's dial, sent with the AI turn's first action
}

export interface Watcher { room(r: Room | null): void; actions(list: string[] | null): void; connected(ok: boolean): void }

export interface CreateInput { code: string; name: string; hostFaction: FactionId; clock: ClockSec; rulesVersion: number; build: string }

export interface Live { head: Head | null; presence: Presence | null }   // read fresh from the server, not from the cache

export interface StartRead { settings: MatchSettings; snap: Snap | null; checks: Record<number, string> }

export interface Net {
  uid(): Promise<string>;
  serverNow(): number;                                                    // Date.now() + the server offset
  create(input: CreateInput): Promise<true | Refusal>;
  join(code: string, name: string, rules: number): Promise<{ seat: PlayerId } | Refusal>;   // a member gets their seat back
  takeOver(code: string, seat: PlayerId, rules: number): Promise<true | Refusal>;
  setLobby(code: string, patch: { clock?: ClockSec; hostFaction?: FactionId; name?: string }): Promise<true | Refusal>;
  setAiSeat(code: string, seat: PlayerId, s: AiSeat): Promise<true | Refusal>;              // host, lobby only
  start(code: string, settings: MatchSettings, openingHash: string): Promise<true | Refusal>;
  append(code: string, a: Append): Promise<true | 'refused' | 'notSetUp'>;                  // pending while offline; never 'offline'
  readLive(code: string): Promise<Live | Refusal>;
  present(code: string, pausedTo: number | null): Promise<true | Refusal>;                  // arms onDisconnect, then presentPatch
  claimHost(code: string): Promise<void>;                                                   // does nothing when already host
  readStart(code: string): Promise<StartRead | Refusal>;
  reportDesync(code: string, d: Desync | null): Promise<void>;
  clearDesync(code: string, uid: string): Promise<void>;                                    // another uid's entry, once it is no longer a member; best effort
  watch(code: string, w: Watcher): () => void;                                              // listens only; closing it may write presence off
  remove(code: string): Promise<boolean>;
}
