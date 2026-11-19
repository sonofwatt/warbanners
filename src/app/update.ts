// Registers the service worker and reports when the app can play offline and when a newer build is waiting.
export interface UpdateState { offlineReady: boolean; updateReady: boolean }
export interface Updater {
  apply(): Promise<void>;
  check(): void;
  homeReached(): void;   // the store has just gone to Home: a window that was told to reload may do so now
}

// When Update is tapped in one window, every window of the game is told to reload once the new worker takes over.
// A window on Home reloads at once; one in a match waits until it reaches Home, so a match is never interrupted.
export function reloadGate(reload: () => void): { needed(atHome: boolean): void; homeReached(): void } {
  let pending = false;
  return {
    needed: atHome => { if (atHome) reload(); else pending = true; },
    homeReached: () => { if (pending) { pending = false; reload(); } },
  };
}

export function startUpdates(onChange: (s: UpdateState) => void, atHome: () => boolean): Updater {
  const state: UpdateState = { offlineReady: false, updateReady: false };
  let reload: ((reloadPage?: boolean) => Promise<void>) | null = null;
  let registration: ServiceWorkerRegistration | undefined;
  const report = (patch: Partial<UpdateState>): void => { Object.assign(state, patch); onChange({ ...state }); };
  const gate = reloadGate(() => window.location.reload());

  // Dynamic import so that Node (the unit tests) never loads the virtual module.
  void import('virtual:pwa-register').then(({ registerSW }) => {
    reload = registerSW({
      onNeedRefresh: () => report({ updateReady: true }),
      onOfflineReady: () => report({ offlineReady: true }),
      onNeedReload: () => gate.needed(atHome()),
      onRegisteredSW: (_url, r) => { registration = r; },
    });
  }).catch(() => {});

  return {
    apply: async () => { if (reload !== null) await reload(true); },
    check: () => {
      if (registration !== undefined && (typeof navigator === 'undefined' || navigator.onLine)) void registration.update().catch(() => {});
    },
    homeReached: () => gate.homeReached(),
  };
}
