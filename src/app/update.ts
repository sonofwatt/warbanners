// Registers the service worker and reports when the app can play offline and when a newer build is waiting.
export interface UpdateState { offlineReady: boolean; updateReady: boolean }
export interface Updater { apply(): Promise<void>; check(): void }

export function startUpdates(onChange: (s: UpdateState) => void): Updater {
  const state: UpdateState = { offlineReady: false, updateReady: false };
  let reload: ((reloadPage?: boolean) => Promise<void>) | null = null;
  let registration: ServiceWorkerRegistration | undefined;
  const report = (patch: Partial<UpdateState>): void => { Object.assign(state, patch); onChange({ ...state }); };

  // Dynamic import so that Node (the unit tests) never loads the virtual module.
  void import('virtual:pwa-register').then(({ registerSW }) => {
    reload = registerSW({
      onNeedRefresh: () => report({ updateReady: true }),
      onOfflineReady: () => report({ offlineReady: true }),
      onRegisteredSW: (_url, r) => { registration = r; },
    });
  }).catch(() => {});

  return {
    apply: async () => { if (reload !== null) await reload(true); },
    check: () => {
      if (registration !== undefined && (typeof navigator === 'undefined' || navigator.onLine)) void registration.update().catch(() => {});
    },
  };
}
