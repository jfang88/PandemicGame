import { useState } from 'react';
import { firebaseAuth } from './firebase';
import { AuthScreen } from './screen';

export default function AuthApp() {
  const [auth] = useState(() => {
    try { return firebaseAuth(); } catch { return null; }
  });
  return auth ? <AuthScreen auth={auth} /> : <main>
    <h1>PandemicGame sign-in</h1>
    <p>Sign-in is unavailable until this site has Firebase configuration.</p>
    <p><a href="/">Back to PandemicGame</a></p>
  </main>;
}
