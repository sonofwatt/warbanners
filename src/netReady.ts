// Whether online play can be offered at all. The store imports this statically, so it lands in the main chunk:
// it must import nothing and name no URL, so that solo and pass-the-phone play never carry the database address.

// The Firebase web API key. Firebase setup F1 replaces the placeholder. It is public by design: it names the
// project to Google's servers and grants nothing on its own; the database rules decide who may read and write.
export const FIREBASE_API_KEY: string = 'AIzaSyB_SJs6kgFkOtsLEJOR1NodLuIs6ZcknDQ';

/** True when this build can reach a Firebase backend: a real key, an emulator build, or a dev server. */
export function netReady(): boolean {
  return FIREBASE_API_KEY !== 'PASTE_ME'
    || import.meta.env.VITE_EMULATOR === '1'
    || (import.meta.env.DEV && import.meta.env.VITE_USE_PROD !== '1');
}
