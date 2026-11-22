import { cloneElement, createContext, isValidElement, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { grade } from './palette';

// Which look the art draws in. Bright is the default kid-friendly art; Gritty darkens the grounds and lets figures
// show battle wear. The value comes from the player's setting (ui/artMode.ts) through this context, so the art itself
// never reads storage.
export type ArtMode = 'bright' | 'gritty';

export const ArtModeContext = createContext<ArtMode>('bright');

export function useArtLook(): ArtMode {
  return useContext(ArtModeContext);
}

function regrade(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(regrade);
  if (!isValidElement(node)) return node;
  const props = node.props as { fill?: unknown; stroke?: unknown; children?: ReactNode };
  const patch: Record<string, unknown> = {};
  if (typeof props.fill === 'string') patch.fill = grade(props.fill);
  if (typeof props.stroke === 'string') patch.stroke = grade(props.stroke);
  if (props.children !== undefined) patch.children = regrade(props.children);
  return cloneElement(node, patch);
}

/**
 * Scenery drawn in Gritty's overcast grade: every fill and stroke in a plain SVG tree is muted and cooled. Bright mode
 * returns the art untouched. Call it from a component, on art made of plain SVG elements.
 */
export function useGraded(art: ReactElement): ReactElement {
  return useArtLook() === 'gritty' ? (regrade(art) as ReactElement) : art;
}
