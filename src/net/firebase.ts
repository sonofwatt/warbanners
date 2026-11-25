/// <reference types="node" />
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence, connectAuthEmulator, indexedDBLocalPersistence, inMemoryPersistence, initializeAuth,
  signInAnonymously, type Auth,
} from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase, goOffline, goOnline, onValue, ref, type Database } from 'firebase/database';
import { FIREBASE_API_KEY } from '../netReady';
import { firebaseConfig } from './firebaseConfig';

// Nothing here runs on import: the app and its auth are created on the first call to fb().

export const EMU = {
  projectId: 'demo-banners',
  host: '127.0.0.1',
  dbPort: 9010,
  authPort: 9110,
  databaseURL: 'http://127.0.0.1:9010?ns=demo-banners-default-rtdb',
} as const;

const emulatorConfig = { apiKey: 'demo', projectId: EMU.projectId, databaseURL: EMU.databaseURL };

const inNode = (): boolean => typeof window === 'undefined';

/**
 * Whether this process talks to the local emulator. In Node (Vitest) it must: without EMULATOR=1 it throws, so no
 * test can ever reach the live database. In a browser it is an emulator build (VITE_EMULATOR=1) or a dev server
 * that has not opted into the real backend with VITE_USE_PROD=1.
 */
export function usingEmulator(): boolean {
  if (inNode()) {
    if (process.env.EMULATOR === '1') return true;
    throw new Error('EMULATOR=1 is required to use Firebase from Node');
  }
  return import.meta.env.VITE_EMULATOR === '1' || (import.meta.env.DEV && import.meta.env.VITE_USE_PROD !== '1');
}

/** A production build whose Firebase setup has not been filled in: the app shows that online play is not set up. */
export function configMissing(): boolean {
  return FIREBASE_API_KEY === 'PASTE_ME' && !usingEmulator();
}

export interface Fb { app: FirebaseApp; db: Database; auth: Auth }

const made = new Map<string, Fb>();

/** The Firebase app, database and auth for one identity, created on the first call per name. */
export function fb(name = '[DEFAULT]'): Fb {
  const known = made.get(name);
  if (known) return known;
  const emu = usingEmulator();
  const missing = configMissing();
  // An unconfigured build still initialises with something routable rather than crash on the placeholder URL;
  // it connects nowhere, because nothing calls into it once the app has shown that online play is not set up.
  const app = initializeApp(emu || missing ? emulatorConfig : firebaseConfig, name);
  const db = getDatabase(app);
  // initializeAuth rather than getAuth: getAuth also wires in the popup and redirect resolvers, code for sign-in
  // flows this app never runs (anonymous sign-in is the only one). In a browser the two persistences are the ones
  // getAuth would have tried first, in the same order, so a phone keeps its anonymous identity, and with it its
  // seat, across reloads and browser restarts. Do not drop indexedDBLocalPersistence for that reason.
  const auth = initializeAuth(app, {
    persistence: inNode() ? inMemoryPersistence : [indexedDBLocalPersistence, browserLocalPersistence],
  });
  if (emu) {
    connectDatabaseEmulator(db, EMU.host, EMU.dbPort);
    connectAuthEmulator(auth, `http://${EMU.host}:${EMU.authPort}`, { disableWarnings: true });
  }
  const f: Fb = { app, db, auth };
  made.set(name, f);
  return f;
}

const signingIn = new WeakMap<Fb, Promise<string>>();
/**
 * Signs in anonymously unless already signed in, and returns the uid. Calls made while a sign-in is on its way share
 * it: two sign-ins that overlap could each make an anonymous user, and the phone would end up as the second while
 * holding the first one's uid. A failed sign-in is forgotten, so the next call tries again.
 */
export function ensureSignedIn(f: Fb): Promise<string> {
  if (f.auth.currentUser) return Promise.resolve(f.auth.currentUser.uid);
  let p = signingIn.get(f);
  if (!p) {
    p = signInAnonymously(f.auth).then((cred) => cred.user.uid).finally(() => { signingIn.delete(f); });
    signingIn.set(f, p);
  }
  return p;
}

/** Calls cb with whether the SDK holds a live connection to the database. Returns the unsubscribe. */
export function watchConnected(f: Fb, cb: (ok: boolean) => void): () => void {
  return onValue(ref(f.db, '.info/connected'), (snap) => cb(snap.val() === true));
}

/** Calls cb with the estimated server clock minus this phone's clock, in ms. Returns the unsubscribe. */
export function serverOffset(f: Fb, cb: (ms: number) => void): () => void {
  return onValue(ref(f.db, '.info/serverTimeOffset'), (snap) => {
    const ms: unknown = snap.val();
    cb(typeof ms === 'number' ? ms : 0);
  });
}

/**
 * Forces the SDK to rebuild its connection. A phone that switches apps freezes the tab, and it can come back holding
 * a socket the OS closed while it slept; the SDK's own retry does not always fire from that state. Call this only
 * when already believed offline: otherwise it flaps presence for everyone else in the room.
 */
export function reconnect(f: Fb): void {
  goOffline(f.db);
  goOnline(f.db);
}

/** Takes this identity's connection down or brings it back. The emulator tests use it to drop a phone. */
export function setOnline(f: Fb, on: boolean): void {
  if (on) goOnline(f.db);
  else goOffline(f.db);
}
