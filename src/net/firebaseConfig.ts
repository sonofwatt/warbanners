import { FIREBASE_API_KEY } from '../netReady';

// The public client identifiers of the Firebase project. Firebase setup F1 fills in the placeholders.
// None of them is a secret: every web client ships them, and the database rules decide what a client may do.
export const firebaseConfig: { apiKey: string; authDomain: string; databaseURL: string; projectId: string; appId: string } = {
  apiKey: FIREBASE_API_KEY,
  authDomain: 'PASTE_ME',
  databaseURL: 'PASTE_ME',
  projectId: 'PASTE_ME',
  appId: 'PASTE_ME',
};
