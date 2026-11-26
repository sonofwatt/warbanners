// What the 3D unit figures draw, taken from the board's scene. No three.js here: the board imports this file whether
// the option is on or off. The 3D chunk imports only its types, so the engine and the palette stay out of that chunk.
import { isHero } from '../../engine';
import type { FactionId, UnitTypeId } from '../../engine';
import { ACCENT, playerColour } from '../art/palette';
import type { SceneItem } from '../board/scene';

/** One unit figure as the 3D layer draws it: everything it shows, and where (the board point of its tile centre). */
export interface GlUnit {
  id: number;
  type: UnitTypeId;
  look: { main: string; dark: string; accent: string };
  hero: boolean;
  x: number;
  y: number;
  /** An own unit with nothing left to do this turn: drawn darker (eased), never see-through. */
  spent: boolean;
  /** Dug in (rules 7): a unit that hunkers turns back to its rest facing (units/facing.ts). */
  hunkered: boolean;
}

/**
 * How a unit's own state shows, in both looks: `shaded`, an own unit that is spent, drawn darker with its banner;
 * `eye`, an own unit with the hidden trait, the slashed eye on its banner. No unit is ever drawn see-through. Both
 * are only ever shown to the unit's owner: the spent set holds only the viewer's units, and an enemy's hidden trait
 * says nothing the viewer may use (it is the enemy's own business whether it is seen).
 */
export function unitShown(u: { mine: boolean; spent: boolean; hidden: boolean }): { shaded: boolean; eye: boolean } {
  return { shaded: u.mine && u.spent, eye: u.mine && u.hidden };
}

/**
 * The 3D figures for the scene, and their signature (equal signatures need no rebuild). Exactly the scene's units:
 * the scene is built from the viewer's own view, so a unit the viewer cannot see is never in it, and never here.
 */
export function glUnitsOf(items: readonly SceneItem[], factions: readonly FactionId[]): { units: GlUnit[]; key: string } {
  const units: GlUnit[] = [];
  for (const it of items) {
    if (it.kind !== 'unit') continue;
    const u = it.unit;
    const faction = factions[u.owner];
    if (faction === undefined) continue; // the SVG draws nothing for it either
    units.push({
      id: u.id, type: u.type, look: { ...playerColour(faction), accent: ACCENT[faction] }, hero: isHero(u),
      x: it.at.x, y: it.at.y,
      spent: it.mine && it.spent,
      hunkered: u.hunkered,
    });
  }
  const key = units.map((u) => `${u.id}:${u.type}:${u.look.main}${u.look.dark}${u.look.accent}:${u.hero ? 'h' : ''}:${u.x},${u.y}:${u.spent ? 's' : ''}:${u.hunkered ? 'k' : ''}`).join(' ');
  return { units, key };
}
