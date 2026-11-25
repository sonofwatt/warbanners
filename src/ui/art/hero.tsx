import type { ReactElement } from 'react';
import type { ItemId } from '../../engine';
import { Ink } from './features';
import { bannerRight, GLINT_GAP, MARK_STEP, PIP_H, PIP_Y, PLATE } from './banner';
import { WOOD, WOOD_DARK } from './units';

// The hero's pennant, drawn behind a figure, and the badge of a carried item, drawn on the banner's row.
// Both use the figures' coordinates: feet near (0, 4), the tile's top face centred on the origin.

const GOLD = '#FFDA4D';
const GLASS = '#DDEFF2';
const DRAUGHT = '#3CC8D8';

/**
 * A swallowtail pennant on a short staff that rises from behind the figure's left shoulder: the accent with a
 * gold edge along its top, a dark lower tail in the plate's colour and a gold knob on the staff. The dark tail
 * keeps it readable over a city's cream and sand at the farthest zoom, where gold alone fades into the ground.
 * It flies to the left, clear of the spears and lances most figures carry on the right, and its top stays below
 * the taunted and blinded badges that hang beside the plate.
 */
export function HeroMark(p: { accent: string }): ReactElement {
  const ink = new Ink();
  ink.line(-4, -4.6, -11.6, -34.6, WOOD_DARK, 1.6);
  ink.poly([-11.8, -35.2, -20, -33.8, -16, -30, -20, -25.6, -10.8, -25.2], p.accent);
  ink.poly([-16, -30, -20, -25.6, -10.8, -25.2, -11, -28], PLATE);
  ink.poly([-11.8, -35.2, -20, -33.8, -17.4, -31.4, -11.4, -30.4], GOLD);
  ink.circle(-11.8, -35.2, 1.3, GOLD);
  return <g data-hero-mark="true">{ink.items}</g>;
}

/**
 * A carried item's badge, centred on x 0 on the plate's row: a small dark tab, like the pip plate,
 * with a stoppered flask on it. The caller moves it to `itemBadgeX`.
 */
export function ItemBadge(p: { item: ItemId }): ReactElement {
  const ink = new Ink();
  const mid = PIP_Y + PIP_H / 2;
  ink.rect(-3, mid - 4.3, 6, 8, PLATE, 1.8);
  ink.rect(-0.8, mid - 2.8, 1.6, 2.4, GLASS);
  ink.rect(-1.2, mid - 3.7, 2.4, 1.2, WOOD, 0.4);
  ink.circle(0, mid + 1.2, 2.3, GLASS);
  ink.circle(0, mid + 1.5, 1.8, DRAUGHT);
  ink.circle(-0.8, mid + 0.6, 0.5, '#FFFFFF');
  return <g data-item={p.item}>{ink.items}</g>;
}

/** Where the item badge goes for a unit of this maximum health: the glint's slot right of the war banner, or one slot
 * past it when the glint or the hunker shield (which shares the glint's slot) is shown. A hidden unit's banner is
 * wider by its eye. */
export function itemBadgeX(maxHp: number, slotTaken: boolean, hidden = false): number {
  return bannerRight(maxHp, hidden) + GLINT_GAP + (slotTaken ? MARK_STEP : 0);
}
