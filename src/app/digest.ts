import { playerView } from '../engine';
import type { GameEvent, MatchState, PlayerId, UnitTypeId } from '../engine';

export type DigestLine =
  | { kind: 'unitLost'; unitType: UnitTypeId; by: UnitTypeId | null }
  | { kind: 'unitHurt'; unitType: UnitTypeId; damage: number; by: UnitTypeId | null }
  | { kind: 'cityLost' };

// One accepted action: the state before and after it, and what it did.
export interface TurnStep { before: MatchState; after: MatchState; events: GameEvent[] }

// Whether the viewer's side could see unit `id` in `state`.
const sees = (state: MatchState, viewer: PlayerId, id: number): boolean => playerView(state, viewer).units.some(u => u.id === id);

// What happened to the viewer's own units and cities, in order. Nothing else is reported.
export function digestFor(viewer: PlayerId, log: readonly TurnStep[]): DigestLine[] {
  const lines: DigestLine[] = [];
  for (const { before, after, events } of log) {
    const died = new Set<number>();
    let by: UnitTypeId | null = null;
    for (const e of events) {
      if (e.type === 'died') died.add(e.unit);
      // The attacker is named only if the viewer's side could see it, before the attack or after it.
      if (e.type === 'attacked' && by === null && (sees(before, viewer, e.unit) || sees(after, viewer, e.unit))) {
        by = before.units.find(u => u.id === e.unit)?.type ?? null;
      }
    }
    const lost = new Set<number>();
    for (const e of events) {
      if (e.type === 'attacked' || e.type === 'splashed') {
        const target = before.units.find(u => u.id === e.target);
        if (target === undefined || target.owner !== viewer) continue;
        if (died.has(target.id)) {
          if (!lost.has(target.id)) { lost.add(target.id); lines.push({ kind: 'unitLost', unitType: target.type, by }); }
        } else {
          lines.push({ kind: 'unitHurt', unitType: target.type, damage: e.damage, by });
        }
      } else if (e.type === 'captured') {
        if (before.cities.find(c => c.id === e.city)?.owner === viewer) lines.push({ kind: 'cityLost' });
      }
    }
  }
  return lines;
}
