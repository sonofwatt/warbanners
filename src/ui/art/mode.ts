import { cloneElement, createContext, isValidElement, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { grade, mute } from './palette';

// Which look the art draws in. Bright is the default kid-friendly art; Gritty darkens the grounds and lets figures
// show battle wear. The value comes from the player's setting (ui/artMode.ts) through this context, so the art itself
// never reads storage.
export type ArtMode = 'bright' | 'gritty';

export const ArtModeContext = createContext<ArtMode>('bright');

export function useArtLook(): ArtMode {
  return useContext(ArtModeContext);
}

function regrade(node: ReactNode, by: (c: string) => string = grade): ReactNode {
  if (Array.isArray(node)) return node.map((n) => regrade(n, by));
  if (!isValidElement(node)) return node;
  const props = node.props as { fill?: unknown; stroke?: unknown; children?: ReactNode };
  const patch: Record<string, unknown> = {};
  if (typeof props.fill === 'string') patch.fill = by(props.fill);
  if (typeof props.stroke === 'string') patch.stroke = by(props.stroke);
  if (props.children !== undefined) patch.children = regrade(props.children, by);
  return cloneElement(node, patch);
}

/**
 * A figure as Gritty draws it: every fill and stroke in its plain SVG tree a little less saturated and a touch
 * darker (palette.ts mute), the colours themselves rather than a filter, so nothing extra is drawn per frame.
 * Bright, and anything else, is returned untouched.
 */
export function muteFigure(art: ReactElement, look: ArtMode): ReactElement {
  return look === 'gritty' ? (regrade(art, mute) as ReactElement) : art;
}

/**
 * Scenery drawn in Gritty's overcast grade: every fill and stroke in a plain SVG tree is muted and cooled. Bright mode
 * returns the art untouched. Call it from a component, on art made of plain SVG elements.
 */
export function useGraded(art: ReactElement): ReactElement {
  return useArtLook() === 'gritty' ? (regrade(art) as ReactElement) : art;
}
