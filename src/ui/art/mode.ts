import { createContext, useContext } from 'react';

// Which look the art draws in. Bright is the default kid-friendly art; Gritty darkens the grounds and lets figures
// show battle wear. The value comes from the player's setting (ui/artMode.ts) through this context, so the art itself
// never reads storage.
export type ArtMode = 'bright' | 'gritty';

export const ArtModeContext = createContext<ArtMode>('bright');

export function useArtLook(): ArtMode {
  return useContext(ArtModeContext);
}
