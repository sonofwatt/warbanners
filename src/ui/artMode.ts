import { useSyncExternalStore } from 'react';
import type { ArtMode } from './art/mode';

// The player's art style, kept per phone. Bright (the kid-friendly art) is the default; Gritty is chosen in Settings
// on Home. Storage is read and written only inside these functions, never when the module loads, and a phone that
// blocks storage keeps the choice in memory for the session, as the mute does.

const KEY = 'banners.artMode';
let memory: ArtMode = 'bright';
const listeners = new Set<() => void>();

export function getArtMode(): ArtMode {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(KEY);
      if (v === 'gritty' || v === 'bright') return v;
    }
  } catch {
    // storage blocked: fall back to memory
  }
  return memory;
}

export function setArtMode(mode: ArtMode): void {
  memory = mode;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, mode);
  } catch {
    // storage blocked: the in-memory value still holds
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** The current art style, re-rendering when Settings changes it. */
export function useArtMode(): ArtMode {
  return useSyncExternalStore(subscribe, getArtMode, () => 'bright');
}
