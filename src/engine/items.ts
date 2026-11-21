import { UNITS } from './data/units';
import { hasTrait, unitById } from './state';
import type { Action, Handler, MatchState, Unit } from './types';

// Why the current player's unit cannot use its item, or null when it can. The reasons are the handler's.
export function useItemRefusal(s: MatchState, unitId: unknown): string | null {
  if (typeof unitId !== 'number') return 'bad item use';
  const u = unitById(s, unitId);
  if (u === undefined) return 'no such unit';
  if (u.owner !== s.current) return 'not your unit';
  if (u.item === null) return 'nothing to use';
  if (u.fresh) return 'unit is too new';
  if (u.itemTurn === s.stamp) return 'found this turn';
  const def = UNITS[u.type];
  if (def.atk <= 0 || def.range <= 0 || (hasTrait(u, 'siege') && u.moved)) return 'cannot attack';
  return null;
}

export function canUseItem(s: MatchState, unitId: number): boolean {
  return useItemRefusal(s, unitId) === null;
}

// A unit that drank this turn keeps one attack back: the draught buys an attack, never a second ability.
export function drankThisTurn(s: MatchState, u: Unit): boolean {
  return u.item === null && u.itemTurn === s.stamp;
}

// The Battle draught: one more attack this turn, then it is gone. Drinking is not acting or moving.
export const useItemHandler: Handler<Extract<Action, { type: 'useItem' }>> = (s, a, ev) => {
  const refusal = useItemRefusal(s, a.unit);
  if (refusal !== null) return refusal;
  const u = unitById(s, a.unit)!;
  ev.push({ type: 'usedItem', unit: u.id, item: u.item! });
  u.attacks += 1;
  u.item = null;
  u.itemTurn = s.stamp;
  return null;
};
