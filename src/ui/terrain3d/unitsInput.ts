// What the 3D unit figures draw, taken from the board's scene. No three.js here: the board imports this file whether
// the option is on or off. The 3D chunk imports only its types, so the engine and the palette stay out of that chunk.
import { isHero, UNITS } from '../../engine';
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
  /** The SVG figure's opacity: 0.55 for an own spent unit, 0.7 for an own hidden one, else 1. */
  alpha: number;
  /** Dug in (rules 7): a unit that hunkers turns back to its rest facing (units/facing.ts). */
  hunkered: boolean;
}

/** How the SVG figure of a unit is dimmed (Board.tsx draws it with this opacity when the 3D figures are off). */
export function unitAlpha(u: { mine: boolean; spent: boolean; hidden: boolean }): number {
  return u.mine && u.spent ? 0.55 : u.mine && u.hidden ? 0.7 : 1;
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
      alpha: unitAlpha({ mine: it.mine, spent: it.spent, hidden: UNITS[u.type].traits.includes('hidden') }),
      hunkered: u.hunkered,
    });
  }
  const key = units.map((u) => `${u.id}:${u.type}:${u.look.main}${u.look.dark}${u.look.accent}:${u.hero ? 'h' : ''}:${u.x},${u.y}:${u.alpha}:${u.hunkered ? 'k' : ''}`).join(' ');
  return { units, key };
}
