import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthScreen } from '../src/auth/screen';
import type { AuthAdapter, AuthSession, Provider } from '../src/auth/session';

const listeners = new Set<(session: AuthSession | null) => void>();
const key = 'firebase-local-popup-fixture';
const attempted = new Set<Provider>();
const storedUid = sessionStorage.getItem(key);
let current: AuthSession | null = storedUid ? { uid: storedUid } : null;

function setSession(session: AuthSession | null) {
  current = session;
  if (session) sessionStorage.setItem(key, session.uid);
  else sessionStorage.removeItem(key);
  for (const listener of listeners) listener(current);
}

window.addEventListener('firebase-fixture-switch', () => setSession({ uid: 'fixture-other-user' }));

const auth: AuthAdapter = {
  observe(listener) {
    const timer = setTimeout(() => {
      listeners.add(listener);
      listener(current);
    }, 250);
    return () => { clearTimeout(timer); listeners.delete(listener); };
  },
  async signIn(provider) {
    const scenario = new URLSearchParams(location.search).get('test');
    if ((scenario === 'recovery' || scenario === 'closed') && !attempted.has(provider)) {
      attempted.add(provider);
      throw { code: scenario === 'closed' ? 'auth/popup-closed-by-user'
        : provider === 'google' ? 'auth/popup-blocked' : 'auth/account-exists-with-different-credential' };
    }
    setSession({ uid: 'fixture-user' });
  },
  async signOut() { setSession(null); },
  async getIdToken(forceRefresh, expectedUid) {
    if (current?.uid !== expectedUid) throw new Error('Fixture session changed');
    return forceRefresh ? 'mock-refreshed-token' : 'mock-initial-token';
  },
};

createRoot(document.getElementById('root')!).render(<React.StrictMode><AuthScreen auth={auth} /></React.StrictMode>);
