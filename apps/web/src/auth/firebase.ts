import { getApps, initializeApp } from 'firebase/app';
import { browserLocalPersistence, browserPopupRedirectResolver, browserSessionPersistence, GoogleAuthProvider,
  indexedDBLocalPersistence, initializeAuth, OAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import type { AuthAdapter } from './session';

export function firebaseAuth(): AuthAdapter | null {
  const { VITE_FIREBASE_API_KEY: apiKey, VITE_FIREBASE_AUTH_DOMAIN: authDomain,
    VITE_FIREBASE_PROJECT_ID: projectId, VITE_FIREBASE_APP_ID: appId } = import.meta.env;
  if (!configured(apiKey) || !configured(authDomain) || !configured(projectId) || !configured(appId)) return null;
  const name = 'pandemic-auth';
  const app = getApps().find(candidate => candidate.name === name) ?? initializeApp({ apiKey, authDomain, projectId, appId }, name);
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  return {
    observe: listener => onAuthStateChanged(auth, user => listener(user ? { uid: user.uid } : null)),
    async signIn(provider) {
      const oauth = provider === 'google' ? new GoogleAuthProvider() : new OAuthProvider('microsoft.com');
      await signInWithPopup(auth, oauth);
    },
    signOut: () => signOut(auth),
    async getIdToken(forceRefresh, expectedUid) {
      const user = auth.currentUser;
      if (user?.uid !== expectedUid) throw new Error('Firebase session changed');
      const token = await user.getIdToken(forceRefresh);
      if (auth.currentUser?.uid !== expectedUid) throw new Error('Firebase session changed');
      return token;
    },
  };
}

function configured(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !value.startsWith('REPLACE_');
}
