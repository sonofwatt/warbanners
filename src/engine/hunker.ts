import { CONFIG } from './data/config';
import { drankThisTurn } from './items';
import { hasTrait, unitById } from './state';
import type { Action, GameEvent, Handler, MatchState, Unit } from './types';

// rules 7, Hunker: why the current player's unit cannot hunker now, or null when it can. The reasons are the handler's.
// A unit hunkers only when it has done nothing yet this turn (no move, attack, ability, capture or claim; since rules 8
// a drink is fine, CONFIG.hunker.drinkKeepsHunker), was not trained this turn, is not hunkered already, and is no
// siege engine. Since rules 9 it may not hunker again on a turn it unhunkered.
export function hunkerRefusal(s: MatchState, unitId: unknown): string | null {
  if (!CONFIG.hunker.on) return 'unknown action';
  if (typeof unitId !== 'number') return 'bad hunker';
  const u = unitById(s, unitId);
  if (u === undefined) return 'no such unit';
  if (u.owner !== s.current) return 'not your unit';
  if (u.fresh) return 'unit is too new';
  if (u.hunkered) return 'already hunkered';
  if (hasTrait(u, 'siege')) return 'siege engines cannot hunker';
  if (u.moved || u.acted || (!CONFIG.hunker.drinkKeepsHunker && drankThisTurn(s, u))) return 'unit already acted this turn';
  if (u.unhunkeredTurn === s.stamp) return 'unhunkered this turn';
  return null;
}

export function canHunker(s: MatchState, unitId: number): boolean {
  return hunkerRefusal(s, unitId) === null;
}

// Hunkering spends the unit's turn but is not acting or moving, so the unit still rests.
export const hunkerHandler: Handler<Extract<Action, { type: 'hunker' }>> = (s, a, ev) => {
  const refusal = hunkerRefusal(s, a.unit);
  if (refusal !== null) return refusal;
  const u = unitById(s, a.unit)!;
  u.hunkered = true;
  u.mp = 0; u.bonusMp = 0; u.attacks = 0;
  ev.push({ type: 'hunkered', unit: u.id });
  return null;
};

// rules 9, Unhunker: why the current player's unit cannot unhunker now, or null when it can. Only a hunkered unit of
// the player whose turn it is.
export function unhunkerRefusal(s: MatchState, unitId: unknown): string | null {
  if (!CONFIG.hunker.on || !CONFIG.hunker.unhunker) return 'unknown action';
  if (typeof unitId !== 'number') return 'bad unhunker';
  const u = unitById(s, unitId);
  if (u === undefined) return 'no such unit';
  if (u.owner !== s.current) return 'not your unit';
  if (!u.hunkered) return 'not hunkered';
  return null;
}

export function canUnhunker(s: MatchState, unitId: number): boolean {
  return unhunkerRefusal(s, unitId) === null;
}

// Unhunkering ends the hunker and nothing else: it costs nothing, is not acting or moving (the unit still rests), and
// gives back no movement or attacks (a unit that hunkered this turn still cannot move). The unit may not hunker again
// this turn.
export const unhunkerHandler: Handler<Extract<Action, { type: 'unhunker' }>> = (s, a, ev) => {
  const refusal = unhunkerRefusal(s, a.unit);
  if (refusal !== null) return refusal;
  const u = unitById(s, a.unit)!;
  endHunker(u, ev);
  u.unhunkeredTurn = s.stamp;
  return null;
};

// Ends a unit's hunker, if it has one: it moved, acted or was pulled off its ground.
export function endHunker(u: Unit, ev: GameEvent[]): void {
  if (!u.hunkered) return;
  u.hunkered = false;
  ev.push({ type: 'hunkerEnded', unit: u.id });
}

// The defence bonus a hunkered unit gets when it is attacked (never when it attacks).
export function hunkerDef(u: Unit): number {
  return u.hunkered ? CONFIG.hunker.def : 0;
}
