import { FIREBASE_API_KEY } from '../netReady';

// The public client identifiers of the Firebase project. Firebase setup F1 fills in the placeholders.
// None of them is a secret: every web client ships them, and the database rules decide what a client may do.
export const firebaseConfig: { apiKey: string; authDomain: string; databaseURL: string; projectId: string; appId: string } = {
  apiKey: FIREBASE_API_KEY,
  authDomain: 'banners-game.firebaseapp.com',
  databaseURL: 'https://banners-game-default-rtdb.firebaseio.com',
  projectId: 'banners-game',
  appId: '1:377540570036:web:19c0a764aa8a8dbfb7a0e1',
};
