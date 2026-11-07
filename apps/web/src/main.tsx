import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  const [health, setHealth] = React.useState('Checking local Worker…');
  React.useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const body: unknown = await response.json();
        if (typeof body !== 'object' || body === null || !('ok' in body) || body.ok !== true) throw new Error('Invalid health response');
        setHealth('Local Worker connected');
      }).catch(error => { if (!controller.signal.aborted) setHealth('Worker unavailable: ' + String(error)); });
    return () => controller.abort();
  }, []);
  return <main>
    <p className="eyebrow">PRIVATE CO-OP GAME</p>
    <h1>PandemicGame</h1>
    <p>A cooperative strategy game for 2–4 players.</p>
    <section aria-label="Development status">
      <strong>Foundation preview</strong>
      <p>{health}</p>
      <p>Accounts and connected rooms will arrive in later tasks.</p>
      {import.meta.env.DEV && <p><a href="/local.html">Play a local game</a></p>}
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
