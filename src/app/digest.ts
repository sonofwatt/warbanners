import { FACTIONS, isHidden, playerView } from '../engine';
import type { GameEvent, HeroTraitId, HexKey, MatchState, PlayerId, UnitTypeId } from '../engine';

// Every line names the tile it happened on (`at`), so tapping it in the report can show that place on the board.
export type DigestLine = { at: HexKey } & (
  | { kind: 'unitLost'; unitType: UnitTypeId; by: UnitTypeId | null }
  | { kind: 'unitHurt'; unitType: UnitTypeId; damage: number; by: UnitTypeId | null }
  | { kind: 'tileTaken'; by: UnitTypeId }          // an enemy melee killer stepped into a lost unit's tile
  | { kind: 'treasureTaken' }                       // the other side claimed a treasure the viewer's side can see
  | { kind: 'traitEarned'; unitType: UnitTypeId; trait: HeroTraitId }   // a unit of the viewer's earned a trait on the other side's turn
  | { kind: 'heroMade'; unitType: UnitTypeId }                          // ... and that trait made it a hero
  | { kind: 'cityLost' }
  | { kind: 'snareSprung'; unitType: UnitTypeId; damage: number; died: boolean });   // rules 11: an enemy stepped on the viewer's snare

// One accepted action: the state before and after it, and what it did.
export interface TurnStep { before: MatchState; after: MatchState; events: GameEvent[] }

// Whether the viewer's side could see unit `id` in `state`.
const sees = (state: MatchState, viewer: PlayerId, id: number): boolean => playerView(state, viewer).units.some(u => u.id === id);

// What happened to the viewer's own units and cities, in order, and the treasures the other side claimed in sight.
// Nothing else is reported.
export function digestFor(viewer: PlayerId, log: readonly TurnStep[]): DigestLine[] {
  const lines: DigestLine[] = [];
  for (const { before, after, events } of log) {
    const died = new Set<number>();
    let by: UnitTypeId | null = null;
    for (const e of events) {
      if (e.type === 'died') died.add(e.unit);
      // The attacker is named only if the viewer's side could see it, before the attack or after it, or (rules 11) it
      // shot from Woodland cover or a veil: its kind is told, never its tile (the line's tile is the target's).
      if (e.type === 'attacked' && by === null) {
        const a = before.units.find(u => u.id === e.unit);
        const covered = a !== undefined && FACTIONS[before.players[a.owner]!.faction].forestHidden && isHidden(before, a);
        if (covered || sees(before, viewer, e.unit) || sees(after, viewer, e.unit)) by = a?.type ?? null;
      }
    }
    const lost = new Set<number>();
    const hurt = new Map<number, { kind: 'unitHurt'; damage: number }>();   // a Dash-strike's arrow and charge: one line
    for (const e of events) {
      if (e.type === 'attacked' || e.type === 'splashed') {
        const target = before.units.find(u => u.id === e.target);
        if (target === undefined || target.owner !== viewer) continue;
        if (died.has(target.id)) {
          if (!lost.has(target.id)) { lost.add(target.id); lines.push({ kind: 'unitLost', unitType: target.type, by, at: target.pos }); }
        } else if (hurt.has(target.id)) {
          hurt.get(target.id)!.damage += e.damage;
        } else {
          const line = { kind: 'unitHurt' as const, unitType: target.type, damage: e.damage, by, at: target.pos };
          hurt.set(target.id, line); lines.push(line);
        }
      } else if (e.type === 'snared') {
        const unit = before.units.find(u => u.id === e.unit);
        if (unit !== undefined && unit.owner !== viewer) lines.push({ kind: 'snareSprung', unitType: unit.type, damage: e.damage, died: died.has(unit.id), at: e.at });
      } else if (e.type === 'advanced') {
        // Told only after a loss of ours, and only when our side can see the unit standing there now.
        const unit = after.units.find(u => u.id === e.unit);
        if (unit !== undefined && unit.owner !== viewer && lost.size > 0 && sees(after, viewer, e.unit)) {
          lines.push({ kind: 'tileTaken', by: unit.type, at: unit.pos });
        }
      } else if (e.type === 'treasure') {
        if (before.current !== viewer && playerView(after, viewer).visible.includes(e.at)) lines.push({ kind: 'treasureTaken', at: e.at });
      } else if (e.type === 'heroTrait') {
        // Only the viewer's own units, and only what happened on the other side's turn.
        const unit = after.units.find(u => u.id === e.unit);
        if (before.current !== viewer && unit !== undefined && unit.owner === viewer) {
          lines.push(e.hero ? { kind: 'heroMade', unitType: unit.type, at: unit.pos } : { kind: 'traitEarned', unitType: unit.type, trait: e.trait, at: unit.pos });
        }
      } else if (e.type === 'captured') {
        const city = before.cities.find(c => c.id === e.city);
        if (city?.owner === viewer) lines.push({ kind: 'cityLost', at: city.pos });
      }
    }
  }
  return lines;
}
