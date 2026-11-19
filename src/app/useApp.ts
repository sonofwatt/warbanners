import { createContext, useContext, useSyncExternalStore } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { browserDeps, createAppStore } from './store';
import type { AppState, Deps } from './store';
import type { Updater } from './update';

let store: StoreApi<AppState> | null = null;
let deps: Deps | null = null;

// The one app store, made the first time something asks for it and never when the module loads.
export function appStore(): StoreApi<AppState> {
  if (store === null) { deps = browserDeps(); store = createAppStore(deps); }
  return store;
}

// The store reads its updater when Update is tapped, so it can be given one after it is made.
export function setUpdater(updater: Updater): void {
  appStore();
  if (deps !== null) deps.updater = updater;
}

// Tests give the screens their own store here; the app leaves it empty and gets the singleton.
export const StoreContext = createContext<StoreApi<AppState> | null>(null);

// Reads a slice of the store. Pick plain values or stable references: a fresh object each call would re-render forever.
// Not zustand's own hook: that one renders the initial state on the server, and the tests render static markup.
export function useApp<T>(pick: (s: AppState) => T): T {
  const api = useContext(StoreContext) ?? appStore();
  const read = (): T => pick(api.getState());
  return useSyncExternalStore(api.subscribe, read, read);
}
